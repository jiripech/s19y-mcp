import express from 'express'
import { randomUUID } from 'node:crypto'
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'
import { createManager, createServer } from './memory-server.mjs'
import { migrateGraph } from './migrate.mjs'
import { startCompressor } from './compressor.mjs'
import { initInfoStore } from './info-store.mjs'
import { createInfoRouter } from './info-routes.mjs'
import { initInstructions } from './instructions.mjs'
import { createBrowserRouter, generateAdminPassword } from './browser-routes.mjs'
import { logger } from './logger.mjs'
import { names } from './names.mjs'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const app = express()
const PORT = process.env.PORT || 3000
const API_KEY = process.env.API_KEY || 'change-to-your-api-key'
const ADMIN_USER = process.env.ADMIN_USER || null
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || null
const DATA_DIR = process.env.DATA_DIR || '/app/data'

app.set('trust proxy', true)

app.use(express.json())

const sessions = new Map()
const usedNames = new Set()
const manager = await createManager()
await migrateGraph(manager)
startCompressor(manager)
await initInfoStore(join(dirname(fileURLToPath(import.meta.url)), 'info'))
await initInstructions()

const randomName = () => {
  const unused = names.filter(n => !usedNames.has(n))
  if (unused.length === 0) {
    return names[Math.floor(Math.random() * names.length)]
  }
  return unused[Math.floor(Math.random() * unused.length)]
}

const MAX_AGENT_NAME_LENGTH = 64

const assignName = (req) => {
  const requested = (req.headers['x-agent-name'] || '')
    .toString()
    .replace(/[\x00-\x1f\x7f]/g, '')
    .trim()
    .slice(0, MAX_AGENT_NAME_LENGTH)
  if (requested) {
    if (usedNames.has(requested)) {
      logger.warn(`Requested agent name "${requested}" is already in use, assigning a random codename`)
      const pick = randomName()
      usedNames.add(pick)
      return pick
    }
    usedNames.add(requested)
    return requested
  }
  const pick = randomName()
  usedNames.add(pick)
  return pick
}

const authMiddleware = (req, res, next) => {
  const clientKey = req.headers['x-api-key']
  if (!clientKey || clientKey !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized: Invalid API key' })
  }
  next()
}

app.use((req, res, next) => {
  const start = process.hrtime()
  res.on('finish', () => {
    const ms = (process.hrtime(start)[0] * 1e3 + process.hrtime(start)[1] / 1e6).toFixed(0)
    logger.debug(`${req.method} ${req.path} ${res.statusCode} ${ms}ms`)
  })
  next()
})

app.get('/session', authMiddleware, async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] || req.query.sessionId
  if (!sessionId) {
    return res.status(400).json({ error: 'Mcp-Session-Id header or sessionId query param required' })
  }
  const session = sessions.get(sessionId)
  if (!session) {
    return res.status(404).json({ error: 'Session not found' })
  }
  res.json({
    name: session.name,
    sessionId,
    transport: session.transport instanceof StreamableHTTPServerTransport ? 'streamable-http' : 'sse',
    identified: session.ctx ? session.ctx.identified : true
  })
})

const wrap = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next)

app.get('/sse', authMiddleware, wrap(async (req, res) => {
  const transport = new SSEServerTransport('/messages', res)
  const name = assignName(req)
  const sessionCtx = { name, identified: Boolean(req.headers['x-agent-name']) }
  const server = await createServer(manager, { session: sessionCtx })

  sessions.set(transport.sessionId, { transport, server, name, ctx: sessionCtx })
  logger.info(`${name} (${transport.sessionId}) connected from ${req.ip} (SSE)`)

  req.on('close', () => {
    sessions.delete(transport.sessionId)
    usedNames.delete(name)
    logger.info(`${name} (${transport.sessionId}) closed (active: ${sessions.size})`)
  })

  await server.connect(transport)
}))

app.post('/messages', authMiddleware, wrap(async (req, res) => {
  const sessionId = req.query.sessionId
  const session = sessions.get(sessionId)

  if (session) {
    await session.transport.handlePostMessage(req, res)
  } else {
    res.status(404).json({ error: 'Session not found or expired' })
  }
}))

app.all('/mcp', authMiddleware, async (req, res) => {
  try {
    const sessionId = req.headers['mcp-session-id']
    let transport

    if (sessionId && sessions.has(sessionId)) {
      transport = sessions.get(sessionId).transport
    } else if (req.method === 'POST' && !sessionId && isInitializeRequest(req.body)) {
      const name = assignName(req)
      const sessionCtx = { name, identified: Boolean(req.headers['x-agent-name']) }
      const sessionRef = { sid: null }
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          sessionRef.sid = sid
          sessions.set(sid, { transport, server, name, ctx: sessionCtx })
          logger.info(`${name} (${sid}) connected from ${req.ip} (Streamable HTTP)`)
        }
      })
      const server = await createServer(manager, { session: sessionCtx })
      await server.connect(transport)

      transport.onclose = () => {
        const { sid } = sessionRef
        if (sid) sessions.delete(sid)
        usedNames.delete(name)
        logger.info(`${name} (${sid}) closed (active: ${sessions.size})`)
      }

      await transport.handleRequest(req, res, req.body)
      return
    } else if (sessionId) {
      return res.status(404).json({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Session not found' },
        id: null
      })
    } else {
      return res.status(400).json({ error: 'Bad Request: Mcp-Session-Id header is required' })
    }

    await transport.handleRequest(req, res, req.body)
  } catch (error) {
    logger.error(`Error handling request: ${error.message}`)
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' })
    }
  }
})

async function resolveStoredPassword() {
  if (ADMIN_PASSWORD) {
    logger.info(`Browser password login enabled for user "${ADMIN_USER}", static password from ADMIN_PASSWORD.`)
    return { password: ADMIN_PASSWORD, rotate: null }
  }
  const file = join(DATA_DIR, 'admin.password')
  const rotate = async () => {
    const next = generateAdminPassword()
    try {
      await writeFile(file, next)
    } catch (err) {
      logger.warn(`Could not persist new admin password to ${file}: ${err.message}`)
    }
    logger.info(`Browser one-time password for user "${ADMIN_USER}" consumed; new password: ${next}`)
    return next
  }
  let password = null
  try {
    await mkdir(DATA_DIR, { recursive: true })
    password = (await readFile(file, 'utf8')).trim()
  } catch {
    password = null
  }
  if (password) {
    logger.info(`Browser password login enabled for user "${ADMIN_USER}", using stored one-time password.`)
  } else {
    password = generateAdminPassword()
    try {
      await writeFile(file, password)
    } catch (err) {
      logger.warn(`Could not persist admin password to ${file}: ${err.message}`)
    }
    logger.info(`Browser one-time password login for user "${ADMIN_USER}", current password: ${password}`)
  }
  return { password, rotate }
}

const storedAdmin = ADMIN_USER ? await resolveStoredPassword() : null

if (ADMIN_USER) {
  logger.info(`Browser password login enabled for user "${ADMIN_USER}".`)
}

app.use('/info', createInfoRouter(API_KEY))

app.use('/browser.app', createBrowserRouter(manager, {
  adminUser: ADMIN_USER,
  adminPassword: storedAdmin ? storedAdmin.password : null,
  rotateAdminPasswordOnUse: storedAdmin ? storedAdmin.rotate : null,
  dataDir: DATA_DIR
}))

app.listen(PORT, () => {
  logger.info(`MCP Memory Server running on port ${PORT} with authentication enabled.`)
})

import express from 'express'
import { randomUUID } from 'node:crypto'
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createManager, createServer } from './memory-server.mjs'
import { createBrowserRouter } from './browser-routes.mjs'
import { logger } from './logger.mjs'
import { names } from './names.mjs'

const app = express()
const PORT = process.env.PORT || 3000
const API_KEY = process.env.API_KEY || 'change-to-your-api-key'

app.set('trust proxy', true)

app.use(express.json())

const sessions = new Map()
const usedNames = new Set()
const manager = await createManager()

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
    transport: session.transport instanceof StreamableHTTPServerTransport ? 'streamable-http' : 'sse'
  })
})

app.get('/sse', authMiddleware, async (req, res) => {
  const transport = new SSEServerTransport('/messages', res)
  const server = await createServer(manager)
  const name = assignName()

  sessions.set(transport.sessionId, { transport, server, name })
  logger.info(`${name} (${transport.sessionId}) connected from ${req.ip} (SSE)`)

  req.on('close', () => {
    sessions.delete(transport.sessionId)
    usedNames.delete(name)
    logger.info(`${name} (${transport.sessionId}) closed (active: ${sessions.size})`)
  })

  await server.connect(transport)
})

app.post('/messages', authMiddleware, async (req, res) => {
  const sessionId = req.query.sessionId
  const session = sessions.get(sessionId)

  if (session) {
    await session.transport.handlePostMessage(req, res)
  } else {
    res.status(404).json({ error: 'Session not found or expired' })
  }
})

app.all('/mcp', authMiddleware, async (req, res) => {
  try {
    const sessionId = req.headers['mcp-session-id']
    let transport

    if (sessionId && sessions.has(sessionId)) {
      transport = sessions.get(sessionId).transport
    } else if (req.method === 'POST' && !sessionId) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID()
      })
      const server = await createServer(manager)
      await server.connect(transport)

      await transport.handleRequest(req, res, req.body)

      const sid = transport.sessionId
      const name = assignName()
      sessions.set(sid, { transport, server, name })
      logger.info(`${name} (${sid}) connected from ${req.ip} (Streamable HTTP)`)

      transport.onclose = () => {
        sessions.delete(sid)
        usedNames.delete(name)
        logger.info(`${name} (${sid}) closed (active: ${sessions.size})`)
      }

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

app.use('/browser.app', createBrowserRouter(manager))

app.listen(PORT, () => {
  logger.info(`MCP Memory Server running on port ${PORT} with authentication enabled.`)
})

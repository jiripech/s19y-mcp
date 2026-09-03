import express from 'express'
import { randomUUID } from 'node:crypto'
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createManager, createServer } from './memory-server.mjs'
import { logger } from './logger.mjs'

const app = express()
const PORT = process.env.PORT || 3000
const API_KEY = process.env.API_KEY || 'change-to-your-api-key'

app.set('trust proxy', true)

app.use(express.json())

const sessions = new Map()
const manager = await createManager()

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

app.get('/sse', authMiddleware, async (req, res) => {
  const transport = new SSEServerTransport('/messages', res)
  const server = await createServer(manager)

  sessions.set(transport.sessionId, { transport, server })
  logger.info(`Session ${transport.sessionId} connected from ${req.ip} (SSE)`)

  req.on('close', () => {
    sessions.delete(transport.sessionId)
    logger.info(`Session ${transport.sessionId} closed (active: ${sessions.size})`)
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
      sessions.set(sid, { transport, server })
      logger.info(`Session ${sid} connected from ${req.ip} (Streamable HTTP)`)

      transport.onclose = () => {
        sessions.delete(sid)
        logger.info(`Session ${sid} closed (active: ${sessions.size})`)
      }

      return
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

app.listen(PORT, () => {
  logger.info(`MCP Memory Server running on port ${PORT} with authentication enabled.`)
})

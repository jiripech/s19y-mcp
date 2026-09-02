import express from 'express'
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import { createManager, createServer } from './memory-server.mjs'
import { logger } from './logger.mjs'

const app = express()
const PORT = process.env.PORT || 3000
const API_KEY = process.env.API_KEY || 'change-to-your-api-key'

app.set('trust proxy', true)

const sessions = new Map()
const manager = await createManager()

// Middleware to validate API key in request header
const authMiddleware = (req, res, next) => {
  const clientKey = req.headers['x-api-key']
  if (!clientKey || clientKey !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized: Invalid API key' })
  }
  next()
}

// Debug request logging (method, path, status, duration)
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
  logger.info(`Session ${transport.sessionId} connected from ${req.ip}`)

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

app.listen(PORT, () => {
  logger.info(`MCP Memory Server running on port ${PORT} with authentication enabled.`)
})

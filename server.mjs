import express from 'express'
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import { createServer } from './memory-server.mjs'

const app = express()
const PORT = process.env.PORT || 3000
const API_KEY = process.env.API_KEY || 'change-to-your-api-key'

const sessions = new Map()

// Middleware to validate API key in request header
const authMiddleware = (req, res, next) => {
  const clientKey = req.headers['x-api-key']
  if (!clientKey || clientKey !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized: Invalid API key' })
  }
  next()
}

app.get('/sse', authMiddleware, async (req, res) => {
  const transport = new SSEServerTransport('/messages', res)
  const server = await createServer()

  sessions.set(transport.sessionId, { transport, server })

  req.on('close', () => {
    sessions.delete(transport.sessionId)
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
  console.log(`[MCP Memory Server] Running on port ${PORT} with authentication enabled.`)
})

import express, { Router } from 'express'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  loadUsers,
  getRegistrationToken,
  setRegistrationToken,
  findUserByName,
  findUserById,
  createUser,
  deleteUser,
  generateRegistrationOptions,
  verifyRegistration,
  generateLoginOptions,
  verifyLogin,
  listUsers
} from './webauthn.mjs'
import { cookieName, cookieOptions, createSession, getSession, deleteSession } from './browser-sessions.mjs'
import { logger } from './logger.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const browserDir = join(__dirname, 'browser')
const CHALLENGE_TTL = 5 * 60 * 1000

const parseCookies = (req) => {
  const cookies = {}
  const header = req.headers.cookie
  if (!header) return cookies
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    const key = part.slice(0, idx).trim()
    const value = part.slice(idx + 1).trim()
    try {
      cookies[key] = decodeURIComponent(value)
    } catch {
      cookies[key] = value
    }
  }
  return cookies
}

function parseMemory(entity) {
  const observations = entity.observations || []
  let content = ''
  let importance = 5
  let tags = []
  let source = null
  for (const obs of observations) {
    if (obs.startsWith('importance: ')) {
      importance = parseInt(obs.slice(12), 10) || 5
    } else if (obs.startsWith('tags: ')) {
      tags = obs.slice(6).split(',').map(t => t.trim()).filter(Boolean)
    } else if (obs.startsWith('source: ')) {
      source = obs.slice(8)
    } else if (!content) {
      content = obs
    }
  }
  return { name: entity.name, content, importance, tags, source }
}

export function createBrowserRouter(manager) {
  const router = Router()
  const pendingChallenges = new Map()

  const requireAuth = (req, res, next) => {
    const token = parseCookies(req)[cookieName]
    const session = getSession(token)
    if (!session) {
      return res.status(401).json({ error: 'Not authenticated' })
    }
    req.session = session
    req.sessionToken = token
    next()
  }

  const requireSuperuser = (req, res, next) => {
    requireAuth(req, res, () => {
      if (req.session.userRole !== 'superuser') {
        return res.status(403).json({ error: 'Superuser access required' })
      }
      next()
    })
  }

  const takePendingChallenge = (userId) => {
    const pending = pendingChallenges.get(userId)
    if (!pending) return null
    if (Date.now() - pending.createdAt > CHALLENGE_TTL) {
      pendingChallenges.delete(userId)
      return null
    }
    return pending
  }

  const startSession = (res, user) => {
    const token = createSession(user.id, user.name, user.role)
    res.cookie(cookieName, token, cookieOptions)
    res.json({ user: { id: user.id, name: user.name, role: user.role } })
  }

  router.use(express.static(browserDir))

  router.post('/api/register/begin', async (req, res) => {
    const { name, token } = req.body
    if (!name) {
      return res.status(400).json({ error: 'Name required' })
    }
    const data = await loadUsers()
    const isFirstUser = data.users.length === 0
    if (token || !isFirstUser) {
      const expectedToken = await getRegistrationToken()
      if (!token || token !== expectedToken) {
        return res.status(403).json({ error: 'Invalid registration token' })
      }
    }
    const existing = await findUserByName(name)
    if (existing) {
      return res.status(409).json({ error: 'User name already taken' })
    }
    const user = await createUser(name, isFirstUser ? 'superuser' : 'user')
    const options = await generateRegistrationOptions(name)
    pendingChallenges.set(user.id, { challenge: options.challenge, createdAt: Date.now() })
    res.json({ options, userId: user.id })
  })

  router.post('/api/register/finish', async (req, res) => {
    const { userId, response } = req.body
    const pending = takePendingChallenge(userId)
    if (!pending) {
      return res.status(400).json({ error: 'Registration challenge not found or expired' })
    }
    let result
    try {
      result = await verifyRegistration(userId, { challenge: pending.challenge, response })
    } catch {
      return res.status(400).json({ error: 'Registration verification failed' })
    }
    if (!result.verified) {
      return res.status(400).json({ error: 'Registration verification failed' })
    }
    pendingChallenges.delete(userId)
    const user = await findUserById(userId)
    if (!user) {
      return res.status(400).json({ error: 'Registration verification failed' })
    }
    startSession(res, user)
  })

  router.post('/api/login/begin', async (req, res) => {
    const { name } = req.body
    const user = await findUserByName(name)
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }
    if (!user.webauthn || user.webauthn.length === 0) {
      return res.status(400).json({ error: 'No passkey registered for this user' })
    }
    const options = await generateLoginOptions(name)
    pendingChallenges.set(user.id, { challenge: options.challenge, createdAt: Date.now() })
    res.json({ options, userId: user.id })
  })

  router.post('/api/login/finish', async (req, res) => {
    const { userId, response } = req.body
    const pending = takePendingChallenge(userId)
    if (!pending) {
      return res.status(400).json({ error: 'Login challenge not found or expired' })
    }
    let result
    try {
      result = await verifyLogin(userId, { challenge: pending.challenge, response })
    } catch {
      return res.status(400).json({ error: 'Login verification failed' })
    }
    if (!result.verified) {
      return res.status(400).json({ error: 'Login verification failed' })
    }
    pendingChallenges.delete(userId)
    const user = await findUserById(userId)
    if (!user) {
      return res.status(400).json({ error: 'Login verification failed' })
    }
    startSession(res, user)
  })

  router.post('/api/logout', requireAuth, (req, res) => {
    deleteSession(req.sessionToken)
    res.clearCookie(cookieName, { path: '/browser.app' })
    res.json({ success: true })
  })

  router.get('/api/session', requireAuth, (req, res) => {
    res.json({
      user: {
        id: req.session.userId,
        name: req.session.userName,
        role: req.session.userRole,
        createdAt: req.session.createdAt
      }
    })
  })

  router.get('/api/users', requireSuperuser, async (req, res) => {
    res.json({ users: await listUsers() })
  })

  router.delete('/api/users', requireSuperuser, async (req, res) => {
    const { userId } = req.body
    if (userId === req.session.userId) {
      return res.status(400).json({ error: 'Cannot delete your own account' })
    }
    const user = await findUserById(userId)
    await deleteUser(userId)
    logger.info(`User ${user ? user.name : userId} deleted by ${req.session.userName}`)
    res.json({ success: true })
  })

  router.put('/api/registration-token', requireSuperuser, async (req, res) => {
    const { token } = req.body
    if (typeof token !== 'string' || token.length === 0) {
      return res.status(400).json({ error: 'Token must be a non-empty string' })
    }
    await setRegistrationToken(token)
    logger.info(`Registration token updated by ${req.session.userName}`)
    res.json({ success: true })
  })

  router.get('/api/memories', requireAuth, async (req, res) => {
    const graph = await manager.readGraph()
    let memories = graph.entities.filter(e => e.entityType === 'memory')
    if (req.query.source) {
      memories = memories.filter(e => e.observations.some(o => o === `source: ${req.query.source}`))
    }
    let parsed = memories.map(parseMemory)
    if (req.query.search) {
      const query = req.query.search.toLowerCase()
      parsed = parsed.filter(m => m.name.toLowerCase().includes(query) || m.content.toLowerCase().includes(query))
    }
    parsed.sort((a, b) => b.name.localeCompare(a.name))
    res.json({ memories: parsed })
  })

  router.post('/api/memories', requireSuperuser, async (req, res) => {
    const { content, tags, source, importance = 5 } = req.body
    const name = `memory_${Date.now()}`
    const observations = [content, `importance: ${importance}`]
    if (tags && tags.length > 0) {
      observations.push(`tags: ${tags.join(', ')}`)
    }
    if (source) {
      observations.push(`source: ${source}`)
    }
    await manager.createEntities([{ name, entityType: 'memory', observations }])
    logger.info(`Stored memory ${name} (importance ${importance}${source ? `, source ${source}` : ''})`)
    res.json({ success: true, name })
  })

  router.put('/api/memories/:name', requireSuperuser, async (req, res) => {
    const { name } = req.params
    const graph = await manager.openNodes([name])
    if (graph.entities.length === 0) {
      return res.status(404).json({ error: 'Memory not found' })
    }
    const current = parseMemory(graph.entities[0])
    const { content, tags, source, importance } = req.body
    const mergedContent = content ?? current.content
    const mergedImportance = importance ?? current.importance
    const mergedTags = tags ?? current.tags
    const mergedSource = source ?? current.source
    const observations = [mergedContent, `importance: ${mergedImportance}`]
    if (mergedTags && mergedTags.length > 0) {
      observations.push(`tags: ${mergedTags.join(', ')}`)
    }
    if (mergedSource) {
      observations.push(`source: ${mergedSource}`)
    }
    await manager.deleteEntities([name])
    await manager.createEntities([{ name, entityType: 'memory', observations }])
    logger.info(`Updated memory ${name} (importance ${mergedImportance}${mergedSource ? `, source ${mergedSource}` : ''})`)
    res.json({ success: true })
  })

  router.delete('/api/memories/:name', requireSuperuser, async (req, res) => {
    const { name } = req.params
    await manager.deleteEntities([name])
    logger.info(`Deleted memory ${name}`)
    res.json({ success: true })
  })

  return router
}

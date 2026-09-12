import express, { Router } from 'express'
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  loadUsers,
  getRegistrationToken,
  isRegistrationTokenManagedByEnv,
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
import { getPoolState } from './name-pool.mjs'
import { getAgents, getIdentities } from './agent-registry.mjs'
import { initInfoStore, listInfoPages, readInfoPage, writeInfoPage, deleteInfoPage } from './info-store.mjs'
import { readFile } from 'node:fs/promises'
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
  let priority = 50
  let tags = []
  let source = null
  for (const obs of observations) {
    if (obs.startsWith('priority: ')) {
      priority = parseInt(obs.slice(10), 10) || 50
    } else if (obs.startsWith('importance: ')) {
      priority = Math.min(parseInt(obs.slice(12), 10) * 10, 100) || 50
    } else if (obs.startsWith('tags: ')) {
      tags = obs.slice(6).split(',').map(t => t.trim()).filter(Boolean)
    } else if (obs.startsWith('source: ')) {
      source = obs.slice(8)
    } else if (!content) {
      content = obs
    }
  }
  return { name: entity.name, content, priority, tags, source: source || 'Unclaimed' }
}

export function generateAdminPassword() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = randomBytes(64)
  let password = ''
  for (let i = 0; password.length < 8 && i < bytes.length; i++) {
    if (bytes[i] < 252) {
      password += chars[bytes[i] % 36]
    }
  }
  while (password.length < 8) {
    const b = randomBytes(1)[0]
    if (b < 252) {
      password += chars[b % 36]
    }
  }
  return password
}

const passwordMatches = (candidate, expected) => {
  const a = createHash('sha256').update(candidate || '').digest()
  const b = createHash('sha256').update(expected || '').digest()
  return timingSafeEqual(a, b)
}

export function createBrowserRouter(manager, options = {}) {
  const { adminUser = null, adminPassword = null } = options
  const dataDir = options.dataDir || null
  const rotateOnUse = options.rotateAdminPasswordOnUse || null
  let currentAdminPassword = adminPassword
  const router = Router()
  const wrap = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next)

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

  router.post('/api/register/begin', wrap(async (req, res) => {
    const { name, token } = req.body
    if (!name) {
      return res.status(400).json({ error: 'Name required' })
    }
    const data = await loadUsers()
    const isFirstUser = data.users.length === 0
    if (token || !isFirstUser) {
      const expectedToken = await getRegistrationToken()
      if (!token || token !== expectedToken) {
        logger.warn(`Registration rejected for "${name}" from ${req.ip}: invalid token`)
        return res.status(403).json({ error: 'Invalid registration token' })
      }
    }
    const existing = await findUserByName(name)
    if (existing && existing.webauthn && existing.webauthn.length > 0) {
      logger.warn(`Registration rejected for "${name}" from ${req.ip}: name already taken`)
      return res.status(409).json({ error: 'User name already taken' })
    }
    const options = await generateRegistrationOptions(name)
    const challengeId = randomUUID()
    pendingChallenges.set(challengeId, {
      challenge: options.challenge,
      createdAt: Date.now(),
      name
    })
    logger.info(`Registration started for "${name}" (${isFirstUser ? 'superuser' : 'user'}) from ${req.ip}`)
    res.json({ options, userId: challengeId })
  }))

  router.post('/api/register/finish', wrap(async (req, res) => {
    const { userId, response } = req.body
    const pending = takePendingChallenge(userId)
    if (!pending) {
      return res.status(400).json({ error: 'Registration challenge not found or expired' })
    }
    const data = await loadUsers()
    const isFirstUser = data.users.length === 0
    let user = await findUserByName(pending.name)
    if (user && user.webauthn && user.webauthn.length > 0) {
      return res.status(409).json({ error: 'User name already taken' })
    }
    if (!user) {
      user = await createUser(pending.name, isFirstUser ? 'superuser' : 'user')
    }
    let result
    try {
      result = await verifyRegistration(user.id, { challenge: pending.challenge, response })
    } catch {
      logger.warn(`Passkey registration failed for "${user.name}" from ${req.ip}`)
      if (user.webauthn.length === 0) {
        await deleteUser(user.id)
      }
      return res.status(400).json({ error: 'Registration verification failed' })
    }
    if (!result.verified) {
      logger.warn(`Passkey registration failed for "${user.name}" from ${req.ip}`)
      if (user.webauthn.length === 0) {
        await deleteUser(user.id)
      }
      return res.status(400).json({ error: 'Registration verification failed' })
    }
    logger.info(`User "${user.name}" registered a passkey from ${req.ip}`)
    startSession(res, user)
  }))

  router.post('/api/login/begin', wrap(async (req, res) => {
    const { name, password } = req.body
    if (!name) {
      return res.status(400).json({ error: 'Name required' })
    }
    if (adminUser && currentAdminPassword && password) {
      if (name === adminUser && passwordMatches(password, currentAdminPassword)) {
        if (rotateOnUse) {
          const next = await rotateOnUse()
          if (next) currentAdminPassword = next
          logger.info(`User "${adminUser}" signed in with one-time password from ${req.ip}`)
        } else {
          logger.info(`User "${adminUser}" signed in with password from ${req.ip}`)
        }
        const token = createSession('password-admin', adminUser, 'superuser')
        res.cookie(cookieName, token, cookieOptions)
        return res.json({ user: { id: 'password-admin', name: adminUser, role: 'superuser' }, passwordLogin: true })
      }
      logger.warn(`Password login rejected for "${name}" from ${req.ip}`)
      return res.status(401).json({ error: 'Invalid username or password' })
    }
    const user = await findUserByName(name)
    if (!user) {
      logger.warn(`Login rejected from ${req.ip}: unknown user "${name}"`)
      return res.status(404).json({ error: 'User not found' })
    }
    if (!user.webauthn || user.webauthn.length === 0) {
      return res.status(400).json({ error: 'No passkey registered for this user' })
    }
    const options = await generateLoginOptions(name)
    pendingChallenges.set(user.id, { challenge: options.challenge, createdAt: Date.now() })
    res.json({ options, userId: user.id })
  }))

  router.post('/api/login/finish', wrap(async (req, res) => {
    const { userId, response } = req.body
    const pending = takePendingChallenge(userId)
    if (!pending) {
      return res.status(400).json({ error: 'Login challenge not found or expired' })
    }
    let result
    try {
      result = await verifyLogin(userId, { challenge: pending.challenge, response })
    } catch {
      logger.warn(`Passkey login failed for user ${userId} from ${req.ip}`)
      return res.status(400).json({ error: 'Login verification failed' })
    }
    if (!result.verified) {
      logger.warn(`Passkey login failed for user ${userId} from ${req.ip}`)
      return res.status(400).json({ error: 'Login verification failed' })
    }
    pendingChallenges.delete(userId)
    const user = await findUserById(userId)
    if (!user) {
      return res.status(400).json({ error: 'Login verification failed' })
    }
    logger.info(`User "${user.name}" signed in from ${req.ip}`)
    startSession(res, user)
  }))

  router.post('/api/logout', requireAuth, (req, res) => {
    deleteSession(req.sessionToken)
    logger.info(`User "${req.session.userName}" signed out`)
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

  router.get('/api/status', wrap(async (req, res) => {
    let llm = 'unknown'
    let logWarning = null
    if (dataDir) {
      try {
        llm = (await readFile(join(dataDir, 'llm.status'), 'utf8')).trim() || 'unknown'
      } catch {
        llm = 'unknown'
      }
      try {
        logWarning = (await readFile(join(dataDir, 'log-warning'), 'utf8')).trim() || null
      } catch {
        logWarning = null
      }
    }
    res.json({ llm, server: 's19y-memory', logWarning })
  }))

  router.get('/api/agent-pool', requireAuth, wrap(async (req, res) => {
    res.json({ pool: getPoolState() })
  }))

  router.get('/api/agents', requireSuperuser, wrap(async (req, res) => {
    const sessions = getAgents().sort((a, b) =>
      new Date(b.lastSeen || 0) - new Date(a.lastSeen || 0)
    )
    res.json({ pool: getPoolState(), identities: getIdentities(), sessions })
  }))

  router.get('/api/users', requireSuperuser, wrap(async (req, res) => {
    res.json({ users: await listUsers() })
  }))

  router.delete('/api/users', requireSuperuser, wrap(async (req, res) => {
    const { userId } = req.body
    if (userId === req.session.userId) {
      return res.status(400).json({ error: 'Cannot delete your own account' })
    }
    const user = await findUserById(userId)
    await deleteUser(userId)
    logger.info(`User ${user ? user.name : userId} deleted by ${req.session.userName}`)
    res.json({ success: true })
  }))

  router.put('/api/registration-token', requireSuperuser, wrap(async (req, res) => {
    const { token } = req.body
    if (typeof token !== 'string' || token.trim().length === 0) {
      return res.status(400).json({ error: 'Token must be a non-empty string' })
    }
    if (isRegistrationTokenManagedByEnv()) {
      return res.status(400).json({ error: 'Registration token is managed by the REGISTRATION_TOKEN environment variable and cannot be changed here' })
    }
    await setRegistrationToken(token)
    logger.info(`Registration token updated by ${req.session.userName}`)
    res.json({ success: true, token })
  }))

  router.get('/api/registration-token', requireSuperuser, wrap(async (req, res) => {
    const token = await getRegistrationToken()
    res.json({ token, managedByEnv: isRegistrationTokenManagedByEnv() })
  }))

  router.get('/api/memories', requireAuth, wrap(async (req, res) => {
    const graph = await manager.readGraph()
    let memories = graph.entities.filter(e => e.entityType === 'memory')
    let parsed = memories.map(parseMemory)
    if (req.query.source) {
      parsed = parsed.filter(m => m.source === req.query.source)
    }
    if (req.query.search) {
      const query = req.query.search.toLowerCase()
      parsed = parsed.filter(m => m.name.toLowerCase().includes(query) || m.content.toLowerCase().includes(query))
    }
    parsed.sort((a, b) => b.name.localeCompare(a.name))
    res.json({ memories: parsed })
  }))

  router.post('/api/memories', requireSuperuser, wrap(async (req, res) => {
    const { content, tags, source, priority = 50 } = req.body
    const name = `memory_${Date.now()}`
    const observations = [content, `priority: ${priority}`]
    if (tags && tags.length > 0) {
      observations.push(`tags: ${tags.join(', ')}`)
    }
    if (source) {
      observations.push(`source: ${source}`)
    }
    await manager.createEntities([{ name, entityType: 'memory', observations }])
    logger.info(`Stored memory ${name} (priority ${priority}${source ? `, source ${source}` : ''})`)
    res.json({ success: true, name })
  }))

  router.put('/api/memories/:name', requireSuperuser, wrap(async (req, res) => {
    const { name } = req.params
    const graph = await manager.openNodes([name])
    if (graph.entities.length === 0) {
      return res.status(404).json({ error: 'Memory not found' })
    }
    const current = parseMemory(graph.entities[0])
    const { content, tags, source, priority } = req.body
    const mergedContent = content ?? current.content
    const mergedPriority = priority ?? current.priority
    const mergedTags = tags ?? current.tags
    const mergedSource = source ?? current.source
    const observations = [mergedContent, `priority: ${mergedPriority}`]
    if (mergedTags && mergedTags.length > 0) {
      observations.push(`tags: ${mergedTags.join(', ')}`)
    }
    if (mergedSource) {
      observations.push(`source: ${mergedSource}`)
    }
    await manager.deleteEntities([name])
    await manager.createEntities([{ name, entityType: 'memory', observations }])
    logger.info(`Updated memory ${name} (priority ${mergedPriority}${mergedSource ? `, source ${mergedSource}` : ''})`)
    res.json({ success: true })
  }))

  router.delete('/api/memories/:name', requireSuperuser, wrap(async (req, res) => {
    const { name } = req.params
    await manager.deleteEntities([name])
    logger.info(`Deleted memory ${name}`)
    res.json({ success: true })
  }))

  router.get('/api/info', requireAuth, wrap(async (req, res) => {
    res.json({ pages: await listInfoPages() })
  }))

  router.get('/api/info/:name', requireAuth, wrap(async (req, res) => {
    const page = await readInfoPage(req.params.name)
    if (!page) {
      return res.status(404).json({ error: 'Info page not found' })
    }
    res.json(page)
  }))

  router.post('/api/info', requireSuperuser, wrap(async (req, res) => {
    const { name, content } = req.body
    let result
    try {
      result = await writeInfoPage(name, content)
    } catch (err) {
      return res.status(400).json({ error: err.message })
    }
    logger.info(`Info page "${name}" saved by ${req.session.userName}`)
    res.json({ success: true, name: result.name, size: result.size })
  }))

  router.put('/api/info/:name', requireSuperuser, wrap(async (req, res) => {
    const { name } = req.params
    const existing = await readInfoPage(name)
    if (!existing) {
      return res.status(404).json({ error: 'Info page not found' })
    }
    const { content } = req.body
    let result
    try {
      result = await writeInfoPage(name, content)
    } catch (err) {
      return res.status(400).json({ error: err.message })
    }
    logger.info(`Info page "${name}" saved by ${req.session.userName}`)
    res.json({ success: true, name, size: result.size })
  }))

  router.delete('/api/info/:name', requireSuperuser, wrap(async (req, res) => {
    const { name } = req.params
    const deleted = await deleteInfoPage(name)
    if (!deleted) {
      return res.status(404).json({ error: 'Info page not found' })
    }
    logger.info(`Info page "${name}" deleted by ${req.session.userName}`)
    res.json({ success: true })
  }))

  router.use((err, req, res, next) => {
    logger.error(`Browser API error: ${err.message}`)
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  return router
}

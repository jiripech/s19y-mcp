import crypto from 'node:crypto'

const sessions = new Map()
const SESSION_TTL = 24 * 60 * 60 * 1000

export const cookieName = 's19y_session'
export const cookieOptions = { httpOnly: true, sameSite: 'lax', path: '/browser.app', maxAge: SESSION_TTL }

export function createSession(userId, userName, userRole) {
  const token = crypto.randomBytes(32).toString('hex')
  sessions.set(token, { userId, userName, userRole, createdAt: Date.now() })
  return token
}

export function getSession(token) {
  if (!token) return null
  const session = sessions.get(token)
  if (!session) return null
  if (Date.now() - session.createdAt > SESSION_TTL) {
    sessions.delete(token)
    return null
  }
  return session
}

export function deleteSession(token) {
  sessions.delete(token)
}

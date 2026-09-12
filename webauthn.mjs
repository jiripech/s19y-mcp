import { randomUUID, randomBytes } from 'node:crypto'
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import os from 'node:os'
import {
  generateRegistrationOptions as serverGenRegOpts,
  verifyRegistrationResponse as serverVerifyRegResp,
  generateAuthenticationOptions as serverGenAuthOpts,
  verifyAuthenticationResponse as serverVerifyAuthResp
} from '@simplewebauthn/server'
import { logger } from './logger.mjs'

const dataDir = process.env.DATA_DIR || '/app/data'
let effectiveDataDir = dataDir

export const rpContextFor = (req = {}) => {
  const headers = req.headers || {}
  const forwardedHost = (headers['x-forwarded-host'] || '').split(',')[0].trim()
  const hostHeader = forwardedHost || headers.host || ''
  const hostOnly = hostHeader.replace(/:\d+$/, '') || os.hostname()
  const scheme = process.env.BROWSER_SCHEME || (req.secure ? 'https' : (req.protocol || 'http'))
  const originHost = hostHeader || `${hostOnly}:${process.env.PORT || '3000'}`
  const rpId = process.env.BROWSER_HOSTNAME || hostOnly
  return { rpId, scheme, origin: `${scheme}://${originHost}` }
}

export const describeRpDefaults = () => {
  const rpId = process.env.BROWSER_HOSTNAME || '<derived from request Host>'
  const scheme = process.env.BROWSER_SCHEME || '<derived from X-Forwarded-Proto>'
  const port = process.env.PORT || '3000'
  const auto = process.env.BROWSER_HOSTNAME ? '' : ' (auto: set BROWSER_HOSTNAME for a stable RP ID)'
  return `rpID=${rpId} scheme=${scheme} external port=${port}${auto}`
}

const toBase64 = (buf) => Buffer.from(buf).toString('base64url')
const fromBase64 = (str) => new Uint8Array(Buffer.from(str, 'base64url'))

export const loadUsers = async () => {
  try {
    const raw = await readFile(join(effectiveDataDir, 'users.json'), 'utf8')
    return JSON.parse(raw)
  } catch {
    const data = { registrationToken: randomBytes(32).toString('hex'), users: [] }
    await saveUsers(data)
    return data
  }
}

export const saveUsers = async (data) => {
  try {
    await mkdir(effectiveDataDir, { recursive: true })
  } catch {
    effectiveDataDir = 'data'
    logger.warn(`Cannot create ${dataDir}, falling back to ${effectiveDataDir}`)
    await mkdir(effectiveDataDir, { recursive: true })
  }
  const usersPath = join(effectiveDataDir, 'users.json')
  const tmpFile = `${usersPath}.tmp`
  await writeFile(tmpFile, JSON.stringify(data, null, 2))
  await rename(tmpFile, usersPath)
}

export const getRegistrationToken = async () => {
  if (process.env.REGISTRATION_TOKEN) {
    return process.env.REGISTRATION_TOKEN
  }
  const data = await loadUsers()
  return data.registrationToken
}

export const isRegistrationTokenManagedByEnv = () => {
  return Boolean(process.env.REGISTRATION_TOKEN)
}

export const setRegistrationToken = async (newToken) => {
  const data = await loadUsers()
  data.registrationToken = newToken
  await saveUsers(data)
}

export const findUserByName = async (name) => {
  const data = await loadUsers()
  return data.users.find(u => u.name === name) || null
}

export const findUserById = async (id) => {
  const data = await loadUsers()
  return data.users.find(u => u.id === id) || null
}

export const createUser = async (name, role) => {
  const data = await loadUsers()
  const user = {
    id: randomUUID(),
    name,
    role,
    webauthn: [],
    createdAt: new Date().toISOString()
  }
  data.users.push(user)
  await saveUsers(data)
  return user
}

export const addCredentialToUser = async (userId, credential) => {
  const data = await loadUsers()
  const user = data.users.find(u => u.id === userId)
  if (!user) throw new Error('User not found')
  user.webauthn.push(credential)
  await saveUsers(data)
}

export const deleteUser = async (userId) => {
  const data = await loadUsers()
  data.users = data.users.filter(u => u.id !== userId)
  await saveUsers(data)
}

export const generateRegistrationOptions = async (name, rp) => {
  const rpCtx = rp || rpContextFor()
  const user = await findUserByName(name)

  const excludeCredentials = user
    ? (user.webauthn || []).map(c => ({
        id: c.credentialID,
        transports: c.transports
      }))
    : []

  return serverGenRegOpts({
    rpName: 'S19y Memory',
    rpID: rpCtx.rpId,
    userName: name,
    attestationType: 'none',
    excludeCredentials,
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred'
    }
  })
}

export const verifyRegistration = async (userId, attestationResponse, rp) => {
  const rpCtx = rp || rpContextFor()
  const data = await loadUsers()
  const user = data.users.find(u => u.id === userId)
  if (!user) throw new Error('User not found')

  const { challenge, response } = attestationResponse

  const result = await serverVerifyRegResp({
    response,
    expectedChallenge: challenge,
    expectedOrigin: rpCtx.origin,
    expectedRPID: rpCtx.rpId
  })

  if (result.verified && result.registrationInfo) {
    const { credential } = result.registrationInfo
    user.webauthn.push({
      credentialID: credential.id,
      credentialPublicKey: toBase64(credential.publicKey),
      counter: credential.counter
    })
    await saveUsers(data)
  }

  return result
}

export const generateLoginOptions = async (name, rp) => {
  const rpCtx = rp || rpContextFor()
  const user = await findUserByName(name)
  if (!user) throw new Error('User not found')

  const allowCredentials = (user.webauthn || []).map(c => ({
    id: c.credentialID,
    transports: c.transports
  }))

  return serverGenAuthOpts({
    rpID: rpCtx.rpId,
    allowCredentials,
    userVerification: 'preferred'
  })
}

export const verifyLogin = async (userId, assertionResponse, rp) => {
  const rpCtx = rp || rpContextFor()
  const data = await loadUsers()
  const user = data.users.find(u => u.id === userId)
  if (!user) throw new Error('User not found')

  const { challenge, response } = assertionResponse

  const stored = user.webauthn.find(c => c.credentialID === response.id)
  if (!stored) throw new Error('Credential not found')

  const credential = {
    id: stored.credentialID,
    publicKey: fromBase64(stored.credentialPublicKey),
    counter: stored.counter
  }

  const result = await serverVerifyAuthResp({
    response,
    expectedChallenge: challenge,
    expectedOrigin: rpCtx.origin,
    expectedRPID: rpCtx.rpId,
    credential
  })

  if (result.verified) {
    stored.counter = result.authenticationInfo.newCounter
    await saveUsers(data)
  }

  return result
}

export const isSuperuser = async (userId) => {
  const user = await findUserById(userId)
  return user?.role === 'superuser'
}

export const listUsers = async () => {
  const data = await loadUsers()
  return data.users.map(({ id, name, role, createdAt }) => ({ id, name, role, createdAt }))
}

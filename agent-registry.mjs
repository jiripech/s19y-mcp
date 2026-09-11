import { readFile, writeFile, rename, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { logger } from './logger.mjs'

let effectiveDataDir = process.env.DATA_DIR || '/app/data'
let agents = {}
let loaded = false
let writeChain = Promise.resolve()

const agentsPath = () => join(effectiveDataDir, 'agents.json')

const persistAgentsFile = async () => {
  try {
    await mkdir(effectiveDataDir, { recursive: true })
  } catch {
    effectiveDataDir = 'data'
    logger.warn(`Cannot create ${effectiveDataDir}, falling back to data directory`)
    await mkdir(effectiveDataDir, { recursive: true })
  }
  const tmpFile = `${agentsPath()}.tmp`
  await writeFile(tmpFile, JSON.stringify(agents, null, 2))
  await rename(tmpFile, agentsPath())
}

const chain = (fn) => {
  writeChain = writeChain.then(fn, fn)
  return writeChain
}

const normalizeRecord = (raw) => ({
  uuid: raw.uuid,
  name: raw.name || 'Unknown',
  source: raw.source || null,
  firstSeen: raw.firstSeen || null,
  lastSeen: raw.lastSeen || null,
  connections: raw.connections || 0,
  ip: raw.ip || null,
  transport: raw.transport || null
})

export async function initAgentRegistry() {
  try {
    const raw = JSON.parse(await readFile(agentsPath(), 'utf8'))
    agents = raw && typeof raw === 'object' ? raw : {}
    const known = Object.values(agents).filter(a => a.identified || a.source).length
    logger.info(`Agent registry restored: ${Object.keys(agents).length} sessions, ${known} identified from ${agentsPath()}`)
  } catch {
    agents = {}
    await persistAgentsFile()
    logger.info(`Agent registry created: ${agentsPath()}`)
  }
  loaded = true
  return agents
}

export function getAgent(uuid) {
  const raw = agents[uuid]
  return raw ? normalizeRecord(raw) : null
}

export function getAgents() {
  return Object.values(agents).map(normalizeRecord)
}

export function getIdentifiedAgents() {
  return getAgents().filter(a => a.source)
}

export function getIdentities() {
  const bySource = new Map()
  for (const record of getAgents()) {
    if (!record.source) continue
    const existing = bySource.get(record.source)
    if (!existing) {
      bySource.set(record.source, { ...record })
      continue
    }
    if (new Date(record.lastSeen || 0) > new Date(existing.lastSeen || 0)) {
      existing.name = record.name
      existing.lastSeen = record.lastSeen
      existing.ip = record.ip || existing.ip
      existing.transport = record.transport || existing.transport
      existing.uuid = record.uuid
    }
    existing.firstSeen = existing.firstSeen || record.firstSeen
    existing.connections = (existing.connections || 0) + (record.connections || 0)
  }
  return [...bySource.values()].sort((a, b) =>
    new Date(b.lastSeen || 0) - new Date(a.lastSeen || 0)
  )
}

export function findPreviousClaim({ uuid, name }) {
  for (const raw of Object.values(agents)) {
    if (raw.source && (raw.uuid === uuid || (name && raw.name === name))) {
      return raw.source
    }
  }
  return null
}

export function rememberConnection({ uuid, name, ip, transport }) {
  if (!uuid) return Promise.resolve(null)
  return chain(async () => {
    const now = new Date().toISOString()
    const existing = agents[uuid]
    if (existing) {
      existing.name = name
      existing.lastSeen = now
      existing.connections = (existing.connections || 1) + 1
      if (ip) existing.ip = ip
      if (transport) existing.transport = transport
    } else {
      agents[uuid] = {
        uuid,
        name,
        ip: ip || null,
        transport: transport || null,
        source: null,
        firstSeen: now,
        lastSeen: now,
        connections: 1
      }
    }
    await persistAgentsFile()
    return normalizeRecord(agents[uuid])
  })
}

export function rememberIdentity(uuid, source) {
  if (!uuid || !source) return Promise.resolve(null)
  return chain(async () => {
    const now = new Date().toISOString()
    const existing = agents[uuid]
    if (!existing) {
      const prior = Object.values(agents).find(a => a.source === source && a.uuid !== uuid)
      agents[uuid] = {
        uuid,
        name: source,
        ip: prior && prior.ip ? prior.ip : null,
        transport: prior && prior.transport ? prior.transport : null,
        source,
        firstSeen: prior ? (prior.firstSeen || now) : now,
        lastSeen: now,
        connections: prior ? (prior.connections || 1) + 1 : 1
      }
    } else {
      existing.source = source
      existing.lastSeen = now
    }
    await persistAgentsFile()
    return normalizeRecord(agents[uuid])
  })
}
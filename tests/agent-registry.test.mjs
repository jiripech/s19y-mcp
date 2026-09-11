import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dataDir = mkdtempSync(join(tmpdir(), 's19y-agents-'))

process.env.DATA_DIR = dataDir

let mod

describe('Agent registry', () => {
  before(async () => {
    mod = await import('../agent-registry.mjs')
    await mod.initAgentRegistry()
  })

  after(() => {
    rmSync(dataDir, { recursive: true, force: true })
  })

  it('records a connection and persists it', async () => {
    const record = await mod.rememberConnection({
      uuid: 'uuid-1',
      name: 'Agent Umbra',
      ip: '172.17.0.1',
      transport: 'streamable-http'
    })
    assert.strictEqual(record.name, 'Agent Umbra')
    assert.strictEqual(record.connections, 1)
    assert.ok(record.firstSeen)
  })

  it('increments the connection count on reconnect', async () => {
    await mod.rememberConnection({ uuid: 'uuid-1', name: 'Agent Umbra' })
    const record = mod.getAgent('uuid-1')
    assert.strictEqual(record.connections, 2)
  })

  it('remembers the claimed identity', async () => {
    await mod.rememberIdentity('uuid-1', 'Aemilius Papinianus')
    const record = mod.getAgent('uuid-1')
    assert.strictEqual(record.source, 'Aemilius Papinianus')
    assert.strictEqual(record.name, 'Agent Umbra')
    assert.ok(mod.getIdentifiedAgents().some(a => a.source === 'Aemilius Papinianus'))
  })

  it('offers a previously claimed identity by name or uuid', async () => {
    assert.strictEqual(mod.findPreviousClaim({ uuid: 'uuid-1' }), 'Aemilius Papinianus')
    assert.strictEqual(mod.findPreviousClaim({ name: 'Agent Umbra' }), 'Aemilius Papinianus')
    assert.strictEqual(mod.findPreviousClaim({ uuid: 'unknown-uuid', name: 'Nobody' }), null)
  })

  it('merges identity history when the same source is reused on a new session', async () => {
    await mod.rememberIdentity('uuid-2', 'Aemilius Papinianus')
    const record = mod.getAgent('uuid-2')
    assert.strictEqual(record.source, 'Aemilius Papinianus')
    assert.ok(record.firstSeen)
    const identities = mod.getIdentities().filter(i => i.source === 'Aemilius Papinianus')
    assert.strictEqual(identities.length, 1)
    assert.strictEqual(identities[0].connections, 5)
    assert.strictEqual(identities[0].ip, '172.17.0.1')
  })

  it('sorts identities by lastSeen with the most recent first', async () => {
    const identities = mod.getIdentities()
    for (let i = 1; i < identities.length; i++) {
      assert.ok(new Date(identities[i - 1].lastSeen) >= new Date(identities[i].lastSeen))
    }
  })

  it('reloads the registry from disk at next startup', async () => {
    const fresh = await import(`../agent-registry.mjs?reload=${Date.now()}`)
    await fresh.initAgentRegistry()
    const record = fresh.getAgent('uuid-1')
    assert.strictEqual(record.source, 'Aemilius Papinianus')
    assert.strictEqual(record.connections, 2)
  })
})
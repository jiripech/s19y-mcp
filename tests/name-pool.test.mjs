import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dataDir = mkdtempSync(join(tmpdir(), 's19y-pool-'))

process.env.DATA_DIR = dataDir

let mod

describe('Name pool', () => {
  before(async () => {
    mod = await import('../name-pool.mjs')
  })

  after(() => {
    rmSync(dataDir, { recursive: true, force: true })
  })

  it('seeds the pool from defaults when names.txt is missing', async () => {
    await mod.initNamePool()
    const state = mod.getPoolState()
    assert.strictEqual(state.total, 47)
    assert.ok(state.available.includes('Epictetus'))
    assert.ok(existsSync(join(dataDir, 'names.txt')))
  })

  it('claims a name and rotates in the next ordinal variant', async () => {
    const ok = await mod.claimName('Epictetus')
    assert.strictEqual(ok, true)
    const lines = readFileSync(join(dataDir, 'names.txt'), 'utf8')
      .split('\n')
      .filter(Boolean)
    assert.ok(!lines.includes('Epictetus'))
    assert.ok(lines.includes('Epictetus the 2nd'))
  })

  it('ignores claims for names that are not in the pool', async () => {
    const ok = await mod.claimName('Not In The Pool')
    assert.strictEqual(ok, false)
    assert.ok(mod.getAvailableNames().includes('Cicero'))
  })

  it('serializes claims so only one session gets a given name', async () => {
    const [a, b] = await Promise.all([
      mod.claimName('Cicero'),
      mod.claimName('Cicero')
    ])
    assert.strictEqual(a, true)
    assert.strictEqual(b, false)
    const lines = readFileSync(join(dataDir, 'names.txt'), 'utf8')
      .split('\n')
      .filter(Boolean)
    assert.ok(!lines.includes('Cicero'))
    assert.ok(lines.includes('Cicero the 2nd'))
  })

  it('renders higher ordinal variants correctly', async () => {
    await mod.claimName('Cicero the 2nd')
    const lines = readFileSync(join(dataDir, 'names.txt'), 'utf8')
      .split('\n')
      .filter(Boolean)
    assert.ok(!lines.includes('Cicero the 2nd'))
    assert.ok(lines.includes('Cicero the 3rd'))
  })

  it('is file-based only and never writes a memory entity', async () => {
    const graphPath = join(dataDir, 'memory.jsonl')
    assert.ok(!existsSync(graphPath) || !readFileSync(graphPath, 'utf8').includes('agent_names'))
  })
})
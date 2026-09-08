import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dataDir = mkdtempSync(join(tmpdir(), 's19y-instr-'))
process.env.DATA_DIR = dataDir

let mod

describe('Instruction transpose', () => {
  before(async () => {
    mod = await import('../instructions.mjs')
    await mod.initInstructions()
  })

  after(() => {
    delete process.env.DATA_DIR
    rmSync(dataDir, { recursive: true, force: true })
  })

  it('initializes the AGENTS.md file', () => {
    assert.ok(existsSync(join(dataDir, 'AGENTS.md')))
  })

  it('transposes a priority 90 memory into AGENTS.md', async () => {
    await mod.transposeInstruction({
      name: 'memory_checklist',
      observations: [
        'Before-Push Checklist content',
        'priority: 90',
        'u: jiri.pech',
        'p: s19y-mcp',
        'source: Aemilius Papinianus the 2nd'
      ]
    })
    const content = readFileSync(join(dataDir, 'AGENTS.md'), 'utf8')
    assert.match(content, /Before-Push Checklist content/)
    assert.match(content, /u: jiri\.pech, p: s19y-mcp/)
  })

  it('does not transpose a memory below priority 90', async () => {
    await mod.transposeInstruction({
      name: 'memory_low',
      observations: ['plain content', 'priority: 50']
    })
    const content = readFileSync(join(dataDir, 'AGENTS.md'), 'utf8')
    assert.doesNotMatch(content, /plain content/)
  })

  it('does not transpose the same memory twice', async () => {
    await mod.transposeInstruction({
      name: 'memory_checklist',
      observations: [
        'Before-Push Checklist content',
        'priority: 90',
        'u: jiri.pech',
        'p: s19y-mcp'
      ]
    })
    const content = readFileSync(join(dataDir, 'AGENTS.md'), 'utf8')
    assert.strictEqual((content.match(/<!-- memory: memory_checklist -->/g) || []).length, 1)
  })
})
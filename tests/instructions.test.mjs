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

  it('initializes the agents info page', async () => {
    assert.ok(existsSync(join(dataDir, 'info', 'agents.md')))
  })

  it('lists the agents page in the info store', async () => {
    const infoStore = await import('../info-store.mjs')
    const pages = await infoStore.listInfoPages()
    assert.ok(pages.some(p => p.name === 'agents'))
  })

  it('transposes a priority 90 memory into the agents info page', async () => {
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
    const content = readFileSync(join(dataDir, 'info', 'agents.md'), 'utf8')
    assert.match(content, /Before-Push Checklist content/)
    assert.match(content, /Author metadata: u jiri\.pech, p s19y-mcp/)
  })

  it('wraps long content at 80 columns and ends the section cleanly', async () => {
    const longContent = 'Sentence one. '.repeat(30) +
      'Sentence two with a very long unbroken token: ' +
      'abcdefghijklmnopqrstuvwxyz'.repeat(5) + '.'
    await mod.transposeInstruction({
      name: 'memory_wrapped',
      observations: [longContent, 'priority: 90', 'u: jiri.pech']
    })
    const content = readFileSync(join(dataDir, 'info', 'agents.md'), 'utf8')
    const section = content.slice(content.indexOf('<!-- memory: memory_wrapped -->'))
    for (const line of section.split('\n')) {
      assert.ok(line.length <= 80, `line exceeds 80 chars: ${line.length}`)
    }
    assert.match(section, /\n---\nAuthor metadata: u jiri\.pech, p Unclaimed, stored /)
  })

  it('does not transpose a memory below priority 90', async () => {
    await mod.transposeInstruction({
      name: 'memory_low',
      observations: ['plain content', 'priority: 50']
    })
    const content = readFileSync(join(dataDir, 'info', 'agents.md'), 'utf8')
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
    const content = readFileSync(join(dataDir, 'info', 'agents.md'), 'utf8')
    assert.strictEqual((content.match(/<!-- memory: memory_checklist -->/g) || []).length, 1)
  })
})
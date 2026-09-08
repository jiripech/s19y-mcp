import { readFile, writeFile, rename, access } from 'node:fs/promises'
import { join } from 'node:path'
import { logger } from './logger.mjs'

const dataDir = process.env.DATA_DIR || '/app/data'
const agentsFile = join(dataDir, 'AGENTS.md')
const TRANSPOSE_MARKER = (name) => `<!-- memory: ${name} -->`
const CONTENT_PATTERN = /^(priority: |tags: |u: |p: |exp: |cr: |cs: |source: |compressed: |importance: )/

export async function initInstructions() {
  try {
    await access(agentsFile)
  } catch {
    const header = '# Server instructions\n\n' +
      'High priority memories (90+) are transposed here automatically.\n'
    await writeFile(agentsFile, header)
    logger.info(`Initialized ${agentsFile}`)
  }
}

export async function transposeInstruction(entity) {
  const observations = entity.observations || []
  if (!observations.some(o => /^priority: (9[0-9]|100)$/.test(o))) {
    return
  }
  if (observations.some(o => o === TRANSPOSE_MARKER(entity.name))) {
    return
  }
  const uObs = observations.find(o => o.startsWith('u: '))
  const pObs = observations.find(o => o.startsWith('p: '))
  const content = observations.find(o => o && o.trim() && !CONTENT_PATTERN.test(o))
  if (!content) {
    return
  }
  const date = new Date().toISOString().slice(0, 10)
  const meta = `u: ${uObs ? uObs.slice(3) : 'Unclaimed'}, p: ${pObs ? pObs.slice(3) : 'Unclaimed'}`
  const section = `\n${TRANSPOSE_MARKER(entity.name)}\n\n## ${content.slice(0, 60)}\n\n` +
    `${content}\n\n_Author ${meta}, stored ${date}_\n`
  try {
    let current = ''
    try {
      current = await readFile(agentsFile, 'utf8')
    } catch {
      await initInstructions()
    }
    const tmpFile = `${agentsFile}.tmp`
    await writeFile(tmpFile, current + section)
    await rename(tmpFile, agentsFile())
    logger.info(`Instruction from memory ${entity.name} transposed into AGENTS.md`)
  } catch (err) {
    logger.error(`Failed to transpose memory ${entity.name} into AGENTS.md: ${err.message}`)
  }
}

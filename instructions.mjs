import { readFile, writeFile, rename, access } from 'node:fs/promises'
import { join } from 'node:path'
import { logger } from './logger.mjs'

const dataDir = process.env.DATA_DIR || '/app/data'
const agentsFile = join(dataDir, 'AGENTS.md')
const TRANSPOSE_MARKER = (name) => `<!-- memory: ${name} -->`
const CONTENT_PATTERN = /^(priority: |tags: |u: |p: |exp: |cr: |cs: |source: |compressed: |importance: )/
const TITLE_MAX = 60
const WRAP_WIDTH = 80

function titleFrom(content) {
  const trimmed = content.trim()
  if (trimmed.length <= TITLE_MAX) {
    return trimmed
  }
  const slice = trimmed.slice(0, TITLE_MAX)
  const lastSpace = slice.lastIndexOf(' ')
  const cut = lastSpace > 0 ? slice.slice(0, lastSpace) : slice
  return `${cut}…`
}

function wrapLine(line, width) {
  if (line.length <= width) {
    return [line]
  }
  const words = line.split(/\s+/)
  const lines = []
  let current = ''
  for (const word of words) {
    if (word.length > width) {
      if (current) {
        lines.push(current)
        current = ''
      }
      for (let i = 0; i < word.length; i += width) {
        lines.push(word.slice(i, i + width))
      }
    } else if (current && current.length + word.length + 1 > width) {
      lines.push(current)
      current = word
    } else {
      current = current ? `${current} ${word}` : word
    }
  }
  if (current) {
    lines.push(current)
  }
  return lines
}

function wrapContent(content) {
  return content
    .split('\n')
    .flatMap(line => wrapLine(line, WRAP_WIDTH))
    .join('\n')
}

export function formatSection(name, content, meta, date) {
  const title = titleFrom(content)
  const body = wrapContent(content.trim())
  return `\n${TRANSPOSE_MARKER(name)}\n\n## ${title}\n\n${body}\n\n---\n` +
    `Author metadata: ${meta}, stored ${date}\n`
}

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
  const uObs = observations.find(o => o.startsWith('u: '))
  const pObs = observations.find(o => o.startsWith('p: '))
  const content = observations.find(o => o && o.trim() && !CONTENT_PATTERN.test(o))
  if (!content) {
    return
  }
  const date = new Date().toISOString().slice(0, 10)
  const meta = `u ${uObs ? uObs.slice(3) : 'Unclaimed'}, p ${pObs ? pObs.slice(3) : 'Unclaimed'}`
  const section = formatSection(entity.name, content, meta, date)
  try {
    let current = ''
    try {
      current = await readFile(agentsFile, 'utf8')
    } catch {
      await initInstructions()
    }
    if (current.includes(TRANSPOSE_MARKER(entity.name))) {
      return
    }
    const tmpFile = `${agentsFile}.tmp`
    await writeFile(tmpFile, current + section)
    await rename(tmpFile, agentsFile)
    logger.info(`Instruction from memory ${entity.name} transposed into AGENTS.md`)
  } catch (err) {
    logger.error(`Failed to transpose memory ${entity.name} into AGENTS.md: ${err.message}`)
  }
}

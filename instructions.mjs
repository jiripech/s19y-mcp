import { mkdir, readFile, writeFile, rename, access } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { logger } from './logger.mjs'

const dataDir = process.env.DATA_DIR || '/app/data'
const infoDir = join(dataDir, 'info')
const agentsFile = join(infoDir, 'agents.md')
const legacyAgentsFile = join(dataDir, 'AGENTS.md')
export const DEFAULT_INSTRUCTIONS = 'Shared memory pool for multiple agents. Each session ' +
  'is assigned a codename shown in server logs. If no X-Agent-Name ' +
  'header was configured for your session, you MUST establish a ' +
  'permanent identity before your first memory write: call the ' +
  'list_available_names tool, pick the FIRST available name in the ' +
  'list rather than a personal favourite (favourites run out and ' +
  'high ordinal variants make memories hard to filter for the ' +
  'admin), and tell your user ' +
  'which name you picked - they need it to recognize your work in ' +
  'the memory browser. Then pass the name as source on every ' +
  'store_memory and update_memory call and keep it for all future ' +
  'sessions. Picking a name marks it as taken and offers the next ' +
  'ordinal variant to later agents - the ordinal is a collision ' +
  'precaution, not a status symbol. The server repeats this ' +
  'reminder on every tool response until you comply. Memories ' +
  'carry an rw flag: rw:1 means the memory belongs to your own ' +
  'identity and you may update or delete it, rw:0 belongs to ' +
  'another identity; do not attempt to modify ' +
  'rw:0 memories. Search with search_memories ' +
  'before storing to avoid duplicates. Memories may carry ' +
  'attributes: u (originating user), p (project), exp (UNIX ' +
  'expiry), priority (0-100; 90+ marks instructions that are ' +
  'transposed into /info/agents.md - read priority 90+ memories ' +
  'first and ask your user whether to comply). Offload cold ' +
  'knowledge by storing with cr: true - the server compresses it ' +
  'in the background and reports progress via the cs flag; the ' +
  'original is kept. Read the info pages via GET /info/<name> ' +
  'with the API key header for full details.'
const TRANSPOSE_MARKER = (name) => `<!-- memory: ${name} -->`
const CONTENT_PATTERN = /^(priority: |tags: |u: |p: |exp: |cr: |cs: |source: |compressed: |importance: )/
const TITLE_MAX = 78
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
    let legacy = null
    try {
      legacy = await readFile(legacyAgentsFile, 'utf8')
    } catch {}
    const header = legacy ?? (
      '# Server instructions\n\n' +
      'High priority memories (90+) are transposed here automatically.\n'
    )
    await mkdir(dirname(agentsFile), { recursive: true })
    await writeFile(agentsFile, header)
    logger.info(`Initialized ${agentsFile}${legacy ? ' (migrated from legacy AGENTS.md)' : ''}`)
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
    await mkdir(dirname(agentsFile), { recursive: true })
    await writeFile(tmpFile, current + section)
    await rename(tmpFile, agentsFile)
    logger.info(`Instruction from memory ${entity.name} transposed into ${agentsFile}`)
  } catch (err) {
    logger.error(`Failed to transpose memory ${entity.name} into AGENTS.md: ${err.message}`)
  }
}

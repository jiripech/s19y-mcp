import { readdir, readFile, writeFile, rename, mkdir, stat, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { logger } from './logger.mjs'

const dataDir = process.env.DATA_DIR || '/app/data'
let effectiveDataDir = dataDir
let infoDirPath = join(effectiveDataDir, 'info')

const PAGE_NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/

export const infoDir = () => infoDirPath

const ensureInfoDir = async () => {
  try {
    await mkdir(infoDirPath, { recursive: true })
  } catch {
    effectiveDataDir = 'data'
    infoDirPath = join(effectiveDataDir, 'info')
    logger.warn(`Cannot create ${dataDir}, falling back to ${effectiveDataDir}`)
    await mkdir(infoDirPath, { recursive: true })
  }
}

const pageName = (name) => {
  if (typeof name !== 'string' || !PAGE_NAME_RE.test(name)) {
    throw new Error('Invalid page name')
  }
  return name
}

export const initInfoStore = async (seedDir) => {
  await ensureInfoDir()
  if (!seedDir) return 0
  let entries
  try {
    entries = await readdir(seedDir)
  } catch {
    return 0
  }
  const existing = new Set(await readdir(infoDirPath))
  let seeded = 0
  for (const file of entries.filter(e => e.endsWith('.md'))) {
    if (existing.has(file)) continue
    try {
      const content = await readFile(join(seedDir, file), 'utf8')
      await writeFile(join(infoDirPath, file), content)
      seeded++
    } catch {}
  }
  if (seeded > 0) {
    logger.info(`Seeded ${seeded} info page(s) from ${seedDir}`)
  }
  return seeded
}

export const listInfoPages = async () => {
  let entries
  try {
    entries = await readdir(infoDirPath)
  } catch {
    return []
  }
  const pages = []
  for (const entry of entries.filter(e => e.endsWith('.md'))) {
    const st = await stat(join(infoDirPath, entry))
    pages.push({ name: entry.slice(0, -3), size: st.size, updatedAt: st.mtime.toISOString() })
  }
  pages.sort((a, b) => a.name.localeCompare(b.name))
  return pages
}

export const readInfoPage = async (name) => {
  if (typeof name !== 'string' || !PAGE_NAME_RE.test(name)) return null
  try {
    const content = await readFile(join(infoDirPath, `${name}.md`), 'utf8')
    return { name, content }
  } catch {
    return null
  }
}

export const writeInfoPage = async (name, content) => {
  pageName(name)
  if (typeof content !== 'string' || content.length === 0) {
    throw new Error('Content must be a non-empty string')
  }
  await ensureInfoDir()
  const pagePath = join(infoDirPath, `${name}.md`)
  const tmpFile = `${pagePath}.tmp`
  await writeFile(tmpFile, content)
  await rename(tmpFile, pagePath)
  return { name, size: Buffer.byteLength(content) }
}

export const deleteInfoPage = async (name) => {
  if (typeof name !== 'string' || !PAGE_NAME_RE.test(name)) return false
  try {
    await unlink(join(infoDirPath, `${name}.md`))
    return true
  } catch {
    return false
  }
}

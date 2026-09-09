import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { logger } from './logger.mjs'

const DATA_DIR = process.env.DATA_DIR || '/app/data'
const LLM_PORT = process.env.LLM_PORT || '8080'
const WATCH_INTERVAL_MS = Math.max(10000, parseInt(process.env.LLM_WATCH_MS, 10) || 30000)
const HEALTH_URL = `http://127.0.0.1:${LLM_PORT}/health`
const STATUS_FILE = join(DATA_DIR, 'llm.status')
const VOLATILE_STATUS = new Set(['starting', 'error-start', 'ready'])

const readStatus = async () => {
  try {
    return (await readFile(STATUS_FILE, 'utf8')).trim()
  } catch {
    return ''
  }
}

export const startLlmWatcher = () => {
  const timer = setInterval(async () => {
    const status = await readStatus()
    if (!VOLATILE_STATUS.has(status)) {
      return
    }
    let healthy = false
    try {
      const response = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(5000) })
      healthy = response.ok
    } catch {
      healthy = false
    }
    const next = healthy ? 'ready' : 'error-start'
    if (next !== status) {
      await writeFile(STATUS_FILE, next)
      logger.info(`llm.status updated to ${next} (llama-server ${healthy ? 'became healthy' : 'not responding'})`)
    }
  }, WATCH_INTERVAL_MS)
  timer.unref?.()
  return {
    stop() {
      clearInterval(timer)
    }
  }
}
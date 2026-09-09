import { logger } from './logger.mjs'

const rawEndpoint = process.env.COMPRESSION_ENDPOINT || ''
const COMPRESSION_DISABLED = /^(none|disabled|false|0)$/i.test(rawEndpoint.trim())
const COMPRESSION_ENDPOINT = rawEndpoint.trim() || 'http://127.0.0.1:8080/v1'
const COMPRESSION_MODEL = process.env.COMPRESSION_MODEL || 'qwen2.5-3b-instruct'
const COMPRESSION_INTERVAL_MS = Math.max(10000, parseInt(process.env.COMPRESSION_INTERVAL_MS, 10) || 60000)

const ATTRIBUTE_PATTERN = /^(priority: |tags: |u: |p: |exp: |cr: |cs: |source: )/

const compress = async (content) => {
  const response = await fetch(`${COMPRESSION_ENDPOINT}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: COMPRESSION_MODEL,
      messages: [{
        role: 'user',
        content: 'Compress the following memory. Keep the meaning intact ' +
          'but use far fewer words. Reply with the compressed text only, ' +
          'no preamble.\n\n' + content
      }],
      stream: false,
      max_tokens: 512,
      temperature: 0.2
    }),
    signal: AbortSignal.timeout(120000)
  })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
  const data = await response.json()
  const text = (data.choices?.[0]?.message?.content || '').trim()
  if (!text) {
    throw new Error('empty response')
  }
  return text
}

export const startCompressor = (manager) => {
  if (COMPRESSION_DISABLED) {
    logger.info('Memory compressor disabled (COMPRESSION_ENDPOINT set to none)')
    return
  }
  logger.info(`Memory compressor configured (endpoint ${COMPRESSION_ENDPOINT}, model ${COMPRESSION_MODEL}, interval ${COMPRESSION_INTERVAL_MS}ms)`)
  let running = false
  let lastEndpointError = null
  let announcedEnabled = false
  const probeEndpoint = async () => {
    const response = await fetch(`${COMPRESSION_ENDPOINT}/models`, {
      signal: AbortSignal.timeout(5000)
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
  }
  const tick = async () => {
    if (running) {
      return
    }
    running = true
    try {
      if (!announcedEnabled) {
        await probeEndpoint()
        announcedEnabled = true
        logger.info(`Memory compressor enabled (endpoint ${COMPRESSION_ENDPOINT}, model ${COMPRESSION_MODEL})`)
      }
      const graph = await manager.readGraph()
      const candidates = (graph.entities || [])
        .filter(entity =>
          entity.entityType === 'memory' &&
          entity.name !== 'agent_names' &&
          (entity.observations || []).includes('cr: 1') &&
          !(entity.observations || []).includes('cs: 1') &&
          !(entity.observations || []).some(o => o.startsWith('compressed: '))
        )
        .slice(0, 5)
      for (const entity of candidates) {
        const content = (entity.observations || []).find(o => o && o.trim() && !ATTRIBUTE_PATTERN.test(o))
        if (!content) {
          continue
        }
        try {
          const text = await compress(content)
          await manager.addObservations([{ entityName: entity.name, contents: [`compressed: ${text}`] }])
          await manager.deleteObservations([{ entityName: entity.name, observations: ['cs: 0'] }])
          await manager.addObservations([{ entityName: entity.name, contents: ['cs: 1'] }])
          logger.debug(`Compression status of memory ${entity.name} changed to: 1`)
        } catch (error) {
          logger.error(`Compression failed for memory ${entity.name}: ${error.message}`)
        }
      }
      lastEndpointError = null
    } catch (error) {
      const isEndpointDown = /fetch failed|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|HTTP (4|5)/i.test(String(error.message))
      if (isEndpointDown && !announcedEnabled) {
        if (lastEndpointError !== error.message) {
          logger.warn(`Compression endpoint not reachable yet (${error.message}). Retrying every tick.`)
          lastEndpointError = error.message
        }
      } else {
        logger.error(`Memory compressor tick failed: ${error.message}`)
      }
    } finally {
      running = false
    }
  }
  const timer = setInterval(() => tick(), COMPRESSION_INTERVAL_MS)
  timer.unref?.()
  return {
    stop() {
      clearInterval(timer)
    }
  }
}

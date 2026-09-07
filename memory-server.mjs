import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { KnowledgeGraphManager } from '@modelcontextprotocol/server-memory/dist/index.js'
import { z } from 'zod'
import { logger } from './logger.mjs'
import { initNamePool, claimName, isProtectedMemory } from './name-pool.mjs'

async function resolveMemoryPath() {
  if (process.env.MEMORY_FILE_PATH) {
    await mkdir(path.dirname(process.env.MEMORY_FILE_PATH), { recursive: true })
    return process.env.MEMORY_FILE_PATH
  }
  const dataDir = process.env.DATA_DIR || '/app/data'
  try {
    await mkdir(dataDir, { recursive: true })
    return path.join(dataDir, 'memory.jsonl')
  } catch {
    const fallbackDir = 'data'
    logger.warn(`Cannot create ${dataDir}, falling back to ${fallbackDir}`)
    await mkdir(fallbackDir, { recursive: true })
    return path.join(fallbackDir, 'memory.jsonl')
  }
}

export async function createManager() {
  const memoryPath = await resolveMemoryPath()
  const manager = new KnowledgeGraphManager(memoryPath)
  await initNamePool(manager)
  const graph = await manager.readGraph()
  logger.info(`Loaded ${graph.entities.length} memories and ${graph.relations.length} relations from ${memoryPath}`)
  return manager
}

export async function createServer(manager, options = {}) {
  if (!manager) {
    const memoryPath = await resolveMemoryPath()
    manager = new KnowledgeGraphManager(memoryPath)
  }
  const session = options.session || null
  const withNotice = (result) => {
    if (session && !session.identified) {
      result.identityNotice =
        `Anonymous session (codename "${session.name}"). Before writing ` +
        'anything, establish a permanent identity: retrieve the memory ' +
        '"agent_names", pick an available name, tell your user which name ' +
        'you picked, then pass it as source on every store_memory and ' +
        'update_memory call.'
    }
    return result
  }
  const markIdentified = (source) => {
    if (session && source) {
      session.identified = true
      if (!session.source) {
        session.source = source
      } else if (session.source !== source) {
        logger.warn(`Session identity "${session.source}" does not match source "${source}" used in a tool call`)
      }
    }
  }
  const sourceOf = (entity) => {
    const match = (entity.observations || []).find(o => o.match(/^source: (.+)$/))
    return match ? match.replace(/^source: /, '') : null
  }
  const rwFor = (entity) => {
    if (!session || !session.source) {
      return 0
    }
    return sourceOf(entity) === session.source ? 1 : 0
  }
  const withRw = (entity) => ({ ...entity, rw: rwFor(entity) })

  const server = new McpServer({
    name: 's19y-memory',
    version: '0.11.2'
  }, {
    instructions: 'Shared memory pool for multiple agents. Each session ' +
      'is assigned a codename shown in server logs. If no X-Agent-Name ' +
      'header was configured for your session, you MUST establish a ' +
      'permanent identity before your first memory write: retrieve the ' +
      'memory "agent_names", pick an available name, and tell your user ' +
      'which name you picked - they need it to recognize your work in ' +
      'the memory browser. Then pass the name as source on every ' +
      'store_memory and update_memory call and keep it for all future ' +
      'sessions. Picking a name marks it as taken and offers the next ' +
      'ordinal variant to later agents. The server repeats this ' +
      'reminder on every tool response until you comply. Memories ' +
      'carry an rw flag: rw:1 means the memory belongs to your own ' +
      'identity and you may update or delete it, rw:0 belongs to ' +
      'another identity or to the system - do not attempt to modify ' +
      'rw:0 memories; system-owned memories (the names list) reject ' +
      'modification and log the attempt. Search with search_memories ' +
      'before storing to avoid duplicates.'
  })

  server.tool(
    'store_memory',
    'Store a new memory or reflection',
    {
      memories: z.array(z.object({
        content: z.string().describe('The memory content to store'),
        tags: z.array(z.string()).optional().describe('Optional tags for categorization'),
        source: z.string().optional().describe('Optional agent/source identifier to attribute this memory'),
        importance: z.number().min(1).max(10).optional().describe('Importance level 1-10')
      })).optional().describe('Batch of memories to store'),
      content: z.string().optional().describe('The memory content to store'),
      tags: z.array(z.string()).optional().describe('Optional tags for categorization'),
      source: z.string().optional().describe('Optional agent/source identifier to attribute this memory'),
      importance: z.number().min(1).max(10).optional().describe('Importance level 1-10')
    },
    async (args) => {
      if (Array.isArray(args.memories)) {
        const results = []
        for (const mem of args.memories) {
          const entityName = `memory_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
          const tags = mem.tags || []
          const importance = mem.importance ?? 5
          const observations = [mem.content, `importance: ${importance}`, `tags: ${tags.join(', ')}`]
          if (mem.source) {
            observations.push(`source: ${mem.source}`)
          }
          try {
            await manager.createEntities([{
              name: entityName,
              entityType: 'memory',
              observations
            }])
            logger.info(`Stored memory ${entityName} (importance ${importance}${mem.source ? `, source ${mem.source}` : ''})`)
            if (mem.source) {
              markIdentified(mem.source)
              await claimName(mem.source).catch(err => logger.warn(`Name pool claim failed: ${err.message}`))
            }
            results.push({ name: entityName, success: true, message: 'Memory stored successfully' })
          } catch (err) {
            results.push({ name: entityName, success: false, message: err.message })
          }
        }
        return withNotice({
          content: [{ type: 'text', text: JSON.stringify({ success: true, results }) }]
        })
      }
      const { content, tags = [], source, importance = 5 } = args
      const entityName = `memory_${Date.now()}`
      const observations = [content, `importance: ${importance}`, `tags: ${tags.join(', ')}`]
      if (source) {
        observations.push(`source: ${source}`)
      }
      await manager.createEntities([{
        name: entityName,
        entityType: 'memory',
        observations
      }])
      logger.info(`Stored memory ${entityName} (importance ${importance}${source ? `, source ${source}` : ''})`)
      if (source) {
        markIdentified(source)
        await claimName(source).catch(err => logger.warn(`Name pool claim failed: ${err.message}`))
      }
      return withNotice({
        content: [{ type: 'text', text: JSON.stringify({ success: true, name: entityName }) }]
      })
    }
  )

  server.tool(
    'update_memory',
    'Update an existing memory by name',
    {
      name: z.string().describe('The memory name to update'),
      content: z.string().optional().describe('New memory content'),
      tags: z.array(z.string()).optional().describe('New tags for categorization'),
      source: z.string().optional().describe('New agent/source identifier'),
      importance: z.number().min(1).max(10).optional().describe('New importance level 1-10')
    },
    async ({ name, content, tags, source, importance }) => {
      if (isProtectedMemory(name)) {
        logger.error(`[CRIT] Attempt to modify protected system memory "${name}"`)
        return withNotice({
          content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'This memory is managed by the server and cannot be modified' }) }],
          isError: true
        })
      }
      const graph = await manager.openNodes([name])
      if (graph.entities.length === 0) {
        return withNotice({
          content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'Memory not found' }) }],
          isError: true
        })
      }
      const entity = graph.entities[0]
      let currentContent = ''
      let currentImportance = 5
      let currentTags = []
      let currentSource = undefined
      for (const obs of entity.observations) {
        const impMatch = obs.match(/^importance: (\d+)$/)
        if (impMatch) {
          currentImportance = parseInt(impMatch[1])
          continue
        }
        const tagMatch = obs.match(/^tags: (.*)$/)
        if (tagMatch) {
          currentTags = tagMatch[1] ? tagMatch[1].split(', ').filter(Boolean) : []
          continue
        }
        const srcMatch = obs.match(/^source: (.+)$/)
        if (srcMatch) {
          currentSource = srcMatch[1]
          continue
        }
        currentContent = obs
      }
      const mergedContent = content ?? currentContent
      const mergedImportance = importance ?? currentImportance
      const mergedTags = tags ?? currentTags
      const mergedSource = source ?? currentSource
      const observations = [mergedContent, `importance: ${mergedImportance}`, `tags: ${mergedTags.join(', ')}`]
      if (mergedSource) {
        observations.push(`source: ${mergedSource}`)
      }
      await manager.deleteEntities([name])
      await manager.createEntities([{
        name,
        entityType: 'memory',
        observations
      }])
      logger.info(`Updated memory ${name} (importance ${mergedImportance}${mergedSource ? `, source ${mergedSource}` : ''})`)
      if (mergedSource && mergedSource !== currentSource) {
        markIdentified(mergedSource)
        await claimName(mergedSource).catch(err => logger.warn(`Name pool claim failed: ${err.message}`))
      }
      return withNotice({
        content: [{ type: 'text', text: JSON.stringify({ success: true, name }) }]
      })
    }
  )

  server.tool(
    'retrieve_memory',
    'Retrieve a specific memory by name',
    {
      name: z.string().describe('The memory name to retrieve'),
      source: z.string().optional().describe('Only retrieve when attributed to this agent/source')
    },
    async ({ name, source }) => {
      const graph = await manager.openNodes([name])
      if (graph.entities.length === 0) {
        return withNotice({
          content: [{ type: 'text', text: JSON.stringify({ error: 'Memory not found' }) }],
          isError: true
        })
      }
      if (source && sourceOf(graph.entities[0]) !== source) {
        return withNotice({
          content: [{ type: 'text', text: JSON.stringify({ error: 'Memory not found' }) }],
          isError: true
        })
      }
      return withNotice({
        content: [{ type: 'text', text: JSON.stringify({ success: true, memory: withRw(graph.entities[0]) }) }]
      })
    }
  )

  server.tool(
    'search_memories',
    'Search memories by content or tags',
    {
      query: z.string().describe('Search query to match against memory content'),
      source: z.string().optional().describe('Only return memories attributed to this agent/source')
    },
    async ({ query, source }) => {
      const graph = await manager.searchNodes(query)
      if (source) {
        graph.entities = graph.entities.filter(e =>
          e.observations.some(o => o === `source: ${source}`)
        )
      }
      graph.entities = graph.entities.map(withRw)
      return withNotice({
        content: [{ type: 'text', text: JSON.stringify({ success: true, results: graph }) }]
      })
    }
  )

  server.tool(
    'list_memories',
    'List all stored memories',
    {
      source: z.string().optional().describe('Only return memories attributed to this agent/source')
    },
    async ({ source }) => {
      const graph = await manager.readGraph()
      if (source) {
        graph.entities = graph.entities.filter(e =>
          e.observations.some(o => o === `source: ${source}`)
        )
      }
      graph.entities = graph.entities.map(withRw)
      return withNotice({
        content: [{ type: 'text', text: JSON.stringify({ success: true, graph }) }]
      })
    }
  )

  server.tool(
    'count_memories',
    'Count stored memories',
    {
      source: z.string().optional().describe('Only count memories attributed to this agent/source')
    },
    async ({ source }) => {
      const graph = await manager.readGraph()
      let memories = graph.entities.filter(e => e.entityType === 'memory')
      if (source) {
        memories = memories.filter(e =>
          e.observations.some(o => o === `source: ${source}`)
        )
      }
      return withNotice({
        content: [{ type: 'text', text: JSON.stringify({ count: memories.length }) }]
      })
    }
  )

  server.tool(
    'list_sources',
    'List all unique sources with memory counts',
    {},
    async () => {
      const graph = await manager.readGraph()
      const memories = graph.entities.filter(e => e.entityType === 'memory')
      const sourceCounts = {}
      for (const entity of memories) {
        for (const obs of entity.observations) {
          const srcMatch = obs.match(/^source: (.+)$/)
          if (srcMatch) {
            const src = srcMatch[1]
            sourceCounts[src] = (sourceCounts[src] || 0) + 1
          }
        }
      }
      const sources = Object.entries(sourceCounts).map(([name, count]) => ({ name, count }))
      return withNotice({
        content: [{ type: 'text', text: JSON.stringify({ sources }) }]
      })
    }
  )

  server.tool(
    'delete_memory',
    'Delete a memory by name',
    {
      name: z.string().describe('The memory name to delete'),
      source: z.string().optional().describe('Source identifier to guard against cross-source deletion')
    },
    async ({ name, source }) => {
      if (isProtectedMemory(name)) {
        logger.error(`[CRIT] Attempt to delete protected system memory "${name}"`)
        return withNotice({
          content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'This memory is managed by the server and cannot be deleted' }) }],
          isError: true
        })
      }
      if (source) {
        const graph = await manager.openNodes([name])
        if (graph.entities.length === 0) {
          return withNotice({
            content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'Memory not found' }) }],
            isError: true
          })
        }
        const entity = graph.entities[0]
        const srcObs = entity.observations.find(o => o.match(/^source: (.+)$/))
        if (srcObs) {
          const actualSource = srcObs.replace(/^source: /, '')
          if (actualSource !== source) {
            logger.error(`[CRIT] Cross-source delete attempt: session source="${source}" target="${name}" target_source="${actualSource}"`)
            return withNotice({
              content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'Cannot delete memory attributed to another source' }) }],
              isError: true
            })
          }
        }
      }
      await manager.deleteEntities([name])
      logger.info(`Deleted memory ${name}`)
      return withNotice({
        content: [{ type: 'text', text: JSON.stringify({ success: true, deleted: name }) }]
      })
    }
  )

  return server
}

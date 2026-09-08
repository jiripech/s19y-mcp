import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { KnowledgeGraphManager } from '@modelcontextprotocol/server-memory/dist/index.js'
import { z } from 'zod'
import { logger } from './logger.mjs'
import { initNamePool, claimName, isProtectedMemory } from './name-pool.mjs'
import { transposeInstruction } from './instructions.mjs'

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
  const priorityOf = (entity) => {
    const priMatch = (entity.observations || []).find(o => o.match(/^priority: (\d+)$/))
    if (priMatch) {
      return parseInt(priMatch.replace(/^priority: /, ''))
    }
    const impMatch = (entity.observations || []).find(o => o.match(/^importance: (\d+)$/))
    if (impMatch) {
      return Math.min(parseInt(impMatch.replace(/^importance: /, '')) * 10, 100)
    }
    return 50
  }
  const rwFor = (entity) => {
    if (!session || !session.source) {
      return 0
    }
    return sourceOf(entity) === session.source ? 1 : 0
  }
  const withRw = (entity) => ({ ...entity, rw: rwFor(entity) })
  const attributesOf = (entity) => {
    const attrs = { tags: [] }
    for (const obs of entity.observations || []) {
      const tagMatch = obs.match(/^tags: (.*)$/)
      if (tagMatch) {
        attrs.tags = tagMatch[1] ? tagMatch[1].split(', ').filter(Boolean) : []
        continue
      }
      const srcMatch = obs.match(/^source: (.+)$/)
      if (srcMatch) {
        attrs.source = srcMatch[1]
        continue
      }
      const uMatch = obs.match(/^u: (.+)$/)
      if (uMatch) {
        attrs.u = uMatch[1]
        continue
      }
      const pMatch = obs.match(/^p: (.+)$/)
      if (pMatch) {
        attrs.p = pMatch[1]
        continue
      }
      const expMatch = obs.match(/^exp: (\d+)$/)
      if (expMatch) {
        attrs.exp = parseInt(expMatch[1])
        continue
      }
      const crMatch = obs.match(/^cr: (\d+)$/)
      if (crMatch) {
        attrs.cr = crMatch[1]
        continue
      }
      const csMatch = obs.match(/^cs: (\d+)$/)
      if (csMatch) {
        attrs.cs = csMatch[1]
        continue
      }
    }
    attrs.priority = priorityOf(entity)
    return attrs
  }
  const attributeMatches = (attrs, key, value) => {
    if (key === 'minPriority') {
      return attrs.priority >= Number(value)
    }
    if (key === 'tag') {
      const needle = String(value).toLowerCase()
      return attrs.tags.some(t => t.toLowerCase() === needle)
    }
    return attrs[key] !== undefined &&
      String(attrs[key]).toLowerCase() === String(value).toLowerCase()
  }
  const filterMemories = (entities, include, exclude) =>
    entities.filter(entity => {
      const attrs = attributesOf(entity)
      if (include && !Object.entries(include).every(([key, value]) => attributeMatches(attrs, key, value))) {
        return false
      }
      if (exclude && Object.entries(exclude).some(([key, value]) => attributeMatches(attrs, key, value))) {
        return false
      }
      return true
    })
  const buildObservations = (mem) => {
    const priority = mem.priority ?? 50
    const now = Math.floor(Date.now() / 1000)
    const exp = mem.ttl !== undefined ? now + mem.ttl : mem.exp
    if (exp !== undefined && exp <= now) {
      logger.warn(`Memory expiry ${exp} is already in the past`)
    }
    const observations = [mem.content, `priority: ${priority}`, `tags: ${(mem.tags || []).join(', ')}`]
    if (mem.u) {
      observations.push(`u: ${mem.u}`)
    }
    if (mem.p) {
      observations.push(`p: ${mem.p}`)
    }
    if (exp !== undefined) {
      observations.push(`exp: ${exp}`)
    }
    if (mem.cr) {
      observations.push('cr: 1')
      observations.push(`cs: ${mem.cs ? 1 : 0}`)
    }
    if (mem.source) {
      observations.push(`source: ${mem.source}`)
    }
    return observations
  }
  const memoryLogDetails = (mem) =>
    `priority ${mem.priority ?? 50}` +
    (mem.u ? `, u ${mem.u}` : '') +
    (mem.p ? `, p ${mem.p}` : '') +
    (mem.source ? `, source ${mem.source}` : '')

  const server = new McpServer({
    name: 's19y-memory',
    version: '0.12.0'
  }, {
    instructions: 'Shared memory pool for multiple agents. Each session ' +
      'is assigned a codename shown in server logs. If no X-Agent-Name ' +
      'header was configured for your session, you MUST establish a ' +
      'permanent identity before your first memory write: retrieve the ' +
      'memory "agent_names", pick the FIRST available name in the list ' +
      'rather than a personal favourite (favourites run out and high ' +
      'ordinal variants make memories hard to filter for the admin), ' +
      'and tell your user ' +
      'which name you picked - they need it to recognize your work in ' +
      'the memory browser. Then pass the name as source on every ' +
      'store_memory and update_memory call and keep it for all future ' +
      'sessions. Picking a name marks it as taken and offers the next ' +
      'ordinal variant to later agents - the ordinal is a collision ' +
      'precaution, not a status symbol. The server repeats this ' +
      'reminder on every tool response until you comply. Memories ' +
      'carry an rw flag: rw:1 means the memory belongs to your own ' +
      'identity and you may update or delete it, rw:0 belongs to ' +
      'another identity or to the system - do not attempt to modify ' +
      'rw:0 memories; system-owned memories (the names list) reject ' +
      'modification and log the attempt. Search with search_memories ' +
      'before storing to avoid duplicates. Memories may carry ' +
      'attributes: u (originating user), p (project), exp (UNIX ' +
      'expiry), priority (0-100; 90+ marks instructions that are ' +
      'transposed into /info/agents.md - read priority 90+ memories ' +
      'first and ask your user whether to comply). Offload cold ' +
      'knowledge by storing with cr: true - the server compresses it ' +
      'in the background and reports progress via the cs flag; the ' +
      'original is kept. Read the info pages via GET /info/<name> ' +
      'with the API key header for full details.'
  })

  server.tool(
    'store_memory',
    'Store a new memory or reflection',
    {
      memories: z.array(z.object({
        content: z.string().describe('The memory content to store'),
        tags: z.array(z.string()).optional().describe('Optional tags for categorization'),
        source: z.string().optional().describe('Optional agent/source identifier to attribute this memory'),
        priority: z.number().int().min(0).max(100).optional().describe('Priority level 0-100 (default 50)'),
        u: z.string().optional().describe('Originating user ($USER)'),
        p: z.string().optional().describe('Originating project'),
        exp: z.number().int().positive().optional().describe('Absolute UNIX expiry timestamp in seconds'),
        ttl: z.number().int().positive().optional().describe('Time to live in seconds, overrides exp'),
        cr: z.boolean().optional().describe('Request compression of this memory')
      })).optional().describe('Batch of memories to store'),
      content: z.string().optional().describe('The memory content to store'),
      tags: z.array(z.string()).optional().describe('Optional tags for categorization'),
      source: z.string().optional().describe('Optional agent/source identifier to attribute this memory'),
      priority: z.number().int().min(0).max(100).optional().describe('Priority level 0-100 (default 50)'),
      u: z.string().optional().describe('Originating user ($USER)'),
      p: z.string().optional().describe('Originating project'),
      exp: z.number().int().positive().optional().describe('Absolute UNIX expiry timestamp in seconds'),
      ttl: z.number().int().positive().optional().describe('Time to live in seconds, overrides exp'),
      cr: z.boolean().optional().describe('Request compression of this memory')
    },
    async (args) => {
      if (Array.isArray(args.memories)) {
        const results = []
        for (const mem of args.memories) {
          const entityName = `memory_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
          const observations = buildObservations(mem)
          try {
            await manager.createEntities([{
              name: entityName,
              entityType: 'memory',
              observations
            }])
            logger.info(`Stored memory ${entityName} (${memoryLogDetails(mem)})`)
            if (mem.source) {
              markIdentified(mem.source)
              await claimName(mem.source).catch(err => logger.warn(`Name pool claim failed: ${err.message}`))
            }
            await transposeInstruction({ name: entityName, observations })
            results.push({ name: entityName, success: true, message: 'Memory stored successfully' })
          } catch (err) {
            results.push({ name: entityName, success: false, message: err.message })
          }
        }
        return withNotice({
          content: [{ type: 'text', text: JSON.stringify({ success: true, results }) }]
        })
      }
      const { source } = args
      const entityName = `memory_${Date.now()}`
      const observations = buildObservations(args)
      await manager.createEntities([{
        name: entityName,
        entityType: 'memory',
        observations
      }])
      logger.info(`Stored memory ${entityName} (${memoryLogDetails(args)})`)
      if (source) {
        markIdentified(source)
        await claimName(source).catch(err => logger.warn(`Name pool claim failed: ${err.message}`))
      }
      await transposeInstruction({ name: entityName, observations })
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
      priority: z.number().int().min(0).max(100).optional().describe('New priority level 0-100'),
      u: z.string().optional().describe('New originating user ($USER)'),
      p: z.string().optional().describe('New originating project'),
      exp: z.number().int().positive().optional().describe('New absolute UNIX expiry timestamp in seconds'),
      ttl: z.number().int().positive().optional().describe('New time to live in seconds, recomputed expiry overrides exp'),
      cr: z.boolean().optional().describe('Request compression of this memory')
    },
    async ({ name, content, tags, source, priority, u, p, exp, ttl, cr }) => {
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
      const currentPriority = priorityOf(entity)
      let currentTags = []
      let currentSource = undefined
      let currentU = undefined
      let currentP = undefined
      let currentExp = undefined
      let currentCr = false
      let currentCs = false
      for (const obs of entity.observations) {
        if (obs.match(/^priority: (\d+)$/) || obs.match(/^importance: (\d+)$/)) {
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
        const uMatch = obs.match(/^u: (.+)$/)
        if (uMatch) {
          currentU = uMatch[1]
          continue
        }
        const pMatch = obs.match(/^p: (.+)$/)
        if (pMatch) {
          currentP = pMatch[1]
          continue
        }
        const expMatch = obs.match(/^exp: (\d+)$/)
        if (expMatch) {
          currentExp = parseInt(expMatch[1])
          continue
        }
        const crMatch = obs.match(/^cr: (\d+)$/)
        if (crMatch) {
          currentCr = crMatch[1] === '1'
          continue
        }
        const csMatch = obs.match(/^cs: (\d+)$/)
        if (csMatch) {
          currentCs = csMatch[1] === '1'
          continue
        }
        currentContent = obs
      }
      let mergedCr = currentCr
      if (cr === true) {
        mergedCr = true
      } else if (cr === false && currentCr) {
        logger.warn('Compression request cannot be recalled')
      }
      const merged = {
        content: content ?? currentContent,
        priority: priority ?? currentPriority,
        tags: tags ?? currentTags,
        source: source ?? currentSource,
        u: u ?? currentU,
        p: p ?? currentP,
        exp: exp ?? currentExp,
        ttl,
        cr: mergedCr,
        cs: currentCs
      }
      const observations = buildObservations(merged)
      await manager.deleteEntities([name])
      await manager.createEntities([{
        name,
        entityType: 'memory',
        observations
      }])
      logger.info(`Updated memory ${name} (${memoryLogDetails(merged)})`)
      if (merged.source && merged.source !== currentSource) {
        markIdentified(merged.source)
        await claimName(merged.source).catch(err => logger.warn(`Name pool claim failed: ${err.message}`))
      }
      await transposeInstruction({ name, observations })
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
      source: z.string().optional().describe('Only return memories attributed to this agent/source'),
      include: z.record(z.string(), z.union([z.string(), z.number()])).optional().describe('Return only memories whose attributes match all of these key-value pairs (special keys: minPriority, tag)'),
      exclude: z.record(z.string(), z.union([z.string(), z.number()])).optional().describe('Exclude memories whose attributes match any of these key-value pairs (special keys: minPriority, tag)')
    },
    async ({ query, source, include, exclude }) => {
      const graph = await manager.searchNodes(query)
      if (source) {
        graph.entities = graph.entities.filter(e =>
          e.observations.some(o => o === `source: ${source}`)
        )
      }
      graph.entities = filterMemories(graph.entities, include, exclude)
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
      source: z.string().optional().describe('Only return memories attributed to this agent/source'),
      include: z.record(z.string(), z.union([z.string(), z.number()])).optional().describe('Return only memories whose attributes match all of these key-value pairs (special keys: minPriority, tag)'),
      exclude: z.record(z.string(), z.union([z.string(), z.number()])).optional().describe('Exclude memories whose attributes match any of these key-value pairs (special keys: minPriority, tag)')
    },
    async ({ source, include, exclude }) => {
      const graph = await manager.readGraph()
      if (source) {
        graph.entities = graph.entities.filter(e =>
          e.observations.some(o => o === `source: ${source}`)
        )
      }
      graph.entities = filterMemories(graph.entities, include, exclude)
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
      source: z.string().optional().describe('Only count memories attributed to this agent/source'),
      include: z.record(z.string(), z.union([z.string(), z.number()])).optional().describe('Count only memories whose attributes match all of these key-value pairs (special keys: minPriority, tag)'),
      exclude: z.record(z.string(), z.union([z.string(), z.number()])).optional().describe('Exclude memories whose attributes match any of these key-value pairs (special keys: minPriority, tag)')
    },
    async ({ source, include, exclude }) => {
      const graph = await manager.readGraph()
      let memories = graph.entities.filter(e => e.entityType === 'memory')
      if (source) {
        memories = memories.filter(e =>
          e.observations.some(o => o === `source: ${source}`)
        )
      }
      memories = filterMemories(memories, include, exclude)
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

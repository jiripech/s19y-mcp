import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { KnowledgeGraphManager } from '@modelcontextprotocol/server-memory/dist/index.js'
import { z } from 'zod'
import { logger } from './logger.mjs'

async function resolveMemoryPath() {
  if (process.env.MEMORY_FILE_PATH) {
    await mkdir(path.dirname(process.env.MEMORY_FILE_PATH), { recursive: true })
    return process.env.MEMORY_FILE_PATH
  }
  const dataDir = process.env.DATA_DIR || '/app/data'
  await mkdir(dataDir, { recursive: true })
  return path.join(dataDir, 'memory.jsonl')
}

export async function createManager() {
  const memoryPath = await resolveMemoryPath()
  const manager = new KnowledgeGraphManager(memoryPath)
  const graph = await manager.readGraph()
  logger.info(`Loaded ${graph.entities.length} memories and ${graph.relations.length} relations from ${memoryPath}`)
  return manager
}

export async function createServer(manager) {
  if (!manager) {
    const memoryPath = await resolveMemoryPath()
    manager = new KnowledgeGraphManager(memoryPath)
  }

  const server = new McpServer({
    name: 's19y-memory',
    version: '0.4.0'
  })

  server.tool(
    'store_memory',
    'Store a new memory or reflection',
    {
      content: z.string().describe('The memory content to store'),
      tags: z.array(z.string()).optional().describe('Optional tags for categorization'),
      source: z.string().optional().describe('Optional agent/source identifier to attribute this memory'),
      importance: z.number().min(1).max(10).optional().describe('Importance level 1-10')
    },
    async ({ content, tags = [], source, importance = 5 }) => {
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
      return {
        content: [{ type: 'text', text: JSON.stringify({ success: true, name: entityName }) }]
      }
    }
  )

  server.tool(
    'retrieve_memory',
    'Retrieve a specific memory by name',
    {
      name: z.string().describe('The memory name to retrieve')
    },
    async ({ name }) => {
      const graph = await manager.openNodes([name])
      if (graph.entities.length === 0) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: 'Memory not found' }) }],
          isError: true
        }
      }
      return {
        content: [{ type: 'text', text: JSON.stringify({ success: true, memory: graph.entities[0] }) }]
      }
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
      return {
        content: [{ type: 'text', text: JSON.stringify({ success: true, results: graph }) }]
      }
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
      return {
        content: [{ type: 'text', text: JSON.stringify({ success: true, graph }) }]
      }
    }
  )

  server.tool(
    'delete_memory',
    'Delete a memory by name',
    {
      name: z.string().describe('The memory name to delete')
    },
    async ({ name }) => {
      await manager.deleteEntities([name])
      logger.info(`Deleted memory ${name}`)
      return {
        content: [{ type: 'text', text: JSON.stringify({ success: true, deleted: name }) }]
      }
    }
  )

  return server
}

import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { KnowledgeGraphManager } from '@modelcontextprotocol/server-memory/dist/index.js'
import { z } from 'zod'

async function resolveMemoryPath() {
  if (process.env.MEMORY_FILE_PATH) {
    await mkdir(path.dirname(process.env.MEMORY_FILE_PATH), { recursive: true })
    return process.env.MEMORY_FILE_PATH
  }
  const dataDir = process.env.DATA_DIR || '/app/data'
  await mkdir(dataDir, { recursive: true })
  return path.join(dataDir, 'memory.jsonl')
}

export async function createServer() {
  const server = new McpServer({
    name: 's19y-memory',
    version: '0.1.2'
  })

  const memoryPath = await resolveMemoryPath()
  const manager = new KnowledgeGraphManager(memoryPath)

  server.tool(
    'store_memory',
    'Store a new memory or reflection',
    {
      content: z.string().describe('The memory content to store'),
      tags: z.array(z.string()).optional().describe('Optional tags for categorization'),
      importance: z.number().min(1).max(10).optional().describe('Importance level 1-10')
    },
    async ({ content, tags = [], importance = 5 }) => {
      const entityName = `memory_${Date.now()}`
      await manager.createEntities([{
        name: entityName,
        entityType: 'memory',
        observations: [content, `importance: ${importance}`, `tags: ${tags.join(', ')}`]
      }])
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
      query: z.string().describe('Search query to match against memory content')
    },
    async ({ query }) => {
      const graph = await manager.searchNodes(query)
      return {
        content: [{ type: 'text', text: JSON.stringify({ success: true, results: graph }) }]
      }
    }
  )

  server.tool(
    'list_memories',
    'List all stored memories',
    {},
    async () => {
      const graph = await manager.readGraph()
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
      return {
        content: [{ type: 'text', text: JSON.stringify({ success: true, deleted: name }) }]
      }
    }
  )

  return server
}

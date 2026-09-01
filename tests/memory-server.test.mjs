import { describe, it, before } from 'node:test'
import assert from 'node:assert'
import { KnowledgeGraphManager, ensureMemoryFilePath } from '@modelcontextprotocol/server-memory/dist/index.js'

describe('Knowledge Graph Manager', () => {
  let manager

  before(async () => {
    const memoryPath = await ensureMemoryFilePath()
    manager = new KnowledgeGraphManager(memoryPath)
  })

  describe('createEntities', () => {
    it('should create an entity', async () => {
      const result = await manager.createEntities([{
        name: 'Test_Entity',
        entityType: 'test',
        observations: ['First observation']
      }])

      assert.ok(result)
    })
  })

  describe('createRelations', () => {
    it('should create a relation between entities', async () => {
      await manager.createEntities([
        { name: 'Entity_A', entityType: 'type_a', observations: [] },
        { name: 'Entity_B', entityType: 'type_b', observations: [] }
      ])

      const result = await manager.createRelations([{
        from: 'Entity_A',
        to: 'Entity_B',
        relationType: 'related_to'
      }])

      assert.ok(result)
    })
  })

  describe('addObservations', () => {
    it('should add observations to an entity', async () => {
      await manager.createEntities([
        { name: 'Obs_Entity', entityType: 'obs_type', observations: [] }
      ])

      const result = await manager.addObservations([{
        entityName: 'Obs_Entity',
        contents: ['New observation 1', 'New observation 2']
      }])

      assert.ok(result)
    })
  })

  describe('readGraph', () => {
    it('should read the entire knowledge graph', async () => {
      const result = await manager.readGraph()

      assert.ok(result)
      assert.ok(result.entities)
      assert.ok(result.relations)
      assert.ok(Array.isArray(result.entities))
      assert.ok(Array.isArray(result.relations))
    })
  })

  describe('searchNodes', () => {
    it('should search for nodes', async () => {
      await manager.createEntities([{
        name: 'Search_Entity',
        entityType: 'searchable',
        observations: ['Unique search term: pineapple']
      }])

      const result = await manager.searchNodes('pineapple')

      assert.ok(result)
      assert.ok(result.entities)
      assert.ok(result.entities.length > 0)
    })
  })

  describe('openNodes', () => {
    it('should open specific nodes by name', async () => {
      await manager.createEntities([{
        name: 'Open_Entity',
        entityType: 'openable',
        observations: ['Opened observation']
      }])

      const result = await manager.openNodes(['Open_Entity'])

      assert.ok(result)
      assert.ok(result.entities)
      assert.ok(result.entities.length > 0)
      assert.strictEqual(result.entities[0].name, 'Open_Entity')
    })
  })

  describe('deleteObservations', () => {
    it('should delete observations', async () => {
      await manager.createEntities([{
        name: 'Delete_Obs_Entity',
        entityType: 'delete_type',
        observations: ['To be deleted']
      }])

      await manager.deleteObservations([{
        entityName: 'Delete_Obs_Entity',
        observations: ['To be deleted']
      }])

      const graph = await manager.readGraph()
      const entity = graph.entities.find(e => e.name === 'Delete_Obs_Entity')
      assert.ok(!entity.observations.includes('To be deleted'))
    })
  })

  describe('deleteEntities', () => {
    it('should delete entities', async () => {
      await manager.createEntities([{
        name: 'To_Be_Deleted',
        entityType: 'temp',
        observations: []
      }])

      await manager.deleteEntities(['To_Be_Deleted'])

      const graph = await manager.readGraph()
      const found = graph.entities.find(e => e.name === 'To_Be_Deleted')
      assert.strictEqual(found, undefined)
    })
  })

  describe('deleteRelations', () => {
    it('should delete relations', async () => {
      await manager.createEntities([
        { name: 'Del_Rel_A', entityType: 'type', observations: [] },
        { name: 'Del_Rel_B', entityType: 'type', observations: [] }
      ])

      await manager.createRelations([{
        from: 'Del_Rel_A',
        to: 'Del_Rel_B',
        relationType: 'temp_rel'
      }])

      await manager.deleteRelations([{
        from: 'Del_Rel_A',
        to: 'Del_Rel_B',
        relationType: 'temp_rel'
      }])

      const graph = await manager.readGraph()
      const found = graph.relations.find(r =>
        r.from === 'Del_Rel_A' && r.to === 'Del_Rel_B' && r.relationType === 'temp_rel'
      )
      assert.strictEqual(found, undefined)
    })
  })
})

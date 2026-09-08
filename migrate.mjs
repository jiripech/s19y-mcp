import { logger } from './logger.mjs'

export async function migrateGraph(manager) {
  const graph = await manager.readGraph()
  let migrated = 0
  for (const entity of graph.entities) {
    if (entity.entityType !== 'memory' || entity.name === 'agent_names') {
      continue
    }
    const observations = entity.observations || []
    if (observations.some(o => o.match(/^priority: /))) {
      continue
    }
    const impObs = observations.find(o => o.match(/^importance: (\d+)$/))
    if (!impObs) {
      continue
    }
    const importance = parseInt(impObs.replace(/^importance: /, ''))
    if (importance < 1 || importance > 10) {
      continue
    }
    const priority = Math.min(importance * 10, 100)
    await manager.deleteObservations([{
      entityName: entity.name,
      observations: [`importance: ${importance}`]
    }])
    await manager.addObservations([{
      entityName: entity.name,
      contents: [`priority: ${priority}`]
    }])
    migrated++
  }
  if (migrated > 0) {
    logger.info(`Priority migration: converted ${migrated} memories from importance 1-10 to priority 0-100`)
  }
}

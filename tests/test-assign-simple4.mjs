import { initNamePool, getAvailableNames, claimName } from './name-pool.mjs';
import { findPreviousClaim, rememberIdentity } from './agent-registry.mjs';

async function test() {
  await initNamePool();
  
  const uuid = 'test-uuid-123';
  
  // Claim a name for the first time (simulate first connection)
  await claimName('Epictetus');
  console.log('After first claim:', getAvailableNames()[0]);
  
  // Remember identity with the source "Epictetus" and UUID
  rememberIdentity(uuid, 'Epictetus').catch(console.warn);
  
  // Re-import agent-registry to access agents
  import('./agent-registry.mjs');
  console.log('agents after remember:', (await import('./agent-registry.mjs')).agents);
}

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
  
  // Check agents directly by importing it again
  import('./agent-registry.mjs');
  console.log('agents after remember:', require('./agent-registry')); // can't use require for ESM
}

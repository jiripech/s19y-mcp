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
  
  // Find previous claim
  const previous = findPreviousClaim({ uuid });
  console.log('previous:', previous);
  
  if (previous) {
    await import('./name-pool.mjs').then(mod => mod.reclaimBaseName(previous));
    const names = getAvailableNames();
    console.log('pool after reclaim:', names[0]);
  }
  
  // Check what name was returned by assign_name logic
  const names = getAvailableNames();
  console.log('After assign_name logic, pool:', names[0]);
}

test().catch(err => {
  console.error('Error:', err);
});

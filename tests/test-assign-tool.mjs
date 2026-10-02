import { createServer } from './memory-server.mjs';
import { initNamePool, getAvailableNames } from './name-pool.mjs';
import { initAgentRegistry, findPreviousClaim, rememberIdentity } from './agent-registry.mjs';

async function test() {
  await initNamePool();
  await initAgentRegistry();
  
  const uuid = 'test-uuid-123';
  
  // Claim a name for the first time (simulate first connection)
  await import('./name-pool.mjs').then(mod => mod.claimName('Epictetus'));
  console.log('After first claim:', getAvailableNames()[0]);
  
  // Remember identity with the source "Epictetus" and UUID
  await rememberIdentity(uuid, 'Epictetus');
  
  // Now simulate reconnect: call assign_name tool via the MCP server's tools
  const server = await createServer(undefined, { session: { uuid } });
  
  // Get the assign_name tool from the server
  const tools = server.getTools();
  if (tools.assign_name) {
    const result = await tools.assign_name({ sessionUuid: uuid });
    console.log('assign_name result:', result);
  } else {
    console.log('assign_name tool not found in server');
  }
  
  // Check what name was returned and if it reclaimed the base name
  const names = getAvailableNames();
  console.log('After assign_name, pool:', names[0]);
}

test().catch(err => {
  console.error('Error:', err);
});

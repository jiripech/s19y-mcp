import { createServer } from './memory-server.mjs';
import { initNamePool, getAvailableNames, claimName, reclaimBaseName } from './name-pool.mjs';
import { findPreviousClaim, rememberIdentity } from './agent-registry.mjs';

async function test() {
  // Initialize name pool and agent registry
  await initNamePool();
  
  // Create a fake session UUID
  const uuid = 'test-uuid-123';
  
  // Claim a name for the first time (simulate first connection)
  await claimName('Epictetus');
  console.log('After first claim:', getAvailableNames()[0]);
  
  // Remember identity with the source "Epictetus" and UUID
  rememberIdentity(uuid, 'Epictetus').catch(console.warn);
  
  // Now simulate reconnect: call assign_name with the session UUID
  const server = await createServer(undefined, { session: { uuid } });
  
  // Call assign_name tool via the MCP server's tools
  // We need to access the server instance and call the tool directly
  // The server has a `tools` object that exposes all tools as functions
  // Let's get the assign_name tool from the server
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
  
  // Verify reclaimBaseName works directly too
  await reclaimBaseName('Epictetus');
  console.log('After direct reclaim:', getAvailableNames()[0]);
}

test().catch(err => {
  console.error('Error:', err);
});

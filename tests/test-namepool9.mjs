import { initNamePool, getAvailableNames, claimName } from './name-pool.mjs';
await initNamePool();
const names = getAvailableNames();
console.log('initial:', names);
// Manually add an ordinal name to test pattern matching
availableNames = [...names];  // need access — let's just read names.txt and modify it
import { writeFile } from 'node:fs/promises';
await writeFile('/Users/jiri.pech/s19y-mcp/data/names2.txt', '');  // dummy

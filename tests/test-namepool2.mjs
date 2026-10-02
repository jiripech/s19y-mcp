import { initNamePool, getAvailableNames, claimName } from './name-pool.mjs';
await initNamePool();  // await it!
const names = getAvailableNames();
console.log('initial:', names);
claimName(names[0]);  // claim the first name
const names1 = getAvailableNames();
console.log('after claiming:', names1);

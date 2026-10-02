import { initNamePool, getAvailableNames, claimName } from './name-pool.mjs';
await initNamePool();
const names = getAvailableNames();
console.log('names[0]:', names[0]);
const claimPromise = claimName(names[0]);  // returns claimChain
await claimPromise;  // wait for chain to resolve
const names1 = getAvailableNames();
console.log('after claiming:', names1);

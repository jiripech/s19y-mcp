import { initNamePool, getAvailableNames, claimName, reclaimBaseName } from './name-pool.mjs';
await initNamePool();
const names = getAvailableNames();
console.log('initial:', names[0]);

// First claim: agent -> agent the 2nd
await claimName(names[0]);
const names1 = getAvailableNames();
console.log('after 1st claim:', names1[0]);

// Reclaim base name back to "agent" — should work
await reclaimBaseName(names[0].split(' ')[0] + ' ' + names[0].split(' ')[1]); // e.g., "Aemilius Papinianus"
const names2 = getAvailableNames();
console.log('after reclaim:', names2[0]);

// Claim again — should produce "agent the 2nd" again
await claimName(names2[0]);
const names3 = getAvailableNames();
console.log('after 2nd claim:', names3[0]);

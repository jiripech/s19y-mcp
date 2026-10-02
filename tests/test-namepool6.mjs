import { initNamePool, getAvailableNames, claimName } from './name-pool.mjs';
await initNamePool();
const names = getAvailableNames();
console.log('initial:', names[0]);
await claimName(names[0]);  // first claim: agent -> agent the 2nd
const names1 = getAvailableNames();
console.log('after 1st claim:', names1[0]);
await claimName("Aemilius Papinianus");  // try to reuse base name — should reclaim
const names2 = getAvailableNames();
console.log('after 2nd claim (reclaiming):', names2[0]);

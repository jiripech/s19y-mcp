import { initNamePool, getAvailableNames, claimName } from './name-pool.mjs';
await initNamePool();
const names = getAvailableNames();
console.log('initial:', names[0]);
await claimName(names[0]);  // first claim: agent -> agent the 2nd
const names1 = getAvailableNames();
console.log('after 1st claim:', names1[0]);
// Now try to reuse the base name "Aemilius Papinianus" — what happens?
await claimName("Aemilius Papinianus");  // should find and put back "Aemilius Papinianus"? No, it won't find it in availableNames since it was replaced with "the 2nd"
const names2 = getAvailableNames();
console.log('after 2nd claim (reusing base name):', names2[0]);

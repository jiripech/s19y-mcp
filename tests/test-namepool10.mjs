import { initNamePool, getAvailableNames, claimName } from './name-pool.mjs';
await initNamePool();
const names = getAvailableNames();
console.log('initial:', names[0]);
// Claim first name
await claimName(names[0]);  // "Aemilius Papinianus" -> "Aemilius Papinianus the 2nd"
const names1 = getAvailableNames();
console.log('after 1st claim:', names1[0]);
// Try to claim a non-existent name (not pattern match) — should return false
await claimName("NonExistentAgent");
const names2 = getAvailableNames();
console.log('after claiming non-existent:', names2[0]);

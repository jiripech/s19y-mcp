import { initNamePool, getAvailableNames, claimName } from './name-pool.mjs';
await initNamePool();
const names = getAvailableNames();
console.log('initial:', names[0], '|', names[1]);
await claimName(names[0]);  // "Aemilius Papinianus" -> "Aemilius Papinianus the 2nd"
const names1 = getAvailableNames();
console.log('after 1st claim:', names1[0], '|', names1[1]);
await claimName("Aemilius Papinianus");  // reclaim back to "Aemilius Papinianus"
const names2 = getAvailableNames();
console.log('after 2nd claim (reclaim):', names2[0], '|', names2[1]);
await claimName(names2[0]);  // claim again -> "Aemilius Papinianus the 2nd"
const names3 = getAvailableNames();
console.log('after 3rd claim:', names3[0], '|', names3[1]);

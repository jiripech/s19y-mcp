import { initNamePool, getAvailableNames, claimName } from './name-pool.mjs';
await initNamePool();
const names = getAvailableNames();
console.log('initial:', names[0], '|', names[1]);  // e.g., "Seneca the Younger" or similar
// Find a name that has an ordinal number (like "agent") and claim it
const firstOrdName = names.find(n => n.includes('the ') && /the \d+/i.test(n));
console.log('first ord name:', firstOrdName);
if (firstOrdName) {
  await claimName(firstOrdName);
  const names1 = getAvailableNames();
  console.log('after 1st claim:', names1[0], '|', names1[1]);
  await claimName(firstOrdName);  // should find pattern match and reclaim
  const names2 = getAvailableNames();
  console.log('after 2nd claim (reclaim):', names2[0], '|', names2[1]);
} else {
  console.log('no ordinal name found');
}

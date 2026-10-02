import * as namePool from './name-pool.mjs';
await namePool.initNamePool();
console.log('availableNames:', namePool['availableNames']);  // should work
const names = namePool.getAvailableNames();
console.log('names[0]:', names[0]);
namePool.claimName(names[0]);
console.log('availableNames after claim (module):', namePool['availableNames']);
const names1 = namePool.getAvailableNames();
console.log('names1[0]:', names1[0]);

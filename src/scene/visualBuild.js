// r149 allocates UUIDs through Math.random in geometry/material constructors.
// New visual resources must not advance the game's target/reaction random stream.
// This scope is synchronous: no event handler or frame can run before restoration.
let idSeed = 0x74746b31;
const idRandom = () => {
  idSeed ^= idSeed << 13; idSeed ^= idSeed >>> 17; idSeed ^= idSeed << 5;
  return (idSeed >>> 0)/4294967296;
};
export function withVisualIds(build){
  const gameRandom = Math.random;
  Math.random = idRandom;
  try { return build(); }
  finally { Math.random = gameRandom; }
}

/* What a crack sounds like, as a list of hits for audio/audio.js bone() (user: "너무 기계음 같아… 우두둑 소리도 좀
   다양하게", 2026-10-15). Each call picks a pattern and jitters it, so no two cracks are the same:
   뚝     one big hit and a small tail
   두둑   two
   우두둑 three to five, speeding up
   드드득 six to eight small fast ones, then a big one
   A PERFECT only gets the three-plus patterns. rand: () => [0, 1). Hit: {dt (s after the previous hit), gain, freq (Hz)}.
   crunchPattern: the hard wrong crack (core/fail.js forceTier), lower and a longer grinding run. */
const jit = (rand, v, by) => v*(1 + (rand()*2 - 1)*by);
export const CRACK_PATTERNS = ["뚝", "두둑", "우두둑", "드드득"];
export function crackPattern(rand = Math.random, perfect = false){
  const pool = perfect ? CRACK_PATTERNS.slice(2) : CRACK_PATTERNS;
  const name = pool[Math.min(pool.length - 1, Math.floor(rand()*pool.length))];
  const f0 = jit(rand, 1700, 0.3), hits = [];
  const hit = (dt, gain, freq) => hits.push({dt: Math.max(0, jit(rand, dt, 0.25)), gain: Math.min(1, jit(rand, gain, 0.2)), freq: jit(rand, freq, 0.25)});
  if(name === "뚝"){ hit(0, 0.95, f0); hit(0.07, 0.25, f0*1.4); }
  else if(name === "두둑"){ hit(0, 0.85, f0); hit(0.075, 0.75, f0*0.8); }
  else if(name === "우두둑"){
    const n = 3 + Math.floor(rand()*3);
    for(let i = 0; i < n; i++) hit(i ? 0.075*(1 - i*0.12) : 0, 0.9 - i*0.1, f0*(1 + (i % 2 ? 0.3 : -0.1)));
  }else{
    const n = 6 + Math.floor(rand()*3);
    for(let i = 0; i < n; i++) hit(i ? 0.022 : 0, 0.35 + rand()*0.15, f0*1.3);
    hit(0.04, 0.95, f0*0.85);
  }
  return {name, hits};
}
export function crunchPattern(rand = Math.random, tier = 1){
  const n = tier > 1 ? 14 + Math.floor(rand()*3) : 10 + Math.floor(rand()*3), hits = [];
  for(let i = 0; i < n; i++) hits.push({dt: i ? 0.012 + rand()*0.028 : 0, gain: (0.5 + 0.2*tier)*(1 - i*0.03)*(0.7 + rand()*0.3), freq: 600 + rand()*700*tier});
  if(tier > 1) hits.push({dt: 0.03, gain: 1, freq: 1500});   // the final snap
  return {name: tier > 1 ? "아그작" : "으그적", hits};
}

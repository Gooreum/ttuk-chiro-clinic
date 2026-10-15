/* How a crack is spaced, for audio/audio.js crackSound (user: "우두둑 소리도 좀 다양하게", 2026-10-15). Each hit is
   still the original pop (a click-cluster rewrite sounded less natural: "원래 소리가 제일 자연스럽다"), so the patterns
   stay inside the original range: 45-95 ms apart, 900-2300 Hz.
   뚝     one hit and a small tail
   두둑   two
   우두둑 three or four
   A PERFECT is always 우두둑. rand: () => [0, 1). Hit: {dt (s after the previous hit), gain 0..1, freq (Hz)}. */
export const CRACK_PATTERNS = ["뚝", "두둑", "우두둑"];
export function crackPattern(rand = Math.random, perfect = false){
  const name = perfect ? "우두둑" : CRACK_PATTERNS[Math.min(2, Math.floor(rand()*3))];
  const n = name === "뚝" ? 2 : name === "두둑" ? 2 : 3 + Math.floor(rand()*2);
  const hits = [];
  for(let i = 0; i < n; i++){
    const tail = name === "뚝" && i === 1;
    hits.push({dt: i ? 0.045 + rand()*0.05 : 0, gain: tail ? 0.3 + rand()*0.1 : 1 - i*0.14, freq: 900 + rand()*1400});
  }
  return {name, hits};
}

import { clamp } from "../lib/math.js";

/* Tolerance multiplier: nervous patients tighten up to 40% over 24 s. */
/* tight: a 영업 일지 day that narrows every zone (core/campaign.js mods.tight) */
export function tolMul(trait, elapsed, tight = false){
  const t = tight ? 0.8 : 1;
  if(trait === "nervous") return t*Math.max(0.6, 1 - elapsed/24000);
  return t;
}
/* Normalised distance to the target; d <= 1 is the success zone. m = T.tol * tolMul. */
export function distAt(rot, bend, target, m){
  if(!target) return 9;
  const dr = (rot - target.rot)/(target.tolR*m), db = (bend - target.bend)/(target.tolB*m);
  return Math.sqrt(dr*dr + db*db);
}
export const closenessOf = d => clamp(1 - (d - 0.3)/2.2, 0, 1);
/* Input gain near the target: heavier the closer you get, stiff patients add weight and damp sensitivity. */
export function deltaGain(heavy, stiff, c){
  const h = clamp(heavy + (stiff ? 0.25 : 0), 0, 0.92);
  return (1 - h * c) * (stiff ? 0.8 : 1);
}
export function breathState(now, t0, breathSec){
  const P = breathSec * 1000;
  const ph = ((now - t0) % P) / P;
  const exhale = ph >= 0.42;
  const fill = exhale ? 1 - (ph - 0.42)/0.58 : ph/0.42;
  return {exhale, fill};
}

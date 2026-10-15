import { REVIEWS } from "../patient/roster.js";

/* Wrong-crack gags (AGENTS.md 3-6). Judging is untouched: adjust() decides as before, this only names the show.
   kind: "over" past the danger limit (rubber-band boing, "잠깐잠깐!"), "dud" just off (a half crack that fizzles),
   "finger" way off (the therapist's own knuckle cracks and the hand shakes out). */
export function failKind(over, d){ return over ? "over" : d < 2 ? "dud" : "finger"; }
export const DUD_AMP = 0.3;          // a dud: the neck's crack motion at 30%
// the patient's line for the n-th wrong crack on them (1-based); the last one repeats
export function failLine(lines, n){
  const a = (lines && lines.fail) || [];
  return a.length ? a[Math.max(1, Math.min(n, a.length)) - 1] : "";
}
// "over": degrees on top of the aim, toward the middle first, a damped rubber-band wobble gone by BOING_LEN
export const BOING_LEN = 1.1;
export function boingProfile(t){
  if(t <= 0 || t >= BOING_LEN) return 0;
  const e = 1 - t/BOING_LEN;
  return -12*Math.exp(-3.2*t)*Math.sin(2*Math.PI*3.4*t)*e;
}
// "finger": the contact hand jumps off the neck (away 0..1) and the wrist shakes out (radians), back by FLINCH_LEN
export const FLINCH_LEN = 1.0;
export function flinchProfile(t){
  if(t <= 0 || t >= FLINCH_LEN) return {away: 0, shake: 0};
  const away = t < 0.08 ? Math.sin(Math.PI/2*t/0.08) : t < 0.7 ? 1 : 0.5 + 0.5*Math.cos(Math.PI*(t - 0.7)/(FLINCH_LEN - 0.7));
  const shake = t > 0.15 && t < 0.7 ? 0.8*Math.sin(2*Math.PI*7*(t - 0.15))*(1 - (t - 0.15)/0.55) : 0;
  return {away, shake};
}
// day log lines for a patient who got wrong cracks but was finished, by the last kind
export const FAIL_REVIEWS = {
  dud:    ["하다 마신 줄 알았어요", "목보다 마음이 더 결렸어요"],
  finger: ["치료사님 손가락이 더 아파 보였어요", "제 목 말고 선생님 손이 풀렸대요"],
  over:   ["잠깐 천장이 옆으로 보였어요", "목이 고무줄인 줄 알았어요"]
};
/* r: a day log row {stars, fails: [kind...], lines}. Walked out (stars 0) -> the patient's own parting line;
   wrong cracks -> the pool of the last kind; otherwise the usual star reviews. */
export function reviewLine(r, rand = Math.random){
  const pick = a => a[Math.min(a.length - 1, Math.floor(rand()*a.length))];
  if(!r.stars) return (r.lines && r.lines.quit) || "다음에 다시 올게요…";
  const last = r.fails && r.fails[r.fails.length - 1];
  if(last && FAIL_REVIEWS[last]) return pick(FAIL_REVIEWS[last]);
  return pick(REVIEWS[r.stars] || ["다음에 다시 올게요…"]);
}

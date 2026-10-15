import { REVIEWS } from "../patient/roster.js";

/* Wrong-crack gags (AGENTS.md 3-6). Judging is untouched: adjust() decides as before, this only names the show.
   kind: "over" past the danger limit (rubber-band boing, "잠깐잠깐!"), "dud" just off (a half crack that fizzles),
   "finger" way off (the therapist's own knuckle cracks and the hand shakes out). */
export function failKind(over, d){ return over ? "over" : d < 2 ? "dud" : "finger"; }
export const DUD_AMP = 0.6;          // a dud: the neck's crack motion at 60%
// how far the neck is wrenched on a wrong crack, times the crack motion (core/crack.js, peak 15°): it has to read on a
// phone (user: "거의 안돌아가", 2026-10-15). By kind, and by force tier on a hard one (forceTier below)
export const FAIL_AMP = { over: 1.2, dud: DUD_AMP, finger: 1.6 };
export const FORCE_AMP = { 1: 1.8, 2: 2.3 };
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
  return -20*Math.exp(-2.6*t)*Math.sin(2*Math.PI*3.0*t)*e;
}
// "finger": the contact hand jumps off the neck (away 0..1) and the wrist shakes out (radians), back by FLINCH_LEN
export const FLINCH_LEN = 1.0;
export function flinchProfile(t){
  if(t <= 0 || t >= FLINCH_LEN) return {away: 0, shake: 0};
  const away = t < 0.08 ? Math.sin(Math.PI/2*t/0.08) : t < 0.7 ? 1 : 0.5 + 0.5*Math.cos(Math.PI*(t - 0.7)/(FLINCH_LEN - 0.7));
  const shake = t > 0.15 && t < 0.7 ? 0.8*Math.sin(2*Math.PI*7*(t - 0.15))*(1 - (t - 0.15)/0.55) : 0;
  return {away, shake};
}
// the big tilted stamp on a wrong crack (ui/hud.js stamp), the old toast line rides under it
export const FAIL_STAMP = { over: "뾰잉~", dud: "뚜…륵?", finger: "손가락 뚝!" };
// day log chips: how many of each kind, in over / dud / finger order. A hard one shows the crunch, not its kind's gag,
// so it counts as 금 / 골절 only
export const FAIL_TAG = { over: "뾰잉", dud: "삑사리", finger: "손가락" };
export function failTags(fails, tiers){
  const n = {}; (fails || []).forEach((k, i) => { if(!(tiers && tiers[i])) n[k] = (n[k] || 0) + 1; });
  const m = {}; (tiers || []).forEach(t => { if(t) m[t] = (m[t] || 0) + 1; });
  return [...Object.keys(FAIL_TAG).filter(k => n[k]).map(k => `${FAIL_TAG[k]} ×${n[k]}`),
    ...Object.keys(FORCE_TAG).filter(t => m[t]).map(t => `${FORCE_TAG[t]} ×${m[t]}`)];
}
/* How hard the wrong crack was (user request 2026-10-15): f = the flick's peak strength over its trigger (1 = just enough;
   motion: max(rotation rate / T.flick, jolt / T.jerk), swipe: speed / 1.6; the button gives 0).
   0 gentle -> the gags above as they are; 1 hard -> a bone crunch and a hairline crack on the x-ray; 2 very hard ->
   a louder crunch and the vertebra breaks in two. A cartoon warning, not anatomy. Judging is untouched. */
export const FORCE_CRACK = 2.5, FORCE_BREAK = 4.0;
export function forceTier(f){ return f >= FORCE_BREAK ? 2 : f >= FORCE_CRACK ? 1 : 0; }
export const FORCE_STAMP = { 1: "으그적!", 2: "아그작!!" };
export const FORCE_LINES = {
  1: ["어… 방금 '으그적' 했는데요?", "목에서 과자 씹는 소리 났어요…"],
  2: ["으아아악!!", "제 목… 아직 붙어 있어요?!"]
};
export const FORCE_TAG = { 1: "금", 2: "골절" };
export const FORCE_REVIEWS = {
  1: ["엑스레이에 금이 보였대요", "목에서 과자 소리가 났어요"],
  2: ["구급차 타고 갑니다", "목에서 아그작 소리 들어 본 사람?"]
};
// day log lines for a patient who got wrong cracks but was finished, by the last kind
export const FAIL_REVIEWS = {
  dud:    ["하다 마신 줄 알았어요", "목보다 마음이 더 결렸어요"],
  finger: ["치료사님 손가락이 더 아파 보였어요", "제 목 말고 선생님 손이 풀렸대요"],
  over:   ["잠깐 천장이 옆으로 보였어요", "목이 고무줄인 줄 알았어요"]
};
/* r: a day log row {stars, fails: [kind...], tiers: [0|1|2...], lines, ambulance}. Walked out (stars 0) -> the patient's own parting line;
   a crack / break -> the pool of the last hard one; wrong cracks -> the pool of the last kind; otherwise the usual
   star reviews. */
export function reviewLine(r, rand = Math.random){
  const pick = a => a[Math.min(a.length - 1, Math.floor(rand()*a.length))];
  if(!r.stars && !r.ambulance) return (r.lines && r.lines.quit) || "다음에 다시 올게요…";
  const hard = (r.tiers || []).filter(Boolean).pop();
  if(hard && FORCE_REVIEWS[hard]) return pick(FORCE_REVIEWS[hard]);
  const last = r.fails && r.fails[r.fails.length - 1];
  if(last && FAIL_REVIEWS[last]) return pick(FAIL_REVIEWS[last]);
  return pick(REVIEWS[r.stars] || ["다음에 다시 올게요…"]);
}

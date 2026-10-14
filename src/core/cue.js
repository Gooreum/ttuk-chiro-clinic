/* Clinic talk timing (pure, no DOM). From the 98-video reference (2026-10-15): the therapist settles the patient
   first ("힘 빼세요", palpates, rocks the head) and times the thrust to the END of an exhale ("들이쉬고… 내쉬세요"). */

/* Prep: a new patient lies down, the therapist's hands palpate and gently rock the head. No judging meanwhile. */
export const PREP_MS = 2200;
export const PREP_LINES = ["힘 빼세요~ 목 좀 만져 볼게요", "편하게 누워 계세요, 힘 빼시고요", "어깨 힘 빼세요, 살살 할게요"];
export const inPrep = (now, prepUntil) => now < (prepUntil || 0);

/* Breath cue, once per side: when the aim is close (closeness >= CUE_CLOSE) and a new in-breath starts, the therapist
   says CUE_IN; at the next out-breath CUE_OUT, so the player can crack as that exhale runs out.
   st: previous state (or null); key: which patient side this is (a new key starts over).
   Returns {st, line}: line is "in", "out" or null. */
export const CUE_CLOSE = 0.5;
export const CUE_IN = "숨 크게 들이쉬고…";
export const CUE_OUT = "천천히 내쉬세요…";
export function breathCue(st, key, exhale, close){
  const s = st && st.key === key ? {...st} : {key, step: 0, was: exhale};
  let line = null;
  if(exhale !== s.was){
    if(s.step === 0 && !exhale && close >= CUE_CLOSE){ s.step = 1; line = "in"; }
    else if(s.step === 1 && exhale){ s.step = 2; line = "out"; }
  }
  s.was = exhale;
  return {st: s, line};
}

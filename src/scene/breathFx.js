import { floater, headScreen, coach } from "../ui/hud.js";
import { S } from "../game/state.js";
import { T } from "../tuning.js";
import { closeness } from "../game/feel.js";
import { breathCue, CUE_IN, CUE_OUT } from "../core/cue.js";

/* Breath lines: a short "흐읍…" as the patient starts breathing in and "후우~" as they let it out, drifting up beside
   the head (the out-breath in mint, like the HUD's exhale arc: the bonus window). Only while aiming.
   (2026-10-15: replaces a mint mist from the nose; the user wanted words, not something coming out of the mouth.) */
const IN = ["흐읍…", "스읍…", "흐으읍…"], OUT = ["후우~", "하아~", "후우우~"];
let wasExhale = null, n = 0, cue = null;
// br: breath state {exhale, fill}. on: only while aiming (not busy, not under the x-ray, not on menus).
export function updateBreathFx(br, on){
  if(!on){ wasExhale = null; return; }
  // breath cue (core/cue.js, once per side): close to the target, the therapist talks the patient through one breath,
  // "들이쉬고…" as it starts, "내쉬세요…" as the out-breath (the +15 window) begins, so the crack lands as it runs out
  const r = breathCue(cue, `${S.idx}:${S.sideIdx}:${S.patientStart}`, br.exhale, closeness(S.cur.rot, S.cur.bend));
  cue = r.st;
  if(r.line && T.breath && !(S.mods && S.mods.noisy)) coach(r.line === "in" ? CUE_IN : CUE_OUT, r.line === "in" ? 1500 : 1900);
  if(wasExhale !== null && br.exhale !== wasExhale){
    const list = br.exhale ? OUT : IN, side = n++ % 2 ? 1 : -1;
    floater(list[Math.floor(Math.random()*list.length)], side*(headScreen.r + 46), -headScreen.r*0.6, br.exhale ? "breath out" : "breath", 1700);
  }
  wasExhale = br.exhale;
}

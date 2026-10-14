import { floater, headScreen } from "../ui/hud.js";

/* Breath lines: a short "흐읍…" as the patient starts breathing in and "후우~" as they let it out, drifting up beside
   the head (the out-breath in mint, like the HUD's exhale arc: the bonus window). Only while aiming.
   (2026-10-15: replaces a mint mist from the nose; the user wanted words, not something coming out of the mouth.) */
const IN = ["흐읍…", "스읍…", "흐으읍…"], OUT = ["후우~", "하아~", "후우우~"];
let wasExhale = null, n = 0;
// br: breath state {exhale, fill}. on: only while aiming (not busy, not under the x-ray, not on menus).
export function updateBreathFx(br, on){
  if(!on){ wasExhale = null; return; }
  if(wasExhale !== null && br.exhale !== wasExhale){
    const list = br.exhale ? OUT : IN, side = n++ % 2 ? 1 : -1;
    floater(list[Math.floor(Math.random()*list.length)], side*(headScreen.r + 46), -headScreen.r*0.6, br.exhale ? "breath out" : "breath", 1700);
  }
  wasExhale = br.exhale;
}

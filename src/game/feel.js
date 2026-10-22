import { clamp } from "../lib/math.js";
import { T } from "../tuning.js";
import { S } from "./state.js";
import { tolMul, tightFactor, distAt, closenessOf, deltaGain, breathState } from "../core/feel.js";
import { bossTolMul, bonusWindow } from "../core/boss.js";
import { towelTension, towelDist, aimOff } from "../core/towel.js";

/* Game-side wrappers over src/core/feel.js, reading the current patient and tuning. */
export const curTolMul = now => S.target ? tolMul(S.target.trait, now - S.patientStart, tightFactor(S.mods)) * bossTolMul(S.boss, now - S.patientStart, S.bossTaunt) : 1;
// towel mode (core/towel.js): the distance is the towel's tension off the band (the aim's vertical axis) or the aim off
// the patient's centre (its horizontal axis), whichever is worse
export const distAtNow = (rot, bend, now = performance.now()) => S.game === "towel" && S.towel ? Math.max(towelDist(towelTension(bend), S.towel), Math.abs(aimOff(rot, S.towel)))
  : distAt(rot, bend, S.target, T.tol * curTolMul(now));
// __FORCE_HIT__ is true only in `npm run build:shot` so scripts/shot.py can capture the crack moment.
export const distNorm = () => __FORCE_HIT__ ? 0.2 : distAtNow(S.cur.rot, S.cur.bend);
export const closeness = (rot, bend) => closenessOf(distAtNow(rot, bend));
export function applyDelta(dr, db){
  const stiff = S.target && S.target.trait === "stiff";
  const g = deltaGain(T.heavy, stiff, closeness(S.input.rot, S.input.bend));
  S.input.rot = clamp(S.input.rot + dr*g, -75, 75);
  S.input.bend = clamp(S.input.bend + db*g, -32, 32);
}
export const breath = now => breathState(now, S.breathT0, S.target ? S.target.breath : 4);
/* does the breath bonus pay now? (core/boss.js: the "fake" boss pays on the in-breath) */
export const bonusExhale = now => bonusWindow(S.boss, breath(now).exhale);

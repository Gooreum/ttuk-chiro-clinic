import { clamp } from "../lib/math.js";
import { T } from "../tuning.js";
import { S } from "./state.js";
import { tolMul, distAt, closenessOf, deltaGain, breathState } from "../core/feel.js";

/* Game-side wrappers over src/core/feel.js, reading the current patient and tuning. */
export const curTolMul = now => S.target ? tolMul(S.target.trait, now - S.patientStart) : 1;
export const distAtNow = (rot, bend, now = performance.now()) => distAt(rot, bend, S.target, T.tol * curTolMul(now));
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

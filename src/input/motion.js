import { $ } from "../lib/dom.js";
import { DEG } from "../lib/math.js";
import { T } from "../tuning.js";
import { S } from "../game/state.js";
import { applyDelta } from "../game/feel.js";
import { adjust } from "../game/flow.js";
import { setModeText } from "../ui/hud.js";
import { physAngle } from "./orientation.js";
import { tiltAngles } from "../core/tilt.js";
import { classifySample, aimBefore } from "../core/motion.js";

/* Tilt aiming + flick snap from devicemotion (AGENTS.md 3-1 ~ 3-3).
   - Pose comes from accelerationIncludingGravity, never from rotationRate axis names (iOS labels them differently).
   - rotationRate is used only as a magnitude, for snap detection.
   - Shaky samples are dropped; aim accumulates frame-to-frame deltas through applyDelta (for heaviness).
   - A snap is judged at the aim from 250 ms before the flick. */
const screenAngle = () => (physAngle() + S.viewRot) * DEG;
let gSign = 0, prevTilt = null;
const grav = {x:0, y:0, z:0, ok:false};
export const live = {lr:0, pt:0};
export const aimHist = [];
function snap(now){
  S.flickCool = now + 900;
  const pre = aimBefore(aimHist, now - 250, {rot:S.cur.rot, bend:S.cur.bend});
  S.input.rot = S.cur.rot = pre.rot;
  S.input.bend = S.cur.bend = pre.bend;
  adjust("snap");
}
export function onMotion(e){
  const now = performance.now();
  const r = e.rotationRate;
  const m = (r && r.alpha != null) ? Math.hypot(r.alpha||0, r.beta||0, r.gamma||0) : 0;
  S.rate = m;
  if(m > S.peakRate) S.peakRate = m;
  const a = e.accelerationIncludingGravity;
  if(!a || a.x == null || a.y == null || a.z == null) return;
  if(!S.sensorSeen){ S.sensorSeen = true; S.mode = "tilt"; setModeText(); }
  const lin = Math.abs(Math.hypot(a.x, a.y, a.z) - 9.81);
  if(lin > S.jerkPeak) S.jerkPeak = lin;
  const playing = S.phase === "play" && !S.busy && $("#tune").hidden;
  const kind = classifySample({m, lin, playing, now, flickCool: S.flickCool, flick: T.flick, jerk: T.jerk});
  if(kind === "snap"){ snap(now); return; }
  if(kind === "discard") return;
  if(!gSign && Math.abs(a.z) > 2.5) gSign = a.z > 0 ? 1 : -1;
  const sg = gSign || 1;
  const k = grav.ok ? 0.35 : 1;
  grav.x += (sg*a.x - grav.x)*k; grav.y += (sg*a.y - grav.y)*k; grav.z += (sg*a.z - grav.z)*k; grav.ok = true;
  const t = tiltAngles(grav.x, grav.y, grav.z, screenAngle());
  live.lr = t.lr; live.pt = t.pt;
  const prev = prevTilt; prevTilt = t;
  if(!playing || !prev || now < S.flickCool - 500) return;
  const dlr = t.lr - prev.lr, dpt = t.pt - prev.pt;
  if(Math.abs(dlr) > 25 || Math.abs(dpt) > 25) return;
  applyDelta(-dlr*T.sens, -dpt*T.sens*T.bend);
}

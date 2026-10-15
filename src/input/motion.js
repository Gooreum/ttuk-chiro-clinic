import { $ } from "../lib/dom.js";
import { DEG } from "../lib/math.js";
import { T } from "../tuning.js";
import { S } from "../game/state.js";
import { applyDelta } from "../game/feel.js";
import { adjust, wouldSucceed } from "../game/flow.js";
import { setModeText, uiBlocked } from "../ui/hud.js";
import { physAngle } from "./orientation.js";
import { tiltAngles } from "../core/tilt.js";
import { classifySample, aimBefore, aimDelta, orientationSign, voteSign, signFromVotes } from "../core/motion.js";

/* Tilt aiming + flick snap from devicemotion (AGENTS.md 3-1 ~ 3-3).
   - Pose comes from accelerationIncludingGravity, never from rotationRate axis names (iOS labels them differently).
   - rotationRate is used only as a magnitude, for snap detection.
   - Shaky samples are dropped; aim accumulates frame-to-frame deltas through applyDelta (for heaviness).
   - A snap is judged at the aim from 250 ms before the flick.
   - How hard it was (the wrong-crack show only, core/fail.js forceTier) is the flick's peak: the first sample over the
     trigger is only the start of the swing (always ~1.0-1.3, so a break never came, user 2026-10-15). A good crack
     lands at once; a wrong one waits FORCE_WINDOW ms for the peak. */
const screenAngle = () => (physAngle() + S.viewRot) * DEG;
let gSign = 0, prevTilt = null, signVotes = 0;
const grav = {x:0, y:0, z:0, ok:false};
export const live = {lr:0, pt:0, sign:0, signSrc:""};
// Latest deviceorientation pose; used only to decide gSign, never for aiming.
let pose = null;
export function onOrientation(e){
  if(e.beta == null || e.gamma == null) return;
  pose = {beta: e.beta, gamma: e.gamma, t: performance.now()};
}
export const aimHist = [];
const FORCE_WINDOW = 130;   // ms
let pend = null;            // {force}: a wrong crack waiting for the flick's peak
function snap(now, force){
  S.flickCool = now + 900;
  const pre = aimBefore(aimHist, now - 250, {rot:S.cur.rot, bend:S.cur.bend});
  S.input.rot = S.cur.rot = pre.rot;
  S.input.bend = S.cur.bend = pre.bend;
  if(wouldSucceed()){ S.lastForce = force; adjust("snap", force); return; }
  pend = {force};
  setTimeout(() => { const f = pend.force; pend = null; S.lastForce = f; adjust("snap", f); }, FORCE_WINDOW);
}
export function onMotion(e){
  const now = performance.now();
  const r = e.rotationRate;
  const m = (r && r.alpha != null) ? Math.hypot(r.alpha||0, r.beta||0, r.gamma||0) : 0;
  S.rate = m;
  if(m > S.peakRate) S.peakRate = m;
  const a = e.accelerationIncludingGravity;
  if(!a || a.x == null || a.y == null || a.z == null) return;
  if(pend) pend.force = Math.max(pend.force, m/T.flick, Math.abs(Math.hypot(a.x, a.y, a.z) - 9.81)/T.jerk);
  if(!S.sensorSeen){ S.sensorSeen = true; S.mode = "tilt"; setModeText(); }
  const lin = Math.abs(Math.hypot(a.x, a.y, a.z) - 9.81);
  if(lin > S.jerkPeak) S.jerkPeak = lin;
  const playing = S.phase === "play" && !S.busy && !uiBlocked();
  const kind = classifySample({m, lin, playing, now, flickCool: S.flickCool, flick: T.flick, jerk: T.jerk});
  if(kind === "snap"){ snap(now, Math.max(m/T.flick, lin/T.jerk)); return; }   // how hard: for the wrong-crack show only
  if(kind === "discard") return;
  // gSign: decided by the pose angles when deviceorientation is available (works in any posture, keeps checking);
  // otherwise the first sample's z sign (player holds the screen facing up).
  const ps = pose && now - pose.t < 250 ? orientationSign(a.z, pose.beta, pose.gamma) : 0;
  if(ps){
    signVotes = voteSign(signVotes, ps);
    const vs = signFromVotes(signVotes);
    if(vs && vs !== gSign){ gSign = vs; grav.ok = false; prevTilt = null; live.signSrc = "자세"; }
  }
  if(!gSign && Math.abs(a.z) > 2.5){ gSign = a.z > 0 ? 1 : -1; live.signSrc = "첫 값"; }
  live.sign = gSign;
  const sg = gSign || 1;
  const k = grav.ok ? 0.35 : 1;
  grav.x += (sg*a.x - grav.x)*k; grav.y += (sg*a.y - grav.y)*k; grav.z += (sg*a.z - grav.z)*k; grav.ok = true;
  const t = tiltAngles(grav.x, grav.y, grav.z, screenAngle());
  live.lr = t.lr; live.pt = t.pt;
  const prev = prevTilt; prevTilt = t;
  if(!playing || !prev || now < S.flickCool - 500) return;
  const dlr = t.lr - prev.lr, dpt = t.pt - prev.pt;
  if(Math.abs(dlr) > 25 || Math.abs(dpt) > 25) return;
  const d = aimDelta(dlr, dpt, T.sens, T.bend);
  applyDelta(d.dr, d.db);
}

/* What to do with one devicemotion sample (AGENTS.md 3-2, 3-3).
   m = rotation-rate magnitude (°/s), lin = | |a| - 9.81 | (m/s²).
   "snap": a flick or jerk while playing and off cooldown. "discard": shaky sample, keep it out of the gravity
   filter and the aim. "use": feed it to the gravity filter. */
export function classifySample({m, lin, playing, now, flickCool, flick, jerk}){
  if(playing && now > flickCool && (m > flick || lin > jerk)) return "snap";
  if(lin > 1.6 || m > flick*0.65) return "discard";
  return "use";
}
/* Latest aim record at or before t; the snap is judged at the aim from 250 ms before the flick. */
export function aimBefore(hist, t, fallback){
  for(let i = hist.length - 1; i >= 0; i--) if(hist[i].t <= t) return hist[i];
  return hist[0] || fallback;
}
/* Tilt delta (degrees of phone pose) -> aim delta (degrees of head rotation / side bend).
   Signs are the prototype's: tilting left (lr up) turns the head left (rot down).
   Confirmed on iPhone 2026-10-14 via the tuning panel. If both axes ever feel reversed, suspect gSign, not this. */
export function aimDelta(dlr, dpt, sens, bend){
  return {dr: -dlr*sens, db: -dpt*sens*bend};
}

/* Gravity sign from the phone pose (AGENTS.md 3-1). iOS reports accelerationIncludingGravity with the opposite sign
   to the spec, so gSign normalises it. The pose angles of deviceorientation (beta, gamma) follow the spec on every
   platform, and per spec z = +g·cos(beta)·cos(gamma). So: same sign as expected -> +1, opposite -> -1.
   Returns 0 when this sample can't tell (phone near upright, or z too small). */
export function orientationSign(z, beta, gamma){
  const ez = Math.cos(beta*Math.PI/180) * Math.cos(gamma*Math.PI/180);
  if(Math.abs(ez) < 0.35 || Math.abs(z) < 2.5) return 0;
  return Math.sign(z) === Math.sign(ez) ? 1 : -1;
}
/* Votes from orientationSign, kept within ±20. gSign follows once 5 more samples agree one way. */
export const SIGN_VOTES = 5;
export function voteSign(votes, s){ return Math.max(-20, Math.min(20, votes + s)); }
export function signFromVotes(votes){ return votes >= SIGN_VOTES ? 1 : votes <= -SIGN_VOTES ? -1 : 0; }

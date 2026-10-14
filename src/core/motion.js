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

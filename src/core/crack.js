/* The neck's own motion on a crack, in degrees on top of the aim, by real seconds since the thrust:
   a small load-up against the turn, a fast thrust past the aim (peak ~0.15 s), then a damped wobble back as the
   neck lets go, with a little side-bend coupled to the turn (rotation and side-bend go together in the neck).
   Over by CRACK_LEN, before the x-ray opens. */
export const CRACK_LEN = 0.62;
const LOAD = 3, PEAK = 15, T_LOAD = 0.07, T_PEAK = 0.15;
export function crackProfile(t){
  let rot;
  if(t <= 0 || t >= CRACK_LEN) rot = 0;
  else if(t < T_LOAD) rot = -LOAD*Math.sin(Math.PI/2*t/T_LOAD);
  else if(t < T_PEAK){ const u = (t - T_LOAD)/(T_PEAK - T_LOAD); rot = -LOAD + (PEAK + LOAD)*(1 - Math.pow(1 - u, 3)); }
  else{
    const u = t - T_PEAK, end = 1 - u/(CRACK_LEN - T_PEAK);
    rot = PEAK*Math.exp(-6.5*u)*Math.cos(2*Math.PI*3.2*u)*end*end;
  }
  return {rot, bend: 0.35*rot, push: Math.max(0, rot/PEAK)};
}

import { DEG, clamp } from "../lib/math.js";

/* Phone pose from the gravity vector (AGENTS.md 3-1). x/y/z are accelerationIncludingGravity in device axes,
   th is the screen angle in radians (physical orientation + self-rotation viewRot).
   lr = left/right incl. steering, pt = front/back tilt of the top edge. */
export function tiltAngles(x, y, z, th){
  const c = Math.cos(th), s = Math.sin(th);
  const gx = x*c - y*s, gy = x*s + y*c;
  const g = Math.hypot(gx, gy, z) || 9.81;
  return { lr: Math.asin(clamp(gx/g, -1, 1)) / DEG, pt: Math.atan2(gy, z) / DEG };
}

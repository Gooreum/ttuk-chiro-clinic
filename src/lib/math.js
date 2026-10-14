export const DEG = Math.PI/180;
export const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
export const lerp = (a,b,t) => a + (b-a)*t;
export const ease = t => t<.5 ? 2*t*t : 1 - Math.pow(-2*t+2, 2)/2;

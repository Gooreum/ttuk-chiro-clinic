// Rendering profiles only. The tug distances, timings and judging live in towel.js.
const sat = x => Math.max(0, Math.min(1, x));
export const soft = x => { const t = sat(x); return t*t*(3 - 2*t); };

// A quiet shoulder, a continuous column, and a flat derivative at both attachments.
export function columnFollow(t, radius){
  const axial = 1 - soft((t - 0.035)/0.965);
  return axial*(1 - soft((radius - 1.2)/0.29));
}
// The head export has a small skirt below its cut. All of it must follow the cut,
// including the wide vertices: a radial mask here leaves hanging triangular flaps.
export const jawFollow = t => 1 - soft(t);
export const jawColumnFollow = (column, t) => jawFollow(t)*(1 - 0.65*column)/0.35;

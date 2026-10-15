// Game-only pressure and motion curves. No DOM, rendering or device dependencies.
export const TARGETS = [0.18, 0.50, 0.82];
export const PRESS_MS = 900;
export const SWEET = {min: 0.42, max: 0.78, ideal: 0.60};
export const POSITION_TOL = 0.12;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export function pressureAt(heldMs){ return clamp(heldMs / PRESS_MS, 0, 1.35); }
export function judgePress(position, step, pressure){
  if(!Number.isFinite(position) || !Number.isFinite(pressure) || !Number.isInteger(step) || step < 0 || step >= TARGETS.length)
    return {kind: 'miss', points: 0, perfect: false};
  const distance = Math.abs(position - TARGETS[step]);
  const kind = pressure > SWEET.max ? 'over' : distance > POSITION_TOL ? 'miss' : pressure < SWEET.min ? 'weak' : 'ok';
  const perfect = kind === 'ok' && distance <= 0.045 && Math.abs(pressure - SWEET.ideal) <= 0.09;
  const points = kind === 'ok' ? Math.round(100 - 25 * distance / POSITION_TOL - 20 * Math.min(1, Math.abs(pressure - SWEET.ideal) / 0.18)) : 0;
  return {kind, points, perfect};
}
export function pressProfile(t, kind = 'ok'){
  if(!Number.isFinite(t) || t < 0 || t >= 0.9) return 0;
  const rise = Math.sin(Math.min(1, t / 0.10) * Math.PI / 2);
  const decay = t <= 0.10 ? 1 : Math.exp(-(t - 0.10) * 7);
  const bounce = t <= 0.10 ? 1 : Math.cos((t - 0.10) * 16);
  const amplitude = kind === 'over' ? 1.65 : kind === 'weak' ? 0.30 : kind === 'miss' ? 0.55 : 1;
  return rise * decay * bounce * amplitude;
}
export function formatRank(score, mistakes){
  return mistakes >= 3 ? '침대도 쉬고 싶대요' : score >= 290 ? '손끝에서 오케스트라' : score >= 250 ? '허리까지 시원한 원장님' : '오늘도 한 뚝 배웠어요';
}

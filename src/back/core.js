import {forceTier} from '../core/fail.js';
import {scoreSuccess} from '../core/scoring.js';
// Game-only pressure and motion curves. No DOM, rendering or device dependencies.
export const TARGETS = [0.18, 0.50, 0.82];
export const BACK_XRAY={start:.7,full:1,release:1.55,released:2.35,fade:3.05,end:3.5};
export const makeBackTargets=(random=Math.random)=>TARGETS.map(p=>p+(random()-.5)*.10);
// Keep the camera loaded until the radiograph takes over, independent of tissue rebound.
export const cameraPreload=(pressure,peak,time)=>time>=0&&time<BACK_XRAY.end?peak:pressure;
export function pressureHint(position,step,pressure,targets=TARGETS){
  const lateral=Math.abs(position-targets[step])/POSITION_TOL;
  if(lateral>=1)return 'position';
  const half=.18*Math.sqrt(1-lateral*lateral);
  return pressure>SWEET.ideal+half?'release':pressure<SWEET.ideal-half?'load':'ready';
}
export const PRESS_MS = 900;
export const SWEET = {min: 0.42, max: 0.78, ideal: 0.60};
export const POSITION_TOL = 0.12;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export function pressureAt(heldMs){ return clamp(heldMs / PRESS_MS, 0, 1.35); }
export function backDistance(position,step,pressure,targets=TARGETS){
  if(!Number.isFinite(position)||!Number.isFinite(pressure)||!Number.isInteger(step)||step<0||step>=TARGETS.length)return 9;
  return Math.hypot((position-targets[step])/POSITION_TOL,(pressure-SWEET.ideal)/.18);
}
export function judgePress(position,step,pressure,force=1,{streak=0,pain=0,exhale=false,targets=TARGETS}={}){
  const d=backDistance(position,step,pressure,targets);
  let kind=pressure>SWEET.max?'over':Math.abs(position-targets[step])>POSITION_TOL?'miss':pressure<SWEET.min||force<1?'weak':d<=1+1e-9?'ok':pressure>SWEET.ideal?'over':'weak';
  if(!Number.isFinite(position)||!Number.isFinite(pressure)||!Number.isInteger(step)||step<0||step>=3)kind='miss';
  const tier=kind==='ok'?0:forceTier(force);
  if(kind!=='ok')return {kind,feedback:kind==='miss'?(d<2?'dud':'finger'):kind,points:0,perfect:false,tier,d,streak:0,stars:0};
  const score=scoreSuccess(Math.min(1,d),exhale,streak,pain);
  return {...score,points:score.pts,kind,perfect:score.perfect,tier:0,d};
}
export function reactionTiming(kind,tier=0){
  return tier?{faceAt:3.5,faceEnd:7.05,end:7.95,sirenAt:5.95}
    :kind==='weak'||kind==='miss'?{faceAt:3.5,faceEnd:5.75,end:6.15}
    :{faceAt:3.5,faceEnd:5.9,end:6.35};
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
  return mistakes >= 3 ? '침대도 쉬고 싶대요' : score >= 330 ? '손끝에서 오케스트라' : score >= 250 ? '허리까지 시원한 원장님' : '오늘도 한 뚝 배웠어요';
}

import {therapistStyle} from './therapistMotion.js';
import {forceTier,failKind,FAIL_AMP,FORCE_AMP} from '../core/fail.js';
import {crackProfile} from '../core/crack.js';
import {scoreSuccess} from '../core/scoring.js';
// Game-only pressure and motion curves. No DOM, rendering or device dependencies.
export const TARGETS = [0.18, 0.50, 0.82];
export const BACK_XRAY={start:.7,full:.9,release:1.25,released:2.65,fade:3.1,end:3.5};
// Timing from clinic flow.js (XRAY_DELAY/FRAC_AT/FRAC_HOLD) and loop.js opacity speeds.
// Organ ruptures (user, 2026-10-18 "척추가 먼저 골절되는걸 기존처럼 옆에서 보이게 하고 그 애니메이션 끝나면 터진 장기가 크게 보이면서 펑"):
// the spine side close-up until spineEnd, a pull-out to the burst organs by zoomEnd, then they grow and pop at burstAt.
// Seconds after the x-ray delay, like clinicFilm's own clock.
export const ORGAN_EXTRA=1.8,ORGAN_BEAT={spineEnd:1.6,zoomEnd:2,burstAt:2.4,stagger:.06};
export function organZoom(time){const t=Math.max(0,Math.min(1,(time-ORGAN_BEAT.spineEnd)/(ORGAN_BEAT.zoomEnd-ORGAN_BEAT.spineEnd)));return t*t*(3-2*t);}
export function clinicFilm(time,kind,tier=0,force=1,organs=false){
  time-=therapistStyle(force,tier).xrayDelay;
  if(time<0)return 0;
  if(kind!=='ok'&&!tier)return time<.7?0:Math.max(0,1-(time-.7)*1.4)*.55;
  const start=tier?.45:.7,hold=tier?2.3+(organs?ORGAN_EXTRA:0):2.4;
  return Math.max(0,Math.min(1,(time-start)*5,1-Math.max(0,time-start-hold)*2.5));
}
// The bone under the hands, as the x-ray engine's segment: a crack or break shows where the shove landed, not the
// zone that was asked for (user request 2026-10-16). The three targets keep their old segments 3/4/5.
export const pressedSegment=position=>Math.max(2,Math.min(6,Math.round(3+(Math.min(1,Math.max(0,Number.isFinite(position)?position:TARGETS[0]))-TARGETS[0])/(TARGETS[1]-TARGETS[0]))));
export const pressedZone=position=>{const s=pressedSegment(position);return s<=2?'목 밑':s===3?'등 위쪽':s===4?'등 가운데':s===5?'허리':'골반 쪽';};
// Portrait viewport while held sideways: rotate toward the last landscape the phone was in (neck layout() rule), so an
// OS flip caused by tilting a flat-held phone keeps the same physical screen frame (user, 2026-10-17).
export function backViewRot(w,h,pa,last=90){
  pa=((pa%360)+360)%360;const lastLandscape=pa===90||pa===270?pa:last;
  return {rot:h>w?(lastLandscape===270?270:90):0,lastLandscape};
}
export const makeBackTargets=(random=Math.random)=>TARGETS.map(p=>p+(random()-.5)*.10);
// Once the height is locked the hand bar is left(0)..right(1) of the patient's spine, 0.5 = on it
// (user, 2026-10-18 "오른쪽으로 치우쳐져서 누르면 오른쪽에 있는 장기들이 파열").
export const SIDE_CENTRE=.5;
export const makeSideTargets=(random=Math.random)=>TARGETS.map(()=>SIDE_CENTRE+(random()-.5)*.12);
export const pressedSide=position=>position>SIDE_CENTRE?'R':'L';
// Two-stage aim (user, 2026-10-18 "위아래 설정을 기존 모션방식으로 … 고정 버튼을 누르면 지금의 좌우 모션"):
// the bar runs along the spine first; once the height is locked it aims left/right. Unlocked, the hands stay on the spine.
export function judgeAim({height,side=SIDE_CENTRE,locked=false},step,pressure,force=1,{heights=TARGETS,sides=[.5,.5,.5],...o}={}){
  const h=judgePress(height,step,pressure,force,{...o,targets:heights});
  return !locked||h.kind!=='ok'?h:judgePress(side,step,pressure,force,{...o,targets:sides});
}
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
  // Back pressing follows the requested overload rule even at the correct spot.
  const tier=Math.max(forceTier(force),pressure>=1.2?2:pressure>=1?1:0);
  if(tier)kind='over';
  if(kind!=='ok')return {kind,feedback:tier? (tier===2?'break':'crack'):failKind(kind==='over',kind==='weak'?Math.min(d,1.99):d),points:0,perfect:false,tier,d,streak:0,stars:0};
  const score=scoreSuccess(Math.min(1,d),exhale,streak,pain);
  return {...score,points:score.pts,kind,perfect:score.perfect,tier:0,d};
}
export function reactionTiming(kind,tier=0,force=1,organs=false){
  const delay=therapistStyle(force,tier).xrayDelay,x=tier&&organs?ORGAN_EXTRA:0;
  const timing=tier?{faceAt:3.15+x,faceEnd:5.65+x,end:5.65+x,sirenAt:3.15+x}
    :kind!=='ok'?{faceAt:1.45,faceEnd:3.6,end:3.6}
    :{faceAt:3.5,faceEnd:7.25,end:7.25};
  return Object.fromEntries(Object.entries(timing).map(([k,v])=>[k,v+delay]));
}
// Exactly the clinic's load-up, thrust and damped return; only the destination is the back.
export function impactFeel(force=1,tier=0){
  const f=Number.isFinite(force)?Math.max(0,force):1;
  const gain=tier===2?FORCE_AMP[2]+.25*clamp((f-4)/2,0,1):tier===1?FORCE_AMP[1]+.2*clamp((f-2.5)/1.5,0,1):clamp(.3+.7*f,.35,1.5);
  return {gain,rate:1,shake:tier===2?1.35:tier===1?.85:clamp(f*.32,.12,.72),settle:tier===2?.006:tier===1?.003:0};
}
export function pressProfile(t,kind='ok',tier=0,feedback='dud',force=1){
  const feel=impactFeel(force,tier),amp=tier?feel.gain:feel.gain*(kind==='ok'?1:FAIL_AMP[kind==='over'?'over':feedback]);
  return crackProfile((t-(therapistStyle(force,tier).impactAt-.15))*feel.rate).rot/15*amp;
}
export function formatRank(score, mistakes){
  return mistakes >= 3 ? '침대도 쉬고 싶대요' : score >= 330 ? '손끝에서 오케스트라' : score >= 250 ? '허리까지 시원한 원장님' : '오늘도 한 뚝 배웠어요';
}

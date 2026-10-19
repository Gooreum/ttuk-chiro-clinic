import {judgeAim,SIDE_CENTRE,SWEET} from '../back/core.js';
// Side-posture lumbar roll ("허리비틀기", user 2026-10-19 "이거는 좌우 두번해야돼"): every patient is adjusted on
// both sides, the symptom side first, then he rolls over and the other side. Game-only rules, no DOM or rendering.
// The aim reuses the back mode: before the lock the bar is the height along L1..L5, after it the pelvis roll
// (position 0.5 = neutral, more = rolled toward the therapist) and the forward tilt is the preload.
export const SIDE_NAME={L:'왼쪽',R:'오른쪽'};
export const sideOrder=first=>first==='R'?['R','L']:['L','R'];
// Height 0..1 runs L1 (0) .. L5 (1).
export const lumbarAt=h=>'L'+Math.max(1,Math.min(5,Math.round(1+4*(Number.isFinite(h)?Math.min(1,Math.max(0,h)):1))));
// Per side: a height near L4/5 and a roll a little past neutral. Rolled once when the patient walks in.
export function makeSideGoals(random=Math.random){
  return [0,1].map(()=>({height:.78+(random()-.5)*.1,roll:SIDE_CENTRE+.1+(random()-.5)*.1}));
}
// Height first; once locked, the roll too. Overload tiers, points and stars are the back mode's.
export function judgeSide(aim,pressure,force,goal,o={}){
  return judgeAim(aim,0,pressure,force,{...o,heights:[goal.height],sides:[goal.roll]});
}
// The patient leaves only after two results on opposite sides.
export const canLeave=results=>Array.isArray(results)&&results.length===2&&results[0].side!==results[1].side;
// How hard a side was worked, relative to its own goal: roll and preload.
const effort=r=>.5*(r.roll-SIDE_CENTRE)/Math.max(.01,r.goalRoll-SIDE_CENTRE)+.5*r.pressure/SWEET.ideal;
export function balance(results){
  if(!canLeave(results))return {bonus:0,label:''};
  const [a,b]=results,kinds=[a.kind,b.kind];
  if(kinds.includes('over')&&kinds.includes('weak'))return {bonus:-30,label:'한쪽만 꽈배기'};
  const gap=Math.abs(effort(a)-effort(b));
  if(a.kind==='ok'&&b.kind==='ok'&&gap<=.15)return {bonus:30,label:'좌우 대칭 완성'};
  if(gap>.3&&(a.kind==='ok'||b.kind==='ok'))return {bonus:-30,label:'한쪽만 꽈배기'};
  return {bonus:0,label:a.kind==='ok'&&b.kind==='ok'?'양쪽 온도차 있네요':''};
}
export const patientTotal=results=>Math.max(0,results.reduce((s,r)=>s+(r.points||0),0)+balance(results).bonus);
// Sounds at the moment of the thrust (user 2026-10-19 "우두둑 소리도 안나는것 같은데"): every thrust cracks a recorded
// bone sample, right or wrong, like the towel mode; a wrong one adds its joke sound on top.
export function thrustSounds({kind,tier=0,perfect=false}){
  if(tier)return [{fn:'crackSound',n:3},{fn:'crunch',tier}];
  if(kind==='ok')return [{fn:'crackSound',n:perfect?3:2},{fn:'chime',perfect}];
  if(kind==='over')return [{fn:'crackSound',n:3},{fn:'boing'}];
  if(kind==='weak')return [{fn:'crackSound',n:1},{fn:'fizzle'}];
  return [{fn:'crackSound',n:1},{fn:'knuckle'}];
}
// A hard thrust (user 2026-10-19 "엄청 세게 꺾거나 할때 우수꽝스러운 표현이 없음"): the patient whips round screaming,
// the therapist overacts. Level scales the body animation (scene.js react); none for an ordinary thrust.
export function overReaction({kind,tier=0}){
  if(tier===2)return {level:3,scream:'끄아아아악!!!',doc:'나 아무것도 안 했다?'};
  if(tier===1)return {level:2,scream:'으아아악!!',doc:'앗 뜨거!'};
  if(kind==='over')return {level:1,scream:'끼야악?!',doc:'어… 어?'};
  return null;
}
// The clinic x-ray engine's target for this shot: its slots C1..C7 hold T11, T12, L1..L5 (side/xray.js), so Ln is seg
// n+2; the worked facet is the up side, the patient's right when he lies on his left (engine side +1 = patient's left).
export function xrayTarget(height,side){
  return {name:'side',seg:Number(lumbarAt(height).slice(1))+2,side:side==='R'?1:-1,xr:'rot'};
}
// The torso wring of a thrust (user 2026-10-19 "푸시할때 환자 몸이 안비틀림. 비틀림 효과 정상, 약함, 정상범주 오버, 과함에
// 따라 다 다르게"): degrees the pelvis winds forward and the chest is held back, and the therapist's weight 0..1, over the
// shot time t (s) with the hand landing at hit. Preload until hit, then a snap to the peak and a settle; a weak thrust
// creeps up and goes slack, an over one stays wrung and shivers. Peaks and settles both rank weak < ok < over < tier 1 < 2.
const TWIST={weak:{pre:4,peak:8,rise:.25,end:3,chest:[1,0],drop:[.3,0]},ok:{pre:6,peak:26,rise:.08,end:16,chest:[8,4],drop:[.6,.2]},
  over:{pre:6,peak:48,rise:.1,end:36,chest:[14,10],drop:[.85,.4],shiver:2.5},1:{pre:6,peak:66,rise:.12,end:58,chest:[22,16],drop:[1,.5],shiver:4},
  2:{pre:6,peak:86,rise:.14,end:78,chest:[30,22],drop:[1,.6],shiver:5}};
const ramp=(a,b,x)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t);};
export function twistProfile(t,{kind='ok',tier=0,hit=.15}={}){
  if(!Number.isFinite(t)||t<0)return {pelvis:0,chest:0,drop:0};
  const P=TWIST[tier||(kind==='miss'?'weak':kind)]||TWIST.ok,u=t-hit;
  if(u<0){const k=ramp(0,Math.max(.01,hit),t);return {pelvis:P.pre*k,chest:0,drop:0};}
  const up=ramp(0,P.rise,u),down=ramp(P.rise,P.rise+.4,u),pick=([a,b])=>a*up+(b-a)*down;
  const shiver=(P.shiver||0)*Math.sin(u*32)*Math.exp(-u*2.5)*up;
  return {pelvis:P.pre+(P.peak-P.pre)*up+(P.end-P.peak)*down+shiver,chest:pick(P.chest),drop:pick(P.drop)};
}
// A good thrust's slow-mo and camera punch (2026-10-19 "세개다 반영해봐", the neck mode's crack had them, this one not):
// the shot clock runs at SLOW.rate for SLOW.len s from the hand landing, then on at full speed (everything after, the
// x-ray, the line and the end of the side, comes SLOW.len·(1 − rate) later). punchProfile: 0..1, in fast, out slowly.
export const SLOW={at:.15,len:.45,rate:.35};
export function slowWarp(t){
  if(!(t>SLOW.at))return t;
  return t<SLOW.at+SLOW.len?SLOW.at+(t-SLOW.at)*SLOW.rate:t-SLOW.len*(1-SLOW.rate);
}
export function punchProfile(t){
  if(!(t>=SLOW.at))return 0;
  const u=t-SLOW.at;
  return u<.1?ramp(0,.1,u):1-ramp(.1,.7,u);
}
// One more go per side after a mild miss (weak / over-rolled / missed, no crack or break): the side is not over yet
// (2026-10-19, the neck mode retries the same side after a mild miss).
export const canRetry=(kind,tier,retried)=>kind!=='ok'&&!tier&&!retried;

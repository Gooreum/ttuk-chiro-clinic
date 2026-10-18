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

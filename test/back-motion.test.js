import {describe,it,expect} from 'vitest';
import {BackMotion,screenVector,thrustSample} from '../src/back/motion.js';
import {judgePress,backDistance,reactionTiming,pressureHint,cameraPreload,BACK_XRAY,makeBackTargets} from '../src/back/core.js';
const rad=d=>d*Math.PI/180;
function packet({angle=0,lr=0,pt=0,forward=0,side=0,down=0,rate=0,sign=1,linear=true}={}){
  const gx=9.81*Math.sin(rad(lr)),gy=9.81*Math.cos(rad(lr))*Math.sin(rad(pt)),gz=9.81*Math.cos(rad(lr))*Math.cos(rad(pt));
  const c=Math.cos(angle),s=Math.sin(angle),a={x:(side*c+forward*s)*sign,y:(-side*s+forward*c)*sign,z:-down*sign};
  return {acceleration:linear?a:null,accelerationIncludingGravity:{x:(gx*c+gy*s)*sign+a.x,y:(-gx*s+gy*c)*sign+a.y,z:gz*sign+a.z},rotationRate:{alpha:rate,beta:0,gamma:0}};
}
function warm(m,options={}){for(let t=0;t<=700;t+=20)m.sample(packet(options),t,options.angle||0);}
describe('back motion follows neck rules with a directional thrust',()=>{
  it.each([0,90,180,270])('recognises forward translation at screen angle %i',degrees=>{
    const angle=rad(degrees),m=new BackMotion();warm(m,{angle});
    const hit=m.sample(packet({angle,forward:12}),800,angle);
    expect(hit.ready).toBe(true);expect(hit.type).toBe('impulse');expect(hit.force).toBeCloseTo(1.2);
    expect(hit.position).toBeCloseTo(.5);
  });
  it('accepts a short downward press but ignores rotation alone and sideways shaking',()=>{
    expect(thrustSample({x:0,y:0,z:-12},0,0).force).toBeCloseTo(1.2);
    expect(thrustSample({x:0,y:0,z:0},0,900).force).toBe(0);
    for(const p of [{side:20},{forward:-20},{down:-20},{rate:900}]){
      const m=new BackMotion();warm(m);expect(m.sample(packet(p),800,0).type).not.toBe('impulse');
    }
  });
  it('does not count the positive recoil after a backwards pull',()=>{
    const m=new BackMotion();warm(m);
    m.sample(packet({forward:-15}),800,0);
    expect(m.sample(packet({forward:15}),850,0).type).not.toBe('impulse');
  });
  it('blocks double triggers for the same 900 ms cooldown as neck adjustment',()=>{
    const m=new BackMotion();warm(m);
    expect(m.sample(packet({forward:12}),800,0).type).toBe('impulse');
    for(let t=820;t<1500;t+=20)m.sample(packet(),t,0);
    expect(m.sample(packet({forward:12}),1500,0).type).not.toBe('impulse');
    for(let t=1520;t<1750;t+=20)m.sample(packet(),t,0);
    expect(m.sample(packet({forward:12}),1750,0).type).toBe('impulse');
  });
  it('never triggers before calibration, when paused, or while watching the reaction',()=>{
    const m=new BackMotion();expect(m.sample(packet({forward:40}),0,0).type).not.toBe('impulse');warm(m);
    expect(m.sample(packet({forward:40}),800,0,{active:false}).type).not.toBe('impulse');
    expect(m.sample(packet({forward:40}),900,0,{canPush:false}).type).not.toBe('impulse');
  });
  it('aims from 250 ms before the shove rather than its contaminated gravity vector',()=>{
    const m=new BackMotion();warm(m);
    const record=[];
    for(let t=720;t<=1200;t+=20){const value=m.sample(packet({lr:(t-700)/30,pt:-(t-700)/50}),t,0);record.push({t,p:value.position});}
    const expected=record.filter(p=>p.t<=1250-250).pop().p;
    const hit=m.sample(packet({lr:45,pt:45,forward:14}),1250,0);
    expect(hit.type).toBe('impulse');expect(hit.position).toBeCloseTo(expected);
  });
  it('normalises opposite gravity signs and recalibrates on a screen orientation change',()=>{
    const m=new BackMotion();warm(m,{sign:-1});
    expect(m.sample(packet({sign:-1,forward:15}),800,0).type).toBe('impulse');
    expect(m.sample(packet({angle:rad(90),sign:-1}),1000,rad(90)).ready).toBe(false);
  });
  it('uses gravity subtraction when linear acceleration is unavailable',()=>{
    const m=new BackMotion();warm(m,{linear:false});
    expect(m.sample(packet({linear:false,forward:12}),800,0).type).toBe('impulse');
  });
});
describe('same success and damage rules as neck adjustment',()=>{
  it('requires both position and preload inside the ellipse',()=>{
    expect(backDistance(.27,0,.735)).toBeGreaterThan(1);
    expect(judgePress(.27,0,.735).kind).toBe('over');
    expect(judgePress(.18,0,.6).kind).toBe('ok');
  });
  it('uses the same force thresholds and only damages failed attempts',()=>{
    expect(judgePress(.8,0,.6,2.49).tier).toBe(0);
    expect(judgePress(.8,0,.6,2.5).tier).toBe(1);
    expect(judgePress(.8,0,.6,4).tier).toBe(2);
    expect(judgePress(.18,0,.6,5)).toMatchObject({kind:'ok',tier:0});
    expect(judgePress(.18,0,.6,.8)).toMatchObject({kind:'weak',tier:0});
  });
  it('shares perfect, exhale and first-try streak scoring',()=>{
    expect(judgePress(.18,0,.6,1,{streak:2,pain:0,exhale:true})).toMatchObject({points:135,perfect:true,stars:3,streak:3});
    expect(judgePress(.18,0,.6,1,{streak:2,pain:1,exhale:false})).toMatchObject({points:100,streak:0,stars:2});
  });
  it('keeps the face visible before the ambulance ends a damage run',()=>{
    const timing=reactionTiming('miss',2);expect(timing.sirenAt).toBeGreaterThan(timing.faceAt);expect(timing.end).toBeGreaterThan(timing.faceEnd);
  });
});

describe('back feel regression fixes',()=>{
  it('keeps camera preload through impact and separates red compression from release',()=>{
    expect(cameraPreload(0,.6,.35)).toBe(.6);
    expect(cameraPreload(.12,.6,-1)).toBe(.12);
    expect(BACK_XRAY.start).toBeGreaterThanOrEqual(.6);
    expect(BACK_XRAY.release-BACK_XRAY.full).toBeGreaterThanOrEqual(.5);
    expect(reactionTiming('ok').faceAt).toBeGreaterThanOrEqual(BACK_XRAY.end);
  });
  it('asks for less pressure at an ellipse corner and distinguishes close and far misses',()=>{
    expect(pressureHint(.27,0,.74)).toBe('release');
    expect(pressureHint(.27,0,.46)).toBe('load');
    expect(judgePress(.31,0,.6).feedback).toBe('dud');
    expect(judgePress(.8,0,.6).feedback).toBe('finger');
  });
  it('randomises within anatomical regions and judges the generated target',()=>{
    const targets=makeBackTargets(()=>1);
    [.23,.55,.87].forEach((p,i)=>expect(targets[i]).toBeCloseTo(p));
    expect(judgePress(targets[2],2,.6,1,{targets}).perfect).toBe(true);
  });
  it('moves toward the screen left when tilting left, regardless of screen rotation',()=>{
    for(const angle of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
      const m=new BackMotion();warm(m,{angle});
      for(let t=720;t<=1000;t+=20)m.sample(packet({angle,lr:8}),t,angle);
      // Increasing z is toward the feet, projected left by this camera.
      expect(m.position).toBeGreaterThan(.5);
    }
  });
  it('handles opposite signs between native linear and gravity-inclusive acceleration',()=>{
    for(const gravitySign of [1,-1])for(const linearSign of [1,-1]){
      const m=new BackMotion();warm(m,{sign:gravitySign});
      const e=packet({sign:gravitySign,forward:12});
      e.acceleration={x:0,y:12*linearSign,z:0};
      expect(m.sample(e,800,0).type).toBe('impulse');
    }
  });
});

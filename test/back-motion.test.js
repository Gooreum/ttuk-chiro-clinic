import {describe,it,expect} from 'vitest';
import {BackMotion,screenVector,thrustSample} from '../src/back/motion.js';
import {pressedSegment,pressedZone,TARGETS,judgePress,backDistance,reactionTiming,pressureHint,cameraPreload,BACK_XRAY,makeBackTargets,clinicFilm,impactFeel,pressProfile,backViewRot} from '../src/back/core.js';
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
    for(const p of [{side:20},{rate:900}]){
      const m=new BackMotion();warm(m);expect(m.sample(packet(p),800,0).type).not.toBe('impulse');
    }
  });
  // User request 2026-10-16: pushing the phone back toward you presses too.
  it.each([0,90,180,270])('recognises backward translation at screen angle %i',degrees=>{
    const angle=rad(degrees),m=new BackMotion();warm(m,{angle});
    const hit=m.sample(packet({angle,forward:-12}),800,angle);
    expect(hit.type).toBe('impulse');expect(hit.force).toBeCloseTo(1.2);
  });
  it('accepts a backward pull or lift as a press',()=>{
    expect(thrustSample({x:0,y:0,z:12},0,0).force).toBeCloseTo(1.2);
    for(const p of [{forward:-20},{down:-20}]){
      const m=new BackMotion();warm(m);expect(m.sample(packet(p),800,0).type).toBe('impulse');
    }
  });
  it('counts a backwards pull once and not the recoil after it',()=>{
    const m=new BackMotion();warm(m);
    expect(m.sample(packet({forward:-15}),800,0).type).toBe('impulse');
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
describe('back overload with clinic damage thresholds',()=>{
  it('requires both position and preload inside the ellipse',()=>{
    expect(backDistance(.27,0,.735)).toBeGreaterThan(1);
    expect(judgePress(.27,0,.735).kind).toBe('over');
    expect(judgePress(.18,0,.6).kind).toBe('ok');
  });
  it('uses clinic damage thresholds even at the right spot',()=>{
    expect(judgePress(.8,0,.6,2.49).tier).toBe(0);
    expect(judgePress(.8,0,.6,2.5).tier).toBe(1);
    expect(judgePress(.8,0,.6,4).tier).toBe(2);
    expect(judgePress(.18,0,.6,2.5)).toMatchObject({kind:'over',tier:1,points:0});
    expect(judgePress(.18,0,.6,4)).toMatchObject({kind:'over',tier:2,points:0});
    expect(judgePress(.18,0,1,1).tier).toBe(1);
    expect(judgePress(.18,0,1.2,1).tier).toBe(2);
    expect(judgePress(.18,0,.6,.8)).toMatchObject({kind:'weak',tier:0});
  });
  it('shares perfect, exhale and first-try streak scoring',()=>{
    expect(judgePress(.18,0,.6,1,{streak:2,pain:0,exhale:true})).toMatchObject({points:135,perfect:true,stars:3,streak:3});
    expect(judgePress(.18,0,.6,1,{streak:2,pain:1,exhale:false})).toMatchObject({points:100,streak:0,stars:2});
  });
  it('keeps the face visible before the ambulance ends a damage run',()=>{
    const timing=reactionTiming('miss',2);expect(timing.sirenAt).toBeGreaterThanOrEqual(timing.faceAt);expect(timing.end).toBeGreaterThanOrEqual(timing.faceEnd);
  });
});

describe('back feel regression fixes',()=>{
  it('keeps camera preload through impact and separates red compression from release',()=>{
    expect(cameraPreload(0,.6,.35)).toBe(.6);
    expect(cameraPreload(.12,.6,-1)).toBe(.12);
    expect(BACK_XRAY.start).toBeGreaterThanOrEqual(.6);
    expect(BACK_XRAY.release-BACK_XRAY.start).toBeCloseTo(.55);
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
  it('returns to the centre after tilting past either end (no drift off the wall)',()=>{
    for(const end of [30,-30]){
      const m=new BackMotion();warm(m);let t=720;
      for(let i=1;i<=30;i++,t+=20)m.sample(packet({lr:end*i/30}),t,0);
      expect(m.position).toBe(end>0?1:0);
      for(let i=29;i>=0;i--,t+=20)m.sample(packet({lr:end*i/30}),t,0);
      for(let i=0;i<10;i++,t+=20)m.sample(packet(),t,0);
      expect(m.position).toBeCloseTo(.5,1);expect(Math.abs(m.position-.5)).toBeLessThan(.02);
    }
  });
  it('follows a fast tilt instead of dropping it',()=>{
    const m=new BackMotion();warm(m);let t=720;
    for(let i=1;i<=3;i++,t+=16)m.sample(packet({lr:5*i,rate:300}),t,0);
    for(let i=0;i<10;i++,t+=16)m.sample(packet({lr:15,rate:0}),t,0);
    expect(Math.abs(m.position-.5)).toBeGreaterThan(.3);
  });
  it('moves the same distance for the same tilt either way',()=>{
    const at=lr=>{const m=new BackMotion();warm(m);for(let t=720;t<=1100;t+=20)m.sample(packet({lr}),t,0);return m.position-.5;};
    expect(at(12)).toBeCloseTo(-at(-12),2);expect(Math.abs(at(12))).toBeGreaterThan(.2);
  });
  it('rotates a portrait viewport toward the last landscape, like the neck layout',()=>{
    expect(backViewRot(390,844,0,270)).toEqual({rot:270,lastLandscape:270});
    expect(backViewRot(390,844,0,90)).toEqual({rot:90,lastLandscape:90});
    expect(backViewRot(844,390,270)).toEqual({rot:0,lastLandscape:270});
    expect(backViewRot(390,844,0)).toEqual({rot:90,lastLandscape:90});
    expect(backViewRot(844,390,-90,90).lastLandscape).toBe(270);
  });
  it('keeps aiming through an OS flip when the sensor angle stays the same',()=>{
    const angle=rad(270),m=new BackMotion();warm(m,{angle});let t=720,last=.5;
    for(let i=1;i<=15;i++,t+=20){m.sample(packet({angle,lr:i}),t,angle,{axis:1});expect(m.position).toBeLessThanOrEqual(last+1e-9);last=m.position;}
    // OS rotated to portrait: angle stays 0+270, so no recalibration
    for(let i=16;i<=20;i++,t+=20)m.sample(packet({angle,lr:i}),t,angle,{axis:1});
    expect(m.ready).toBe(true);expect(m.position).toBeLessThan(last);
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

it('uses the clinic film timings for success, injury and a harmless wrong crack',()=>{
  expect(clinicFilm(.69,'ok')).toBe(0);
  expect(clinicFilm(.9,'ok')).toBe(1);
  expect(clinicFilm(3.5,'ok')).toBeCloseTo(0);
  expect(clinicFilm(1.75,'miss',2)).toBeCloseTo(1);
  expect(clinicFilm(4.25,'miss',2)).toBeCloseTo(0);
  expect(clinicFilm(.7,'weak')).toBe(.55);
  expect(clinicFilm(1.45,'weak')).toBe(0);
});

it('scales actual pressure movement continuously and keeps crack and break distinct',()=>{
  expect(impactFeel(1.8).gain).toBeGreaterThan(impactFeel(1.1).gain);
  expect(impactFeel(3.8,1).gain).toBeGreaterThan(impactFeel(2.6,1).gain);
  expect(impactFeel(4.2,2).gain).toBeGreaterThan(impactFeel(3.8,1).gain);
  expect(pressProfile(.15,'weak',0,'dud',.75)).toBeLessThan(pressProfile(.15,'ok',0,'dud',1.2));
});
describe('the injured bone is the one under the hands',()=>{
  it('keeps the old segments on the three targets',()=>{
    expect(TARGETS.map(pressedSegment)).toEqual([3,4,5]);
    expect(makeBackTargets(()=>0).map(pressedSegment)).toEqual([3,4,5]);
    expect(makeBackTargets(()=>.999).map(pressedSegment)).toEqual([3,4,5]);
  });
  it('maps the ends of the back to the neck base and the pelvis',()=>{
    expect(pressedSegment(0)).toBe(2);expect(pressedSegment(1)).toBe(6);
    expect(pressedSegment(NaN)).toBe(3);expect(pressedZone(1)).toBe('골반 쪽');
  });
  it('breaks the pelvis-side bone when the upper back was the target',()=>{
    const hit=judgePress(.95,0,1.25,1);
    expect(hit.tier).toBe(2);expect(pressedSegment(.95)).not.toBe(pressedSegment(TARGETS[0]));
  });
});

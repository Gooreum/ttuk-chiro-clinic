import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {solveTwoBone} from '../src/side/ik.js';
import {sideOrder,canLeave,judgeSide,balance,lumbarAt,makeSideGoals,patientTotal,thrustSounds,overReaction,xrayTarget,twistProfile,slowWarp,punchProfile,canRetry,SLOW,runComplete,continuePlan} from '../src/side/core.js';

const goal={height:.78,roll:.6};
const res=(side,kind,roll=.6,pressure=.6,points=80)=>({side,kind,roll,pressure,goalRoll:.6,points});

describe('side-posture lumbar roll (user 2026-10-19 "이거는 좌우 두번해야돼")',()=>{
  it('always does the two opposite sides, symptom side first',()=>{
    expect(sideOrder('L')).toEqual(['L','R']);
    expect(sideOrder('R')).toEqual(['R','L']);
  });
  it('never lets the patient leave after one side or the same side twice',()=>{
    expect(canLeave([])).toBe(false);
    expect(canLeave([res('L','ok')])).toBe(false);
    expect(canLeave([res('L','ok'),res('L','ok')])).toBe(false);
    expect(canLeave([res('L','ok'),res('R','miss')])).toBe(true);
  });
  it('judges the height first and the roll once locked',()=>{
    const ok=judgeSide({height:.78,side:.6,locked:true},.6,1,goal);
    expect(ok.kind).toBe('ok');expect(ok.points).toBeGreaterThan(0);
    expect(judgeSide({height:.78,side:.95,locked:false},.6,1,goal).kind).toBe('ok');
    expect(judgeSide({height:.78,side:.95,locked:true},.6,1,goal).kind).toBe('miss');
    expect(judgeSide({height:.3,side:.6,locked:true},.6,1,goal).kind).toBe('miss');
    expect(judgeSide({height:.78,side:.6,locked:true},.6,5,goal)).toMatchObject({kind:'over',tier:2});
  });
  it('rewards a symmetric pair and punishes a twisted one',()=>{
    expect(balance([res('L','ok'),res('R','ok',.62,.62)])).toEqual({bonus:30,label:'좌우 대칭 완성'});
    expect(balance([res('L','over'),res('R','weak')]).bonus).toBe(-30);
    expect(balance([res('L','ok',.6,.6),res('R','ok',.9,1)]).bonus).toBe(-30);
    expect(balance([res('L','miss'),res('R','miss')]).bonus).toBe(0);
    expect(balance([res('L','ok')]).bonus).toBe(0);
    expect(patientTotal([res('L','ok'),res('R','ok',.62,.62)])).toBe(190);
    expect(patientTotal([res('L','over',.6,.6,0),res('R','weak',.6,.6,0)])).toBe(0);
  });
  it('names the lumbar level and rolls goals near L4/5',()=>{
    expect(lumbarAt(0)).toBe('L1');expect(lumbarAt(1)).toBe('L5');expect(lumbarAt(.7)).toBe('L4');expect(lumbarAt(NaN)).toBe('L5');
    for(const r of [0,.5,.999])for(const g of makeSideGoals(()=>r)){
      expect(g.height).toBeGreaterThan(.7);expect(g.height).toBeLessThan(.86);
      expect(g.roll).toBeGreaterThan(.5);
    }
  });
  it('cracks a recorded bone on every thrust, right or wrong (user 2026-10-19 "우두둑 소리도 안나는것 같은데")',()=>{
    const cases=[{kind:'ok',perfect:true},{kind:'ok'},{kind:'weak'},{kind:'miss'},{kind:'over'},{kind:'over',tier:1},{kind:'over',tier:2}];
    for(const c of cases)expect(thrustSounds(c).some(s=>s.fn==='crackSound'&&s.n>=1)).toBe(true);
    expect(thrustSounds({kind:'ok',perfect:true})).toEqual([{fn:'crackSound',n:3},{fn:'chime',perfect:true}]);
    expect(thrustSounds({kind:'over',tier:2})).toContainEqual({fn:'crunch',tier:2});
    expect(thrustSounds({kind:'over',tier:1})).toContainEqual({fn:'crunch',tier:1});
  });
  it('overacts only on a hard thrust (user 2026-10-19 "엄청 세게 꺾거나 할때")',()=>{
    expect(overReaction({kind:'over'}).level).toBe(1);
    expect(overReaction({kind:'over',tier:1}).level).toBe(2);
    expect(overReaction({kind:'over',tier:2})).toMatchObject({level:3,scream:'끄아아아악!!!'});
    for(const kind of ['ok','weak','miss'])expect(overReaction({kind})).toBeNull();
  });
  it('maps the shot onto the clinic x-ray engine: T11, T12 on top, so Ln -> seg n+2, the up-side facet',()=>{
    expect(xrayTarget(.78,'L')).toEqual({name:'side',seg:6,side:-1,xr:'rot'});
    expect(xrayTarget(.78,'R').side).toBe(1);
    expect(xrayTarget(0,'L').seg).toBe(3);expect(xrayTarget(1,'L').seg).toBe(7);
  });
});

describe('twistProfile',()=>{
  const CASES=[{kind:'weak'},{kind:'ok'},{kind:'over'},{kind:'over',tier:1},{kind:'over',tier:2}];
  const peak=c=>Math.max(...Array.from({length:200},(_,i)=>twistProfile(i/100,c).pelvis));
  it('ranks weak < ok < over < tier 1 < tier 2 at the peak and once settled',()=>{
    const peaks=CASES.map(peak),ends=CASES.map(c=>twistProfile(2,c).pelvis),drops=CASES.map(c=>twistProfile(2,c).drop);
    for(let i=1;i<CASES.length;i++){expect(peaks[i]).toBeGreaterThan(peaks[i-1]);expect(ends[i]).toBeGreaterThan(ends[i-1]);expect(drops[i]).toBeGreaterThan(drops[i-1]);}
  });
  it('is still before the shot and on bad input',()=>{
    for(const t of [-1,NaN,Infinity])expect(twistProfile(t,{kind:'ok'})).toEqual({pelvis:0,chest:0,drop:0});
  });
  it('only preloads before the hand lands',()=>{
    expect(twistProfile(.1,{kind:'over',tier:2,hit:.55}).pelvis).toBeLessThanOrEqual(6);
  });
  it('an ok thrust overshoots then settles; a weak one goes slack',()=>{
    expect(twistProfile(2,{kind:'ok'}).pelvis).toBeLessThan(peak({kind:'ok'}));
    expect(twistProfile(2,{kind:'weak'}).pelvis).toBeLessThanOrEqual(peak({kind:'weak'})/2);
  });
});

describe('side two-bone world IK',()=>{
  function chain(){
    const root=new THREE.Group(),parent=new THREE.Bone(),upper=new THREE.Bone(),lower=new THREE.Bone(),hand=new THREE.Bone();
    root.position.set(.3,.8,-.2);root.rotation.set(.3,-.5,.4);root.scale.setScalar(.8);
    parent.rotation.set(-.4,.2,.1);root.add(parent);parent.add(upper);upper.add(lower);lower.add(hand);
    upper.position.set(.1,.1,0);lower.position.set(0,.3,0);hand.position.set(0,.25,0);
    upper.rotation.set(.4,.1,-.2);lower.rotation.set(-.6,.2,.3);hand.rotation.set(.2,-.1,.3);
    root.updateMatrixWorld(true);return {root,upper,lower,hand};
  }
  const pos=b=>b.getWorldPosition(new THREE.Vector3());
  it('reaches within 1 mm under rotated and scaled ancestors',()=>{
    const {upper,lower,hand}=chain(),start=pos(upper),q=hand.quaternion.clone();
    const target=start.clone().add(new THREE.Vector3(-.12,.22,.14)),pole=start.clone().add(new THREE.Vector3(.5,.1,.5));
    solveTwoBone(upper,lower,hand,target,pole);
    expect(pos(hand).distanceTo(target)).toBeLessThan(.001);expect(hand.quaternion.equals(q)).toBe(true);
  });
  it('uses the actual parent through intermediate rotated joints',()=>{
    const {root,upper,lower,hand}=chain(),elbowParent=new THREE.Bone(),wristParent=new THREE.Bone();
    elbowParent.position.copy(lower.position);elbowParent.rotation.set(.3,-.2,.5);upper.add(elbowParent);elbowParent.add(lower);lower.position.set(0,0,0);
    wristParent.position.copy(hand.position);wristParent.rotation.set(-.2,.4,.1);lower.add(wristParent);wristParent.add(hand);hand.position.set(0,0,0);
    root.updateMatrixWorld(true);
    const start=pos(upper),target=start.clone().add(new THREE.Vector3(.12,.2,-.1));
    solveTwoBone(upper,lower,hand,target,start.clone().add(new THREE.Vector3(0,0,1)));
    expect(pos(hand).distanceTo(target)).toBeLessThan(.001);
  });
  it('straightens toward an unreachable target without changing lengths',()=>{
    const {upper,lower,hand}=chain(),start=pos(upper),a=start.distanceTo(pos(lower)),b=pos(lower).distanceTo(pos(hand));
    const ray=new THREE.Vector3(.2,-.4,.6).normalize(),target=start.clone().addScaledVector(ray,2);
    solveTwoBone(upper,lower,hand,target,start.clone().add(new THREE.Vector3(1,0,0)));
    expect(pos(hand).distanceTo(start.clone().addScaledVector(ray,a+b))).toBeLessThan(.001);
    expect(pos(lower).distanceTo(start.clone().addScaledVector(ray,a))).toBeLessThan(.001);
  });
  it('leaves the complete pose untouched at weight zero',()=>{
    const {upper,lower,hand}=chain(),before=[upper,lower,hand].map(b=>b.quaternion.clone()),wrist=pos(hand);
    solveTwoBone(upper,lower,hand,new THREE.Vector3(),new THREE.Vector3(1,1,1),0);
    for(const [i,b] of [upper,lower,hand].entries())expect(b.quaternion.equals(before[i])).toBe(true);
    expect(pos(hand).distanceTo(wrist)).toBe(0);
  });
  it('places the elbow on the selected pole side',()=>{
    for(const sign of [-1,1]){
      const {upper,lower,hand}=chain(),start=pos(upper),target=start.clone().add(new THREE.Vector3(0,.25,0));
      solveTwoBone(upper,lower,hand,target,start.clone().add(new THREE.Vector3(sign,0,0)));
      expect((pos(lower).x-start.x)*sign).toBeGreaterThan(.1);
      expect(pos(hand).distanceTo(target)).toBeLessThan(.001);
    }
  });
  it('blends local rotations from the current pose',()=>{
    const full=chain(),half=chain(),start=pos(full.upper),target=start.clone().add(new THREE.Vector3(.1,.2,-.1)),pole=start.clone().add(new THREE.Vector3(1,0,1));
    const before=[half.upper.quaternion.clone(),half.lower.quaternion.clone()];
    solveTwoBone(full.upper,full.lower,full.hand,target,pole);
    solveTwoBone(half.upper,half.lower,half.hand,target,pole,.5);
    for(const [i,key] of ['upper','lower'].entries())expect(half[key].quaternion.angleTo(before[i].slerp(full[key].quaternion,.5))).toBeLessThan(1e-6);
  });
});

describe('good thrust slow-mo and retry',()=>{
  it('the shot clock slows from the hand landing, then runs on at full speed with a fixed lag',()=>{
    expect(slowWarp(.1)).toBe(.1);
    expect(slowWarp(SLOW.at+.2)).toBeCloseTo(SLOW.at+.2*SLOW.rate);
    const lag=SLOW.len*(1-SLOW.rate);
    expect(slowWarp(2)).toBeCloseTo(2-lag);
    for(let t=0;t<3;t+=.01)expect(slowWarp(t+.01)).toBeGreaterThan(slowWarp(t));
    // the back mode starts it where its therapist's hand lands (therapistStyle impactAt)
    expect(slowWarp(.5,.4)).toBeCloseTo(.4+.1*SLOW.rate);
    expect(punchProfile(.3,.4)).toBe(0);
  });
  it('the punch is 0 before the hand lands, peaks fast and is gone by the end',()=>{
    expect(punchProfile(0)).toBe(0);
    expect(punchProfile(SLOW.at+.1)).toBeCloseTo(1);
    expect(punchProfile(SLOW.at+.8)).toBe(0);
  });
  it('a mild miss retries the same side (no cap, the pain limit ends it); a crack, a break or a success does not',()=>{
    expect(canRetry('weak',0)).toBe(true);
    expect(canRetry('over',0)).toBe(true);
    expect(canRetry('miss',0)).toBe(true);
    expect(canRetry('over',1)).toBe(false);
    expect(canRetry('miss',2)).toBe(false);
    expect(canRetry('ok',0)).toBe(false);
  });
});

describe('runComplete / continuePlan (영업 일지 허리비틀기 날)', () => {
  const r = (side, kind, tier = 0) => ({ side, kind, tier, points: kind === 'ok' ? 100 : 0 });
  it('a story day needs both sides fixed and pain under the limit', () => {
    expect(runComplete([r('L', 'ok'), r('R', 'ok')], 0, 3, true)).toBe(true);
    expect(runComplete([r('L', 'weak'), r('R', 'miss')], 2, 3, true)).toBe(false);
    expect(runComplete([r('L', 'ok'), r('R', 'weak')], 1, 3, true)).toBe(false);
    expect(runComplete([r('L', 'ok'), r('R', 'ok')], 3, 3, true)).toBe(false);
    expect(runComplete([r('L', 'ok')], 0, 3, true)).toBe(false);
  });
  it('a free run follows the same rule as a story day (one rule set for all modes)', () => {
    expect(runComplete([r('L', 'ok'), r('R', 'ok')], 2, 3, false)).toBe(true);
    expect(runComplete([r('L', 'weak'), r('R', 'miss')], 2, 3, false)).toBe(false);
    expect(runComplete([r('L', 'ok'), r('R', 'over', 1)], 1, 3, false)).toBe(false);
  });
  it('continue keeps the fixed side and redoes the failed one without teleporting', () => {
    const g = [{ height: .1 }, { height: .2 }];
    expect(continuePlan(['L', 'R'], g, [r('L', 'ok'), r('R', 'weak')])).toMatchObject({ order: ['L', 'R'], results: [r('L', 'ok')], sideIdx: 1, turn: false });
    // the first side failed, the second fixed: he lies on R, so R becomes first and a roll back to L follows
    const p = continuePlan(['L', 'R'], g, [r('L', 'miss'), r('R', 'ok')]);
    expect(p).toMatchObject({ order: ['R', 'L'], results: [r('R', 'ok')], sideIdx: 0, turn: true });
    expect(p.goals).toEqual([g[1], g[0]]);
    // both failed: redo from the side he lies on now
    expect(continuePlan(['L', 'R'], g, [r('L', 'miss'), r('R', 'weak')])).toMatchObject({ order: ['R', 'L'], results: [], sideIdx: 0, turn: false });
    // ended at the pain limit after the first side: same side again
    expect(continuePlan(['L', 'R'], g, [r('L', 'miss')])).toMatchObject({ order: ['L', 'R'], results: [], sideIdx: 0 });
  });
});

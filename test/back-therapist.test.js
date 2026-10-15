import {it,expect} from 'vitest';
import {therapistMotion,therapistStyle} from '../src/back/therapistMotion.js';
import {pressProfile,clinicFilm,reactionTiming} from '../src/back/core.js';
it('keeps a light press grounded and makes the strongest shove jump, land and recoil',()=>{
  expect(therapistMotion(.3,.75).y).toBeLessThanOrEqual(0);
  const style=therapistStyle(4.4,2),flight=therapistMotion(.3,4.4,2),land=therapistMotion(style.impactAt,4.4,2),recoil=therapistMotion(style.impactAt+.38,4.4,2);
  expect(flight.y).toBeGreaterThan(.2);expect(flight.knee).toBeGreaterThan(30);expect(flight.handLift).toBeGreaterThan(.1);
  expect(land.x).toBeLessThan(-.2);expect(land.y).toBeLessThan(0);
  expect(recoil.roll).toBeLessThan(0);expect(recoil.x).toBeGreaterThan(.2);expect(recoil.y).toBeGreaterThan(.15);expect(recoil.handAway).toBeGreaterThan(.15);
  expect(therapistMotion(2,4.4,2)).toMatchObject({x:0,y:0,wide:0});
});
it('keeps every non-injury press compact and planted, with pressure in the hands rather than a squat',()=>{
  const hit=therapistMotion(.15,1.2),hold=therapistMotion(.24,1.2),weak=therapistMotion(.15,.75);
  expect(Math.abs(hit.x)).toBeLessThan(.03);expect(Math.abs(hit.y)).toBeLessThan(.01);
  expect(hit.knee).toBe(0);expect(hit.lean).toBeGreaterThan(8);
  expect(hold.compression).toBeCloseTo(hit.compression);
  expect(weak.compression).toBeLessThan(hit.compression*.3);
  for(const force of [1,1.2,1.8,2.49])for(let t=0;t<1.5;t+=.01){
    const m=therapistMotion(t,force);
    expect(m.y).toBeLessThanOrEqual(0);expect(m.knee).toBe(0);
    expect(m.handLift).toBe(0);expect(m.handAway).toBe(0);expect(m.wide).toBe(0);
    expect(therapistStyle(force).impactAt).toBe(.15);
  }
  expect(therapistMotion(.65,1.2)).toMatchObject({x:0,y:0,compression:0});
});
it('synchronises contact pressure and the radiograph with the actual landing',()=>{
  const style=therapistStyle(4.4,2);
  expect(pressProfile(.2,'over',2,'break',4.4)).toBe(0);
  expect(pressProfile(style.impactAt,'over',2,'break',4.4)).toBeGreaterThan(2);
  expect(clinicFilm(style.impactAt,'over',2,4.4)).toBe(0);
  expect(clinicFilm(2,'over',2,4.4)).toBe(1);
  expect(reactionTiming('over',2,4.4).faceAt).toBeCloseTo(4.25);
});

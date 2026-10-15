import {it,expect} from 'vitest';
import {therapistMotion,therapistStyle} from '../src/back/therapistMotion.js';
import {pressProfile,clinicFilm,reactionTiming} from '../src/back/core.js';
it('keeps a light press grounded and makes the strongest shove jump, land and recoil',()=>{
  expect(therapistMotion(.3,.75).y).toBe(0);
  const style=therapistStyle(4.4,2),flight=therapistMotion(.3,4.4,2),land=therapistMotion(style.impactAt,4.4,2),recoil=therapistMotion(style.impactAt+.38,4.4,2);
  expect(flight.y).toBeGreaterThan(.2);expect(flight.knee).toBeGreaterThan(30);expect(flight.handLift).toBeGreaterThan(.1);
  expect(land.x).toBeLessThan(-.2);expect(land.y).toBeLessThan(0);
  expect(recoil.roll).toBeLessThan(0);expect(recoil.x).toBeGreaterThan(.2);expect(recoil.y).toBeGreaterThan(.15);expect(recoil.handAway).toBeGreaterThan(.15);
  expect(therapistMotion(2,4.4,2)).toMatchObject({x:0,y:0,wide:0});
});
it('synchronises contact pressure and the radiograph with the actual landing',()=>{
  const style=therapistStyle(4.4,2);
  expect(pressProfile(.2,'over',2,'break',4.4)).toBe(0);
  expect(pressProfile(style.impactAt,'over',2,'break',4.4)).toBeGreaterThan(2);
  expect(clinicFilm(style.impactAt,'over',2,4.4)).toBe(0);
  expect(clinicFilm(2,'over',2,4.4)).toBe(1);
  expect(reactionTiming('over',2,4.4).faceAt).toBeCloseTo(4.25);
});

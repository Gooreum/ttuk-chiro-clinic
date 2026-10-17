import {describe,it,expect} from 'vitest';
import {clinicFilm,reactionTiming,organZoom,ORGAN_EXTRA,ORGAN_BEAT} from '../src/back/core.js';
import {therapistStyle} from '../src/back/therapistMotion.js';

describe('organ rupture x-ray beats (user, 2026-10-17)',()=>{
  const force=4.4,d=therapistStyle(force,2).xrayDelay;
  it('keeps the film open ORGAN_EXTRA longer when organs burst',()=>{
    expect(clinicFilm(d+3,'over',2,force,false)).toBeLessThan(1);
    expect(clinicFilm(d+3,'over',2,force,true)).toBe(1);
    expect(clinicFilm(d+.45+2.3+ORGAN_EXTRA+.5,'over',2,force,true)).toBe(0);
  });
  it('leaves the plain fracture film unchanged',()=>{
    for(const t of [0,.5,1,2,2.8,3,3.4])expect(clinicFilm(d+t,'over',2,force,false)).toBe(clinicFilm(d+t,'over',2,force));
  });
  it('delays face, siren and end by ORGAN_EXTRA only for organ ruptures',()=>{
    const a=reactionTiming('over',2,force),b=reactionTiming('over',2,force,true);
    for(const k of ['faceAt','faceEnd','end','sirenAt'])expect(b[k]-a[k]).toBeCloseTo(ORGAN_EXTRA);
    expect(reactionTiming('ok',0,1,true)).toEqual(reactionTiming('ok',0,1));
  });
  it('holds the spine close-up, then pulls out smoothly',()=>{
    expect(organZoom(1)).toBe(0);expect(organZoom(ORGAN_BEAT.spineEnd)).toBe(0);
    expect(organZoom(ORGAN_BEAT.zoomEnd)).toBe(1);expect(organZoom(3)).toBe(1);
    let last=0;for(let t=ORGAN_BEAT.spineEnd;t<=ORGAN_BEAT.zoomEnd;t+=.05){const z=organZoom(t);expect(z).toBeGreaterThanOrEqual(last);last=z;}
  });
});

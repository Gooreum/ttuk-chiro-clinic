import {describe,it,expect} from 'vitest';
import {ORGANS,organsAt,organHit,organLabel,organTagName,subject} from '../src/back/organs.js';
import {TARGETS,POSITION_TOL,makeSideTargets,pressedSide} from '../src/back/core.js';

describe('back organ map',()=>{
  it('puts lungs and heart high, liver/spleen/stomach mid, kidneys low',()=>{
    expect(organsAt(.3)).toEqual(expect.arrayContaining(['lungL','lungR','heart']));
    expect(organsAt(.6)).toEqual(expect.arrayContaining(['liver','spleen','stomach']));
    expect(organsAt(.8)).toEqual(expect.arrayContaining(['kidneyL','kidneyR']));
    expect(organsAt(.95)).toEqual(['bowel']);
  });
  it('covers the whole back with at least one organ',()=>{
    for(let p=0;p<=1;p+=.01)expect(organsAt(p).length).toBeGreaterThan(0);
    expect(new Set(ORGANS.map(o=>o.id)).size).toBe(9);
  });
  it('ruptures only on an overload that missed the ring',()=>{
    expect(organHit(TARGETS[0],0,2)).toEqual([]);
    expect(organHit(TARGETS[0]+.25,0,0)).toEqual([]);
    expect(organHit(NaN,0,2)).toEqual([]);
    expect(organHit(TARGETS[0]+.25,0,1).length).toBeGreaterThan(0);
    expect(organHit(.9,1,2,[.5,.5,.5],[.18,.6,.82])).toEqual(organsAt(.6,'R'));
  });
  it('bursts only the side the hands slid to (user 2026-10-18)',()=>{
    expect(organsAt(.6,'R')).toContain('liver');
    expect(organsAt(.6,'R')).not.toEqual(expect.arrayContaining(['spleen']));
    expect(organsAt(.6,'R')).not.toContain('stomach');
    expect(organsAt(.6,'L')).toEqual(expect.arrayContaining(['spleen','stomach']));
    expect(organsAt(.6,'L')).not.toContain('liver');
    expect(organsAt(.82,'L')).toEqual(['kidneyL','bowel']);
    const right=organHit(.75,1,2,[.5,.5,.5],[.18,.5,.82]),left=organHit(.25,1,2,[.5,.5,.5],[.18,.5,.82]);
    expect(right).toEqual(expect.arrayContaining(['lungR','liver']));
    expect(right.every(id=>['R','C'].includes(ORGANS.find(o=>o.id===id).side))).toBe(true);
    expect(left).toEqual(expect.arrayContaining(['lungL','spleen','stomach']));
    expect(left.every(id=>['L','C'].includes(ORGANS.find(o=>o.id===id).side))).toBe(true);
    expect(organHit(.55,1,2,[.5,.5,.5],[.18,.5,.82])).toEqual([]);
    expect(pressedSide(.51)).toBe('R');expect(pressedSide(.5)).toBe('L');
    for(const r of [0,.5,.999])for(const t of makeSideTargets(()=>r))expect(Math.abs(t-.5)).toBeLessThan(POSITION_TOL);
  });
  it('labels without repeats and with the right particle',()=>{
    expect(organLabel(['lungL','lungR','heart'])).toBe('폐·심장');
    expect(subject('폐·심장')).toBe('폐·심장이');
    expect(subject('폐')).toBe('폐가');
  });
  it('names each organ for its x-ray tag, sides included',()=>{
    expect(organTagName('lungL')).toBe('왼쪽 폐');
    expect(organTagName('kidneyR')).toBe('오른쪽 신장');
    expect(organTagName('liver')).toBe('간');
    expect(organTagName('heart')).toBe('심장');
    expect(organTagName('nope')).toBe('');
  });
});

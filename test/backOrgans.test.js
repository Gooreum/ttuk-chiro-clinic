import {describe,it,expect} from 'vitest';
import {ORGANS,organsAt,organHit,organLabel,subject} from '../src/back/organs.js';
import {TARGETS} from '../src/back/core.js';

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
    expect(organHit(.6,0,2,[.3,.5,.8])).toEqual(organsAt(.6));
  });
  it('labels without repeats and with the right particle',()=>{
    expect(organLabel(['lungL','lungR','heart'])).toBe('폐·심장');
    expect(subject('폐·심장')).toBe('폐·심장이');
    expect(subject('폐')).toBe('폐가');
  });
});

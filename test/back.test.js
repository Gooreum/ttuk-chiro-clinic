import {describe, it, expect} from 'vitest';
import {TARGETS, pressureAt, judgePress, pressProfile} from '../src/back/core.js';
describe('back press pressure and judging', () => {
  it('accepts all three positions, with quality and finite scores', () => {
    TARGETS.forEach((p, i) => expect(judgePress(p, i, 0.6)).toEqual({kind:'ok', points:100, perfect:true}));
    expect(judgePress(0.25, 0, 0.48)).toMatchObject({kind:'ok', perfect:false});
  });
  it('distinguishes weak, misplaced and excessive pushes', () => {
    expect(judgePress(0.18, 0, 0.2).kind).toBe('weak');
    expect(judgePress(0.50, 0, 0.6).kind).toBe('miss');
    expect(judgePress(0.18, 0, 0.9).kind).toBe('over');
    expect(judgePress(0.8, 0, 1).kind).toBe('over');
  });
  it('includes pressure boundaries and rejects beyond them', () => {
    expect(judgePress(0.18, 0, 0.42).kind).toBe('ok');
    expect(judgePress(0.18, 0, 0.78).kind).toBe('ok');
    expect(judgePress(0.18, 0, 0.781).kind).toBe('over');
    expect(judgePress(0.18, 0, 0.419).kind).toBe('weak');
    expect(judgePress(0.301, 0, 0.6).kind).toBe('miss');
  });
  it('caps charge and rejects invalid inputs', () => {
    expect(pressureAt(-1)).toBe(0); expect(pressureAt(540)).toBeCloseTo(0.6);
    expect(pressureAt(10000)).toBe(1.35);
    for(const args of [[NaN,0,0.6],[0.18,0,NaN],[0.18,3,0.6],[0.18,-1,0.6]]){
      expect(judgePress(...args)).toMatchObject({kind:'miss', points:0});
    }
  });
  it('makes an immediate thrust, rebound, then settles fully', () => {
    expect(pressProfile(0)).toBe(0); expect(pressProfile(0.1)).toBeCloseTo(1);
    expect(pressProfile(0.1,'over')).toBeGreaterThan(1);
    expect(pressProfile(0.1,'weak')).toBeLessThan(0.4);
    expect(pressProfile(0.3)).toBeLessThan(0);
    expect(pressProfile(-1)).toBe(0); expect(pressProfile(0.9)).toBe(0);
    expect(pressProfile(NaN)).toBe(0);
  });
});

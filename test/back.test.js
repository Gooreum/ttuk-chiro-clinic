import {describe, it, expect} from 'vitest';
import {crackProfile} from '../src/core/crack.js';
import {TARGETS, pressureAt, judgePress, pressProfile} from '../src/back/core.js';
describe('back press pressure and judging', () => {
  it('accepts all three positions, with quality and finite scores', () => {
    TARGETS.forEach((p, i) => expect(judgePress(p, i, 0.6)).toMatchObject({kind:'ok', points:100, perfect:true}));
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
    expect(pressProfile(0)).toBe(0);
    expect(pressProfile(.15)).toBeCloseTo(1);
    expect(pressProfile(.07)).toBeLessThan(0);
    expect(pressProfile(.15,'over')).toBeCloseTo(1.2);
    expect(pressProfile(.15,'weak')).toBeCloseTo(.6);
    for(const t of [0,.03,.07,.12,.15,.3,.62,.9])expect(pressProfile(t)).toBeCloseTo(crackProfile(t).rot/15);
    expect(pressProfile(-1)).toBe(0);expect(pressProfile(.9)).toBe(0);

  });
});

import {dayQuery, resultTitle} from '../src/back/core.js';
import {readProgress} from '../src/core/campaign.js';
describe('back / side page URL guard (dayQuery)', () => {
  const prog = (cleared, stars = 2) => readProgress({cleared, stars: Array(cleared).fill(stars)});
  it('opens an unlocked day of its own game, free play otherwise', () => {
    expect(dayQuery('?day=14', prog(14), 'back')).toEqual({day: 14, hard: false, pain: false, locked: false});
    expect(dayQuery('', prog(14), 'back')).toMatchObject({day: -1, locked: false});
    expect(dayQuery('?day=0', prog(14), 'back')).toMatchObject({day: -1, locked: false});   // a neck day is not a back day
    expect(dayQuery('?day=29', prog(40), 'back')).toMatchObject({day: -1, locked: false});  // a side day on back.html
    expect(dayQuery('?day=29', prog(40), 'side')).toMatchObject({day: 29, locked: false});
    expect(dayQuery('?day=abc', prog(40), 'back')).toMatchObject({day: -1, locked: false});
  });
  it('refuses a locked day (the page goes to the day list) unless a dev build', () => {
    expect(dayQuery('?day=16', prog(14), 'back')).toEqual({day: -1, hard: false, pain: false, locked: true});
    expect(dayQuery('?day=16', prog(14), 'back', {dev: true})).toMatchObject({day: 16, locked: false});
  });
  it('역경 only on a 3-star day', () => {
    expect(dayQuery('?day=14&hard=1', prog(15, 2), 'back').hard).toBe(false);
    expect(dayQuery('?day=14&hard=1', prog(15, 3), 'back').hard).toBe(true);
  });
  it('통증 칸 +1 only on a plain open day reached by a fresh navigation', () => {
    expect(dayQuery('?day=16&pain=1', prog(16), 'back').pain).toBe(true);
    expect(dayQuery('?day=16&pain=1', prog(16), 'back', {fresh: false}).pain).toBe(false);   // reload / back-forward
    expect(dayQuery('?day=16&pain=1', prog(14), 'back').pain).toBe(false);                   // locked
    expect(dayQuery('?day=14&hard=1&pain=1', prog(15, 3), 'back').pain).toBe(false);         // never on 역경
    expect(dayQuery('?pain=1', prog(16), 'back').pain).toBe(false);                          // free play
  });
});
describe('result card title (the neck rule)', () => {
  it('ambulance, then the pain limit, then the mode line', () => {
    expect(resultTitle({ambulance: true, painOut: true, campaign: true, painMax: 2}, 'X')).toBe('구급차가 왔어요');
    expect(resultTitle({ambulance: false, painOut: true, campaign: false, painMax: 3}, 'X')).toBe('환자가 도망갔어요');
    expect(resultTitle({ambulance: false, painOut: true, campaign: true, painMax: 3}, 'X')).toBe('환자가 도망갔어요');
    expect(resultTitle({ambulance: false, painOut: true, campaign: true, painMax: 2}, 'X')).toBe('영업 정지');
    expect(resultTitle({ambulance: false, painOut: false, campaign: true, painMax: 1}, '허리까지 시원하게.')).toBe('허리까지 시원하게.');
  });
});

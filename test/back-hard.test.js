import {describe, it, expect} from 'vitest';
import {TARGETS, POSITION_TOL, tolFor, showGuide, backDistance, judgePress, judgeAim, pressureHint} from '../src/back/core.js';
import {judgeSide} from '../src/side/core.js';
import {organHit} from '../src/back/organs.js';
import {DAYS, HARD_GAMES, hardDay, hardOpen, readProgress} from '../src/core/campaign.js';

// 허리 날의 mods.tight / 역경 (playtest 5): the zone width is the neck modes' tightFactor, the guide bands hide on 역경.
describe('허리 날 구역 폭', () => {
  it('tolFor: plain x1, tight x0.8, tighter x0.7', () => {
    expect(tolFor(undefined)).toBeCloseTo(POSITION_TOL);
    expect(tolFor({})).toBeCloseTo(POSITION_TOL);
    expect(tolFor({tight: true})).toBeCloseTo(POSITION_TOL * 0.8);
    expect(tolFor({tight: true, tighter: true})).toBeCloseTo(POSITION_TOL * 0.7);
  });
  it('a press just inside the plain zone misses under tight', () => {
    const off = TARGETS[1] + POSITION_TOL * 0.9;   // 0.9 of the plain zone, 1.125 of the tight one
    const plain = judgePress(off, 1, 0.6, 1);
    const tight = judgePress(off, 1, 0.6, 1, {tol: tolFor({tight: true})});
    expect(plain.kind).toBe('ok');
    expect(tight.kind).toBe('miss');
    expect(backDistance(off, 1, 0.6, TARGETS, POSITION_TOL * 0.8)).toBeGreaterThan(backDistance(off, 1, 0.6));
  });
  it('judgeAim and judgeSide pass tol through', () => {
    const tol = tolFor({tight: true}), off = TARGETS[1] + POSITION_TOL * 0.9;
    expect(judgeAim({height: off}, 1, 0.6, 1).kind).toBe('ok');
    expect(judgeAim({height: off}, 1, 0.6, 1, {tol}).kind).toBe('miss');
    const goal = {height: 0.78, roll: 0.6};
    expect(judgeSide({height: 0.78 + POSITION_TOL * 0.9, locked: false}, 0.6, 1, goal).kind).toBe('ok');
    expect(judgeSide({height: 0.78 + POSITION_TOL * 0.9, locked: false}, 0.6, 1, goal, {tol}).kind).toBe('miss');
  });
  it('pressureHint reads the narrower zone', () => {
    const off = TARGETS[0] + POSITION_TOL * 0.9;
    expect(pressureHint(off, 0, 0.6)).toBe('ready');
    expect(pressureHint(off, 0, 0.6, TARGETS, POSITION_TOL * 0.8)).toBe('position');
  });
  it('organs: a side miss inside the plain zone but outside the tight one ruptures', () => {
    const aim = {height: TARGETS[0], side: 0.5 + POSITION_TOL * 0.9, locked: true};
    expect(organHit(aim, 0, 1, TARGETS, [0.5, 0.5, 0.5])).toEqual([]);
    expect(organHit(aim, 0, 1, TARGETS, [0.5, 0.5, 0.5], POSITION_TOL * 0.8).length).toBeGreaterThan(0);
  });
});

describe('허리 역경', () => {
  it('back and side days are 역경 games', () => {
    expect(HARD_GAMES).toEqual(expect.arrayContaining(['back', 'side']));
    const i = DAYS.findIndex(d => d.game === 'back');
    expect(hardOpen({stars: DAYS.map((_, k) => k === i ? 3 : 0)}, i)).toBe(true);
  });
  it('hardDay on a back/side day: one pain fewer (min 2), no zone guide, tight, a beat', () => {
    DAYS.forEach((d, i) => {
      if(d.game !== 'back' && d.game !== 'side') return;
      const h = hardDay(i);
      expect(h.painMax).toBe(Math.min(d.painMax, Math.max(2, d.painMax - 1)));
      expect(h.zone).toBe(0);
      expect(tolFor(h.mods)).toBeLessThan(tolFor(d.mods) + 1e-9);
      expect(tolFor(h.mods)).toBeLessThanOrEqual(POSITION_TOL * 0.8 + 1e-9);
      expect(h.beat).toBeGreaterThan(0);
    });
  });
  it('showGuide: 역경 hides the band, a plain day keeps the old rule', () => {
    const at = {control: 'motion', step: 0, painHere: 0};
    expect(showGuide({hard: true}, at)).toBe(false);
    expect(showGuide({hard: true}, {...at, control: 'touch'})).toBe(false);
    expect(showGuide(DAYS[0], at)).toBe(true);
    expect(showGuide(null, {...at, step: 2})).toBe(false);
    expect(showGuide(null, {...at, step: 2, painHere: 1})).toBe(true);
    expect(showGuide(null, {...at, step: 2, control: 'touch'})).toBe(true);
  });
  it('hard stars of a back day survive readProgress', () => {
    const i = DAYS.findIndex(d => d.game === 'back'), stars = DAYS.map((_, k) => k <= i ? 3 : 0), hard = DAYS.map((_, k) => k === i ? 2 : 0);
    expect(readProgress({cleared: i + 1, stars, hard}).hard[i]).toBe(2);
  });
});

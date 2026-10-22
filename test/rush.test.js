import { describe, it, expect } from "vitest";
import { RUSH_PAIN, RUSH_UNLOCK, rushOpen, rushDays, rushPlan, rushStats, rushRecord, rushRank, RUSH_LINES } from "../src/core/rush.js";
import { DAYS, dayRoster } from "../src/core/campaign.js";
import { ROSTER } from "../src/patient/roster.js";
import { CAST } from "../src/patient/cast.js";
import { continueOffer } from "../src/core/monetize.js";

describe("rush: the boss days", () => {
  it("are the 목꺾기 / 목뽑기 bosses of 2~8장 only (no back / side)", () => {
    const days = rushDays();
    expect(days).toEqual([13, 27, 34, 41, 48, 55]);
    days.forEach(d => { expect(DAYS[d].beat).toBeGreaterThan(0); expect(["clinic", "towel"]).toContain(DAYS[d].game); expect(RUSH_LINES[d]).toBeTruthy(); });
    expect(days.map(d => DAYS[d].ch)).toEqual([2, 4, 5, 6, 7, 8]);
  });
  it("opens with the 56 days of the campaign, like 심야 진료", () => {
    expect(RUSH_UNLOCK).toBe(56);
    expect(rushOpen({ cleared: 55 })).toBe(false);
    expect(rushOpen({ cleared: 56 })).toBe(true);
    expect(rushOpen(null)).toBe(false);
    expect(RUSH_PAIN).toBe(3);
  });
});

describe("rush: the plan", () => {
  const plan = rushPlan(), pool = [...ROSTER, ...CAST];
  it("lists every boss patient in the day's order with that boss's rules", () => {
    expect(plan.length).toBe(rushDays().reduce((n, d) => n + DAYS[d].patients.length, 0));
    expect(plan[0]).toMatchObject({ k: 0, day: 13, name: "최조교", first: true, last: false, game: "clinic", mods: { tight: true }, beat: 97 });
    expect(plan[plan.length - 1]).toMatchObject({ k: 5, name: "뚝할배", last: true });
    expect(plan.filter(p => p.first)).toHaveLength(6);
    expect(plan.filter(p => p.last)).toHaveLength(6);
    plan.forEach(p => expect(pool.some(q => q.name === p.name)).toBe(true));
  });
  it("matches each day's roster so the glue can build the patients", () => {
    rushDays().forEach(d => expect(dayRoster(d, pool).map(p => p.name)).toEqual(plan.filter(p => p.day === d).map(p => p.name)));
  });
});

describe("rush: stats", () => {
  const plan = rushPlan();
  const row = (stars, pts) => ({ stars, pts });
  it("counts reached and cleared bosses from the day log rows", () => {
    const n0 = plan.filter(p => p.k === 0).length;
    // boss 1 fully treated at 120 per patient (240 over 2 cracks each = avg 120 >= 97), boss 2 left at its first patient
    const rows = [...Array(n0).fill(0).map(() => row(3, 240)), row(0, 50)];
    const s = rushStats(plan, rows);
    expect(s.reached).toBe(2);
    expect(s.cleared).toBe(1);
    expect(s.bosses[0]).toMatchObject({ done: true, cleared: true });
    expect(s.bosses[1]).toMatchObject({ done: false, cleared: false });
    expect(s.score).toBe(n0 * 240 + 50);
  });
  it("a finished boss under its beat is done but not cleared; an empty run reaches nothing", () => {
    const n0 = plan.filter(p => p.k === 0).length;
    const s = rushStats(plan, Array(n0).fill(0).map(() => row(1, 150)));   // avg 75 < 97
    expect(s.bosses[0]).toMatchObject({ done: true, cleared: false });
    expect(s.cleared).toBe(0);
    expect(rushStats(plan, [])).toMatchObject({ reached: 0, cleared: 0, score: 0 });
  });
  it("a perfect run clears all six", () => {
    const s = rushStats(plan, plan.map(() => row(3, 300)));
    expect(s.cleared).toBe(6);
    expect(s.reached).toBe(6);
  });
});

describe("rush: record and rank", () => {
  it("more cleared wins, then reached, then score; a run with no boss never counts", () => {
    let r = rushRecord(null, { reached: 0, cleared: 0, score: 40 });
    expect(r.isBest).toBe(false);
    expect(r.record).toEqual({ reached: 0, cleared: 0, score: 0, runs: 1 });
    r = rushRecord(r.record, { reached: 2, cleared: 1, score: 500 });
    expect(r.isBest).toBe(true);
    expect(r.record).toMatchObject({ reached: 2, cleared: 1, score: 500, runs: 2 });
    expect(rushRecord(r.record, { reached: 3, cleared: 1, score: 100 }).isBest).toBe(true);
    expect(rushRecord(r.record, { reached: 2, cleared: 1, score: 400 }).isBest).toBe(false);
    expect(rushRecord(r.record, { reached: 2, cleared: 1, score: 400 }).record).toMatchObject({ score: 500, runs: 3 });
    expect(rushRecord(r.record, { reached: 4, cleared: 0, score: 9999 }).isBest).toBe(false);
  });
  it("ranks by bosses cleared", () => {
    expect([0, 1, 2, 4, 6].map(n => rushRank(n))).toEqual(["보스 구경꾼", "첫 간판 방어", "보스 사냥꾼", "간판 수호자", "보스 러시 완주"]);
  });
  it("the rewarded continue is offered once, like 심야 진료", () => {
    expect(continueOffer({ endedBad: true, bossMiss: false, used: false })).toBe(true);
    expect(continueOffer({ endedBad: true, bossMiss: false, used: true })).toBe(false);
  });
});

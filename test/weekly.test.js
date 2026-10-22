import { describe, it, expect } from "vitest";
import { weekNo, weekRange, weekLabel, daysLeft, weeklySet, weeklyOpen, ruleOfWeek, WEEKLY_RULES, WEEKLY_UNLOCK, weeklyRead, weeklyTry, weeklyRecord, ruleCue } from "../src/core/weekly.js";
import { NIGHT_POOL } from "../src/core/night.js";
import { weeklyShareText } from "../src/core/share.js";
import { EV } from "../src/core/analytics.js";

const kst = s => Date.parse(s + "+09:00");

describe("weekly: the week", () => {
  it("starts on Monday 00:00 KST", () => {
    const sun = weekNo(kst("2026-10-25T23:59:59")), mon = weekNo(kst("2026-10-26T00:00:00"));
    expect(mon).toBe(sun + 1);
    expect(weekNo(kst("2026-10-19T00:00:00"))).toBe(sun);
    expect(weekNo(kst("2026-10-18T23:59:59"))).toBe(sun - 1);
  });
  it("gives the Monday..Sunday dates and a label", () => {
    const w = weekNo(kst("2026-10-22T12:00:00"));
    expect(weekRange(w)).toEqual({ start: "2026-10-19", end: "2026-10-25" });
    expect(weekLabel(w)).toBe("10.19 – 10.25");
  });
  it("counts the days left, 7 on Monday and 1 on Sunday", () => {
    expect(daysLeft(kst("2026-10-19T09:00:00"))).toBe(7);
    expect(daysLeft(kst("2026-10-22T09:00:00"))).toBe(4);
    expect(daysLeft(kst("2026-10-25T23:00:00"))).toBe(1);
  });
  it("uses the KST clock, not the phone's", () => {
    // Sunday 20:00 UTC is already Monday 05:00 in Korea
    expect(weekNo(Date.parse("2026-10-25T20:00:00Z"))).toBe(weekNo(kst("2026-10-26T05:00:00")));
  });
  it("opens after 2장 (7 days)", () => {
    expect(WEEKLY_UNLOCK).toBe(7);
    expect(weeklyOpen({ cleared: 6 })).toBe(false);
    expect(weeklyOpen({ cleared: 7 })).toBe(true);
    expect(weeklyOpen(null)).toBe(false);
  });
});

describe("weekly: the set", () => {
  const weeks = Array.from({ length: 60 }, (_, i) => 2970 + i);
  it("is the same for everybody in a week and differs between weeks", () => {
    expect(weeklySet(2980)).toEqual(weeklySet(2980));
    const names = new Set(weeks.map(w => weeklySet(w).patients.map(p => p.name).join()));
    expect(names.size).toBeGreaterThan(50);
  });
  it("has 3 or 4 different patients from the pool", () => {
    const counts = new Set();
    weeks.forEach(w => {
      const s = weeklySet(w), n = s.patients.map(p => p.name);
      counts.add(n.length);
      expect(n.length).toBeGreaterThanOrEqual(3); expect(n.length).toBeLessThanOrEqual(4);
      expect(new Set(n).size).toBe(n.length);
      n.forEach(x => expect(NIGHT_POOL).toContain(x));
    });
    expect(counts).toEqual(new Set([3, 4]));
  });
  it("mixes both games, except on the boss-rule weeks which are 목꺾기 only", () => {
    weeks.forEach(w => {
      const s = weeklySet(w), games = new Set(s.patients.map(p => p.game));
      if(s.rule.clinicOnly) expect([...games]).toEqual(["clinic"]);
      else expect(games.size).toBe(2);
    });
  });
  it("cycles the rules so two weeks in a row differ", () => {
    for(let w = 3000; w < 3030; w++) expect(ruleOfWeek(w).id).not.toBe(ruleOfWeek(w + 1).id);
    expect(new Set(WEEKLY_RULES.map(r => r.id)).size).toBe(WEEKLY_RULES.length);
  });
  it("carries the rule as mods / boss / pain", () => {
    WEEKLY_RULES.forEach(rule => {
      const w = weeks.find(x => ruleOfWeek(x) === rule), s = weeklySet(w);
      expect(s.painMax).toBe(rule.painMax || 3);
      expect(s.boss).toEqual(rule.boss || []);
      expect(Object.keys(s.mods).length > 0 || !!rule.boss || !!rule.painMax).toBe(true);
      expect(ruleCue(rule).length).toBeGreaterThan(4);
    });
    expect(weeklySet(weeks.find(x => ruleOfWeek(x).id === "tight")).mods.tight).toBeLessThan(1);
    expect(weeklySet(weeks.find(x => ruleOfWeek(x).id === "pain1")).painMax).toBe(1);
  });
});

describe("weekly: the record", () => {
  it("reads junk as an empty week and resets on a new week", () => {
    expect(weeklyRead(null, 5)).toEqual({ week: 5, best: 0, tries: 0 });
    expect(weeklyRead({ week: 5, best: "x", tries: 2 }, 5)).toEqual({ week: 5, best: 0, tries: 0 });
    expect(weeklyRead({ week: 4, best: 300, tries: 2 }, 5)).toEqual({ week: 5, best: 0, tries: 0 });
  });
  it("counts tries", () => {
    const a = weeklyTry(null, 5), b = weeklyTry(a, 5);
    expect(b).toEqual({ week: 5, best: 0, tries: 2 });
    expect(weeklyTry({ week: 4, best: 300, tries: 9 }, 5).tries).toBe(1);
  });
  it("keeps the best of complete runs only; the first clear pays once", () => {
    let r = weeklyRecord({ week: 5, best: 0, tries: 1 }, 5, 250, false);
    expect(r).toMatchObject({ isBest: false, firstClear: false, record: { best: 0 } });
    r = weeklyRecord(r.record, 5, 300, true);
    expect(r).toMatchObject({ isBest: true, firstClear: true, record: { best: 300, tries: 1 } });
    r = weeklyRecord(r.record, 5, 280, true);
    expect(r).toMatchObject({ isBest: false, firstClear: false, record: { best: 300 } });
    r = weeklyRecord(r.record, 5, 300, true);   // a tie is not a new best
    expect(r.isBest).toBe(false);
    r = weeklyRecord(r.record, 5, 340, true);
    expect(r).toMatchObject({ isBest: true, firstClear: false, record: { best: 340 } });
  });
  it("a new week pays again", () => {
    expect(weeklyRecord({ week: 5, best: 340, tries: 4 }, 6, 100, true)).toMatchObject({ firstClear: true, record: { week: 6, best: 100, tries: 0 } });
  });
});

describe("weekly: share and events", () => {
  it("writes the share text", () => {
    const t = weeklyShareText({ best: 312.4, rule: "좁은 구역", label: "10.19 – 10.25", ambulances: 1 });
    expect(t).toContain("이번 주 최고 312점");
    expect(t).toContain("좁은 구역");
    expect(t).toContain("구급차 1번");
    expect(weeklyShareText({ best: 312.4, rule: "x", label: "y" })).toBe(weeklyShareText({ best: 312.4, rule: "x", label: "y" }));
  });
  it("has the events", () => {
    expect(EV.weeklyStart).toBe("weekly_start");
    expect(EV.weeklyEnd).toBe("weekly_end");
  });
});

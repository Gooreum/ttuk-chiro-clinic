import { describe, it, expect } from "vitest";
import { dailySet, ruleOfDay, dailyLabel, dailyRead, dailyTry, dailyRecord, DAILY_POOL } from "../src/core/daily.js";
import { WEEKLY_RULES } from "../src/core/weekly.js";
import { dailyShareText } from "../src/core/share.js";
import { EV } from "../src/core/analytics.js";

const days = n => Array.from({ length: n }, (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}`);

describe("daily: the set", () => {
  it("is the same for everybody on a date and has one patient", () => {
    const a = dailySet("2026-10-23"), b = dailySet("2026-10-23");
    expect(a).toEqual(b);
    expect(a.patients).toHaveLength(1);
    expect(DAILY_POOL).toContain(a.patients[0].name);
  });
  it("never repeats a rule on consecutive days and cycles all of them", () => {
    const ids = days(31).map(d => ruleOfDay(d).id);
    for(let i = 1; i < ids.length; i++) expect(ids[i]).not.toBe(ids[i - 1]);
    expect(new Set(ids).size).toBe(WEEKLY_RULES.length);
  });
  it("keeps the neck-clinic-only rules on the clinic game and mixes games otherwise", () => {
    const sets = days(31).map(d => dailySet(d));
    for(const s of sets) if(s.rule.clinicOnly) expect(s.patients[0].game).toBe("clinic");
    expect(new Set(sets.map(s => s.patients[0].game)).size).toBe(2);
  });
  it("carries the rule's mods, boss rules and pain slots", () => {
    const tight = days(8).map(dailySet).find(s => s.rule.id === "tight"), pain = days(8).map(dailySet).find(s => s.rule.id === "pain1");
    expect(tight.mods.tight).toBeLessThan(1);
    expect(pain.painMax).toBe(1);
    expect(days(8).map(dailySet).find(s => s.rule.id === "timer").boss).toEqual(["timer"]);
  });
  it("labels the date", () => { expect(dailyLabel("2026-10-03")).toBe("10.3"); });
});
describe("daily: the record", () => {
  it("only today's record counts", () => {
    expect(dailyRead({ date: "2026-10-22", best: 200, tries: 3 }, "2026-10-23")).toEqual({ date: "2026-10-23", best: 0, tries: 0 });
    expect(dailyTry(null, "2026-10-23").tries).toBe(1);
  });
  it("a played-through run sets the best and the first clear once", () => {
    const a = dailyRecord(null, "2026-10-23", 180, true);
    expect(a).toMatchObject({ isBest: true, firstClear: true });
    const b = dailyRecord(a.record, "2026-10-23", 150, true);
    expect(b).toMatchObject({ isBest: false, firstClear: false });
    expect(b.record.best).toBe(180);
    expect(dailyRecord(a.record, "2026-10-23", 200, true)).toMatchObject({ isBest: true, firstClear: false });
  });
  it("an unfinished run keeps nothing", () => {
    expect(dailyRecord(null, "2026-10-23", 120, false)).toMatchObject({ isBest: false, firstClear: false });
  });
});
describe("daily: share and events", () => {
  it("writes the share text with the streak only from day two", () => {
    expect(dailyShareText({ best: 190, rule: "좁은 구역", label: "10.23", streak: 1 })).not.toContain("출근");
    expect(dailyShareText({ best: 190, rule: "좁은 구역", label: "10.23", streak: 4 })).toContain("출근 4일째");
  });
  it("has event names", () => { expect([EV.dailyStart, EV.dailyEnd]).toEqual(["daily_start", "daily_end"]); });
});

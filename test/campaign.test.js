import { describe, it, expect } from "vitest";
import { DAYS, dayRoster, dayStars, readProgress, dayOpen, afterDay, nextDay } from "../src/core/campaign.js";
import { ROSTER } from "../src/patient/roster.js";

describe("campaign", () => {
  it("has seven days of known patients and games", () => {
    expect(DAYS.length).toBe(7);
    DAYS.forEach((d, i) => {
      expect(["clinic", "towel"]).toContain(d.game);
      expect(d.patients.length).toBeGreaterThan(0);
      expect(d.intro.length).toBeGreaterThan(0);
      expect(d.painMax).toBeGreaterThanOrEqual(1);
      expect(d.painMax).toBeLessThanOrEqual(3);
      expect(dayRoster(i, ROSTER).map(p => p.name)).toEqual(d.patients);
      Object.keys(d.lines || {}).forEach(n => expect(d.patients).toContain(n));
    });
    expect(DAYS[DAYS.length - 1].patients.at(-1)).toBe("김사장");   // the landlord comes last
  });
  it("gives regulars the day's start line without touching the roster", () => {
    const kim = ROSTER.find(p => p.name === "김사장");
    const before = kim.lines.start;
    const p = dayRoster(6, ROSTER).find(q => q.name === "김사장");
    expect(p.lines.start).toBe(DAYS[6].lines["김사장"]);
    expect(p.lines.ouch).toBe(kim.lines.ouch);
    expect(kim.lines.start).toBe(before);
  });
  it("stars by the rank cuts", () => {
    expect(dayStars(120)).toBe(3);
    expect(dayStars(100)).toBe(2);
    expect(dayStars(40)).toBe(1);
  });
  it("unlocks days in order and keeps the best stars", () => {
    let p = readProgress(null);
    expect(p).toEqual({cleared: 0, stars: [0, 0, 0, 0, 0, 0, 0]});
    expect(dayOpen(p, 0)).toBe(true);
    expect(dayOpen(p, 1)).toBe(false);
    expect(afterDay(p, 0, false, 3)).toBe(p);
    p = afterDay(p, 0, true, 2);
    expect(p.cleared).toBe(1);
    expect(dayOpen(p, 1)).toBe(true);
    expect(nextDay(p, 0)).toBe(1);
    p = afterDay(p, 0, true, 1);
    expect(p.stars[0]).toBe(2);
    expect(p.cleared).toBe(1);   // replaying day 1 does not skip ahead
    p = afterDay(p, 0, true, 3);
    expect(p.stars[0]).toBe(3);
    expect(nextDay({cleared: 7, stars: []}, 6)).toBe(-1);
  });
  it("reads a broken save as a fresh start", () => {
    expect(readProgress({cleared: "x"}).cleared).toBe(0);
    expect(readProgress({cleared: 99, stars: []}).cleared).toBe(7);
    expect(readProgress({cleared: 2, stars: [3, 9, 3]}).stars).toEqual([3, 3, 0, 0, 0, 0, 0]);
  });
});

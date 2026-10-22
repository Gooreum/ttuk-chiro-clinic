import { describe, it, expect } from "vitest";
import { DAYS, CHAPTERS, dayRoster, dayStars, readProgress, dayOpen, afterDay, nextDay, dayLabel, dayInChapter, chapterOf, dayClears } from "../src/core/campaign.js";
import { ROSTER } from "../src/patient/roster.js";
import { CAST } from "../src/patient/cast.js";
import { quietDay, ONBOARD_DAYS } from "../src/core/monetize.js";
import { tolMul } from "../src/core/feel.js";

const ALL = [...ROSTER, ...CAST];

describe("campaign", () => {
  it("has chapters of seven days of known patients and games", () => {
    expect(DAYS.length).toBe(56);
    CHAPTERS.forEach(c => expect(DAYS.filter(d => d.ch === c.no).length).toBe(7));
    DAYS.forEach((d, i) => {
      expect(["clinic", "towel", "back"]).toContain(d.game);
      if(d.game === "back") expect(d.patients.length).toBe(1);   // 허리펴기 is one patient, three zones
      expect(d.patients.length).toBeGreaterThan(0);
      expect(d.intro.length).toBeGreaterThan(0);
      expect(d.painMax).toBeGreaterThanOrEqual(1);
      expect(d.painMax).toBeLessThanOrEqual(3);
      expect(dayRoster(i, ALL).map(p => p.name)).toEqual(d.patients);
      Object.keys(d.lines || {}).forEach(n => expect(d.patients).toContain(n));
    });
    expect(DAYS[6].patients.at(-1)).toBe("김사장");   // the landlord ends chapter 1
    expect(DAYS[13].patients.at(-1)).toBe("강직한");  // the rival ends chapter 2
    expect(DAYS[20]).toMatchObject({ch: 3, game: "back", patients: ["근육왕"]});   // the gym boss ends chapter 3
    expect(DAYS.filter(d => d.ch === 3 && d.game === "back").length).toBe(4);
    expect(DAYS[55]).toMatchObject({ch: 8, beat: 114});   // 뚝할배 closes the story
    expect(DAYS[55].patients.at(-1)).toBe("뚝할배");
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
    expect(p).toEqual({cleared: 0, stars: Array(56).fill(0)});
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
    expect(nextDay({cleared: 7, stars: []}, 6)).toBe(7);   // chapter 1 ends into chapter 2
    expect(nextDay({cleared: 14, stars: []}, 13)).toBe(14);   // chapter 2 ends into chapter 3
    expect(nextDay({cleared: 21, stars: []}, 20)).toBe(21);   // chapter 3 ends into chapter 4
    expect(nextDay({cleared: 56, stars: []}, 55)).toBe(-1);
  });
  it("reads a broken save as a fresh start", () => {
    expect(readProgress({cleared: "x"}).cleared).toBe(0);
    expect(readProgress({cleared: 99, stars: []}).cleared).toBe(56);
    expect(readProgress({cleared: 2, stars: [3, 9, 3]}).stars).toEqual([3, 3, ...Array(54).fill(0)]);
  });
  it("labels days by chapter", () => {
    expect(dayLabel(0)).toBe("1장 1일차");
    expect(dayLabel(9)).toBe("2장 3일차");
    expect(dayInChapter(7)).toBe(0);
    expect(chapterOf(DAYS[13].ch).title).toBe("소문의 대가");
  });
  it("needs the beat average to clear a boss day", () => {
    const boss = DAYS.findIndex(d => d.beat);
    expect(boss).toBe(13);
    expect(DAYS.filter(d => d.beat).length).toBe(7);   // one boss per chapter from 2장
    expect(DAYS.filter(d => d.beat).every(d => d.lose)).toBe(true);   // each boss has its own miss line
    const later = DAYS.filter(d => d.beat && d.ch >= 3).map(d => d.beat);
    expect(later).toEqual([...later].sort((a, b) => a - b));   // from 3장 on, every boss is harder than the last
    expect(dayClears(boss, true, DAYS[boss].beat - 1)).toBe(false);
    expect(dayClears(boss, true, DAYS[boss].beat)).toBe(true);
    expect(dayClears(boss, false, 200)).toBe(false);
    expect(dayClears(0, true, 10)).toBe(true);
  });
  it("keeps onboarding and boss days free of interstitials", () => {
    expect(ONBOARD_DAYS).toBe(3);
    expect(quietDay(0, false)).toBe(true);
    expect(quietDay(2, false)).toBe(true);
    expect(quietDay(3, false)).toBe(false);
    expect(quietDay(13, true)).toBe(true);
    expect(quietDay(null, false)).toBe(false);   // free run
  });
  it("narrows the zone on tight days", () => {
    expect(tolMul("stiff", 0, true)).toBeCloseTo(0.8, 10);
    expect(tolMul("nervous", 60000, true)).toBeCloseTo(0.48, 10);
  });
});

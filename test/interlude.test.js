import { describe, it, expect } from "vitest";
import { INTERLUDES, interludeOf, interludeForDay, interludeSeen, interludeOpen, markInterludeSeen } from "../src/core/interlude.js";
import { DAYS, CHAPTERS, readProgress, afterDay } from "../src/core/campaign.js";

const EMOJI = /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}]/u;

describe("장 막간", () => {
  it("has one card for each chapter after the first, 3-5 one-sentence lines", () => {
    expect(INTERLUDES.map(i => i.before)).toEqual(CHAPTERS.slice(1).map(c => c.no));
    INTERLUDES.forEach(i => {
      expect(i.lines.length).toBeGreaterThanOrEqual(3);
      expect(i.lines.length).toBeLessThanOrEqual(5);
      [i.form, i.title, ...i.lines].forEach(t => { expect(t.length).toBeGreaterThan(0); expect(t).not.toMatch(EMOJI); });
    });
  });
  it("hooks the next chapter and avoids teaching real adjustments", () => {
    expect(interludeOf(2).lines.join(" ")).toContain("김사장");
    expect(interludeOf(8).lines.join(" ")).toContain("메가");
    INTERLUDES.forEach(i => expect(i.lines.join(" ")).not.toMatch(/따라 ?하/));
  });
  it("belongs to a chapter's first day only", () => {
    const firsts = CHAPTERS.map(c => DAYS.findIndex(d => d.ch === c.no));
    firsts.forEach((day, k) => { expect(interludeForDay(day)).toBe(k === 0 ? null : INTERLUDES[k - 1]); });
    expect(interludeForDay(firsts[1] + 1)).toBeNull();
    expect(interludeForDay(-1)).toBeNull();
  });
  it("opens once the chapter's first day is open", () => {
    const fresh = readProgress(null);
    expect(interludeOpen(fresh, 2)).toBe(false);
    expect(interludeOpen({...fresh, cleared: 7}, 2)).toBe(true);
    expect(interludeOpen({...fresh, cleared: 7}, 3)).toBe(false);
    expect(interludeOpen({...fresh, cleared: 56}, 8)).toBe(true);
    expect(interludeOpen({...fresh, cleared: 56}, 1)).toBe(false);
  });
  it("saves seen chapters inside the old save format", () => {
    const old = {cleared: 8, stars: [3, 3, 3, 3, 3, 3, 3, 2]};
    const p = readProgress(old);
    expect(p.seen).toBeUndefined();
    expect(interludeSeen(p, 2)).toBe(false);
    const m = markInterludeSeen(p, 2);
    expect(interludeSeen(m, 2)).toBe(true);
    expect(markInterludeSeen(m, 2)).toBe(m);
    const back = readProgress(JSON.parse(JSON.stringify(m)));
    expect(back.seen).toEqual([2]);
    expect(back.cleared).toBe(8);
    expect(afterDay(back, 8, true, 3).seen).toEqual([2]);   // a cleared day keeps what was seen
    expect(readProgress({...old, seen: [3, 2, 2, "x", 99, 1]}).seen).toEqual([2, 3]);
    expect(readProgress({seen: [2]}).seen).toBeUndefined();   // a broken save reads as fresh
  });
});

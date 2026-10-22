import { describe, it, expect } from "vitest";
import { PERSONA_REVIEWS, starPool, chooseReview } from "../src/core/personaReviews.js";
import { reviewLine } from "../src/core/fail.js";
import { towelReview } from "../src/core/towel.js";
import { ROSTER } from "../src/patient/roster.js";
import { CAST } from "../src/patient/cast.js";

describe("persona reviews", () => {
  const names = [...ROSTER.map(p => p.name), ...CAST.map(p => p.name)];
  it("every roster and cast patient has own good and rough reviews", () => {
    expect(names.length).toBe(32);
    names.forEach(n => {
      expect(PERSONA_REVIEWS[n], n).toBeTruthy();
      expect(PERSONA_REVIEWS[n].good.length, n).toBeGreaterThanOrEqual(5);
      expect(PERSONA_REVIEWS[n].rough.length, n).toBeGreaterThanOrEqual(5);
    });
  });
  it("no sentence is shared by two patients", () => {
    const all = Object.values(PERSONA_REVIEWS).flatMap(p => [...p.good, ...p.rough]);
    expect(new Set(all).size).toBe(all.length);
  });
  it("stars pick the pool; unknown names use the generic one", () => {
    expect(starPool("박대리", 3)).toEqual(PERSONA_REVIEWS.박대리.good);
    expect(starPool("박대리", 1)).toEqual(PERSONA_REVIEWS.박대리.rough);
    expect(starPool("누군가", 3, ["x"])).toEqual(["x"]);
  });
  it("chooseReview skips used lines within one card", () => {
    const used = new Set(), pool = ["a", "b"];
    const first = chooseReview(pool, used, () => 0), second = chooseReview(pool, used, () => 0);
    expect(first).not.toBe(second);
    expect(chooseReview(pool, used, () => 0)).toBeTruthy();
  });
  it("one card never repeats a review", () => {
    const used = new Set();
    const a = reviewLine({name: "말빨", stars: 3, fails: []}, () => 0, used);
    const b = reviewLine({name: "말빨", stars: 3, fails: []}, () => 0, used);
    expect(a).not.toBe(b);
    const c = towelReview({name: "박팀장", stars: 3, fails: []}, () => 0, used);
    expect(used.has(c)).toBe(true);
  });
});

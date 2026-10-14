import { describe, it, expect } from "vitest";
import { PREP_MS, PREP_LINES, inPrep, breathCue, CUE_CLOSE } from "../src/core/cue.js";

describe("prep", () => {
  it("lasts about 2-2.5 s", () => {
    expect(PREP_MS).toBeGreaterThanOrEqual(2000);
    expect(PREP_MS).toBeLessThanOrEqual(2500);
  });
  it("is on until prepUntil, off without one", () => {
    expect(inPrep(1000, 1500)).toBe(true);
    expect(inPrep(1500, 1500)).toBe(false);
    expect(inPrep(1000, 0)).toBe(false);
    expect(inPrep(1000, undefined)).toBe(false);
  });
  it("has short relax lines", () => {
    expect(PREP_LINES.length).toBeGreaterThan(0);
    PREP_LINES.forEach(l => { expect(l.length).toBeLessThan(24); expect(l).toMatch(/힘 빼|편하게/); });
  });
});

// feed a run of [exhale, close] frames, collect the lines
const run = (frames, key = "0:0:1", st = null) => {
  const lines = [];
  frames.forEach(([ex, c]) => { const r = breathCue(st, key, ex, c); st = r.st; if(r.line) lines.push(r.line); });
  return {lines, st};
};

describe("breathCue", () => {
  it("close in: 'in' as an in-breath starts, 'out' as the next out-breath starts", () => {
    expect(run([[true, 0.8], [false, 0.8], [false, 0.8], [true, 0.8]]).lines).toEqual(["in", "out"]);
  });
  it("says nothing while the aim is far", () => {
    expect(run([[true, 0.1], [false, 0.1], [true, 0.1], [false, CUE_CLOSE - 0.01], [true, 0.2]]).lines).toEqual([]);
  });
  it("only once per side, however many breaths follow", () => {
    const f = [[true, 0.9], [false, 0.9], [true, 0.9], [false, 0.9], [true, 0.9], [false, 0.9], [true, 0.9]];
    expect(run(f).lines).toEqual(["in", "out"]);
  });
  it("needs a breath turn: being close mid-inhale waits for the next in-breath", () => {
    expect(run([[false, 0.9], [false, 0.9], [true, 0.9]]).lines).toEqual([]);
  });
  it("finishes the pair even if the aim drifts after 'in'", () => {
    expect(run([[true, 0.9], [false, 0.9], [true, 0.0]]).lines).toEqual(["in", "out"]);
  });
  it("a new side (key) starts over", () => {
    const a = run([[true, 0.9], [false, 0.9], [true, 0.9]]);
    expect(run([[true, 0.9], [false, 0.9], [true, 0.9]], "0:1:2", a.st).lines).toEqual(["in", "out"]);
  });
  it("does not mutate the state it is given", () => {
    const st = {key: "k", step: 0, was: true};
    breathCue(st, "k", false, 1);
    expect(st).toEqual({key: "k", step: 0, was: true});
  });
});

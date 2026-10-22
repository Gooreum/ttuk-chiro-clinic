import { describe, it, expect } from "vitest";
import { tolMul, tightFactor, distAt, closenessOf, deltaGain, breathState } from "../src/core/feel.js";

const target = {rot: 30, bend: -10, tolR: 9, tolB: 6};

describe("tightFactor", () => {
  it("is 1 plain, 0.8 tight, 0.7 tighter", () => {
    expect(tightFactor(undefined)).toBe(1);
    expect(tightFactor({})).toBe(1);
    expect(tightFactor({tight: true})).toBe(0.8);
    expect(tightFactor({tight: true, tighter: true})).toBe(0.7);
    expect(tolMul("stiff", 0, 0.7)).toBe(0.7);
    expect(tolMul("stiff", 0, true)).toBe(0.8);
    expect(tolMul("nervous", 60000, 0.7)).toBeCloseTo(0.42, 10);
  });
});
describe("tolMul", () => {
  it("nervous tightens linearly down to 0.6", () => {
    expect(tolMul("nervous", 0)).toBe(1);
    expect(tolMul("nervous", 6000)).toBeCloseTo(0.75, 10);
    expect(tolMul("nervous", 60000)).toBe(0.6);
  });
  it("other traits stay at 1", () => {
    expect(tolMul("stiff", 60000)).toBe(1);
    expect(tolMul(undefined, 60000)).toBe(1);
  });
});

describe("distAt", () => {
  it("is 0 on target and 1 at the tolerance edge", () => {
    expect(distAt(30, -10, target, 1)).toBe(0);
    expect(distAt(39, -10, target, 1)).toBeCloseTo(1, 10);
    expect(distAt(30, -4, target, 1)).toBeCloseTo(1, 10);
  });
  it("scales with the tolerance multiplier", () => {
    expect(distAt(39, -10, target, 0.6)).toBeCloseTo(1/0.6, 10);
  });
  it("returns 9 without a target", () => {
    expect(distAt(0, 0, null, 1)).toBe(9);
  });
});

describe("closenessOf", () => {
  it("clamps between 0 and 1", () => {
    expect(closenessOf(0)).toBe(1);
    expect(closenessOf(0.3)).toBe(1);
    expect(closenessOf(1.4)).toBeCloseTo(0.5, 10);
    expect(closenessOf(2.5)).toBe(0);
    expect(closenessOf(10)).toBe(0);
  });
});

describe("deltaGain", () => {
  it("gets heavier near the target", () => {
    expect(deltaGain(0.6, false, 0)).toBe(1);
    expect(deltaGain(0.6, false, 1)).toBeCloseTo(0.4, 10);
  });
  it("stiff adds 0.25 weight (capped at 0.92) and damps by 0.8", () => {
    expect(deltaGain(0.6, true, 1)).toBeCloseTo((1 - 0.85)*0.8, 10);
    expect(deltaGain(0.9, true, 1)).toBeCloseTo((1 - 0.92)*0.8, 10);
    expect(deltaGain(0.6, true, 0)).toBeCloseTo(0.8, 10);
  });
});

describe("breathState", () => {
  it("inhales for 42% of the cycle, then exhales", () => {
    expect(breathState(0, 0, 4)).toEqual({exhale: false, fill: 0});
    const before = breathState(1679, 0, 4), at = breathState(1680, 0, 4);
    expect(before.exhale).toBe(false);
    expect(at.exhale).toBe(true);
    expect(at.fill).toBeCloseTo(1, 10);
    expect(breathState(3999, 0, 4).fill).toBeCloseTo(1/2320, 6);
  });
  it("wraps every period and respects t0", () => {
    expect(breathState(5000, 1000, 4)).toEqual(breathState(1000, 1000, 4));
  });
});

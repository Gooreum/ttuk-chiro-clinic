import { describe, it, expect } from "vitest";
import { crackProfile, CRACK_LEN } from "../src/core/crack.js";

describe("crackProfile", () => {
  it("rests at zero before and after", () => {
    expect(crackProfile(0).rot).toBe(0);
    expect(crackProfile(CRACK_LEN).rot).toBe(0);
    expect(Math.abs(crackProfile(CRACK_LEN - 0.01).rot)).toBeLessThan(0.05);
  });
  it("loads up against the turn, then thrusts past the aim", () => {
    expect(crackProfile(0.05).rot).toBeLessThan(0);
    expect(crackProfile(0.15).rot).toBeCloseTo(15, 5);
    expect(crackProfile(0.15).push).toBeCloseTo(1, 5);
  });
  it("wobbles back through zero and dies out", () => {
    const vals = Array.from({length: 40}, (_, i) => crackProfile(0.15 + i*0.012).rot);
    expect(Math.min(...vals)).toBeLessThan(0);
    expect(Math.abs(crackProfile(0.5).rot)).toBeLessThan(2);
  });
  it("side-bend follows the turn", () => {
    expect(crackProfile(0.15).bend).toBeCloseTo(0.35*15, 5);
  });
});

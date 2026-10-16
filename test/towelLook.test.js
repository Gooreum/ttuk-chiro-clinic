import { describe, it, expect } from "vitest";
import { columnFollow, jawFollow, jawColumnFollow } from "../src/core/towelLook.js";

describe("towel neck visual attachment", () => {
  it("pins the shoulder outside the column for every height", () => {
    for(let t = -0.2; t < 2; t += 0.05) expect(columnFollow(t, 1.5)).toBe(0);
  });
  it("keeps the seam and the entire head skirt together", () => {
    expect(columnFollow(0, 1)).toBe(1);
    expect(jawFollow(-0.5)).toBe(1);
    expect(jawFollow(0)).toBe(1);
    expect(jawFollow(1)).toBe(0);
  });
  it("eases into the clavicles and jaw without reversing the skin", () => {
    let prev = 1;
    for(let t = 0; t <= 1; t += 0.01){
      const w = columnFollow(t, 1); expect(w).toBeLessThanOrEqual(prev); expect(w).toBeGreaterThanOrEqual(0); prev = w;
    }
    expect(columnFollow(1, 1)).toBe(0);
  });
  it("matches the same displacement on both sides of an uneven export cut", () => {
    for(const w of [0, 0.2, 0.6, 1]) expect(0.65*w + 0.35*jawColumnFollow(w, 0)).toBeCloseTo(1);
    expect(jawColumnFollow(0.5, 1)).toBe(0);
  });
});

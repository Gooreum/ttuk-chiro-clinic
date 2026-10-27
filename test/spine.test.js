import { describe, it, expect } from "vitest";
import { SPINE, spineOf, spinePose, GAP_SHARE } from "../src/core/spine.js";
import { ROSTER } from "../src/patient/roster.js";

describe("each patient's own neck", () => {
  it("every roster patient has a profile, six discs in a sane range", () => {
    ROSTER.forEach(p => {
      const s = SPINE[p.name];
      expect(s, p.name).toBeTruthy();
      expect(s.disc).toHaveLength(6);
      s.disc.forEach(h => { expect(h).toBeGreaterThanOrEqual(0.45); expect(h).toBeLessThanOrEqual(1.1); });
    });
  });
  it("every neck differs: curves and disc patterns are not all the same", () => {
    const n = Object.keys(SPINE).length;
    const curves = new Set(Object.values(SPINE).map(s => s.curve)), discs = new Set(Object.values(SPINE).map(s => s.disc.join()));
    expect(n).toBe(ROSTER.length); expect(curves.size).toBe(n); expect(discs.size).toBe(n);
    expect(SPINE["정작가"].curve).toBeLessThan(SPINE["박대리"].curve);   // reversed is past straight
  });
  it("the curve is shared out over the gaps and adds back up", () => {
    expect(GAP_SHARE.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    const pose = spinePose(SPINE["정작가"]);
    expect(pose).toHaveLength(6);
    expect(pose.reduce((a, g) => a + g.bend, 0)).toBeCloseTo(-28*Math.PI/180);
  });
  it("an unknown patient gets a healthy neck", () => {
    expect(spinePose(spineOf("누구")).every(g => g.bend === 0 && g.lean === 0 && g.h === 1)).toBe(true);
  });
});

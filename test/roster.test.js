import { describe, it, expect } from "vitest";
import { ROSTER, makePatients } from "../src/patient/roster.js";

describe("makePatients", () => {
  it("gives every patient two sides: complaint side first, then the opposite", () => {
    const ps = makePatients();
    expect(ps).toHaveLength(ROSTER.length);
    ps.forEach((p, i) => {
      expect(p.sides).toHaveLength(2);
      expect(p.sides[0].side).toBe(ROSTER[i].side);
      expect(p.sides[1].side).toBe(-ROSTER[i].side);
    });
  });
  it("rot follows the side, bend goes the other way", () => {
    makePatients().forEach(p => p.sides.forEach(s => {
      expect(Math.sign(s.rot)).toBe(s.side);
      expect(Math.sign(s.bend)).toBe(-s.side);
    }));
  });
  it.each([[0], [0.999]])("keeps rotation inside each trait's range (rand=%f)", r => {
    makePatients(() => r).forEach(p => p.sides.forEach(s => {
      const mag = Math.abs(s.rot);
      const [lo, hi] = p.trait === "flexible" ? [44, 53] : p.trait === "elder" ? [24, 34] : [28, 42];
      expect(mag).toBeGreaterThanOrEqual(lo);
      expect(mag).toBeLessThanOrEqual(hi);
    }));
  });
  it("keeps danger limits (elder 50/22, others 63/27)", () => {
    makePatients().forEach(p => {
      expect([p.limR, p.limB]).toEqual(p.trait === "elder" ? [50, 22] : [63, 27]);
    });
  });
});

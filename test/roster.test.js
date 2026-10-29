import { describe, it, expect } from "vitest";
import { ROSTER, lumbarPatient, PER_DAY, makePatients, rosterFor } from "../src/patient/roster.js";
import { bodyOf } from "../src/core/body.js";
import { CAST } from "../src/patient/cast.js";

describe("makePatients", () => {
  it("gives every patient two sides: complaint side first, then the opposite", () => {
    makePatients().forEach(p => {
      const r = ROSTER.find(q => q.name === p.name);
      expect(p.sides).toHaveLength(2);
      expect(p.sides[0].side).toBe(r.side);
      expect(p.sides[1].side).toBe(-r.side);
    });
  });
  it("draws PER_DAY different patients from the roster", () => {
    expect(PER_DAY).toBe(3);
    for(let k = 0; k < 20; k++){
      const names = makePatients().map(p => p.name);
      expect(names).toHaveLength(PER_DAY);
      expect(new Set(names).size).toBe(PER_DAY);
      names.forEach(n => expect(ROSTER.some(q => q.name === n)).toBe(true));
    }
  });
  it("can draw every roster patient", () => {
    const seen = new Set();
    for(let k = 0; k < 200; k++) makePatients().forEach(p => seen.add(p.name));
    expect(seen.size).toBe(ROSTER.length);
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
  it("keeps danger limits (elder 50/22, others 63/27; a body type scales them, test/body.test.js)", () => {
    makePatients(Math.random, ROSTER.length).filter(p => !bodyOf(p)).forEach(p => {
      expect([p.limR, p.limB]).toEqual(p.trait === "elder" ? [50, 22] : [63, 27]);
    });
  });
  it("조멸치, 마동철, 복순할매, 최필라 are held back for the next version: out of the roster, the cast borrow the remaining bodies", () => {
    ["조멸치", "마동철", "복순할매", "최필라"].forEach(n => expect(ROSTER.find(p => p.name === n)).toBeUndefined());
    expect(ROSTER.filter(p => p.games && !p.games.includes("towel"))).toEqual([]);
    CAST.forEach(c => { expect(ROSTER.find(p => p.name === c.base)).toBeDefined(); expect(c.look).not.toHaveProperty("clinicModel"); });
  });
});

describe("lumbarPatient (허리누르기 / 허리비틀기 free run)", () => {
  it("no patient has its own prone or side-lying body for now: everything falls back to 박대리", () => {
    expect(ROSTER.filter(p => p.look.backModel || p.look.sideModel)).toEqual([]);
    expect(lumbarPatient("back", "김사장", () => 0).name).toBe("박대리");
    expect(lumbarPatient("side", "마동철", () => 0).name).toBe("박대리");
    expect(lumbarPatient("back", null, () => 0.99, true).name).toBe("박대리");
  });
});

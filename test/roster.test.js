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
  it("every patient has a body in both neck modes: 최필라 joins the towel draw (2026-10-25)", () => {
    expect(ROSTER.filter(p => p.games && !p.games.includes("towel"))).toEqual([]);
    expect(rosterFor("towel").map(p => p.name)).toContain("최필라");
  });
  it("마동철 lies on his image-to-3D body in both neck modes, the cast who borrow him keep the MPFB one", () => {
    const ma = ROSTER.find(p => p.name === "마동철");
    expect(ma.look).toMatchObject({model: "patient08", clinicModel: "patient12"});
    const borrowers = CAST.filter(c => c.base === "마동철");
    expect(borrowers.map(c => c.name).sort()).toEqual(["근육왕", "메가회장"]);
    borrowers.forEach(c => { expect(c.look.model).toBe("patient08"); expect(c.look).not.toHaveProperty("clinicModel"); });
  });
  it("복순할매 lies on her image-to-3D body in both neck modes, the cast who borrow her keep the MPFB one", () => {
    const bs = ROSTER.find(p => p.name === "복순할매");
    expect(bs.look).toMatchObject({model: "patient09", clinicModel: "patient13"});
    const borrowers = CAST.filter(c => c.base === "복순할매");
    expect(borrowers.map(c => c.name).sort()).toEqual(["강해녀", "사모님"]);
    borrowers.forEach(c => { expect(c.look.model).toBe("patient09"); expect(c.look).not.toHaveProperty("clinicModel"); });
  });
  it("조멸치 lies on his image-to-3D body in both neck modes, the cast who borrow him keep the MPFB one", () => {
    const jo = ROSTER.find(p => p.name === "조멸치");
    expect(jo.look).toMatchObject({model: "patient06", clinicModel: "patient14"});
    const borrowers = CAST.filter(c => c.base === "조멸치");
    expect(borrowers.map(c => c.name).sort()).toEqual(["이마라톤", "이스쿠터"]);
    borrowers.forEach(c => { expect(c.look.model).toBe("patient06"); expect(c.look).not.toHaveProperty("clinicModel"); });
  });
});

describe("lumbarPatient (허리누르기 / 허리비틀기 free run, 2026-10-25)", () => {
  const IMAGE = ["조멸치", "마동철", "복순할매", "최필라"];
  it("the four image-to-3D patients have their own prone and side-lying bodies and a back complaint", () => {
    IMAGE.forEach(n => {
      const p = ROSTER.find(r => r.name === n), id = p.look.clinicModel || p.look.model;
      // 마동철 is too big for the table: on his side his hip is half a metre up (the L4 mark lands on his belly), prone his
      // shoulders, arms and thighs hang off the pad (59th playtest, 2026-10-27): no lumbar bodies for him
      // 조멸치 on his side: his legs and shoes hang off the pad (skin weights, 69th playtest, 2026-10-28): prone only
      if(n === "조멸치"){ expect(p.look.backModel).toBe(id); expect(p.look).not.toHaveProperty("sideModel"); }
      else if(n !== "마동철"){ expect(p.look.backModel).toBe(id); expect(p.look.sideModel).toBe(id); }
      else { expect(p.look).not.toHaveProperty("backModel"); expect(p.look).not.toHaveProperty("sideModel"); }
      expect(typeof p.waist).toBe("string");
    });
    expect(ROSTER.filter(p => p.look.backModel).map(p => p.name).sort()).toEqual(IMAGE.filter(n => n !== "마동철").sort());
    CAST.forEach(c => { expect(c.look).not.toHaveProperty("backModel"); expect(c.look).not.toHaveProperty("sideModel"); });
  });
  it("?patient= picks that body, an unknown name or a patient without one falls back to the draw", () => {
    expect(lumbarPatient("back", "조멸치").name).toBe("조멸치");
    expect(lumbarPatient("back", "마동철", () => 0).name).toBe("박대리");
    expect(lumbarPatient("side", "최필라").name).toBe("최필라");
    expect(lumbarPatient("side", "마동철", () => 0).name).toBe("박대리");
    expect(lumbarPatient("side", "조멸치", () => 0).name).toBe("박대리");
    expect(lumbarPatient("back", "김사장", () => 0).name).toBe("박대리");
  });
  it("the free draw covers 박대리 and the four; the shot / case builds stay on 박대리", () => {
    const seen = new Set();
    for(let k = 0; k < 3; k++) seen.add(lumbarPatient("side", null, () => k/3 + 0.01).name);
    expect([...seen].sort()).toEqual(["박대리", ...IMAGE.filter(n => n !== "마동철" && n !== "조멸치")].sort());
    expect(lumbarPatient("back", null, () => 0.99, true).name).toBe("박대리");
  });
});


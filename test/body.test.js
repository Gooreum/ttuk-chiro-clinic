import { describe, it, expect } from "vitest";
import { BODY, BODY_OF, bodyOf, withBody, towelBody } from "../src/core/body.js";
import { makePatients } from "../src/patient/roster.js";
import { makeTowelTarget } from "../src/core/towel.js";
import { mulberry32 } from "../src/core/night.js";

// a patient of each body type, from the base patient shapes the roster uses (an ordinary, a flexible and an elder one)
const base = { name: "시험", side: 1, tolR: 7, tolB: 5, breath: 4, burn: 0 };
const kinds = [{}, { trait: "flexible" }, { trait: "elder" }, { trait: "nervous" }];

describe("체형 (core/body.js)", () => {
  it("follows the body: patient06..12 have a type, patient01..05 none", () => {
    expect(Object.keys(BODY_OF)).toEqual(["patient06", "patient07", "patient08", "patient09", "patient10", "patient11", "patient12"]);
    Object.values(BODY_OF).forEach(k => expect(BODY[k]).toBeTruthy());
    expect(bodyOf({ look: { model: "patient01" } })).toBeNull();
    expect(bodyOf({ look: { model: "patient08" } })).toBe(BODY.bulk);
    expect(bodyOf({})).toBeNull();
    expect(bodyOf(null)).toBeNull();
  });
  it("leaves a body without a type exactly as it was rolled", () => {
    const a = makePatients(mulberry32(7), 1, [{ ...base, look: { model: "patient01" } }])[0];
    const b = makePatients(mulberry32(7), 1, [{ ...base }])[0];
    expect(a.sides).toEqual(b.sides);
    expect([a.tolR, a.limR, a.limB, a.breath, a.heavy]).toEqual([7, 63, 27, 4, undefined]);
  });
  it("scales the zone, the breath and the weight per type", () => {
    const roll = model => makePatients(mulberry32(3), 1, [{ ...base, look: { model } }])[0];
    const bulk = roll("patient08"), kid = roll("patient10"), slim = roll("patient06"), plain = roll("patient01");
    expect(bulk.tolR).toBeCloseTo(7*1.25); expect(bulk.heavy).toBe(0.2); expect(bulk.breath).toBeCloseTo(5);
    expect(kid.tolR).toBeCloseTo(7*0.8); expect(kid.breath).toBeCloseTo(2.4);
    expect(Math.abs(slim.sides[0].rot)).toBeCloseTo(Math.abs(plain.sides[0].rot)*1.15);
    expect(slim.limR).toBeLessThan(plain.limR);
  });
  it("never puts the target and its zone past the danger line (500 rolls per type and trait)", () => {
    const rand = mulberry32(11);
    for(const model of Object.keys(BODY_OF)) for(const k of kinds) for(let i = 0; i < 500; i++){
      const p = makePatients(rand, 1, [{ ...base, ...k, look: { model } }])[0];
      p.sides.forEach(s => {
        expect(Math.abs(s.rot) + p.tolR).toBeLessThan(p.limR);
        expect(Math.abs(s.bend) + p.tolB).toBeLessThan(p.limB);
      });
    }
  });
  it("keeps every towel band playable: inside 0.15..0.88, at least 0.1 wide, the snap point above it and at most 0.97", () => {
    const rand = mulberry32(5);
    for(const model of Object.keys(BODY_OF)) for(const k of kinds) for(let i = 0; i < 500; i++){
      const tg = makeTowelTarget({ ...base, ...k, look: { model } }, rand);
      expect(tg.mid - tg.half).toBeGreaterThanOrEqual(0.15 - 1e-9);
      expect(tg.mid + tg.half).toBeLessThanOrEqual(0.88 + 1e-9);
      expect(2*tg.half).toBeGreaterThanOrEqual(0.1);
      expect(tg.limit).toBeGreaterThan(tg.mid + tg.half);
      expect(tg.limit).toBeLessThanOrEqual(0.97);
    }
  });
  it("moves the towel band the way the type says: the hog pulls deep and wide, granny low and narrow", () => {
    const tg = model => makeTowelTarget({ ...base, look: { model } }, () => 0.5);
    const plain = tg("patient01"), hog = tg("patient08"), gran = tg("patient09"), kid = tg("patient10");
    expect(hog.mid).toBeGreaterThan(plain.mid); expect(hog.half).toBeGreaterThan(plain.half); expect(hog.aimTol).toBeGreaterThan(plain.aimTol);
    expect(gran.mid).toBeLessThan(plain.mid); expect(gran.half).toBeLessThan(plain.half);
    expect(kid.aimTol).toBeLessThan(plain.aimTol);
  });
  it("withBody / towelBody are pure", () => {
    const p = { tolR: 7, tolB: 5, breath: 4, limR: 63, limB: 27, sides: [{ rot: 30, bend: -10 }, { rot: -30, bend: 10 }] };
    const copy = JSON.parse(JSON.stringify(p));
    withBody(p, BODY.child);
    expect(p).toEqual(copy);
    const tg = { mid: 0.5, half: 0.1, limit: 0.78, aim: 0, aimTol: 7 };
    towelBody(tg, BODY.bulk.towel);
    expect(tg).toEqual({ mid: 0.5, half: 0.1, limit: 0.78, aim: 0, aimTol: 7 });
  });
});

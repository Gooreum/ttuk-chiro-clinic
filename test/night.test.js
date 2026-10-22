import { describe, it, expect } from "vitest";
import { NIGHT_POOL, NIGHT_UNLOCK, NIGHT_PAIN, nightOpen, kstDate, nightSeed, nightRand, nightTier, nightMods, nightPatient, nightCount, nightRecord, nightRank, TIGHT_MIN, DEEP_MIN, DEEP_FROM } from "../src/core/night.js";
import { ROSTER, makePatients } from "../src/patient/roster.js";
import { CAST } from "../src/patient/cast.js";
import { tolMul, tightFactor } from "../src/core/feel.js";
import { quietDay, continueOffer } from "../src/core/monetize.js";

describe("night: seed and date", () => {
  it("uses the KST calendar date", () => {
    expect(kstDate(Date.UTC(2026, 9, 22, 14, 59))).toBe("2026-10-22");   // 23:59 KST
    expect(kstDate(Date.UTC(2026, 9, 22, 15, 0))).toBe("2026-10-23");    // 00:00 KST
  });
  it("is stable per date and differs between dates", () => {
    expect(nightSeed("2026-10-22")).toBe(nightSeed("2026-10-22"));
    expect(nightSeed("2026-10-22")).not.toBe(nightSeed("2026-10-23"));
    expect(nightSeed(Date.UTC(2026, 9, 22, 15, 0))).toBe(nightSeed("2026-10-23"));
    expect(Number.isInteger(nightSeed("2026-10-22"))).toBe(true);
  });
});

describe("night: patients", () => {
  const seed = nightSeed("2026-10-22");
  it("every pool name is a roster / cast patient", () => {
    const names = [...ROSTER, ...CAST].map(p => p.name);
    NIGHT_POOL.forEach(n => expect(names).toContain(n));
  });
  it("is deterministic and independent of call order", () => {
    const a = nightPatient(seed, 17), b = nightPatient(seed, 17);
    expect(a).toEqual(b);
    nightPatient(seed, 3);
    expect(nightPatient(seed, 17)).toEqual(a);
  });
  it("never repeats a name back to back or a game three times", () => {
    const seq = Array.from({ length: 120 }, (_, i) => nightPatient(seed, i));
    seq.forEach((p, i) => {
      expect(["clinic", "towel"]).toContain(p.game);
      if(i) expect(p.name).not.toBe(seq[i - 1].name);
      if(i > 1) expect(new Set([p.game, seq[i - 1].game, seq[i - 2].game]).size).toBeGreaterThan(1);
    });
    expect(seq.some(p => p.game === "towel") && seq.some(p => p.game === "clinic")).toBe(true);
  });
  it("different dates give different line-ups", () => {
    const a = Array.from({ length: 10 }, (_, i) => nightPatient(seed, i).name).join();
    const b = Array.from({ length: 10 }, (_, i) => nightPatient(nightSeed("2026-10-23"), i).name).join();
    expect(a).not.toBe(b);
  });
  it("rolls the same target angles for a patient every time", () => {
    const base = ROSTER[0];
    const a = makePatients(nightRand(seed, 4, 7), 0, [base])[0], b = makePatients(nightRand(seed, 4, 7), 0, [base])[0];
    expect(a.sides).toEqual(b.sides);
    expect(a.limR).toBe(b.limR);
  });
});

describe("night: difficulty", () => {
  it("a tier is five patients", () => {
    expect([0, 4, 5, 9, 10, 25].map(nightTier)).toEqual([0, 0, 1, 1, 2, 5]);
  });
  it("starts plain, tightens every 5 patients down to a floor, turns the breath cue off from the 11th", () => {
    expect(nightMods(0)).toEqual({});
    expect(nightMods(4)).toEqual({});
    expect(nightMods(5).tight).toBeCloseTo(0.93);
    expect(nightMods(9).noisy).toBeUndefined();
    expect(nightMods(10)).toEqual({ tight: 0.86, noisy: true });
    let last = 1;
    for(let i = 0; i < 200; i++){
      const t = nightMods(i).tight ?? 1;
      expect(t).toBeLessThanOrEqual(last); expect(t).toBeGreaterThanOrEqual(DEEP_MIN); last = t;
    }
    expect(nightMods(5 * DEEP_FROM - 1).tight).toBeGreaterThanOrEqual(TIGHT_MIN);   // before the 41st patient the floor is half
    expect(nightMods(200).tight).toBe(DEEP_MIN);
  });
  it("from the 41st patient the zone goes below half, still deterministic and never under the deep floor", () => {
    expect(nightMods(39).tight).toBe(0.51);
    expect(nightMods(40).tight).toBe(0.47);
    expect(nightMods(40)).toEqual(nightMods(40));
    expect(nightMods(40).noisy).toBe(true);
    expect(nightMods(60).tight).toBeLessThan(TIGHT_MIN);
    expect(nightMods(500).tight).toBe(DEEP_MIN);
  });
  it("a numeric mods.tight is the zone factor (tightFactor), booleans keep 0.8 / 0.7", () => {
    expect(tightFactor(nightMods(10))).toBeCloseTo(0.86);
    expect(tightFactor(nightMods(0))).toBe(1);
    expect(tightFactor({ tight: true })).toBe(0.8);
    expect(tightFactor({ tight: true, tighter: true })).toBe(0.7);
  });
  it("a numeric tight narrows core/feel tolMul", () => {
    expect(tolMul("stiff", 0, 0.86)).toBeCloseTo(0.86);
    expect(tolMul("stiff", 0, true)).toBeCloseTo(0.8);
    expect(tolMul("stiff", 0, false)).toBe(1);
    expect(tolMul("nervous", 0, 0.5)).toBeCloseTo(0.5);
  });
});

describe("night: record", () => {
  it("counts only treated patients", () => {
    expect(nightCount([{ stars: 3 }, { stars: 1 }, { stars: 0, label: "통증으로 중단" }, { ambulance: true }])).toBe(2);
    expect(nightCount(null)).toBe(0);
  });
  it("keeps the best of today, resets on a new date, ignores empty runs", () => {
    const d = "2026-10-22";
    expect(nightRecord(null, d, 0, 0)).toEqual({ record: null, isBest: false });
    expect(nightRecord(null, d, 4, 300)).toEqual({ record: { date: d, count: 4, score: 300 }, isBest: true });
    const prev = { date: d, count: 4, score: 300 };
    expect(nightRecord(prev, d, 3, 999)).toEqual({ record: prev, isBest: false });
    expect(nightRecord(prev, d, 4, 301).isBest).toBe(true);
    expect(nightRecord(prev, d, 4, 300).isBest).toBe(false);
    expect(nightRecord(prev, d, 5, 10).record.count).toBe(5);
    expect(nightRecord(prev, "2026-10-23", 1, 50)).toEqual({ record: { date: "2026-10-23", count: 1, score: 50 }, isBest: true });
    expect(nightRecord(prev, "2026-10-23", 0, 0).record).toBeNull();
    expect(nightRecord({ date: d, count: "x" }, d, 1, 1).isBest).toBe(true);
  });
  it("ranks by count", () => {
    expect(nightRank(0)).toBe("불 끄고 퇴근");
    expect(nightRank(8)).not.toBe(nightRank(7));
  });
});

describe("night: unlock and ads", () => {
  it("opens after every campaign day", () => {
    expect(nightOpen({ cleared: NIGHT_UNLOCK - 1 })).toBe(false);
    expect(nightOpen({ cleared: NIGHT_UNLOCK })).toBe(true);
    expect(nightOpen(null)).toBe(false);
    expect(NIGHT_PAIN).toBe(3);
  });
  it("reuses the one-continue rule and no campaign day is quiet", () => {
    expect(continueOffer({ endedBad: true, bossMiss: false, used: false })).toBe(true);
    expect(continueOffer({ endedBad: true, bossMiss: false, used: true })).toBe(false);
    expect(quietDay(-1, false)).toBe(false);
  });
});

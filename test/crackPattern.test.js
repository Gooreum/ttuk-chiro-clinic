import { describe, it, expect } from "vitest";
import { crackPattern, CRACK_PATTERNS } from "../src/core/crackPattern.js";

// mulberry32: a small Lehmer seed would start every run near 0
const seeded = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0)/4294967296; };

describe("crackPattern", () => {
  it("same seed, same sound", () => {
    expect(crackPattern(seeded(7))).toEqual(crackPattern(seeded(7)));
  });
  it("varies: all three patterns over 30 seeds", () => {
    const names = new Set();
    for(let s = 1; s <= 30; s++) names.add(crackPattern(seeded(s*101)).name);
    expect([...names].sort()).toEqual([...CRACK_PATTERNS].sort());
  });
  it("a PERFECT is 우두둑, three hits or more", () => {
    for(let s = 1; s <= 30; s++){ const p = crackPattern(seeded(s), true); expect(p.name).toBe("우두둑"); expect(p.hits.length).toBeGreaterThanOrEqual(3); }
  });
  it("stays in the original pop's range: 45-95 ms apart, 900-2300 Hz, gain 0..1", () => {
    for(let s = 1; s <= 50; s++) crackPattern(seeded(s)).hits.forEach((h, i) => {
      if(i){ expect(h.dt).toBeGreaterThanOrEqual(0.045); expect(h.dt).toBeLessThanOrEqual(0.095); } else expect(h.dt).toBe(0);
      expect(h.freq).toBeGreaterThanOrEqual(900); expect(h.freq).toBeLessThanOrEqual(2300);
      expect(h.gain).toBeGreaterThan(0); expect(h.gain).toBeLessThanOrEqual(1);
    });
  });
});

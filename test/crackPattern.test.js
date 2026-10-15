import { describe, it, expect } from "vitest";
import { crackPattern, crunchPattern, CRACK_PATTERNS } from "../src/core/crackPattern.js";

// mulberry32: a small Lehmer seed would start every run near 0
const seeded = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0)/4294967296; };

describe("crackPattern", () => {
  it("same seed, same sound", () => {
    expect(crackPattern(seeded(7))).toEqual(crackPattern(seeded(7)));
  });
  it("varies: three or more patterns over 20 seeds, and the hits differ", () => {
    const names = new Set(), firsts = new Set();
    for(let s = 1; s <= 20; s++){ const p = crackPattern(seeded(s*101)); names.add(p.name); firsts.add(p.hits[0].freq.toFixed(1)); }
    expect(names.size).toBeGreaterThanOrEqual(3);
    expect(firsts.size).toBeGreaterThanOrEqual(15);
  });
  it("a PERFECT has three hits or more", () => {
    for(let s = 1; s <= 30; s++) expect(crackPattern(seeded(s), true).hits.length).toBeGreaterThanOrEqual(3);
  });
  it("hits are sane: gain 0..1, audible band, no negative gaps", () => {
    for(let s = 1; s <= 30; s++) for(const h of crackPattern(seeded(s)).hits){
      expect(h.gain).toBeGreaterThan(0); expect(h.gain).toBeLessThanOrEqual(1);
      expect(h.freq).toBeGreaterThan(500); expect(h.freq).toBeLessThan(4000);
      expect(h.dt).toBeGreaterThanOrEqual(0);
    }
    expect(CRACK_PATTERNS.length).toBe(4);
  });
});
describe("crunchPattern", () => {
  it("a break is a longer run than a crack and ends on a snap", () => {
    const a = crunchPattern(seeded(3), 1), b = crunchPattern(seeded(3), 2);
    expect(b.hits.length).toBeGreaterThan(a.hits.length);
    expect(b.hits.at(-1).gain).toBe(1);
  });
});

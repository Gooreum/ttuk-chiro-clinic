import { describe, it, expect } from "vitest";
import { TOWEL_FULL, towelTension, makeTowelTarget, towelDist, towelKind, stretchProfile, STRETCH_LEN,
  TOWEL_STAMP, TOWEL_TAG, towelTags, towelLine } from "../src/core/towel.js";
import { ROSTER } from "../src/patient/roster.js";

describe("towel tension", () => {
  it("reads the aim's vertical axis, clamped to 0..1", () => {
    expect([-5, 0, TOWEL_FULL/2, TOWEL_FULL, 40].map(towelTension)).toEqual([0, 0, 0.5, 1, 1]);
  });
});

describe("towel judging", () => {
  const tg = {mid: 0.6, half: 0.1, limit: 0.88};
  it("in the band is ok", () => {
    expect(towelKind(0.6, tg)).toBe("ok");
    expect(towelKind(0.69, tg)).toBe("ok");
    expect(towelDist(0.6, tg)).toBe(0);
  });
  it("past the limit goes over, too slack slips", () => {
    expect(towelKind(0.9, tg)).toBe("over");
    expect(towelKind(0.75, tg)).toBe("slip");
    expect(towelKind(0, tg)).toBe("slip");
  });
});

describe("makeTowelTarget", () => {
  it("bands fit 0..limit, elders lower, the nervous one narrower", () => {
    for(const r of [0, 0.999]){
      for(const p of ROSTER){
        const tg = makeTowelTarget(p, () => r);
        expect(tg.limit).toBeLessThanOrEqual(0.97);
        expect(tg.mid - tg.half).toBeGreaterThan(0);
        expect(tg.mid + tg.half).toBeLessThan(tg.limit);
      }
    }
    const elder = ROSTER.find(p => p.trait === "elder"), nervous = ROSTER.find(p => p.trait === "nervous"), plain = ROSTER.find(p => !p.trait);
    expect(makeTowelTarget(elder, () => 0.999).mid).toBeLessThan(makeTowelTarget(plain, () => 0).mid);
    expect(makeTowelTarget(nervous, () => 0.5).half).toBeLessThan(makeTowelTarget(plain, () => 0.5).half);
  });
});

describe("stretchProfile", () => {
  it("starts and ends at zero, peaks near the peak", () => {
    expect(stretchProfile(0, 0.09)).toBe(0);
    expect(stretchProfile(STRETCH_LEN, 0.09)).toBe(0);
    const v = Array.from({length: 160}, (_, i) => stretchProfile(i*STRETCH_LEN/160, 0.09));
    expect(Math.max(...v)).toBeGreaterThan(0.09*0.95);
    expect(Math.max(...v)).toBeLessThan(0.09*1.1);
    expect(Math.abs(stretchProfile(STRETCH_LEN - 0.02, 0.09))).toBeLessThan(0.005);
  });
});

describe("towel lines and chips", () => {
  it("every patient has ok / over / slip lines, kinds have a stamp and a chip", () => {
    ROSTER.forEach(p => ["ok", "over", "slip"].forEach(k => expect(towelLine(p.name, k).length).toBeGreaterThan(3)));
    expect(towelLine("누구", "ok").length).toBeGreaterThan(3);
    ["over", "slip"].forEach(k => { expect(TOWEL_STAMP[k].length).toBeGreaterThan(0); expect(TOWEL_TAG[k].length).toBeGreaterThan(0); });
  });
  it("chips count each kind in over / slip order", () => {
    expect(towelTags(["slip", "over", "slip"])).toEqual(["엿가락 ×1", "헛당김 ×2"]);
    expect(towelTags([])).toEqual([]);
    expect(towelTags(undefined)).toEqual([]);
  });
});

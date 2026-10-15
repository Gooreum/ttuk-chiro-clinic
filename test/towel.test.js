import { describe, it, expect } from "vitest";
import { TOWEL_FULL, towelTension, makeTowelTarget, towelDist, towelKind, stretchProfile, STRETCH_LEN, STRETCH_RISE, STRETCH_HOLD, stretchLen, fallProfile, FALL_HIT, OVER_HOLD, GETUP_AT, GETUP_LEN, spineOffsets, discStretch,
  TOWEL_STAMP, TOWEL_TAG, towelTags, towelLine, TOWEL_REVIEWS, towelReview } from "../src/core/towel.js";
import { ROSTER, REVIEWS } from "../src/patient/roster.js";

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
  it("starts and ends at zero, holds near the peak long enough to see", () => {
    expect(stretchProfile(0, 0.09)).toBe(0);
    expect(stretchProfile(STRETCH_LEN, 0.09)).toBe(0);
    expect(Math.abs(stretchProfile(STRETCH_LEN - 0.02, 0.09))).toBeLessThan(0.005);
    for(let t = STRETCH_RISE; t < STRETCH_HOLD; t += 0.05){
      const v = stretchProfile(t, 0.09);
      expect(v).toBeGreaterThan(0.09*0.94); expect(v).toBeLessThan(0.09*1.06);
    }
  });
});

describe("an over-pull's long hold and the therapist's fall", () => {
  it("a longer hold keeps the stretch up and still ends at zero", () => {
    expect(stretchProfile(OVER_HOLD - 0.05, 0.2, OVER_HOLD)).toBeGreaterThan(0.2*0.94);
    expect(stretchProfile(stretchLen(OVER_HOLD), 0.2, OVER_HOLD)).toBe(0);
    expect(stretchLen()).toBe(STRETCH_LEN);
  });
  it("tips over to the floor, stays down, gets back up", () => {
    expect(fallProfile(0)).toBe(0);
    expect(fallProfile(FALL_HIT - 0.01)).toBeGreaterThan(0.9);
    for(let t = FALL_HIT; t < GETUP_AT; t += 0.1){ expect(fallProfile(t)).toBeGreaterThan(0.9); expect(fallProfile(t)).toBeLessThanOrEqual(1); }
    expect(fallProfile(GETUP_AT + GETUP_LEN)).toBe(0);
    expect(fallProfile(GETUP_AT + GETUP_LEN + 1)).toBe(0);
  });
});

describe("the x-ray spine stretch", () => {
  it("C1 moves 7/8, C7 1/8, decreasing down the neck", () => {
    const o = spineOffsets(0.08);
    expect(o).toHaveLength(7);
    expect(o[0]).toBeCloseTo(0.07); expect(o[6]).toBeCloseTo(0.01);
    o.slice(1).forEach((v, i) => expect(v).toBeLessThan(o[i]));
  });
  it("a pulled disc gets taller and thinner", () => {
    expect(discStretch(0, 0.01)).toEqual({sy: 1, sxz: 1});
    const d = discStretch(0.01, 0.01);
    expect(d.sy).toBeCloseTo(2); expect(d.sxz).toBeCloseTo(1/Math.SQRT2);
  });
});

describe("towel lines and chips", () => {
  it("every patient has ok / over / slip lines, kinds have a stamp and a chip", () => {
    ROSTER.forEach(p => ["tense", "tight", "ok", "over", "slip"].forEach(k => expect(towelLine(p.name, k).length).toBeGreaterThan(3)));
    expect(towelLine("누구", "ok").length).toBeGreaterThan(3);
    ["over", "slip"].forEach(k => { expect(TOWEL_STAMP[k].length).toBeGreaterThan(0); expect(TOWEL_TAG[k].length).toBeGreaterThan(0); });
  });
  it("chips count each kind in over / slip order", () => {
    expect(towelTags(["slip", "over", "slip"])).toEqual(["엿가락 ×1", "헛당김 ×2"]);
    expect(towelTags([])).toEqual([]);
    expect(towelTags(undefined)).toEqual([]);
  });
});

describe("towelReview", () => {
  it("walked out: own line; a wrong tug: that kind's pool; clean: star reviews", () => {
    expect(towelReview({stars: 0, fails: ["slip"], lines: {quit: "원장 나오라 그래!"}})).toBe("원장 나오라 그래!");
    expect(TOWEL_REVIEWS.slip).toContain(towelReview({stars: 2, fails: ["over", "slip"]}, () => 0.5));
    expect(TOWEL_REVIEWS.over).toContain(towelReview({stars: 1, fails: ["over"]}, () => 0.5));
    expect(REVIEWS[3]).toContain(towelReview({stars: 3, fails: []}, () => 0));
  });
});

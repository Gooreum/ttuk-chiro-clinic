import { describe, it, expect } from "vitest";
import { TOWEL_FULL, towelTension, makeTowelTarget, towelDist, towelKind, stretchProfile, STRETCH_LEN, STRETCH_RISE, STRETCH_HOLD, stretchLen, fallProfile, letGoProfile, FALL_START, FALL_HIT, OVER_HOLD, GETUP_AT, GETUP_LEN, spineOffsets, discStretch, BODY_SHARE, neckWeight, neckPinch, NECK_OUT, PINCH, UPPER_SHARE, towelReaction, TOWEL_BURN, towelCool, aimOff, skewTier, towelEndsDay, AIM_TOL, AIM_SPREAD, OVER_SIREN, OVER_XRAY, OVER_XRAY_HOLD,
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
    expect(towelKind(0.75, tg)).toBe("taut");
    expect(towelKind(0, tg)).toBe("slip");
  });
  it("over the band but not past the limit cracks (taut)", () => {
    expect(towelKind(0.7, tg)).toBe("ok");
    expect(towelKind(0.71, tg)).toBe("taut");
    expect(towelKind(0.88, tg)).toBe("taut");
    expect(towelKind(0.89, tg)).toBe("over");
    expect(towelKind(0.75, tg, 40)).toBe("taut");
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
  it("moves the body only a little: the neck takes most of the pull", () => {
    expect(BODY_SHARE).toBeGreaterThan(0); expect(BODY_SHARE).toBeLessThanOrEqual(0.2);
  });
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
    ROSTER.forEach(p => ["tense", "tight", "ok", "over", "slip", "skew", "taut"].forEach(k => expect(towelLine(p.name, k).length).toBeGreaterThan(3)));
    expect(towelLine("누구", "ok").length).toBeGreaterThan(3);
    ["over", "slip", "skew", "taut"].forEach(k => { expect(TOWEL_STAMP[k].length).toBeGreaterThan(0); expect(TOWEL_TAG[k].length).toBeGreaterThan(0); });
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

describe("letGoProfile", () => {
  it("lets go of the towel at once as he tips, holds off while down, takes it again as he gets up", () => {
    expect(letGoProfile(0)).toBe(0);
    expect(letGoProfile(FALL_START)).toBe(0);
    expect(letGoProfile(0.25)).toBe(1);
    expect(letGoProfile(3)).toBe(1);
    expect(letGoProfile(GETUP_AT + GETUP_LEN)).toBe(0);
    expect(letGoProfile(10)).toBe(0);
    let prev = 0;
    for(let t = 0; t < GETUP_AT; t += 0.01){ const v = letGoProfile(t); expect(v).toBeGreaterThanOrEqual(prev - 1e-9); prev = v; }
    for(let t = GETUP_AT; t < GETUP_AT + GETUP_LEN; t += 0.01){ const v = letGoProfile(t); expect(v).toBeLessThanOrEqual(prev + 1e-9); prev = v; }
  });
});

describe("towelReaction: who feels what after a good tug", () => {
  it("young and thin: relief within a second, no swearing", () => {
    const r = towelReaction("이라이더", 0);
    expect(r.extra).toBe(0);
    expect(r.steps[0][0]).toBeLessThan(1000); expect(r.steps[0][2]).toBe(towelCool("이라이더"));
    expect(r.steps.some(s => TOWEL_BURN.includes(s[2]))).toBe(false);
  });
  it("old or heavy: a long run of swearing, then slowly the relief", () => {
    const r = towelReaction("김사장", 3.6);
    expect(r.extra).toBe(3600);
    const swear = r.steps.filter(s => TOWEL_BURN.includes(s[2]));
    expect(swear.length).toBeGreaterThanOrEqual(3);
    const cool = r.steps.find(s => s[2] === towelCool("김사장"));
    expect(cool[0]).toBeGreaterThanOrEqual(3600);
    expect(cool[0]).toBeGreaterThan(Math.max(...swear.map(s => s[0])));
    r.steps.forEach((s, i) => { if(i) expect(s[0]).toBeGreaterThan(r.steps[i - 1][0]); });
  });
  it("the roster: the thin young ones feel it at once, the oldest and heaviest swears longest", () => {
    const b = Object.fromEntries(ROSTER.map(p => [p.name, p.burn]));
    expect(b["이라이더"]).toBe(0); expect(b["정작가"]).toBe(0);
    expect(Math.max(...Object.values(b))).toBe(b["김사장"]);
    expect(b["박대리"]).toBeGreaterThan(0);
  });
});

describe("neckWeight: only the thin neck column follows the head", () => {
  const R0 = 0.1;
  it("the seam ring goes with the head, the column's base and below stay", () => {
    expect(neckWeight(0, R0, R0)).toBe(1);
    expect(neckWeight(1, R0, R0)).toBe(0);
    expect(neckWeight(1.4, 0.5*R0, R0)).toBe(0);
  });
  it("the stretch spreads along the column", () => {
    expect(neckWeight(0.5, R0, R0)).toBeCloseTo(0.53, 2);
    expect(neckWeight(0.04, R0, R0)).toBe(1);
    expect(neckWeight(0.25, R0, R0)).toBeGreaterThan(neckWeight(0.75, R0, R0));
  });
  it("the trapezius slope and the shoulders never follow, even right under the seam", () => {
    expect(neckWeight(0, NECK_OUT*R0, R0)).toBe(0);
    expect(neckWeight(0.2, 2*R0, R0)).toBe(0);
    expect(neckWeight(0.2, 1.35*R0, R0)).toBeLessThan(neckWeight(0.2, R0, R0));
  });
  it("the column thins with the stretch, capped", () => {
    expect(neckPinch(0)).toBe(0);
    expect(neckPinch(0.06)).toBeGreaterThan(0.15); expect(neckPinch(0.06)).toBeLessThan(PINCH);
    expect(neckPinch(0.14)).toBeGreaterThan(neckPinch(0.06));
    expect(neckPinch(1)).toBe(PINCH);
  });
  it("the upper neck on the head takes a share of the stretch, the lower column the rest", () => {
    expect(UPPER_SHARE).toBeGreaterThan(0.2); expect(UPPER_SHARE).toBeLessThan(0.5);
  });
});

describe("the left / right focus", () => {
  const tg = {mid: 0.6, half: 0.1, limit: 0.88, aim: 4, aimTol: 7};
  it("on centre and in the band is ok, off centre is a skew", () => {
    expect(towelKind(0.6, tg, 4)).toBe("ok");
    expect(towelKind(0.6, tg, 10.9)).toBe("ok");
    expect(towelKind(0.6, tg, 11.5)).toBe("skew");
    expect(towelKind(0.6, tg, -3.5)).toBe("skew");
  });
  it("tension faults come first: over and slip win over a skew", () => {
    expect(towelKind(0.95, tg, 40)).toBe("over");
    expect(towelKind(0.2, tg, 40)).toBe("slip");
  });
  it("without a rot only the tension is judged (the old call)", () => {
    expect(towelKind(0.6, tg)).toBe("ok");
    expect(towelKind(0.6, {mid: 0.6, half: 0.1, limit: 0.88})).toBe("ok");
  });
  it("aimOff in tolerances, skewTier 1 up to twice the tolerance, then 2", () => {
    expect(aimOff(11, tg)).toBeCloseTo(1);
    expect(aimOff(-3, {mid: 0, half: 1, limit: 1})).toBeCloseTo(-3/AIM_TOL);
    expect(skewTier(4 + 7*1.5, tg)).toBe(1);
    expect(skewTier(4 - 7*2.5, tg)).toBe(2);
  });
  it("an over-pull, a crack and a break end the day (same as a clinic crack); only a slip is a retry", () => {
    expect(towelEndsDay("over", 0)).toBe(true);
    expect(towelEndsDay("skew", 2)).toBe(true);
    expect(towelEndsDay("skew", 1)).toBe(true);
    expect(towelEndsDay("taut", 1)).toBe(true);
    expect(towelEndsDay("slip", 0)).toBe(false);
  });
  it("each patient's centre lies within the spread, the nervous one narrower, tension draws unchanged", () => {
    for(const r of [0, 0.5, 0.999]){
      for(const p of ROSTER){
        const tg2 = makeTowelTarget(p, () => r);
        expect(Math.abs(tg2.aim)).toBeLessThanOrEqual(AIM_SPREAD);
        expect(tg2.aimTol).toBeGreaterThan(0);
      }
    }
    const nervous = ROSTER.find(p => p.trait === "nervous"), plain = ROSTER.find(p => !p.trait);
    expect(makeTowelTarget(nervous, () => 0.5).aimTol).toBeLessThan(makeTowelTarget(plain, () => 0.5).aimTol);
    const seq = [0.3, 0.9], it2 = (a => () => a.shift())([...seq]);
    expect(makeTowelTarget(plain, it2).mid).toBeCloseTo(0.5 + 0.18*0.3);
  });
});

describe("an over-pull ends on an ambulance", () => {
  it("with getup = Infinity the therapist stays down and the fists stay off the towel", () => {
    for(const t of [GETUP_AT + 0.1, GETUP_AT + GETUP_LEN + 1, 9]){
      expect(fallProfile(t, Infinity)).toBeGreaterThan(0.9);
      expect(letGoProfile(t, Infinity)).toBe(1);
    }
    expect(fallProfile(9)).toBe(0);
  });
  it("the siren comes after the x-ray has closed", () => {
    expect(OVER_SIREN).toBeGreaterThan(OVER_XRAY + OVER_XRAY_HOLD);
  });
  it("skew has a stamp, a chip, lines and reviews", () => {
    expect(TOWEL_STAMP.skew).toBeTruthy();
    expect(towelTags(["skew", "skew"])).toEqual(["삐끗 ×2"]);
    for(const p of ROSTER) expect(towelLine(p.name, "skew")).toBeTruthy();
    expect(towelReview({stars: 2, fails: ["skew"]}, () => 0)).toBe(TOWEL_REVIEWS.skew[0]);
  });
});

import { describe, it, expect } from "vitest";
import { failKind, failLine, boingProfile, BOING_LEN, flinchProfile, FLINCH_LEN, FAIL_REVIEWS, reviewLine, FAIL_STAMP, FAIL_TAG, failTags, forceTier, FAIL_AMP, FORCE_AMP, FORCE_STAMP, FORCE_LINES, FORCE_TAG, FORCE_REVIEWS } from "../src/core/fail.js";
import { REVIEWS, ROSTER } from "../src/patient/roster.js";
import { eyesOpen, isBaseFace, FACE_NAMES } from "../src/core/faceRig.js";

describe("failKind", () => {
  it("past the danger limit wins over the distance", () => {
    expect(failKind(true, 0.5)).toBe("over");
    expect(failKind(true, 9)).toBe("over");
  });
  it("just off is a dud, way off cracks the therapist's knuckle", () => {
    expect(failKind(false, 1.2)).toBe("dud");
    expect(failKind(false, 1.99)).toBe("dud");
    expect(failKind(false, 2)).toBe("finger");
  });
});

describe("failLine", () => {
  const lines = {fail: ["a", "b", "c"]};
  it("gets sharper with each wrong crack, the last repeats", () => {
    expect([1, 2, 3, 4].map(n => failLine(lines, n))).toEqual(["a", "b", "c", "c"]);
  });
  it("is empty without lines", () => {
    expect(failLine({}, 1)).toBe("");
    expect(failLine(undefined, 1)).toBe("");
  });
});

describe("gag motion", () => {
  it("boing starts and ends at zero, swings both ways in between", () => {
    expect(boingProfile(0)).toBe(0);
    expect(boingProfile(BOING_LEN)).toBe(0);
    const v = Array.from({length: 50}, (_, i) => boingProfile(i*BOING_LEN/50));
    expect(Math.min(...v)).toBeLessThan(-3);
    expect(Math.max(...v)).toBeGreaterThan(1);
    expect(Math.abs(boingProfile(BOING_LEN - 0.02))).toBeLessThan(0.3);
  });
  it("flinch: the hand jumps off, shakes, comes back", () => {
    expect(flinchProfile(0)).toEqual({away: 0, shake: 0});
    expect(flinchProfile(FLINCH_LEN)).toEqual({away: 0, shake: 0});
    expect(flinchProfile(0.3).away).toBe(1);
    const sh = Array.from({length: 50}, (_, i) => flinchProfile(0.15 + i*0.011).shake);
    expect(Math.max(...sh)).toBeGreaterThan(0.2);
    expect(Math.min(...sh)).toBeLessThan(-0.2);
    expect(flinchProfile(FLINCH_LEN - 0.01).away).toBeLessThan(0.01);
  });
});

describe("reviewLine", () => {
  const lines = {quit: "원장 나오라 그래!"};
  it("a patient who walked out says their own line", () => {
    expect(reviewLine({stars: 0, fails: ["over"], lines})).toBe("원장 나오라 그래!");
  });
  it("taken off in an ambulance: the crack / break review, not the walk-out line", () => {
    expect(FORCE_REVIEWS[2]).toContain(reviewLine({stars: 0, ambulance: true, fails: ["finger"], tiers: [2], lines}, () => 0.5));
  });
  it("wrong cracks: a review about the last kind", () => {
    ["dud", "finger", "over"].forEach(k => {
      expect(FAIL_REVIEWS[k]).toContain(reviewLine({stars: 2, fails: ["dud", k], lines}, () => 0.5));
    });
  });
  it("clean: the usual star reviews", () => {
    [1, 2, 3].forEach(s => expect(REVIEWS[s]).toContain(reviewLine({stars: s, fails: [], lines}, () => 0.999)));
    expect(REVIEWS[3]).toContain(reviewLine({stars: 3}, () => 0));
  });
});

describe("fail lines and face", () => {
  it("every patient has the wrong-crack lines", () => {
    ROSTER.forEach(p => {
      ["dud", "finger", "stop", "doubt", "quit", "ouch"].forEach(k => expect(typeof p.lines[k] === "string" && p.lines[k].length > 1).toBe(true));
      expect(p.lines.fail).toHaveLength(3);
    });
  });
  it("doubt: eyes open (they blink), not a base face the nervous override replaces", () => {
    expect(FACE_NAMES).toContain("doubt");
    expect(eyesOpen("doubt")).toBe(true);
    expect(isBaseFace("doubt")).toBe(false);
  });
});

describe("fail stamp and day log chips", () => {
  it("every kind has a stamp word and a chip name", () => {
    for(const k of ["over", "dud", "finger"]){
      expect(typeof FAIL_STAMP[k]).toBe("string"); expect(FAIL_STAMP[k].length).toBeGreaterThan(0);
      expect(typeof FAIL_TAG[k]).toBe("string"); expect(FAIL_TAG[k].length).toBeGreaterThan(0);
    }
  });
  it("chips count each kind in over / dud / finger order", () => {
    expect(failTags([])).toEqual([]);
    expect(failTags(undefined)).toEqual([]);
    expect(failTags(["dud", "over", "dud"])).toEqual(["뾰잉 ×1", "삑사리 ×2"]);
    expect(failTags(["finger"])).toEqual(["손가락 ×1"]);
  });
  it("the boing is big enough to read but bounded", () => {
    const m = Math.max(...Array.from({length: 200}, (_, i) => Math.abs(boingProfile(i*BOING_LEN/200))));
    expect(m).toBeGreaterThan(8);
    expect(m).toBeLessThanOrEqual(20);
  });
});

describe("how hard the wrong crack was", () => {
  it("tiers at 2.5 and 4.0 (the flick's peak, input/motion.js)", () => {
    expect([0, 2.49, 2.5, 3.99, 4.0, 8].map(forceTier)).toEqual([0, 0, 1, 1, 2, 2]);
  });
  it("every hard tier has a stamp, lines, a chip and reviews", () => {
    for(const t of [1, 2]){
      expect(FORCE_STAMP[t].length).toBeGreaterThan(0);
      expect(FORCE_TAG[t].length).toBeGreaterThan(0);
      expect(FORCE_LINES[t].length).toBeGreaterThan(0);
      expect(FORCE_REVIEWS[t].length).toBeGreaterThan(0);
    }
  });
  it("chips add cracks and breaks after the kinds", () => {
    expect(failTags(["dud"], [0, 2])).toEqual(["삑사리 ×1", "골절 ×1"]);
    expect(failTags(["finger", "finger"], [0, 2])).toEqual(["손가락 ×1", "골절 ×1"]);
    expect(failTags(["over", "finger"], [1, 1])).toEqual(["금 ×2"]);
    expect(failTags(["dud"])).toEqual(["삑사리 ×1"]);
  });
  it("reviews: walked out > the last break / crack > the last kind", () => {
    const lines = {quit: "산재 신청하러 갑니다"};
    expect(reviewLine({stars: 0, fails: ["dud"], tiers: [2], lines})).toBe("산재 신청하러 갑니다");
    expect(FORCE_REVIEWS[2]).toContain(reviewLine({stars: 2, fails: ["dud", "over"], tiers: [1, 2, 0], lines}));
    expect(FAIL_REVIEWS.over).toContain(reviewLine({stars: 2, fails: ["dud", "over"], tiers: [0, 0], lines}));
  });
});

describe("the neck is wrenched on a wrong crack", () => {
  it("by kind: way off and past the limit swing hard, a dud only part way", () => {
    expect(FAIL_AMP.finger).toBeGreaterThan(1);
    expect(FAIL_AMP.over).toBeGreaterThanOrEqual(1);
    expect(FAIL_AMP.dud).toBeLessThan(1);
  });
  it("hard ones further still", () => {
    expect(FORCE_AMP[2]).toBeGreaterThan(FORCE_AMP[1]);
    expect(FORCE_AMP[1]).toBeGreaterThan(FAIL_AMP.finger);
  });
});

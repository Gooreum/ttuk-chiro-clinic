import { describe, it, expect } from "vitest";
import { failKind, failLine, boingProfile, BOING_LEN, flinchProfile, FLINCH_LEN, FAIL_REVIEWS, reviewLine } from "../src/core/fail.js";
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

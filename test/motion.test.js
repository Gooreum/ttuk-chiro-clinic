import { describe, it, expect } from "vitest";
import { classifySample, aimBefore, aimDelta, orientationSign, voteSign, signFromVotes } from "../src/core/motion.js";

const base = {m: 0, lin: 0, playing: true, now: 5000, flickCool: 0, flick: 200, jerk: 10};
const c = o => classifySample({...base, ...o});

describe("classifySample", () => {
  it("snaps on a fast flick or a jerk", () => {
    expect(c({m: 201})).toBe("snap");
    expect(c({lin: 10.5})).toBe("snap");
  });
  it("uses calm samples", () => {
    expect(c({m: 100, lin: 1.0})).toBe("use");
    expect(c({m: 130, lin: 1.6})).toBe("use");
  });
  it("discards shaky samples (lin > 1.6 or rate > flick*0.65)", () => {
    expect(c({lin: 1.61})).toBe("discard");
    expect(c({m: 131})).toBe("discard");
  });
  it("never snaps on cooldown or outside play, but still discards", () => {
    expect(c({m: 400, flickCool: 5900})).toBe("discard");
    expect(c({m: 400, playing: false})).toBe("discard");
    expect(c({m: 200})).toBe("discard");
  });
});

describe("aimBefore", () => {
  const hist = Array.from({length: 49}, (_, i) => ({t: 4200 + i*16.6, rot: i, bend: -i}));
  it("returns the latest record at or before now-250", () => {
    const now = hist[hist.length - 1].t, want = now - 250;
    const got = aimBefore(hist, want, null);
    expect(got.t).toBeLessThanOrEqual(want);
    expect(hist[hist.indexOf(got) + 1].t).toBeGreaterThan(want);
  });
  it("falls back to the oldest record, then to the given fallback", () => {
    expect(aimBefore(hist, 0, null)).toBe(hist[0]);
    const fb = {rot: 1, bend: 2};
    expect(aimBefore([], 100, fb)).toBe(fb);
  });
});

describe("aimDelta", () => {
  it("tilting left (lr goes up) turns the head left (rot goes down)", () => {
    expect(aimDelta(14, 0, 1.5, 1).dr).toBeCloseTo(-21, 10);
    expect(aimDelta(-14, 0, 1.5, 1).dr).toBeCloseTo(21, 10);
  });
  it("up/down keeps the prototype direction (-dpt)", () => {
    expect(aimDelta(0, 10, 1.5, 1).db).toBeCloseTo(-15, 10);
  });
  it("up/down is scaled by the bend multiplier", () => {
    expect(aimDelta(0, 10, 1.5, 2).db).toBeCloseTo(-30, 10);
  });
});

describe("orientationSign (gSign from the pose, any posture)", () => {
  it("spec platform: face up z>0 -> +1, face down z<0 -> +1", () => {
    expect(orientationSign(9.8, 0, 0)).toBe(1);
    expect(orientationSign(-9.8, 180, 0)).toBe(1);
    expect(orientationSign(6.9, 45, 0)).toBe(1);
  });
  it("inverted platform (iOS): face up z<0 -> -1, face down z>0 -> -1", () => {
    expect(orientationSign(-9.8, 0, 0)).toBe(-1);
    expect(orientationSign(9.8, 180, 0)).toBe(-1);
    expect(orientationSign(-6.9, 0, 45)).toBe(-1);
  });
  it("can't tell when the phone is near upright or z is small", () => {
    expect(orientationSign(1.5, 85, 0)).toBe(0);
    expect(orientationSign(2.0, 0, 0)).toBe(0);
  });
});

describe("sign votes", () => {
  it("needs 5 agreeing samples and clamps at ±20", () => {
    let v = 0;
    for(let i = 0; i < 4; i++) v = voteSign(v, -1);
    expect(signFromVotes(v)).toBe(0);
    v = voteSign(v, -1);
    expect(signFromVotes(v)).toBe(-1);
    for(let i = 0; i < 40; i++) v = voteSign(v, -1);
    expect(v).toBe(-20);
    for(let i = 0; i < 25; i++) v = voteSign(v, 1);
    expect(signFromVotes(v)).toBe(1);
  });
});

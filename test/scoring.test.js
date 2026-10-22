import { describe, it, expect } from "vitest";
import { scoreSuccess, rankTitle, patientStars, crackAvg, comboOf, comboAvg, COMBO_CAP, mixedCracks } from "../src/core/scoring.js";

describe("scoreSuccess", () => {
  it("base is 100 - 40d, PERFECT below 0.35", () => {
    const a = scoreSuccess(0.34, false, 0, 0), b = scoreSuccess(0.35, false, 0, 0);
    expect(a.perfect).toBe(true);
    expect(b.perfect).toBe(false);
    expect(a.base).toBe(86);
    expect(scoreSuccess(1, false, 0, 0).base).toBe(60);
  });
  it("adds 15 on the exhale", () => {
    expect(scoreSuccess(0.5, true, 0, 0).pts - scoreSuccess(0.5, false, 0, 0).pts).toBe(15);
  });
  it("streak bonus is (streak-1)*10 on first-try successes", () => {
    const r = scoreSuccess(0.5, false, 2, 0);
    expect(r.streak).toBe(3);
    expect(r.comboBonus).toBe(20);
    expect(r.pts).toBe(80 + 20);
    expect(scoreSuccess(0.5, false, 0, 0).comboBonus).toBe(0);
  });
  it("caps the streak bonus at COMBO_CAP", () => {
    expect(COMBO_CAP).toBe(20);
    expect([1, 2, 3, 4, 9].map(comboOf)).toEqual([0, 10, 20, 20, 20]);
    const r = scoreSuccess(0.5, false, 8, 0);
    expect(r.comboBonus).toBe(20);
    expect(r.pts).toBe(80 + 20);
  });
  it("averages a clean run's bonus by crack count", () => {
    expect(comboAvg(2)).toBe(5);
    expect(comboAvg(3)).toBe(10);
    expect(comboAvg(6)).toBe(15);
    expect(comboAvg(10)).toBe(17);   // bounded: a long day no longer adds 40+ points
  });
  it("a success after pain resets the streak", () => {
    const r = scoreSuccess(0.2, false, 4, 1);
    expect(r.streak).toBe(0);
    expect(r.comboBonus).toBe(0);
  });
  it("stars: perfect first try 3, pain <= 1 gives 2, otherwise 1", () => {
    expect(scoreSuccess(0.2, false, 0, 0).stars).toBe(3);
    expect(scoreSuccess(0.5, false, 0, 0).stars).toBe(2);
    expect(scoreSuccess(0.2, false, 0, 1).stars).toBe(2);
    expect(scoreSuccess(0.2, false, 0, 2).stars).toBe(1);
  });
});

describe("rankTitle", () => {
  it("maps average score to a title", () => {
    expect(rankTitle(115, 0)).toBe("손끝의 명의");
    expect(rankTitle(114.9, 0)).toBe("예약 꽉 찬 원장님");
    expect(rankTitle(98, 2)).toBe("예약 꽉 찬 원장님");
    expect(rankTitle(82, 0)).toBe("동네 인기 원장님");
    expect(rankTitle(81.9, 0)).toBe("열정 넘치는 수련의");
  });
  it("three pains override the average", () => {
    expect(rankTitle(200, 3)).toBe("면허 재시험 대상");
  });
});

describe("both-side helpers", () => {
  it("patient stars are the weaker side", () => {
    expect(patientStars([3, 2])).toBe(2);
    expect(patientStars([3, 3])).toBe(3);
    expect(patientStars([1, 3])).toBe(1);
  });
  it("rank average is per crack (two per patient)", () => {
    expect(crackAvg(1000, 5)).toBe(100);
  });
});

describe("mixedCracks", () => {
  it("counts 2 cracks per 목꺾기 patient and 1 per 목뽑기 patient", () => {
    expect(mixedCracks(["clinic", "towel", "clinic"])).toBe(5);
    expect(mixedCracks([])).toBe(0);
  });
});

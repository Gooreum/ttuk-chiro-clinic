import { describe, it, expect } from "vitest";
import { scoreSuccess, rankTitle } from "../src/core/scoring.js";

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

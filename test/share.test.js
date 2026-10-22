import { describe, it, expect } from "vitest";
import { dayShareText, nightShareText, rushShareText, withLink, leaderboardScore, SHARE_URL, TOSS_PATH } from "../src/core/share.js";

describe("share text", () => {
  it("day: label, title, rounded average and ambulance count", () => {
    const t = dayShareText({ label: "3장 7일차", title: "근육왕 헬스장 대결", avg: 97.4, ambulances: 0 });
    expect(t).toContain("3장 7일차 근육왕 헬스장 대결 평균 97점, 구급차 0번");
    expect(t.split("\n")).toHaveLength(2);
  });
  it("day: 역경 is named", () => {
    expect(dayShareText({ label: "1장 1일차", title: "첫 손님", avg: 100, hard: true })).toContain("1장 1일차 역경 첫 손님");
  });
  it("the joke is stable for the same result", () => {
    const a = { label: "a", title: "b", avg: 90 };
    expect(dayShareText(a)).toBe(dayShareText(a));
  });
  it("night and rush carry their numbers", () => {
    expect(nightShareText({ count: 12, score: 1234.6, ambulances: 1 })).toContain("심야 진료 12명, 1235점, 구급차 1번");
    expect(rushShareText({ cleared: 4, total: 6, reached: 5 })).toContain("6명 중 4명 격파(5명까지 도달), 구급차 0번");
  });
  it("bad numbers do not print NaN", () => {
    expect(nightShareText({ count: NaN, score: undefined })).not.toMatch(/NaN|undefined/);
    expect(rushShareText({ cleared: 2, total: 6, reached: 0 })).toContain("2명까지 도달");
  });
  it("link goes on its own last line", () => {
    expect(withLink("x").split("\n").pop()).toBe(SHARE_URL);
    expect(withLink("x", "intoss-link")).toBe("x\nintoss-link");
    expect(TOSS_PATH.startsWith("intoss://")).toBe(true);
  });
});

describe("leaderboardScore", () => {
  it("only 심야 진료 submits, as a float string", () => {
    expect(leaderboardScore("night", { count: 7 })).toBe("7");
    expect(leaderboardScore("rush", { count: 7 })).toBeNull();
    expect(leaderboardScore("day", { count: 7 })).toBeNull();
  });
  it("zero or invalid counts submit nothing", () => {
    expect(leaderboardScore("night", { count: 0 })).toBeNull();
    expect(leaderboardScore("night", { count: NaN })).toBeNull();
    expect(leaderboardScore("night")).toBeNull();
  });
});

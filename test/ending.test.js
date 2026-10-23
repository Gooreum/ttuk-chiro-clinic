import { describe, it, expect } from "vitest";
import { DAYS, readProgress, afterDay, afterHard } from "../src/core/campaign.js";
import { markInterludeSeen } from "../src/core/interlude.js";
import { afterQuest, QUESTS } from "../src/core/quests.js";

/* 엔딩 다시 보기 (2026-10-23 audit): the ending's seen flag rides in chiroCampaign; old saves have none and still load */
describe("ending seen flag", () => {
  const all = { cleared: DAYS.length, stars: DAYS.map(() => 2), hard: DAYS.map(() => 0) };
  it("old saves load without it, and the flag survives a read", () => {
    expect(readProgress(all).endingSeen).toBeUndefined();
    expect(readProgress(all).cleared).toBe(DAYS.length);
    expect(readProgress({ ...all, endingSeen: true }).endingSeen).toBe(true);
    expect(readProgress({ ...all, endingSeen: "yes" }).endingSeen).toBeUndefined();
    expect(readProgress(null).endingSeen).toBeUndefined();
  });
  it("every later write keeps it (day, 역경, 막간, 의뢰)", () => {
    const p = readProgress({ ...all, endingSeen: true });
    expect(afterDay(p, 3, true, 3).endingSeen).toBe(true);
    expect(afterHard(afterDay(p, 3, true, 3), 3, true, 2).endingSeen).toBe(true);
    expect(markInterludeSeen(p, 4).endingSeen).toBe(true);
    expect(afterQuest(p, QUESTS[0], true, 2).endingSeen).toBe(true);
    expect(readProgress(JSON.parse(JSON.stringify(afterDay(p, 3, true, 3)))).endingSeen).toBe(true);
  });
});

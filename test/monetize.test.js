import { describe, it, expect } from "vitest";
import { continueOffer, bossMissed, BOSS_RETRY_GAP, interstitialDue, ownsSku, INTERSTITIAL_GAP_MS, painAdOffer, clearAdDue, quietDay, ONBOARD_DAYS } from "../src/core/monetize.js";

describe("monetize", () => {
  it("offers one continue after a bad end", () => {
    expect(continueOffer({ endedBad: true, used: false })).toBe(true);
    expect(continueOffer({ endedBad: true, used: true })).toBe(false);
    expect(continueOffer({ endedBad: false, used: false })).toBe(false);
    expect(continueOffer({ bossMiss: true, used: false })).toBe(true);   // a boss day under its beat: replay the last patient
    expect(continueOffer({ bossMiss: true, used: true })).toBe(false);
  });
  it("calls a boss miss only for a finished boss day under its beat", () => {
    expect(bossMissed(100, true, 99)).toBe(true);
    expect(bossMissed(100, true, 100)).toBe(false);
    expect(bossMissed(100, false, 50)).toBe(false);   // not finished: the normal continue covers it
    expect(bossMissed(undefined, true, 10)).toBe(false);
    expect(bossMissed(100, true, 100 - BOSS_RETRY_GAP)).toBe(true);
    expect(bossMissed(100, true, 100 - BOSS_RETRY_GAP - 1)).toBe(false);   // far off: start the day over
  });
  it("does not sell a boss retry that a perfect replay cannot win", () => {
    // 6 cracks, avg 100 of beat 105: a perfect last patient (2 cracks, 115 + combo 5 avg) from 0 pts gains (2*120)/6 = 40
    expect(bossMissed(105, true, 100, { cracks: 6, lastCracks: 2, lastPts: 100 })).toBe(true);
    expect(bossMissed(105, true, 100, { cracks: 6, lastCracks: 2, lastPts: 240 })).toBe(false);   // already near the max
    expect(bossMissed(105, true, 100, { cracks: 3, lastCracks: 1, lastPts: 115 })).toBe(false);   // gain 0
    expect(bossMissed(105, true, 100)).toBe(true);   // no data: the gap rule only
  });
  it("shows the clear-card interstitial on every second clear only", () => {
    expect([1, 2, 3, 4].map(clearAdDue)).toEqual([false, true, false, true]);
  });
  it("offers the pain +1 ad on plain days with 2 or fewer pain slots, once", () => {
    expect(painAdOffer({ painMax: 1, hard: false, used: false })).toBe(true);
    expect(painAdOffer({ painMax: 2, hard: false, used: false })).toBe(true);
    expect(painAdOffer({ painMax: 3, hard: false, used: false })).toBe(false);
    expect(painAdOffer({ painMax: 2, hard: true, used: false })).toBe(false);   // 역경: no ad undoes the difficulty
    expect(painAdOffer({ painMax: 2, hard: false, used: true })).toBe(false);
  });
  it("spaces interstitials and skips them when ad-free", () => {
    expect(interstitialDue(0, INTERSTITIAL_GAP_MS - 1, false)).toBe(false);
    expect(interstitialDue(0, INTERSTITIAL_GAP_MS, false)).toBe(true);
    expect(interstitialDue(0, INTERSTITIAL_GAP_MS * 5, true)).toBe(false);
  });
  it("reads ownership from orders without revoking on an empty list", () => {
    const sku = "ad_free";
    expect(ownsSku([], sku)).toBe(null);
    expect(ownsSku(undefined, sku)).toBe(null);
    expect(ownsSku([{ orderId: "1", sku: "other", status: "COMPLETED" }], sku)).toBe(null);
    expect(ownsSku([{ orderId: "1", sku, status: "COMPLETED" }], sku)).toBe(true);
    expect(ownsSku([{ orderId: "1", sku, status: "REFUNDED" }], sku)).toBe(false);
    expect(ownsSku([{ orderId: "1", sku, status: "REFUNDED" }, { orderId: "2", sku, status: "COMPLETED" }], sku)).toBe(true);
  });
  // 35차: AGENTS.md 4절 광고 위치 서술을 코드 값으로 못 박는다
  it("keeps the interstitial rules from AGENTS.md", () => {
    expect(INTERSTITIAL_GAP_MS).toBe(4 * 60 * 1000);
    expect(ONBOARD_DAYS).toBe(3);
    expect([0, 1, 2].map(d => quietDay(d, false))).toEqual([true, true, true]);   // 첫 3일
    expect(quietDay(3, false)).toBe(false);
    expect(quietDay(27, true)).toBe(true);                                         // 보스 날
    expect(quietDay(-1, false)).toBe(false);                                       // 자유 진료·의뢰·계절은 그대로
    expect(quietDay(-1, true)).toBe(false);
  });
  it("never offers a continue to 역경 and never lets a used one come back", () => {
    expect(painAdOffer({ painMax: 1, hard: true, used: false })).toBe(false);
    expect(continueOffer({ endedBad: true, bossMiss: true, used: true })).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { continueOffer, bossMissed, BOSS_RETRY_GAP, interstitialDue, ownsSku, INTERSTITIAL_GAP_MS } from "../src/core/monetize.js";

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
});

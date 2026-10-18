import { describe, it, expect } from "vitest";
import { continueOffer, interstitialDue, ownsSku, INTERSTITIAL_GAP_MS } from "../src/core/monetize.js";

describe("monetize", () => {
  it("offers one continue after a bad end", () => {
    expect(continueOffer({ endedBad: true, used: false })).toBe(true);
    expect(continueOffer({ endedBad: true, used: true })).toBe(false);
    expect(continueOffer({ endedBad: false, used: false })).toBe(false);
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

import { describe, it, expect } from "vitest";
import { PRODUCTS, KEYS, storeId, keyFromStoreId, keyFromTossSku, readLedger, seen, record, LEDGER_MAX } from "../src/core/iap.js";

describe("iap catalog", () => {
  it("store ids and toss skus map back to keys", () => {
    KEYS.forEach(k => { expect(keyFromStoreId(storeId(k))).toBe(k); expect(keyFromTossSku(PRODUCTS[k].toss)).toBe(k); });
    expect(storeId("adfree")).toBe("com.gooreum.ttukchiro.adfree");
    expect(keyFromStoreId("x")).toBe(null);
  });
  it("only the ad-free product is non-consumable; packs give coins", () => {
    expect(PRODUCTS.adfree.kind).toBe("nonconsumable");
    expect(PRODUCTS.coins_s.coins).toBeGreaterThan(0);
    expect(PRODUCTS.coins_m.coins / PRODUCTS.coins_m.krw).toBeGreaterThan(PRODUCTS.coins_s.coins / PRODUCTS.coins_s.krw);
  });
  it("ledger dedups orders and stays bounded", () => {
    let l = readLedger(null);
    expect(seen(l, "a")).toBe(false);
    l = record(l, "a"); expect(seen(l, "a")).toBe(true);
    for(let i = 0; i < LEDGER_MAX + 20; i++) l = record(l, "o" + i);
    expect(l.length).toBe(LEDGER_MAX); expect(seen(l, "a")).toBe(false);
    expect(readLedger([1, "x", null])).toEqual(["x"]);
  });
});

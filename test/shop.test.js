import { describe, it, expect } from "vitest";
import { ITEMS, PROPS, COUPON_MAX, RUN_COIN_CAP, TOTAL_PROP_COST, readShop, coinsFor, doubleOffer, add, buy, spend, count, owns } from "../src/core/shop.js";

describe("진료비 규칙", () => {
  it("완주한 판은 평균의 90%쯤, 못 끝낸 판은 절반", () => {
    expect(coinsFor({ avg: 100, complete: true })).toBe(90);
    expect(coinsFor({ avg: 100, complete: false })).toBe(45);
  });
  it("클리어 +15, 역경 x1.3, 한 판 상한", () => {
    expect(coinsFor({ avg: 100, complete: true, cleared: true })).toBe(105);
    expect(coinsFor({ avg: 100, complete: true, hard: true })).toBe(117);
    expect(coinsFor({ avg: 500, complete: true, cleared: true, hard: true })).toBe(RUN_COIN_CAP);
  });
  it("점수가 없거나 이상하면 0", () => {
    expect(coinsFor({ avg: 0, complete: true })).toBe(0);
    expect(coinsFor({ avg: NaN, complete: true })).toBe(0);
    expect(coinsFor({ avg: -5, complete: false })).toBe(0);
  });
  it("2배 광고는 번 판에서만, 한 번만, 역경 제외", () => {
    expect(doubleOffer({ earned: 50, hard: false, used: false })).toBe(true);
    expect(doubleOffer({ earned: 50, hard: true, used: false })).toBe(false);
    expect(doubleOffer({ earned: 50, hard: false, used: true })).toBe(false);
    expect(doubleOffer({ earned: 0, hard: false, used: false })).toBe(false);
  });
});

describe("상점", () => {
  it("아이템 id는 겹치지 않고 소품은 8~12개", () => {
    expect(new Set(ITEMS.map(i => i.id)).size).toBe(ITEMS.length);
    expect(PROPS.length).toBeGreaterThanOrEqual(8);
    expect(PROPS.length).toBeLessThanOrEqual(12);
    ITEMS.forEach(i => { expect(i.price).toBeGreaterThan(0); expect(i.line.length).toBeGreaterThan(0); });
  });
  it("가격이 모자라면 못 산다", () => {
    const r = buy({ coins: 100, owned: [] }, "skull");
    expect(r.ok).toBe(false); expect(r.why).toBe("coins"); expect(r.st.coins).toBe(100);
  });
  it("사면 코인이 빠지고 소품은 한 번만", () => {
    const a = buy({ coins: 400, owned: [] }, "skull");
    expect(a.ok).toBe(true); expect(a.st.coins).toBe(250); expect(owns(a.st, "skull")).toBe(true);
    const b = buy(a.st, "skull");
    expect(b.ok).toBe(false); expect(b.why).toBe("have"); expect(b.st.coins).toBe(250);
  });
  it("권은 여러 장 사되 5장까지, 쓰면 한 장 줄어든다", () => {
    let st = { coins: 9999, owned: [] };
    for(let i = 0; i < COUPON_MAX; i++) st = buy(st, "pain1").st;
    expect(count(st, "pain1")).toBe(COUPON_MAX);
    const r = buy(st, "pain1");
    expect(r.ok).toBe(false); expect(r.why).toBe("full");
    st = spend(st, "pain1");
    expect(count(st, "pain1")).toBe(COUPON_MAX - 1);
    expect(spend({ coins: 1, owned: [] }, "pain1")).toEqual({ coins: 1, owned: [] });
  });
  it("모르는 아이템은 거절", () => {
    expect(buy({ coins: 999, owned: [] }, "nope").why).toBe("none");
  });
  it("저장값 읽기: 쓰레기는 빈 상점, 중복·모르는 id는 걸러낸다", () => {
    expect(readShop(null)).toEqual({ coins: 0, owned: [] });
    expect(readShop({ coins: "x", owned: "y" })).toEqual({ coins: 0, owned: [] });
    expect(readShop({ coins: 12.9, owned: ["skull", "skull", "zzz", "pain1", "pain1"] })).toEqual({ coins: 12, owned: ["skull", "pain1", "pain1"] });
    expect(readShop({ coins: -4, owned: [] }).coins).toBe(0);
  });
  it("add는 음수를 무시", () => {
    expect(add({ coins: 5, owned: [] }, -3).coins).toBe(5);
    expect(add({ coins: 5, owned: [] }, 7.8).coins).toBe(12);
  });
  it("소품 전부를 사려면 코인 수천 개 = 수십 판", () => {
    expect(TOTAL_PROP_COST).toBeGreaterThan(4000);
    expect(TOTAL_PROP_COST / 100).toBeGreaterThan(40);
  });
});

import { describe, it, expect } from "vitest";
import { itemById, ITEMS, PROPS, COUPON_MAX, RUN_COIN_CAP, TOTAL_PROP_COST, TOTAL_UPGRADE_COST, UPGRADES, readShop, coinsFor, isReplay, REPLAY_MUL, doubleOffer, add, buy, spend, count, owns } from "../src/core/shop.js";

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
    // a card that already offers the rewarded continue hides the 2x (one rewarded button at a time)
    expect(doubleOffer({ earned: 50, hard: false, used: false, continueOffered: true })).toBe(false);
    expect(doubleOffer({ earned: 50, hard: false, used: false, continueOffered: false })).toBe(true);
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
  it("소품 전부를 사려면 코인 수만 개 = 수백 판", () => {
    expect(TOTAL_PROP_COST).toBeGreaterThan(20000);
    expect(TOTAL_PROP_COST / 105).toBeGreaterThan(200);
  });
});

/* 39차 진행 곡선(docs/economy.md 5절): 보통 실력(평균 100점) 기준으로 상점이 너무 빨리 동나지도, 안 열리지도 않게 */
describe("상점 진행 곡선", () => {
  const run = coinsFor({ avg: 100, complete: true, cleared: true });   // 105
  const ladder = PROPS.map(p => p.price);
  it("싼 것부터 비싼 순이고 첫 소품은 한두 판 안에 산다", () => {
    expect(ladder).toEqual([...ladder].sort((a, b) => a - b));
    expect(ladder[0]).toBeLessThanOrEqual(run * 2);
  });
  it("1장 7일만 깨도 소품 둘은 산다", () => {
    expect(ladder[0] + ladder[1]).toBeLessThanOrEqual(7 * run);
  });
  it("영업 일지 56일을 한 번씩만 깨서는 상점이 동나지 않는다", () => {
    expect(56 * run).toBeLessThan(TOTAL_PROP_COST / 3);
  });
  it("가장 비싼 소품 하나가 한 판 상한(160)의 열 배를 넘지 않는다", () => {
    expect(Math.max(...ladder)).toBeLessThanOrEqual(RUN_COIN_CAP * 150);
    expect(itemById("pain1").price).toBeGreaterThanOrEqual(run);   // 통증권은 한 판 진료비 이상(공짜 같지 않게)
  });
});

/* 40차 엔드게임 소비처: 2단계 업그레이드와 레드카펫 */
describe("엔드게임 소비처", () => {
  it("업그레이드 4개는 base 소품이 있어야 산다", () => {
    expect(UPGRADES.length).toBe(4);
    UPGRADES.forEach(u => expect(itemById(u.base)?.kind).toBe("prop"));
    const poor = { coins: 99999, owned: [] };
    expect(buy(poor, "skull2").why).toBe("base");
    const r = buy(buy(poor, "skull").st, "skull2");
    expect(r.ok).toBe(true);
    expect(owns(r.st, "skull2")).toBe(true);
    expect(buy(r.st, "skull2").why).toBe("have");
  });
  it("업그레이드는 base보다 비싸고 저장값을 거쳐도 남는다", () => {
    UPGRADES.forEach(u => expect(u.price).toBeGreaterThan(itemById(u.base).price));
    expect(readShop({ coins: 1, owned: ["chair", "chair2", "chair2"] }).owned).toEqual(["chair", "chair2"]);
  });
  it("소품 전부 + 업그레이드는 시간당 약 2,000 기준 30시간 넘게 남는다", () => {
    expect((TOTAL_PROP_COST + TOTAL_UPGRADE_COST) / 2000).toBeGreaterThan(30);
  });
});

describe("쉬운 날 반복 파밍 (43차)", () => {
  it("별을 못 늘린 재플레이는 40%, 클리어 보너스 없음", () => {
    expect(REPLAY_MUL).toBe(0.4);
    expect(coinsFor({ avg: 100, complete: true, cleared: true, replay: true })).toBe(36);
    expect(coinsFor({ avg: 100, complete: true, cleared: true, hard: true, replay: true })).toBe(47);
    expect(coinsFor({ avg: 100, complete: true, cleared: true, replay: false })).toBe(105);
  });
  it("isReplay: 처음 깨거나 별을 늘리면 전액", () => {
    expect(isReplay(0, 3)).toBe(false);
    expect(isReplay(undefined, 2)).toBe(false);
    expect(isReplay(2, 3)).toBe(false);
    expect(isReplay(2, 2)).toBe(true);
    expect(isReplay(3, 1)).toBe(true);
    expect(isReplay(1, 0)).toBe(true);
  });
  it("가장 쉬운 날 반복(목뽑기 3명 약 101초)이 평균 진료 수입(시간당 약 2,000)보다 높지 않다", () => {
    const perHour = (coins, sec) => coins / sec * 3600;
    expect(perHour(coinsFor({ avg: 100, complete: true, cleared: true, replay: true }), 101)).toBeLessThan(1500);
    expect(perHour(coinsFor({ avg: 100, complete: true, cleared: true }), 101)).toBeGreaterThan(3000);
  });
});

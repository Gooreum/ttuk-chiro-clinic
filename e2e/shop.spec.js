import { test, expect } from "@playwright/test";
import { watchErrors, waitNeckAssets, playNeckDay } from "./helpers.js";

// Page-less taps: the scene keeps rendering behind the overlays (see campaign.spec.js), so dispatch the click directly.
const tap = (page, sel) => page.locator(sel).dispatchEvent("click");

test("진료실 꾸미기: 코인으로 소품을 사면 저장되고 방에 놓인다", async ({ page }) => {
  const errs = watchErrors(page);
  await page.addInitScript(() => { if(!localStorage.getItem("chiroShop")) localStorage.setItem("chiroShop", JSON.stringify({ coins: 400, owned: [] })); });
  await page.goto("./");
  await waitNeckAssets(page);
  await expect(page.locator("#shopSub")).toHaveText("진료비 400");
  await tap(page, "#shopBtn");
  await expect(page.locator("#shop")).toBeVisible();
  await expect(page.locator("#shopCoins")).toHaveText("400");
  expect(await page.locator("#shopList button").count()).toBeGreaterThanOrEqual(9);
  await expect(page.locator("html")).not.toHaveAttribute("data-shop-props", /.+/);   // nothing bought: nothing built

  // too poor: the 안마의자 (1200) does not sell
  await tap(page, '#shopList button[data-item="chair"]');
  await expect(page.locator("#shopCoins")).toHaveText("400");

  await tap(page, '#shopList button[data-item="skull"]');
  await expect(page.locator("#shopCoins")).toHaveText("250");
  await expect(page.locator('#shopList button[data-item="skull"]')).toBeDisabled();
  await expect(page.locator('#shopList button[data-item="skull"] i')).toHaveText("놓였어요");
  await expect(page.locator("html")).toHaveAttribute("data-shop-props", "1");
  await tap(page, '#shopList button[data-item="pain1"]');
  await expect(page.locator("#shopCoins")).toHaveText("130");
  await expect(page.locator('#shopList button[data-item="pain1"] small')).toContainText("1장 있음");

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("chiroShop")));
  expect(saved).toEqual({ coins: 130, owned: ["skull", "pain1"] });
  const buys = await page.evaluate(() => window.__events.filter(e => e.name === "shop_buy").map(e => [e.item, e.price, e.coins_left]));
  expect(buys).toEqual([["skull", 150, 250], ["pain1", 120, 130]]);

  await tap(page, "#shopClose");
  await expect(page.locator("#shop")).toBeHidden();
  await expect(page.locator("#shopSub")).toHaveText("진료비 130");
  // 영업 일지 list has the same entry
  await tap(page, "#campaignBtn");
  await tap(page, "#daysShop");
  await expect(page.locator("#shop")).toBeVisible();
  await tap(page, "#shopClose");
  await expect(page.locator("#days")).toBeVisible();
  errs.check();
});

test("진료비: 영업 일지 날을 마치면 코인을 받고, 통증 칸 +1권은 한 장 쓴다", async ({ page }) => {
  const errs = watchErrors(page);
  await page.addInitScript(() => { if(!localStorage.getItem("chiroShop")) localStorage.setItem("chiroShop", JSON.stringify({ coins: 10, owned: ["pain1", "pain1"] })); });
  // already stamped today (a future date never stamps), so the attendance line and its coins stay out of this count
  await page.addInitScript(() => localStorage.setItem("chiroAttend", JSON.stringify({ last: "2099-12-31", streak: 1, total: 1 })));
  await page.goto("./");
  await waitNeckAssets(page);
  await tap(page, "#campaignBtn");
  await tap(page, '#dayList button[data-day="0"]');
  await expect(page.locator("#story")).toBeVisible();
  const base = Number((await page.locator("#storyRules").innerText()).match(/통증 (\d)번/)[1]);
  await expect(page.locator("#storyCoupon")).toBeVisible();
  await expect(page.locator("#storyCoupon")).toContainText("2장");
  await tap(page, "#storyCoupon");
  await expect(page.locator("#storyCoupon")).toContainText("쓰는 중");
  await tap(page, "#storyGo");
  await expect(page.locator("#story")).toBeHidden();
  expect(await page.evaluate(() => window.__game.S.painMax)).toBe(base + 1);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("chiroShop")).owned)).toEqual(["pain1"]);   // one spent
  await page.evaluate(() => { window.__game.S.patients.length = 1; });

  await playNeckDay(page);
  await expect(page.locator(".coin-line:not(.attend-line)")).toBeVisible();
  const gain = Number((await page.locator(".coin-line b").innerText()).replace("+", ""));
  expect(gain).toBeGreaterThan(20);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("chiroShop")).coins)).toBe(10 + gain);
  await expect(page.locator(".coin-line small")).toHaveText(`합계 ${10 + gain}`);
  // outside the Toss build there is no rewarded 2x button
  await expect(page.locator(".coin-line + button")).toBeHidden();
  const ev = await page.evaluate(() => window.__events.filter(e => e.name === "coin_earn").map(e => ({ coins: e.coins, step: e.step, total: e.total, game: e.game, day: e.day })));
  expect(ev).toEqual([{ coins: gain, step: "run", total: 10 + gain, game: "crack", day: 1 }]);
  errs.check();
});

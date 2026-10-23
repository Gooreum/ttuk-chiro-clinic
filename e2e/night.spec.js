import { test, expect } from "@playwright/test";
import { watchErrors, waitNeckAssets } from "./helpers.js";

// endingSeen: an unseen ending opens first on 영업 일지 (e2e/ending.spec.js)
const CLEARED = JSON.stringify({ cleared: 56, stars: Array(56).fill(3), hard: Array(56).fill(0), endingSeen: true });

test("심야 진료: 56일 전에는 타이틀과 영업 일지 양쪽에서 잠겨 있다", async ({ page }) => {
  const errs = watchErrors(page);
  await page.goto("./");
  await waitNeckAssets(page);
  await expect(page.locator("#nightBtn")).toBeHidden();
  await page.click("#campaignBtn");
  await expect(page.locator("#daysNight")).toBeHidden();
  errs.check();
});

test("심야 진료: 일일 시드 환자가 끝없이 이어진다 (run_start의 game은 night)", async ({ page }) => {
  const errs = watchErrors(page);
  await page.addInitScript(v => localStorage.setItem("chiroCampaign", v), CLEARED);
  await page.goto("./");
  await waitNeckAssets(page);
  await expect(page.locator("#nightBtn")).toBeEnabled();
  await page.click("#nightBtn");
  const first = await page.evaluate(() => { const S = window.__game.S; return { night: !!S.night, painMax: S.painMax, n: S.patients.length, zone: S.zoneUntil }; });
  expect(first).toMatchObject({ night: true, painMax: 3, n: 1, zone: 0 });
  expect(await page.evaluate(() => window.__events.filter(e => e.name === "run_start").map(e => e.game))).toEqual(["night"]);
  // the list is built on demand: finishing the first patient makes the second, from the same seed
  const { seed, name0 } = await page.evaluate(() => ({ seed: window.__game.S.night.seed, name0: window.__game.S.patients[0].name }));
  const until = Date.now() + 240_000;
  while(await page.evaluate(() => window.__game.S.patients.length) < 2){
    if(Date.now() > until) throw new Error("second patient never came");
    await page.keyboard.press("Space");
    await page.waitForTimeout(600);
  }
  const second = await page.evaluate(() => { const S = window.__game.S; return { seed: S.night.seed, name: S.patients[1].name }; });
  expect(second.seed).toBe(seed);
  expect(second.name).not.toBe(name0);
  expect(await page.evaluate(() => window.__events.filter(e => e.name === "night_start").length)).toBe(1);
  expect(await page.evaluate(() => localStorage.getItem("chiroBest"))).toBeNull();   // the free-play best stays untouched
  errs.check();
});

test("심야 진료: 영업 일지 화면의 버튼으로 시작하고, 끝내면 오늘 기록이 남는다", async ({ page }) => {
  const errs = watchErrors(page);
  await page.addInitScript(v => localStorage.setItem("chiroCampaign", v), CLEARED);
  await page.goto("./");
  await waitNeckAssets(page);
  await page.click("#campaignBtn");
  await expect(page.locator("#daysNight")).toBeEnabled();
  await page.click("#daysNight");
  await expect(page.locator("#days")).toBeHidden();
  expect(await page.evaluate(() => !!window.__game.S.night)).toBe(true);
  // end the run right away (shot build exposes finish): no patient treated -> count 0, no record
  await page.evaluate(() => window.__game.finish());
  await expect(page.locator("#result")).toBeVisible();
  await expect(page.locator("#rdate")).toContainText("심야 진료 · ");
  await expect(page.locator("#dayOutro")).toContainText("오늘의 심야 기록 0명");
  await expect(page.locator("#again")).toHaveText("다시 심야 진료");
  expect(await page.evaluate(() => localStorage.getItem("chiroNightBest"))).toBeNull();
  // a treated patient (one result with stars) makes the record, and the best is the day's best
  await page.evaluate(() => {
    const g = window.__game, S = g.S;
    S.results = [{ name: "박대리", age: 32, pts: 120, stars: 3, label: "", fails: [], lines: S.patients[0].lines }];
    S.score = 120;
    g.finish();
  });
  await expect(page.locator("#dayOutro")).toContainText("오늘의 심야 기록 1명 · 오늘 최고 1명");
  await expect(page.locator("#newbest")).toBeVisible();
  const rec = await page.evaluate(() => JSON.parse(localStorage.getItem("chiroNightBest")));
  expect(rec).toMatchObject({ count: 1, score: 120 });
  expect(rec.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(await page.evaluate(() => window.__events.filter(e => e.name === "night_end").map(e => e.count))).toEqual([0, 1]);
  expect(await page.evaluate(() => localStorage.getItem("chiroBest"))).toBeNull();
  // 다시 심야 진료 starts a new night
  await page.click("#again");
  expect(await page.evaluate(() => ({ night: !!window.__game.S.night, n: window.__game.S.patients.length }))).toEqual({ night: true, n: 1 });
  errs.check();
});

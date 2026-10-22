import { test, expect } from "@playwright/test";
import { watchErrors, waitNeckAssets } from "./helpers.js";

test("오늘의 도전: 새 유저도 타이틀에서 바로 시작하고 환자는 한 명이다", async ({ page }) => {
  const errs = watchErrors(page);
  await page.goto("./");
  await waitNeckAssets(page);
  await expect(page.locator("#dailyBtn")).toBeVisible();
  await page.click("#dailyBtn");
  const s = await page.evaluate(() => {
    const S = window.__game.S;
    return { daily: !!S.daily, n: S.patients.length, night: S.night, rush: S.rush, weekly: S.weekly };
  });
  expect(s).toMatchObject({ daily: true, n: 1 });
  expect(await page.evaluate(() => window.__events.filter(e => e.name === "run_start").map(e => e.game))).toEqual(["daily"]);
  expect((await page.evaluate(() => window.__events.filter(e => e.name === "daily_start"))).length).toBe(1);
  errs.check();
});

test("오늘의 도전: 결과 카드에 오늘 기록·자랑하기·다시 버튼, 자유 진료 최고 기록은 그대로", async ({ page }) => {
  const errs = watchErrors(page);
  await page.goto("./");
  await waitNeckAssets(page);
  await page.click("#dailyBtn");
  // a run played through (an empty run keeps no record, so no share)
  await page.evaluate(() => { const g = window.__game, S = g.S; S.results = S.patients.map(p => ({ name: p.name, age: p.age, pts: 100, stars: 3, label: "", fails: [], lines: p.lines, game: p.weekly.game })); S.score = 200; S.pain = 0; S.ambulance = false; g.finish(); });
  await expect(page.locator("#shareBtn")).toBeVisible();
  await expect(page.locator("#again")).toHaveText("오늘의 도전 다시");
  expect(await page.evaluate(() => localStorage.getItem("chiroBest"))).toBeNull();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("chiroDaily")))).toBeTruthy();
  errs.check();
});

test("출근 도장: 첫 판이 끝나면 한 번 찍히고 같은 날 두 번째 판은 안 찍힌다. 자유 진료 버튼은 한 판 더", async ({ page }) => {
  const errs = watchErrors(page);
  await page.goto("./");
  await waitNeckAssets(page);
  await expect(page.locator("#attendTxt")).not.toBeEmpty();
  await page.click("#start");
  // a scored run stamps the card (an empty run does not)
  await page.evaluate(() => { const g = window.__game; g.S.score = 150; g.finish(); });
  await expect(page.locator(".attend-line")).toBeVisible();
  await expect(page.locator("#again")).toHaveText("한 판 더");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("chiroAttend")).streak)).toBe(1);
  expect(await page.evaluate(() => window.__events.filter(e => e.name === "attend").length)).toBe(1);
  await page.click("#again");
  await page.evaluate(() => { const g = window.__game; g.S.score = 150; g.finish(); });
  expect(await page.evaluate(() => window.__events.filter(e => e.name === "attend").length)).toBe(1);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("chiroAttend")).streak)).toBe(1);
  errs.check();
});

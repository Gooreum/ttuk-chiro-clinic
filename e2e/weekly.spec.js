import { test, expect } from "@playwright/test";
import { watchErrors, waitNeckAssets } from "./helpers.js";

const SAVE = n => JSON.stringify({ cleared: n, stars: Array(n).fill(3), hard: Array(n).fill(0) });

test("주간 챌린지: 2장(7일) 전에는 타이틀과 영업 일지 양쪽에서 숨어 있다", async ({ page }) => {
  const errs = watchErrors(page);
  await page.addInitScript(v => localStorage.setItem("chiroCampaign", v), SAVE(6));
  await page.goto("./");
  await waitNeckAssets(page);
  await expect(page.locator("#weeklyBtn")).toBeHidden();
  await page.click("#campaignBtn");
  await expect(page.locator("#daysWeekly")).toBeHidden();
  errs.check();
});

test("주간 챌린지: 그 주 고정 환자로 시작하고 도전 횟수가 남는다 (run_start의 game은 weekly)", async ({ page }) => {
  const errs = watchErrors(page);
  await page.addInitScript(v => localStorage.setItem("chiroCampaign", v), SAVE(7));
  await page.goto("./");
  await waitNeckAssets(page);
  await expect(page.locator("#weeklyBtn")).toBeEnabled();
  await expect(page.locator("#weeklySub")).not.toBeEmpty();
  await page.click("#weeklyBtn");
  const first = await page.evaluate(() => {
    const S = window.__game.S;
    return { weekly: !!S.weekly, n: S.patients.length, painMax: S.painMax, zone: S.zoneUntil, week: S.weekly.week, rule: S.weekly.set.rule.id, names: S.patients.map(p => p.name), night: S.night, rush: S.rush };
  });
  expect(first).toMatchObject({ weekly: true, zone: 0, night: null, rush: null });
  expect(first.n).toBeGreaterThanOrEqual(3); expect(first.n).toBeLessThanOrEqual(4);
  expect(await page.evaluate(() => window.__events.filter(e => e.name === "run_start").map(e => e.game))).toEqual(["weekly"]);
  expect(await page.evaluate(() => window.__events.filter(e => e.name === "weekly_start").map(e => e.rule))).toEqual([first.rule]);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("chiroWeekly")))).toMatchObject({ week: first.week, best: 0, tries: 1 });
  // the same set again from the result card (다시 주간 챌린지)
  await page.evaluate(() => window.__game.finish());
  await expect(page.locator("#again")).toHaveText("다시 주간 챌린지");
  await page.click("#again");
  const again = await page.evaluate(() => window.__game.S.patients.map(p => p.name));
  expect(again).toEqual(first.names);
  expect((await page.evaluate(() => JSON.parse(localStorage.getItem("chiroWeekly")))).tries).toBe(2);
  expect(await page.evaluate(() => localStorage.getItem("chiroBest"))).toBeNull();
  errs.check();
});

test("주간 챌린지: 끝까지 하면 이번 주 최고와 첫 클리어 보너스가 남고, 별·최고 기록은 그대로다", async ({ page }) => {
  const errs = watchErrors(page);
  await page.addInitScript(v => localStorage.setItem("chiroCampaign", v), SAVE(7));
  await page.goto("./");
  await waitNeckAssets(page);
  await page.click("#campaignBtn");
  await expect(page.locator("#daysWeekly")).toBeEnabled();
  await page.click("#daysWeekly");
  await expect(page.locator("#days")).toBeHidden();
  // an unfinished run keeps no record
  await page.evaluate(() => window.__game.finish());
  await expect(page.locator("#rdate")).toContainText("주간 챌린지 · ");
  await expect(page.locator("#dayOutro")).toContainText("끝까지 진료해야");
  expect((await page.evaluate(() => JSON.parse(localStorage.getItem("chiroWeekly")))).best).toBe(0);
  // a run played through: every patient has a row with stars
  await page.evaluate(() => {
    const g = window.__game, S = g.S;
    S.results = S.patients.map(p => ({ name: p.name, age: p.age, pts: 100, stars: 3, label: "", fails: [], lines: p.lines, game: p.weekly.game }));
    S.score = 300; S.pain = 0; S.ambulance = false;
    g.finish();
  });
  await expect(page.locator("#dayOutro")).toContainText("이번 주 최고 300점");
  await expect(page.locator("#dayOutro")).toContainText("첫 클리어 보너스");
  await expect(page.locator("#newbest")).toBeVisible();
  await expect(page.locator("#shareBtn")).toBeVisible();
  const rec = await page.evaluate(() => JSON.parse(localStorage.getItem("chiroWeekly")));
  expect(rec).toMatchObject({ best: 300, tries: 1 });
  expect((await page.evaluate(() => JSON.parse(localStorage.getItem("chiroShop")))).coins).toBeGreaterThanOrEqual(60);
  const ends = await page.evaluate(() => window.__events.filter(e => e.name === "weekly_end").map(e => [e.complete, e.best, e.first_clear]));
  expect(ends).toEqual([[false, false, false], [true, true, true]]);
  // a lower score later: no new best, no second bonus
  const coins = (await page.evaluate(() => JSON.parse(localStorage.getItem("chiroShop")))).coins;
  await page.evaluate(() => { const g = window.__game; g.S.score = 200; g.S.results.forEach(r => { r.pts = 66; }); g.finish(); });
  await expect(page.locator("#dayOutro")).toContainText("이번 주 최고 300점");
  await expect(page.locator("#dayOutro")).not.toContainText("첫 클리어");
  await expect(page.locator("#newbest")).toBeHidden();
  expect((await page.evaluate(() => JSON.parse(localStorage.getItem("chiroShop")))).coins - coins).toBeLessThan(60 + 1);
  // days / free-play best untouched
  expect(await page.evaluate(() => localStorage.getItem("chiroBest"))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem("chiroNightBest"))).toBeNull();
  expect((await page.evaluate(() => JSON.parse(localStorage.getItem("chiroCampaign")))).cleared).toBe(7);
  errs.check();
});

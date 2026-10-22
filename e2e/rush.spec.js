import { test, expect } from "@playwright/test";
import { watchErrors, waitNeckAssets } from "./helpers.js";

const CLEARED = JSON.stringify({ cleared: 56, stars: Array(56).fill(3), hard: Array(56).fill(0) });
const LOCKED = "56일 다 깨면 열려요";

test("보스 러시: 56일 전에는 타이틀과 영업 일지 양쪽에서 잠겨 있다", async ({ page }) => {
  const errs = watchErrors(page);
  await page.goto("./");
  await waitNeckAssets(page);
  await expect(page.locator("#rushBtn")).toBeDisabled();
  await expect(page.locator("#rushSub")).toHaveText(LOCKED);
  await page.click("#campaignBtn");
  await expect(page.locator("#daysRush")).toBeDisabled();
  await expect(page.locator("#daysRushSub")).toHaveText(LOCKED);
  errs.check();
});

test("보스 러시: 보스 6명의 환자가 한 번에 깔리고 통증 3칸을 같이 쓴다", async ({ page }) => {
  const errs = watchErrors(page);
  await page.addInitScript(v => localStorage.setItem("chiroCampaign", v), CLEARED);
  await page.goto("./");
  await waitNeckAssets(page);
  await expect(page.locator("#rushBtn")).toBeEnabled();
  await page.click("#rushBtn");
  const s = await page.evaluate(() => { const S = window.__game.S; return { rush: !!S.rush, painMax: S.painMax, n: S.patients.length, day: S.day, zone: S.zoneUntil, k: S.patients.map(p => p.rush.k), game: S.game, tight: !!S.mods.tight }; });
  expect(s).toMatchObject({ rush: true, painMax: 3, day: -1, zone: 0, game: "clinic", tight: true });
  expect(new Set(s.k).size).toBe(6);
  expect(s.n).toBe(s.k.length);
  expect(await page.evaluate(() => window.__events.filter(e => e.name === "run_start").map(e => e.game))).toEqual(["rush"]);
  expect(await page.evaluate(() => window.__events.filter(e => e.name === "rush_start").length)).toBe(1);
  expect(await page.evaluate(() => localStorage.getItem("chiroBest"))).toBeNull();
  errs.check();
});

test("보스 러시: 끝내면 기록이 남고 별·최고 기록은 그대로다", async ({ page }) => {
  const errs = watchErrors(page);
  await page.addInitScript(v => localStorage.setItem("chiroCampaign", v), CLEARED);
  await page.goto("./");
  await waitNeckAssets(page);
  await page.click("#campaignBtn");
  await page.click("#daysRush");
  await expect(page.locator("#days")).toBeHidden();
  await page.evaluate(() => window.__game.finish());
  await expect(page.locator("#result")).toBeVisible();
  await expect(page.locator("#rdate")).toContainText("보스 러시 · 0/6");
  await expect(page.locator(".rush-list li")).toHaveCount(6);
  await expect(page.locator("#again")).toHaveText("다시 보스 러시");
  expect(await page.evaluate(() => window.__events.filter(e => e.name === "rush_end").length)).toBe(1);
  // 첫 보스 환자를 모두 치료한 것으로 만들면 도달 1, 점수가 높으면 이긴다
  await page.evaluate(() => {
    const g = window.__game, S = g.S;
    const first = S.patients.filter(p => p.rush.k === 0);
    S.results = first.map(p => ({ name: p.name, age: p.age, pts: 300, stars: 3, label: "", fails: [], lines: p.lines, game: p.rush.game }));
    S.score = 300 * first.length;
    g.finish();
  });
  const rec = await page.evaluate(() => JSON.parse(localStorage.getItem("chiroRush")));
  expect(rec).toMatchObject({ reached: 1, cleared: 1 });
  await expect(page.locator("#newbest")).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("chiroCampaign")).cleared)).toBe(56);
  expect(await page.evaluate(() => localStorage.getItem("chiroBest"))).toBeNull();
  await page.click("#again");
  expect(await page.evaluate(() => !!window.__game.S.rush)).toBe(true);
  errs.check();
});

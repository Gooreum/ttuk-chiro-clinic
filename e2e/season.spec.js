import { test, expect } from "@playwright/test";
import { watchErrors, waitNeckAssets, playNeckDay } from "./helpers.js";

const SAVE = n => JSON.stringify({ cleared: n, stars: Array(n).fill(3), hard: Array(n).fill(0) });
const seed = (page, n, season) => page.addInitScript(([c, s]) => {
  localStorage.setItem("chiroCampaign", c);
  if(s) localStorage.setItem("chiroSeason", s);
}, [SAVE(n), season ? JSON.stringify(season) : null]);
const rd = (page, key) => page.evaluate(k => JSON.parse(localStorage.getItem(k)), key);

test("계절 손님: 1장(7일) 전에는 타이틀과 영업 일지 양쪽에서 숨어 있다", async ({ page }) => {
  const errs = watchErrors(page);
  await seed(page, 6);
  await page.goto("./?season=winter");
  await waitNeckAssets(page);
  await expect(page.locator("#seasonBtn")).toBeHidden();
  await page.click("#campaignBtn");
  await expect(page.locator("#daysSeason")).toBeHidden();
  errs.check();
});

test("계절 손님: 이번 계절 4편만 열리고 다른 계절은 잠긴 채 개수만 보인다", async ({ page }) => {
  const errs = watchErrors(page);
  await seed(page, 7);
  await page.goto("./?season=winter");
  await waitNeckAssets(page);
  await expect(page.locator("#seasonBtn")).toBeEnabled();
  await expect(page.locator("#seasonSub")).toContainText("겨울");
  await expect(page.locator("#seasonSub")).toContainText("0/4");
  await page.click("#seasonBtn");
  await expect(page.locator("#seasons")).toBeVisible();
  const btns = page.locator("#seasonList button");
  await expect(btns).toHaveCount(4);
  await expect(btns.nth(0)).toBeEnabled();
  for(const i of [1, 2, 3]) await expect(btns.nth(i)).toBeDisabled();
  await expect(page.locator("#seasonLocked")).toContainText("???");
  await expect(page.locator("#seasonLocked")).toContainText("4개");
  // story card and back
  await btns.nth(0).click();
  await expect(page.locator("#story")).toBeVisible();
  await expect(page.locator("#storyNo")).toContainText("계절 손님");
  await expect(page.locator("#storyGo")).toHaveText("손님 맞기");
  await page.click("#storyBack");
  await expect(page.locator("#seasons")).toBeVisible();
  await expect(page.locator("#story")).toBeHidden();
  errs.check();
});

test("계절 손님: 1편을 끝까지 하면 별이 남고 2편이 열린다 (캠페인 진행·최고 기록은 그대로)", async ({ page }) => {
  const errs = watchErrors(page);
  await seed(page, 7);
  await page.goto("./?season=winter");
  await waitNeckAssets(page);
  await page.click("#seasonBtn");
  await page.locator("#seasonList button").nth(0).click();
  await page.click("#storyGo");
  const s = await page.evaluate(() => { const S = window.__game.S; return { day: S.day, season: S.season, quest: S.quest }; });
  expect(s.day).toBe(-1); expect(s.season).toBeGreaterThanOrEqual(0); expect(s.quest).toBe(-1);
  await playNeckDay(page);
  await expect(page.locator("#rdate")).toContainText("계절 손님");
  await expect(page.locator("#toDays")).toContainText("계절 목록");
  const rec = await rd(page, "chiroSeason");
  expect(rec.eps.winter1).toBeGreaterThan(0);
  expect((await rd(page, "chiroCampaign")).cleared).toBe(7);
  expect(await page.evaluate(() => localStorage.getItem("chiroBest"))).toBeNull();
  const names = await page.evaluate(() => window.__events.map(e => e.name));
  expect(names).toContain("season_start"); expect(names).toContain("season_end");
  await page.click("#toDays");
  await expect(page.locator("#seasons")).toBeVisible();
  await expect(page.locator("#seasonList button").nth(1)).toBeEnabled();
  errs.check();
});

test("계절 손님: 4편을 모두 깨면 진료비 보너스를 계절당 한 번만 받는다", async ({ page }) => {
  const errs = watchErrors(page);
  await seed(page, 7, { eps: { winter1: 3, winter2: 3, winter3: 3 }, bonus: {} });
  await page.goto("./?season=winter");
  await waitNeckAssets(page);
  await page.click("#seasonBtn");
  await page.locator("#seasonList button").nth(3).click();
  await page.click("#storyGo");
  const finishAll = () => page.evaluate(() => {
    const g = window.__game, S = g.S;
    S.results = S.patients.map(p => ({ name: p.name, age: p.age, pts: 115, stars: 3, label: "", fails: [], lines: p.lines, game: "clinic" }));
    S.score = S.patients.length * 2 * 115; S.pain = 0; S.ambulance = false;
    g.finish();
  });
  await finishAll();
  await expect(page.locator("#dayOutro")).toContainText("다 맞았어요. 진료비 +80");
  expect((await rd(page, "chiroShop")).coins).toBeGreaterThanOrEqual(80);
  expect((await rd(page, "chiroSeason")).bonus.winter).toBe(1);
  const coins = (await rd(page, "chiroShop")).coins;
  await page.click("#again");
  await finishAll();
  await expect(page.locator("#dayOutro")).not.toContainText("다 맞았어요");
  expect((await rd(page, "chiroShop")).coins - coins).toBe(coins - 80); // second run pays only the normal run fee, no bonus
  expect((await rd(page, "chiroSeason")).bonus.winter).toBe(1);
  expect(await page.evaluate(() => localStorage.getItem("chiroBest"))).toBeNull();
  errs.check();
});

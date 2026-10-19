import { test, expect } from "@playwright/test";
import { watchErrors, waitNeckAssets, playNeckDay } from "./helpers.js";

test("목꺾기: 세 환자 양쪽을 교정하고 진료 일지까지 간다", async ({ page }) => {
  const errs = watchErrors(page);
  await page.goto("./");
  await waitNeckAssets(page);
  await expect(page.locator("#intro")).toBeVisible();

  await page.click("#start");
  await expect(page.locator("#intro")).toBeHidden();
  const day = await page.evaluate(() => ({ game: window.__game.S.game, names: window.__game.S.patients.map(p => p.name) }));
  expect(day.game).toBe("clinic");
  expect(day.names).toHaveLength(3);
  expect(new Set(day.names).size).toBe(3);

  // the first patient's chart opens big during the prep time, then folds into the mini chart
  await expect(page.locator("#chartSheet")).toBeVisible();
  await expect(page.locator("#csName")).toHaveText(day.names[0]);

  // first crack: the x-ray opens and the score goes up
  await page.waitForFunction(() => !window.__game.S.busy, null, { timeout: 30_000 });
  await page.keyboard.press("Space");
  await page.waitForFunction(() => window.__game.S.score > 0, null, { timeout: 30_000 });

  await playNeckDay(page);
  await expect(page.locator("#rtitle")).toHaveText("오늘 진료 끝");
  await expect(page.locator("#rlist li")).toHaveCount(3);
  const res = await page.evaluate(() => window.__game.S.results.map(r => ({ name: r.name, stars: r.stars })));
  expect(res.map(r => r.name)).toEqual(day.names);
  res.forEach(r => expect(r.stars).toBeGreaterThan(0));
  expect(Number(await page.locator("#rtotal").textContent())).toBeGreaterThan(0);
  errs.check();
});

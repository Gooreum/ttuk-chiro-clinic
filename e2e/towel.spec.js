import { test, expect } from "@playwright/test";
import { watchErrors, waitNeckAssets, playNeckDay, expectFunnel } from "./helpers.js";

test("목뽑기: ?mode=towel 에서 세 환자를 당기고 일지까지 간다", async ({ page }) => {
  const errs = watchErrors(page);
  await page.goto("./index.html?mode=towel");
  await waitNeckAssets(page);
  await expect(page.locator("#startTowel")).toHaveClass("btn");     // the main button on ?mode=towel

  await page.click("#startTowel");
  const names = await page.evaluate(() => window.__game.S.patients.map(p => p.name));
  expect(await page.evaluate(() => window.__game.S.game)).toBe("towel");
  expect(names).toHaveLength(3);

  await playNeckDay(page);
  await expect(page.locator("#rtitle")).toHaveText("목뽑기 끝");
  await expect(page.locator("#rlist li")).toHaveCount(3);
  const res = await page.evaluate(() => window.__game.S.results.map(r => r.name));
  expect(res).toEqual(names);
  await expectFunnel(page, { mode: "towel", attempts: 3 });
  errs.check();
});

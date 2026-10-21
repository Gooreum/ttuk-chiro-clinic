import { test, expect } from "@playwright/test";
import { watchErrors, waitNeckAssets, playNeckDay } from "./helpers.js";

test("영업 일지: 1일차 사연을 보고 완주하면 2일차가 열린다", async ({ page }) => {
  const errs = watchErrors(page);
  await page.goto("./");
  await waitNeckAssets(page);
  await expect(page.locator("#campaignSub")).toHaveText("개업 첫 주 · 1일차");

  await page.click("#campaignBtn");
  await expect(page.locator("#days")).toBeVisible();
  await expect(page.locator("#dayList button")).toHaveCount(7);
  await expect(page.locator('#dayList button[data-day="1"]')).toBeDisabled();
  await page.click('#dayList button[data-day="0"]');
  await expect(page.locator("#story")).toBeVisible();
  await expect(page.locator("#storyTitle")).toHaveText("개업 첫날");

  await page.click("#storyGo");
  await expect(page.locator("#story")).toBeHidden();
  const day = await page.evaluate(() => ({ day: window.__game.S.day, game: window.__game.S.game, names: window.__game.S.patients.map(p => p.name) }));
  expect(day).toEqual({ day: 0, game: "clinic", names: ["박대리", "이라이더"] });
  // one patient keeps the whole e2e run inside its time budget; the day still ends complete
  await page.evaluate(() => { window.__game.S.patients.length = 1; });

  await playNeckDay(page);
  await expect(page.locator("#rdate")).toHaveText("영업 일지 · 1일차 개업 첫날");
  await expect(page.locator("#rlist li")).toHaveCount(1);
  await expect(page.locator("#dayOutro")).toBeVisible();
  await expect(page.locator("#nextDay")).toBeVisible();
  const prog = await page.evaluate(() => JSON.parse(localStorage.getItem("chiroCampaign")));
  expect(prog.cleared).toBe(1);
  expect(prog.stars[0]).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__events.filter(e => e.name === "day_end").map(e => e.cleared))).toEqual([true]);

  // 다음 날: day 2's story, 박대리 back with a new line
  // Behind the day log the scene keeps rendering under a blurred overlay (and the detailed characters may swap in, recompiling
  // shaders). In headless swiftshader on a loaded machine a frame then took tens of seconds and page.click, which waits for
  // stable frames, timed out. These taps dispatch the click without waiting for a frame.
  const slow = { timeout: 120_000 };
  await page.locator("#nextDay").dispatchEvent("click");
  await expect(page.locator("#storyTitle")).toHaveText("입소문", slow);
  await page.locator("#storyBack").dispatchEvent("click");
  await expect(page.locator('#dayList button[data-day="1"]')).toBeEnabled(slow);
  await expect(page.locator('#dayList button[data-day="2"]')).toBeDisabled(slow);
  errs.check();
});

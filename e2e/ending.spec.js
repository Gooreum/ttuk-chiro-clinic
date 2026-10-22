import { test, expect } from "@playwright/test";
import { watchErrors, waitNeckAssets, playNeckDay } from "./helpers.js";

// 56일차(뚝할배)를 처음 깨면 다음 날 버튼이 엔딩 보기로 바뀌고 엔딩 카드가 뜬다 (playtest 6 P0).
// 강제 성공 빌드의 평균은 보스 기준에 못 미치므로 점수를 크게 올려 두고 끝까지 진행한다.
test("엔딩: 56일차를 처음 깨면 엔딩 카드가 뜬다", async ({ page }) => {
  const errs = watchErrors(page);
  await page.addInitScript(() => localStorage.setItem("chiroCampaign", JSON.stringify({ cleared: 55, stars: Array(55).fill(3), hard: Array(56).fill(0) })));
  await page.goto("./?story=55");
  await waitNeckAssets(page);
  await expect(page.locator("#story")).toBeVisible();
  await page.click("#storyGo");
  await expect(page.locator("#story")).toBeHidden();
  expect(await page.evaluate(() => window.__game.S.day)).toBe(55);
  await page.evaluate(() => { const S = window.__game.S; S.patients.length = 1; S.score = 100000; });
  await playNeckDay(page);
  await expect(page.locator("#nextDay")).toBeVisible();
  await expect(page.locator("#nextDay")).toHaveText("엔딩 보기");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("chiroCampaign")).cleared)).toBe(56);
  await page.click("#nextDay");
  await expect(page.locator("#ending")).toBeVisible();
  await expect(page.locator("#endingTitle")).not.toHaveText("");
  await page.click("#endingClose");
  await expect(page.locator("#days")).toBeVisible();
  errs.check();
});

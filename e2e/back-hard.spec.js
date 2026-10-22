import { test, expect } from "@playwright/test";
import { watchErrors } from "./helpers.js";

// 허리펴기 역경 (playtest 5): back.html?day=14&hard=1 is 3장 1일차 on the harder rules.
const save = JSON.stringify({ cleared: 15, stars: Array(15).fill(3) });

test("허리펴기 역경: 통증 칸이 줄고 역경 표기가 보인다", async ({ page }) => {
  const errs = watchErrors(page);
  await page.addInitScript(s => localStorage.setItem("chiroCampaign", s), save);
  await page.goto("./back.html?day=14&hard=1");
  await page.waitForFunction(() => document.documentElement.dataset.backReady === "true", null, { timeout: 180_000 });
  await expect(page.locator("#backDayNo")).toContainText("역경");
  await expect(page.locator("#backMistakes i")).toHaveCount(2);   // plain day: 3
  errs.leaving();
  await page.goto("./back.html?day=14");
  await page.waitForFunction(() => document.documentElement.dataset.backReady === "true", null, { timeout: 180_000 });
  await expect(page.locator("#backDayNo")).not.toContainText("역경");
  await expect(page.locator("#backMistakes i")).toHaveCount(3);
});

test("허리펴기 역경: 사연 카드에서 역경 시작이 &hard=1로 넘어가고 결과 카드 '이 날 다시'는 사연 카드로 돌아온다", async ({ page }) => {
  const errs = watchErrors(page);
  await page.addInitScript(s => { if(!localStorage.getItem("chiroCampaign")) localStorage.setItem("chiroCampaign", s); }, save);
  await page.goto("./");
  await page.click("#campaignBtn");
  await page.click('#dayList button[data-day="14"]');
  await page.click("#storyHard");
  await expect(page.locator("#storyNo")).toHaveText("3장 1일차 · 역경");
  await expect(page.locator("#storyRules")).toContainText("구역이 좁아요");
  errs.leaving();
  await Promise.all([page.waitForURL(/back\.html\?day=14&hard=1/), page.click("#storyGo")]);
  await page.waitForFunction(() => document.documentElement.dataset.backReady === "true", null, { timeout: 180_000 });
  await page.click("#backTouchStart");
  // three zones, pressed precisely: a 역경 clear (average 98+) is not needed here, only that the result card sends 다시 back to the story card
  const until = Date.now() + 120_000;
  while(await page.locator("#backResult").isHidden()){
    if(Date.now() > until) throw new Error("back day never ended");
    await page.evaluate(() => {
      const s = window.__backShot.snapshot();
      if(s.phase !== "play" || performance.now() < (s.prepUntil || 0)) return;
      if(!s.locked){ window.__backShot.aim(s.heights[s.step]); window.__backShot.lock(true); }
      const t = window.__backShot.snapshot();
      window.__backShot.press(t.targets[t.step], 0.6, 1.5);
    });
    await page.waitForTimeout(500);
  }
  await expect(page.locator("#backResultTitle")).toContainText("역경");
  const hard = await page.evaluate(() => JSON.parse(localStorage.getItem("chiroCampaign")).hard);
  expect(hard && hard[14]).toBeGreaterThan(0);   // 역경 stars go to chiroCampaign.hard
  await Promise.all([page.waitForURL(/index\.html\?story=14&hard=1/), page.click("#backAgain")]);
  await expect(page.locator("#storyNo")).toHaveText("3장 1일차 · 역경");
});

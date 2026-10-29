import { test, expect } from "@playwright/test";
import { watchErrors, expectFunnel } from "./helpers.js";

test("허리펴기: 세 구역을 정확히 누르고 결과 카드까지 간다", async ({ page }) => {
  const errs = watchErrors(page);
  await page.goto("./back.html");
  await page.waitForFunction(() => document.documentElement.dataset.backReady === "true", null, { timeout: 180_000 });

  await page.click("#backTouchStart");
  await expect(page.locator("#backWelcome")).toBeHidden();

  const until = Date.now() + 120_000;
  while(await page.locator("#backResult").isHidden()){
    if(Date.now() > until) throw new Error("back day never ended");
    await page.evaluate(() => {
      const s = window.__backShot.snapshot();
      if(s.phase !== "play" || performance.now() < (s.prepUntil || 0)) return;
      // height first (front-back tilt), lock it, then left-right on the locked row
      if(!s.locked){ window.__backShot.aim(s.heights[s.step]); window.__backShot.lock(true); }
      const t = window.__backShot.snapshot();
      window.__backShot.press(t.targets[t.step], 0.6, 1.5);
    });
    await page.waitForTimeout(500);
  }
  const s = await page.evaluate(() => window.__backShot.snapshot());
  expect(s.results).toHaveLength(3);
  expect(s.mistakes).toBe(0);
  await expect(page.locator("#backResultSteps li")).toHaveCount(3);
  await expect(page.locator("#backResultSteps li .stars").first()).toHaveText(/★/);   // the neck card rows (.who/.pts/.stars)
  await expect(page.locator("#backResultTitle")).toHaveText("허리까지 시원하게.");
  await expectFunnel(page, { mode: "back", attempts: 3 });
  errs.check();
});


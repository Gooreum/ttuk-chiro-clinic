import { test, expect } from "@playwright/test";
import { watchErrors, expectFunnel } from "./helpers.js";

// 허리비틀기 (user 2026-10-19 "이거는 좌우 두번해야돼"): one side, roll over, the other side, then the result card —
// never the card after one side.
test("허리비틀기: 한쪽 → 돌아눕기 → 반대쪽 → 결과 카드", async ({ page }) => {
  const errs = watchErrors(page);
  await page.goto("./side.html");
  await page.waitForFunction(() => document.documentElement.dataset.sideReady === "true", null, { timeout: 180_000 });
  await page.click("#sideTouchStart");
  await expect(page.locator("#sideWelcome")).toBeHidden();

  for(let i = 0; i < 2; i++){
    await page.waitForFunction(() => { const s = window.__sideShot.snapshot(); return s.phase === "play" && performance.now() >= s.prepUntil; }, null, { timeout: 120_000 });
    await expect(page.locator("#sideLock")).toBeVisible();
    await page.evaluate(() => { const g = window.__sideShot.goal(); window.__sideShot.aim(g.height); window.__sideShot.lock(true); window.__sideShot.press(g.roll, 0.6, 1); });
    if(i === 0){
      await page.waitForFunction(() => window.__sideShot.snapshot().phase === "turn", null, { timeout: 60_000 });
      await expect(page.locator("#sideResult")).toBeHidden();
      await page.click("#sideFlip");
      await page.waitForFunction(() => window.__sideShot.snapshot().sideIdx === 1, null, { timeout: 30_000 });
    }
  }
  await expect(page.locator("#sideResult")).toBeVisible({ timeout: 60_000 });
  const s = await page.evaluate(() => window.__sideShot.snapshot());
  expect(s.results.map(r => r.side).sort()).toEqual(["L", "R"]);
  await expect(page.locator("#sideResultSteps li")).toHaveCount(3);   // two sides + the symmetry bonus
  await expectFunnel(page, { mode: "side", attempts: 2 });
  errs.check();
});

// 새 환자의 옆으로 누운 몸 (2026-10-25): ?patient= lays that patient's own side-lying body; both sides and the roll still play
test("허리비틀기: ?patient=복순할매면 그 몸으로 양쪽을 끝낸다", async ({ page }) => {
  const errs = watchErrors(page);
  const glb = [];
  page.on("response", r => { if(/models\/side\/(patient\d*\.glb|patient_marks[^/]*\.json)$/.test(r.url()) && r.ok()) glb.push(r.url().split("/").pop()); });
  await page.goto("./side.html?patient=" + encodeURIComponent("복순할매"));
  await page.waitForFunction(() => document.documentElement.dataset.sideReady === "true", null, { timeout: 180_000 });
  expect(glb.sort()).toEqual(["patient13.glb", "patient_marks.json", "patient_marks_patient13.json"]);
  await expect(page.locator("#sideName")).toContainText("복순할매");
  await page.click("#sideTouchStart");
  for(let i = 0; i < 2; i++){
    await page.waitForFunction(() => { const s = window.__sideShot.snapshot(); return s.phase === "play" && performance.now() >= s.prepUntil; }, null, { timeout: 120_000 });
    await page.evaluate(() => { const g = window.__sideShot.goal(); window.__sideShot.aim(g.height); window.__sideShot.lock(true); window.__sideShot.press(g.roll, 0.6, 1); });
    if(i === 0){
      await page.waitForFunction(() => window.__sideShot.snapshot().phase === "turn", null, { timeout: 60_000 });
      await page.click("#sideFlip");
      await page.waitForFunction(() => window.__sideShot.snapshot().sideIdx === 1, null, { timeout: 30_000 });
    }
  }
  await expect(page.locator("#sideResult")).toBeVisible({ timeout: 60_000 });
  errs.check();
});

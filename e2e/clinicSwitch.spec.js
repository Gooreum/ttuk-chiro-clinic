import { test, expect } from "@playwright/test";
import { watchErrors, waitNeckAssets } from "./helpers.js";

test("클리닉 메뉴: 목꺾기 중에 열어 허리펴기로 옮긴다", async ({ page }) => {
  const errs = watchErrors(page);
  await page.goto("./");
  await waitNeckAssets(page);
  await page.click("#start");
  await page.waitForFunction(() => !window.__game.S.busy, null, { timeout: 30_000 });

  await page.click("#clinicBtn");
  const menu = page.locator("#clinicMenu");
  await expect(menu).toBeVisible();
  await expect(menu.locator("a")).toHaveText(["목꺾기", "목뽑기", "허리펴기", "허리비틀기"]);
  await expect(menu.locator("a[aria-current=page]")).toHaveText("목꺾기");
  await expect(menu.locator("a", { hasText: "목뽑기" })).toHaveAttribute("href", "./index.html?mode=towel");

  // while the menu is open the crack is blocked (blur first: Space on the focused chip would toggle the menu shut)
  await page.evaluate(() => document.activeElement?.blur());
  const before = await page.evaluate(() => window.__game.S.score);
  await page.keyboard.press("Space");
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => window.__game.S.score)).toBe(before);
  await expect(menu).toBeVisible();

  await menu.locator("a", { hasText: "허리펴기" }).click();
  await expect(page).toHaveURL(/back\.html$/);
  await expect(page.locator("#backWelcome")).toBeVisible();
  errs.check();
});

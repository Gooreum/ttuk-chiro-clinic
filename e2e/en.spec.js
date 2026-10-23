import { test, expect } from "@playwright/test";
import { watchErrors, waitNeckAssets, playNeckDay } from "./helpers.js";

// English (src/i18n): the other specs pin ko-KR (playwright.config.js). Here ?lang=en must leave no Hangul on screen.
// Canvas text is not in the DOM; npm run i18n:check covers it from the source side.
const hangulOnScreen = page => page.evaluate(() => {
  const H = /[가-힣]/, out = new Set();
  const shown = el => { for(let e = el; e; e = e.parentElement){ if(e.lang === "ko") return false; const s = getComputedStyle(e); if(s.display === "none" || s.visibility === "hidden" || +s.opacity === 0) return false; } return true; };
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for(let n = w.nextNode(); n; n = w.nextNode()) if(H.test(n.nodeValue) && shown(n.parentElement)) out.add(n.nodeValue.trim());
  if(H.test(document.title)) out.add(document.title);
  return [...out];
});

test("English: title, day 1 story, run and result card have no Korean", async ({ page }) => {
  const errs = watchErrors(page);
  await page.goto("./?lang=en");
  await waitNeckAssets(page);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  expect(await hangulOnScreen(page)).toEqual([]);

  await page.click("#campaignBtn");
  await expect(page.locator("#days")).toBeVisible();
  expect(await hangulOnScreen(page)).toEqual([]);
  await page.click('#dayList button[data-day="0"]');
  await expect(page.locator("#story")).toBeVisible();
  expect(await hangulOnScreen(page)).toEqual([]);

  await page.click("#storyGo");
  await expect(page.locator("#story")).toBeHidden();
  await page.evaluate(() => { window.__game.S.patients.length = 1; });
  await playNeckDay(page);
  await expect(page.locator("#result")).toBeVisible();
  expect(await hangulOnScreen(page)).toEqual([]);
  // saves and events stay Korean ids
  expect(await page.evaluate(() => window.__game.S.patients[0].name)).toMatch(/[가-힣]/);
  errs.check();
});

test("English: the language chip switches and the choice sticks", async ({ page }) => {
  const errs = watchErrors(page);
  await page.goto("./?lang=en");
  await expect(page.locator("#langBtn")).toBeVisible({ timeout: 120_000 });
  await expect(page.locator("#langBtn")).toHaveText("한국어");
  await Promise.all([page.waitForURL(u => !u.search.includes("lang=")), page.click("#langBtn")]);
  await expect(page.locator("#langBtn")).toBeVisible({ timeout: 120_000 });
  await expect(page.locator("html")).toHaveAttribute("lang", "ko");
  await expect(page.locator("#langBtn")).toHaveText("EN");
  await page.click("#langBtn");
  await expect(page.locator("#langBtn")).toBeVisible({ timeout: 120_000 });
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  expect(await page.evaluate(() => localStorage.getItem("chiroLang"))).toBe("en");
  errs.check();
});

for(const p of ["back.html", "side.html"]){
  test(`English: ${p} start card has no Korean`, async ({ page }) => {
    const errs = watchErrors(page);
    await page.goto(`./${p}?lang=en`);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("#langBtn")).toBeVisible({ timeout: 120_000 });
    await page.evaluate(() => document.fonts.ready);
    expect(await hangulOnScreen(page)).toEqual([]);
    errs.check();
  });
}

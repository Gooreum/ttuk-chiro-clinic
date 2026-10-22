import { test, expect } from "@playwright/test";
import { watchErrors, waitNeckAssets } from "./helpers.js";

test("환자 도감: 처음엔 비어 있고, 환자를 만나면 카드가 채워진다", async ({ page }) => {
  const errs = watchErrors(page);
  await page.goto("./");
  await waitNeckAssets(page);
  await expect(page.locator("#dexSub")).toContainText("환자 0/34");
  await page.click("#dexBtn");
  await expect(page.locator("#dex")).toBeVisible();
  await expect(page.locator("#dexList li")).toHaveCount(34);
  await expect(page.locator("#dexList li.miss")).toHaveCount(34);
  expect(await page.evaluate(() => window.__events.filter(e => e.name === "dex_open").length)).toBe(1);
  await page.click("#dexClose");
  await expect(page.locator("#dex")).toBeHidden();
  // 진료실에 들어온 첫 환자가 도감에 적힌다
  await page.click("#start");
  const first = await page.evaluate(() => window.__game.S.patients[0].name);
  await expect.poll(() => page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem("chiroDex") || "{}").met || {}))).toContain(first);
  errs.check();
});

test("환자 도감: 저장된 기록이 카드와 칭호에 나오고 실패 연출 탭이 열린다", async ({ page }) => {
  const errs = watchErrors(page);
  const save = { met: { "박대리": { first: "2026-10-22", n: 3, ok: 2 }, "최교수": { first: "2026-10-22", n: 1, ok: 1 }, "이라이더": { first: "2026-10-22", n: 1, ok: 1 }, "정작가": { first: "2026-10-22", n: 1, ok: 1 }, "김사장": { first: "2026-10-22", n: 1, ok: 0 } }, fails: { over: { first: "2026-10-22", n: 2 }, "t-slip": { first: "2026-10-22", n: 1 } } };
  await page.addInitScript(v => localStorage.setItem("chiroDex", v), JSON.stringify(save));
  await page.goto("./");
  await waitNeckAssets(page);
  await page.click("#campaignBtn");
  await expect(page.locator("#daysDexSub")).toContainText("환자 5/34");
  await page.click("#daysDex");
  await expect(page.locator("#dexList li:not(.miss)")).toHaveCount(5);
  await expect(page.locator("#dexList li.miss").first()).toContainText("???");
  await expect(page.locator("#dexTitle")).toContainText("칭호");
  await page.click('#dex .dex-tabs button[data-tab="f"]');
  await expect(page.locator("#dexList li")).toHaveCount(10);
  await expect(page.locator("#dexList li:not(.miss)")).toHaveCount(2);
  errs.check();
});

test("환자 도감: 잘못 꺾으면 실패 연출이 적히고 결과 카드에 알려 준다", async ({ page }) => {
  const errs = watchErrors(page);
  await page.goto("./");
  await waitNeckAssets(page);
  await page.click("#start");
  await expect.poll(() => page.evaluate(() => !!localStorage.getItem("chiroDex"))).toBe(true);
  await page.evaluate(() => window.__game.finish());
  await expect(page.locator("#result")).toBeVisible();
  await expect(page.locator(".dex-new")).toContainText("도감에 새로 적혔어요");
  errs.check();
});

test("환자 도감: 단골 의뢰를 깬 편만 뒷이야기가 적히고 못 깬 편은 잠겨 있다", async ({ page }) => {
  const errs = watchErrors(page);
  const dex = { met: { "박대리": { first: "2026-10-22", n: 2, ok: 1 }, "최교수": { first: "2026-10-22", n: 1, ok: 1 } }, fails: {} };
  const camp = { cleared: 7, stars: Array(7).fill(2), quests: { "박대리1": 3 } };
  await page.addInitScript(([d, c]) => { localStorage.setItem("chiroDex", d); localStorage.setItem("chiroCampaign", c); }, [JSON.stringify(dex), JSON.stringify(camp)]);
  await page.goto("./");
  await waitNeckAssets(page);
  await expect(page.locator("#dexSub")).toContainText("뒷이야기 1");
  await page.click("#dexBtn");
  await expect(page.locator("#dexLead")).toContainText("뒷이야기 1/64");
  await expect(page.locator("#dexList .tale:not(.lock)")).toHaveCount(1);
  await expect(page.locator("#dexList .tale:not(.lock)")).toContainText("1편 야근 후유증");
  await expect(page.locator("#dexList .tale.lock")).toHaveCount(5);
  expect(await page.evaluate(() => window.__events.find(e => e.name === "dex_open").tales)).toBe(1);
  errs.check();
});

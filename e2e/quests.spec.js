import { test, expect } from "@playwright/test";
import { watchErrors, waitNeckAssets, playNeckDay } from "./helpers.js";

test("단골 의뢰: 게시판에서 이라이더 의뢰를 열어 완주하면 별이 저장된다", async ({ page }) => {
  const errs = watchErrors(page);
  await page.addInitScript(() => localStorage.setItem("chiroCampaign", JSON.stringify({ cleared: 1, stars: [2] })));
  await page.goto("./");
  await waitNeckAssets(page);

  await page.click("#campaignBtn");
  await page.click("#questOpen");
  await expect(page.locator("#quests")).toBeVisible();
  await expect(page.locator("#days")).toBeHidden();
  // day 1 cleared: only the regulars from day 1 have posted (박대리, 이라이더), the rest is locked
  await expect(page.locator("#questList button")).toHaveCount(2);
  await expect(page.locator("#questLocked")).toContainText("잠긴 의뢰 62개");
  await page.click('#questList button[data-q="이라이더1"]');
  await expect(page.locator("#story")).toBeVisible();
  await expect(page.locator("#storyNo")).toHaveText("단골 의뢰 · 이라이더 1편");
  await expect(page.locator("#storyTitle")).toHaveText("배달 피크");
  await expect(page.locator("#storyRules")).toContainText("통증 1번이면 끝");
  await expect(page.locator("#storyHard")).toBeHidden();
  await expect(page.locator("#storyGo")).toHaveText("의뢰 시작");

  // 일지로 -> 의뢰 목록으로 (the card's back button returns to the board, not the day list)
  await page.locator("#storyBack").dispatchEvent("click");
  await expect(page.locator("#quests")).toBeVisible();
  await page.click('#questList button[data-q="이라이더1"]');
  await page.click("#storyGo");
  await expect(page.locator("#story")).toBeHidden();
  const run = await page.evaluate(() => { const S = window.__game.S; return { day: S.day, quest: S.quest, pain: S.painMax, game: S.game, names: S.patients.map(p => p.name) }; });
  expect({ ...run, quest: 0 }).toEqual({ day: -1, quest: 0, pain: 1, game: "clinic", names: ["이라이더"] });
  expect(run.quest).toBeGreaterThan(0);

  await playNeckDay(page);
  await expect(page.locator("#rdate")).toHaveText("단골 의뢰 · 이라이더 배달 피크");
  await expect(page.locator("#dayOutro")).toBeVisible();
  await expect(page.locator("#nextDay")).toBeHidden();
  await expect(page.locator("#toDays")).toHaveText("의뢰 목록");
  const prog = await page.evaluate(() => JSON.parse(localStorage.getItem("chiroCampaign")));
  expect(prog.cleared).toBe(1);   // a quest never moves the campaign
  expect(prog.quests["이라이더1"]).toBeGreaterThan(0);
  const ev = await page.evaluate(() => window.__events.filter(e => /^quest_/.test(e.name)).map(e => e.name));
  expect(ev).toEqual(["quest_start", "quest_end"]);

  const slow = { timeout: 120_000 };
  await page.locator("#toDays").dispatchEvent("click");
  await expect(page.locator("#quests")).toBeVisible(slow);
  await expect(page.locator('#questList button[data-q="이라이더1"] i')).toHaveText(/★/, slow);
  errs.check();
});

test("단골 의뢰: 2편은 1편을 깨고 새 단골이 나와야 열린다", async ({ page }) => {
  const errs = watchErrors(page);
  await page.addInitScript(() => localStorage.setItem("chiroCampaign", JSON.stringify({ cleared: 14, stars: Array(14).fill(2) })));
  await page.goto("./");
  await waitNeckAssets(page);
  await page.click("#campaignBtn");
  await page.click("#questOpen");
  await expect(page.locator('#questList button[data-q="박대리1"]')).toBeVisible();
  await expect(page.locator('#questList button[data-q="박대리2"]')).toHaveCount(0);   // 1편 not cleared yet
  await page.click("#questClose");
  await expect(page.locator("#days")).toBeVisible();
  errs.check();
});

test("단골 의뢰: 3편은 2편을 깨야 열리고 완결 표시가 붙는다", async ({ page }) => {
  const errs = watchErrors(page);
  await page.addInitScript(() => localStorage.setItem("chiroCampaign", JSON.stringify({ cleared: 1, stars: [2], quests: { "이라이더1": 2, "이라이더2": 1 } })));
  await page.goto("./");
  await waitNeckAssets(page);
  await page.click("#campaignBtn");
  await page.click("#questOpen");
  await expect(page.locator('#questList button[data-q="이라이더3"]')).toBeVisible();   // 2편을 깬 저장
  await expect(page.locator('#questList button[data-q="박대리3"]')).toHaveCount(0);   // 박대리 2편은 안 깼다
  await page.click('#questList button[data-q="이라이더3"]');
  await expect(page.locator("#storyNo")).toHaveText("단골 의뢰 · 이라이더 3편 · 완결");
  await expect(page.locator("#storyTitle")).toHaveText("마지막 콜");
  await expect(page.locator("#storyRules")).toContainText("통증 1번이면 끝");
  errs.check();
});

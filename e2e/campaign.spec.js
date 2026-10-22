import { test, expect } from "@playwright/test";
import { watchErrors, waitNeckAssets, playNeckDay } from "./helpers.js";

test("영업 일지: 1일차 사연을 보고 완주하면 2일차가 열린다", async ({ page }) => {
  const errs = watchErrors(page);
  await page.goto("./");
  await waitNeckAssets(page);
  await expect(page.locator("#campaignSub")).toHaveText("개업 첫 주 · 1장 1일차");

  await page.click("#campaignBtn");
  await expect(page.locator("#days")).toBeVisible();
  await expect(page.locator("#dayList button")).toHaveCount(7);
  await expect(page.locator('#chTabs button[data-ch="2"]')).toBeDisabled();   // 2장 opens after 1장
  await expect(page.locator('#dayList button[data-day="1"]')).toBeDisabled();
  await page.click('#dayList button[data-day="0"]');
  await expect(page.locator("#story")).toBeVisible();
  await expect(page.locator("#storyTitle")).toHaveText("개업 첫날");
  await expect(page.locator("#storyNo")).toHaveText("1장 1일차");

  await page.click("#storyGo");
  await expect(page.locator("#story")).toBeHidden();
  const day = await page.evaluate(() => ({ day: window.__game.S.day, game: window.__game.S.game, names: window.__game.S.patients.map(p => p.name) }));
  expect(day).toEqual({ day: 0, game: "clinic", names: ["박대리", "이라이더"] });
  // one patient keeps the whole e2e run inside its time budget; the day still ends complete
  await page.evaluate(() => { window.__game.S.patients.length = 1; });

  await playNeckDay(page);
  await expect(page.locator("#rdate")).toHaveText("영업 일지 · 1장 1일차 개업 첫날");
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

test("영업 일지: 1장을 다 깨면 2장 탭이 열리고 캠페인 환자가 온다", async ({ page }) => {
  const errs = watchErrors(page);
  await page.addInitScript(() => localStorage.setItem("chiroCampaign", JSON.stringify({ cleared: 7, stars: [2, 2, 2, 2, 2, 2, 2] })));
  await page.goto("./");
  await waitNeckAssets(page);
  await expect(page.locator("#campaignSub")).toHaveText("소문의 대가 · 2장 1일차");
  await page.click("#campaignBtn");
  await expect(page.locator('#chTabs button[data-ch="2"]')).toHaveClass(/on/);
  await expect(page.locator("#chLead")).toHaveText("맞은편에 반듯 정골원이 생겼어요");
  await expect(page.locator('#dayList button[data-day="7"]')).toBeEnabled();
  await expect(page.locator('#dayList button[data-day="13"]')).toHaveClass(/boss/);
  await page.click('#chTabs button[data-ch="1"]');
  await expect(page.locator('#dayList button[data-day="0"]')).toBeVisible();
  await page.click('#chTabs button[data-ch="2"]');
  await page.click('#dayList button[data-day="7"]');
  await expect(page.locator("#storyNo")).toHaveText("2장 1일차");
  await page.click("#storyGo");
  const day = await page.evaluate(() => ({ day: window.__game.S.day, names: window.__game.S.patients.map(p => p.name).sort() }));
  expect(day).toEqual({ day: 7, names: ["박대리", "오인턴", "최조교"].sort() });
  errs.check();
});

test("영업 일지: 3장 허리펴기 날은 back.html?day로 넘어가 그날 환자를 받는다", async ({ page }) => {
  const errs = watchErrors(page);
  await page.addInitScript(() => localStorage.setItem("chiroCampaign", JSON.stringify({ cleared: 14, stars: Array(14).fill(2) })));
  await page.goto("./");
  await expect(page.locator("#campaignSub")).toHaveText("허리 펴러 오세요 · 3장 1일차");
  await page.click("#campaignBtn");
  await expect(page.locator('#chTabs button[data-ch="3"]')).toHaveClass(/on/);
  await expect(page.locator('#dayList button[data-day="14"]')).toContainText("허리펴기");
  await expect(page.locator('#dayList button[data-day="20"]')).toHaveClass(/boss/);
  await page.click('#dayList button[data-day="14"]');
  await expect(page.locator("#storyRules")).toContainText("박대리 · 세 구역");
  errs.leaving();
  await page.click("#storyGo");
  await page.waitForURL(/back\.html\?day=14$/);
  await expect(page.locator("#backDayNo")).toHaveText("영업 일지 · 3장 1일차 허리 코너 신설");
  await expect(page.locator("#backName")).toContainText("박대리");

  // 무거운 군장: 서병장, two pain slots (let day 14 finish loading first: leaving mid-load fails the error watch)
  await page.waitForFunction(() => document.documentElement.dataset.backReady === "true", null, { timeout: 180_000 });
  const errs2 = watchErrors(page);
  await page.goto("./back.html?day=16");
  await expect(page.locator("#backName")).toContainText("서병장");
  await expect(page.locator("#backMistakes i")).toHaveCount(2);
  await expect(page.locator("#backWelcomeText")).toContainText("군장");
  errs2.leaving();

  // back.html's result links: ?story=N opens that open day's story card, ?days=1 the day list
  await page.goto("./?story=14");
  await expect(page.locator("#story")).toBeVisible();
  await expect(page.locator("#storyTitle")).toHaveText("허리 코너 신설");
  await page.goto("./?days=1");
  await expect(page.locator("#days")).toBeVisible();
  errs.check();
});

test("영업 일지: 5장 허리비틀기 날은 side.html?day로 넘어가 그날 환자를 받는다", async ({ page }) => {
  const errs = watchErrors(page);
  await page.addInitScript(() => localStorage.setItem("chiroCampaign", JSON.stringify({ cleared: 29, stars: Array(29).fill(2) })));
  await page.goto("./?story=29");
  await expect(page.locator("#story")).toBeVisible();
  await expect(page.locator("#storyRules")).toContainText("허리비틀기");
  await expect(page.locator("#storyRules")).toContainText("이스쿠터 · 좌우 한 번씩");
  errs.leaving();
  await page.click("#storyGo");
  await page.waitForURL(/side\.html\?day=29$/);
  await expect(page.locator("#sideDayNo")).toHaveText("영업 일지 · 5장 2일차 쌍둥이 아닌 동생");
  await expect(page.locator("#sideName")).toContainText("이스쿠터");
  await expect(page.locator("#sideMistakes i")).toHaveCount(3);
  await expect(page.locator("#sideWelcomeText")).toContainText("이라이더 동생");
  await page.waitForFunction(() => document.documentElement.dataset.sideReady === "true", null, { timeout: 180_000 });
  errs.check();
});

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
  await expect(page.locator("#interludeTitle")).toHaveText("월세 동결, 맞은편엔 현수막");   // 장 막간 first
  await page.locator("#interludeGo").dispatchEvent("click");
  await expect(page.locator("#storyNo")).toHaveText("2장 1일차");
  await page.click("#storyGo");
  const day = await page.evaluate(() => ({ day: window.__game.S.day, names: window.__game.S.patients.map(p => p.name).sort() }));
  expect(day).toEqual({ day: 7, names: ["박대리", "오인턴", "최조교"].sort() });
  errs.check();
});

test("영업 일지: 3장 허리펴기 날은 back.html?day로 넘어가 그날 환자를 받는다", async ({ page }) => {
  const errs = watchErrors(page);
  await page.addInitScript(() => localStorage.setItem("chiroCampaign", JSON.stringify({ cleared: 14, stars: Array(14).fill(2), seen: [2, 3] })));
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
  await expect(page.locator("#storyRules")).toContainText("이스쿠터 · 좌우 양쪽");
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

test("영업 일지: 별 3개 날은 역경으로 다시 열리고 더 빡센 규칙으로 시작한다", async ({ page }) => {
  const errs = watchErrors(page);
  await page.addInitScript(() => localStorage.setItem("chiroCampaign", JSON.stringify({ cleared: 2, stars: [3, 2], hard: [2] })));
  await page.goto("./");
  await waitNeckAssets(page);
  await page.click("#campaignBtn");
  await expect(page.locator('#dayList button[data-day="0"] i')).toHaveText("역경 ★★☆");
  await page.click('#dayList button[data-day="1"]');
  await expect(page.locator("#storyHard")).toBeHidden();   // two stars: no 역경 yet
  await page.locator("#storyBack").dispatchEvent("click");
  await page.click('#dayList button[data-day="0"]');
  await expect(page.locator("#storyHard")).toBeVisible();
  await page.click("#storyHard");
  await expect(page.locator("#storyNo")).toHaveText("1장 1일차 · 역경");
  await expect(page.locator("#storyRules")).toContainText("구역 안내 없음");
  await expect(page.locator("#storyRules")).toContainText("구역이 좁아요");
  await expect(page.locator("#storyRules")).toContainText("역경 · 평균 98점 넘기기");
  await page.click("#storyGo");
  const s = await page.evaluate(() => { const S = window.__game.S; return { day: S.day, hard: S.hard, zone: S.zoneUntil, tight: !!S.mods.tight }; });
  expect(s).toEqual({ day: 0, hard: true, zone: 0, tight: true });
  errs.check();
});

test("영업 일지: 장 막간은 다음 장 첫날 전에 한 번만 뜨고 막간 칩으로 다시 본다", async ({ page }) => {
  const errs = watchErrors(page);
  const shotDir = process.env.INTERLUDE_SHOTS;
  // 3장까지 21일을 깬 저장(기존 형식: seen 없음)
  await page.addInitScript(() => { if (!localStorage.getItem("chiroCampaign")) localStorage.setItem("chiroCampaign", JSON.stringify({ cleared: 21, stars: Array(21).fill(2) })); });
  await page.goto("./");
  await waitNeckAssets(page);
  await page.click("#campaignBtn");
  await page.click('#chTabs button[data-ch="3"]');
  await expect(page.locator("#chInterlude")).toBeVisible();   // 3장 앞 막간은 다시 볼 수 있다
  await page.click('#chTabs button[data-ch="4"]');
  await expect(page.locator("#chInterlude")).toBeVisible();
  await page.click('#chTabs button[data-ch="1"]');
  await expect(page.locator("#chInterlude")).toBeHidden();   // 1장은 앞에 막간이 없다
  await page.click('#chTabs button[data-ch="4"]');
  await page.click('#dayList button[data-day="21"]');
  await expect(page.locator("#interlude")).toBeVisible();
  await expect(page.locator("#story")).toBeHidden();
  await expect(page.locator("#interludeTitle")).toHaveText("파라솔 아래 임시 진료소");
  await expect(page.locator("#interludeLines li")).toHaveCount(5);
  if (shotDir) for (const [w, h] of [[844, 390], [740, 360]]) { await page.setViewportSize({ width: w, height: h }); await page.screenshot({ path: `${shotDir}/interlude-${w}x${h}.png` }); }
  await page.locator("#interludeGo").dispatchEvent("click");
  await expect(page.locator("#interlude")).toBeHidden();
  await expect(page.locator("#storyNo")).toHaveText("4장 1일차");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("chiroCampaign")))).toMatchObject({ cleared: 21, seen: [4] });
  // 두 번째로 열면 바로 사연 카드
  await page.locator("#storyBack").dispatchEvent("click");
  await page.click('#dayList button[data-day="21"]');
  await expect(page.locator("#interlude")).toBeHidden();
  await expect(page.locator("#story")).toBeVisible();
  await page.locator("#storyBack").dispatchEvent("click");
  // 막간 칩으로 다시 보고 일지로 돌아온다
  await page.click("#chInterlude");
  await expect(page.locator("#interlude")).toBeVisible();
  await expect(page.locator("#days")).toBeHidden();
  await page.locator("#interludeGo").dispatchEvent("click");
  await expect(page.locator("#days")).toBeVisible();
  errs.check();
});

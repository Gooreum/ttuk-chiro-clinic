import { expect } from "@playwright/test";

// Fails the test on any page error or console error (same rule as scripts/shot.py).
export function watchErrors(page){
  const errors = [];
  page.on("pageerror", e => errors.push(`pageerror: ${e.message}`));
  page.on("console", m => { if(m.type() === "error") errors.push(`console: ${m.text()}`); });
  return { check: () => expect(errors, errors.join("\n")).toEqual([]) };
}

// Realistic models load in the background; wait until both finished (ready or failed) so later frames are stable.
export async function waitNeckAssets(page){
  await page.waitForFunction(() => document.documentElement.dataset.head && document.documentElement.dataset.hands, null, { timeout: 120_000 });
  await page.evaluate(() => document.fonts.ready);
}

// Neck modes: tap Space (the keyboard crack) until the day log shows. Space is ignored while busy / chart open.
export async function playNeckDay(page, { limit = 420_000 } = {}){
  const result = page.locator("#result");
  const until = Date.now() + limit;
  while(await result.isHidden()){
    if(Date.now() > until) throw new Error("day never ended: " + JSON.stringify(await page.evaluate(() => {
      const S = window.__game.S; return { phase: S.phase, idx: S.idx, side: S.sideIdx, busy: S.busy, results: S.results.length };
    })));
    await page.keyboard.press("Space");
    await page.waitForTimeout(600);
  }
}

// Analytics (src/platform/analytics.js): the shot build keeps every event in window.__events. Checks that the run's
// funnel was logged in order and returns the events.
export async function expectFunnel(page, { mode, attempts }){
  const ev = await page.evaluate(() => window.__events || []);
  const names = ev.map(e => e.name);
  for(const n of ["app_open", "screen_view", "load_ready", "run_start", "attempt", "run_end", "run_complete"]) expect(names, n).toContain(n);
  expect(names.indexOf("load_ready")).toBeLessThan(names.indexOf("run_start"));
  expect(names.indexOf("run_start")).toBeLessThan(names.lastIndexOf("run_end"));
  expect(ev.filter(e => e.name === "attempt" && e.result === "ok").length).toBeGreaterThanOrEqual(attempts);
  ev.forEach(e => expect(e.mode, e.name).toBe(mode));
  expect(ev.find(e => e.name === "run_end").outcome).toBe("complete");
  return ev;
}

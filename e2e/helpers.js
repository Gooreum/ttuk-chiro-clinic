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
  await page.waitForFunction(() => document.documentElement.dataset.head && document.documentElement.dataset.hands, null, { timeout: 30_000 });
  await page.evaluate(() => document.fonts.ready);
}

// Neck modes: tap Space (the keyboard crack) until the day log shows. Space is ignored while busy / chart open.
export async function playNeckDay(page, { limit = 180_000 } = {}){
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

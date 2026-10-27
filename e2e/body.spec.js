import { test, expect } from "@playwright/test";
import { watchErrors, waitNeckAssets, playNeckDay } from "./helpers.js";

// 체형 (core/body.js, 2026-10-23): the new bodies come on the table, their models load first, and the small chart names
// the body type beside the trait. The 2nd and 3rd patients are swapped in before they are loaded (window.__game.roll).
for(const [mode, start] of [["목꺾기", "#start"], ["목뽑기", "#startTowel"]]){
  test(`체형: ${mode} 날에 근육돼지·어린이가 오면 그 몸이 뜨고 차트에 체형이 적힌다`, async ({ page }) => {
    const errs = watchErrors(page);
    const glb = new Set();
    page.on("response", r => { const m = r.url().match(/models\/(?:towel-stage\/)?(patient\d\d)\/body\.glb$/); if(m && r.ok()) glb.add(m[1]); });
    await page.goto(start === "#startTowel" ? "./?mode=towel" : "./");
    await waitNeckAssets(page);
    await page.click(start);
    await page.evaluate(() => { const g = window.__game; g.S.patients.splice(1, 2, g.roll("마동철"), g.roll("정꼬마")); });
    // play until the hog is on the table
    const until = Date.now() + 300_000;
    while(await page.evaluate(() => window.__game.S.idx) < 1){
      if(Date.now() > until) throw new Error("second patient never came");
      await page.keyboard.press("Space"); await page.waitForTimeout(600);
    }
    await expect(page.locator("#pname")).toHaveText("마동철");
    await expect(page.locator("#ptrait")).toContainText("근육돼지");
    const hog = await page.evaluate(() => { const S = window.__game.S; return { heavy: S.target.heavy, model: S.target.look.model, towel: S.towel && S.towel.half }; });
    expect(hog).toMatchObject({ heavy: 0.2, model: "patient08" });
    if(mode === "목뽑기") expect(hog.towel).toBeCloseTo(0.13, 5);
    // 목뽑기 lays 마동철 on his image-to-3D clinic body too (look.clinicModel, no towel-stage copy: "fallback")
    await page.waitForFunction(() => document.documentElement.dataset.towelPatient === "fallback" || window.__game.S.game !== "towel", null, { timeout: 120_000 });
    await playNeckDay(page);
    expect(await page.evaluate(() => window.__game.S.results.map(r => r.name).slice(1))).toEqual(["마동철", "정꼬마"]);
    expect([...glb]).toEqual(expect.arrayContaining(["patient12", "patient10"]));   // 마동철's image-to-3D body in both neck modes
    errs.check();
  });
}

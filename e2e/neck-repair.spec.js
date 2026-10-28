import { test, expect } from '@playwright/test';
import { watchErrors, waitNeckAssets, playNeckDay } from './helpers.js';

// Exercise the normal game loader without a necklab/repair query. Cast patients
// borrow patient08 without the roster's separate image-to-3D clinicModel.
test('patient08 목 수리가 실제 목꺾기에서 로드되고 한 판을 끝낸다', async ({ page }) => {
  const errors=watchErrors(page), warnings=[];
  page.on('console',m=>{if(m.type()==='warning'&&m.text().includes('clinic neck'))warnings.push(m.text());});
  await page.addInitScript(() => {
    window.__neckScenes=[];window.__THREE_DEVTOOLS__=new EventTarget();
    window.__THREE_DEVTOOLS__.addEventListener('observe',e=>{if(e.detail?.isScene)window.__neckScenes.push(e.detail);});
  });
  await page.goto('./');await waitNeckAssets(page);await page.click('#start');
  await page.evaluate(() => {
    const g=window.__game,p=g.roll('마동철');p.look={...p.look};delete p.look.clinicModel;
    g.S.patients.splice(1,1,p);
  });
  const until=Date.now()+240_000;
  while(await page.evaluate(()=>window.__game.S.idx)<1){
    if(Date.now()>until)throw new Error('patient08 never reached the table');
    await page.keyboard.press('Space');await page.waitForTimeout(600);
  }
  await page.waitForFunction(() => {
    let found=false;
    for(const s of window.__neckScenes)s.traverse(o=>{
      if(o.name!=='patient08_neck_patch')return;
      let visible=true;for(let p=o;p;p=p.parent)visible&&=p.visible;
      found||=visible;
    });
    return found;
  },null,{timeout:120_000});
  expect(await page.evaluate(()=>window.__neckLab)).toBeUndefined();
  await expect(page.locator('#pname')).toHaveText('마동철');
  await playNeckDay(page);
  expect(await page.evaluate(()=>window.__game.S.results.some(r=>r.name==='마동철'))).toBe(true);
  expect(warnings).toEqual([]);errors.check();
});

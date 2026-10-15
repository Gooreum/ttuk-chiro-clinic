"""Exercise real back-mode controls and save deterministic visual checks. Uses the shot build's read-only state."""
import asyncio, functools, http.server, json, pathlib, threading
from playwright.async_api import async_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'shots' / 'back-press'
OUT.mkdir(parents=True, exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args): pass
server = http.server.ThreadingHTTPServer(('127.0.0.1',0), functools.partial(Quiet,directory=str(ROOT/'dist-shot')))
threading.Thread(target=server.serve_forever,daemon=True).start()
BASE = f'http://127.0.0.1:{server.server_address[1]}'
async def run():
    errors=[]
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist'])
        page = await browser.new_page(viewport={'width':812,'height':375},device_scale_factor=1)
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
        await page.clock.install(time=0)
        await page.clock.pause_at(1000)
        await page.goto(BASE+'/back.html')
        await page.wait_for_selector('html[data-back-ready="true"]',timeout=90000,state='attached')
        await page.evaluate('document.fonts.ready')
        await page.clock.fast_forward(500)
        await page.screenshot(path=str(OUT/'01-welcome.png'))
        await page.click('#backStart')
        await page.clock.fast_forward(500)
        await page.screenshot(path=str(OUT/'02-play.png')); print('ready',flush=True)
        async def snap(): return await page.evaluate('window.__backShot.snapshot()')
        async def position(value):
            box=await page.locator('#backPosition').bounding_box()
            await page.mouse.click(box['x']+8+value*(box['width']-16),box['y']+box['height']/2)
            await page.clock.fast_forward(250)
        async def press(ms=540):
            box=await page.locator('#backPress').bounding_box()
            await page.mouse.move(box['x']+box['width']/2,box['y']+box['height']/2)
            await page.mouse.down()
            await page.clock.fast_forward(ms)
        # Invalid low pressure is recoverable and does not advance the segment.
        await position(.18); await press(120); await page.mouse.up(); await page.clock.fast_forward(1200)
        s=await snap(); assert s['mistakes']==1 and s['step']==0 and s['phase']=='play',s
        # Three valid pushes through actual range and pointer controls.
        for i,value in enumerate([.18,.50,.82]):
            await position(value); s=await snap(); assert abs(s['position']-value)<.03,s
            await press()
            if i==0: await page.screenshot(path=str(OUT/'03-preload.png'))
            await page.mouse.up(); await page.clock.fast_forward(100)
            if i==0: await page.screenshot(path=str(OUT/'04-thrust.png'))
            await page.clock.fast_forward(2300)
            s=await snap(); assert len(s['results'])==i+1,s; print('passed step',i+1,flush=True)
        assert s['phase']=='result' and s['score']>=270,s
        await page.screenshot(path=str(OUT/'05-result.png'))
        best=await page.evaluate('JSON.parse(localStorage.getItem("chiroBackBest"))'); assert best>=270
        # Retry clears all score/failure state; cancelling a hold never applies it.
        await page.click('#backAgain'); await page.clock.fast_forward(100)
        s=await snap(); assert s['score']==0 and s['mistakes']==0 and len(s['results'])==0,s
        await page.locator('#backPress').focus(); await page.keyboard.down('Space'); await page.clock.fast_forward(300)
        assert (await snap())['holdAt'] is not None
        await page.click('#backPause'); await page.keyboard.up('Space')
        s=await snap(); assert s['phase']=='paused' and s['holdAt'] is None,s
        await page.click('#backResume'); await page.clock.fast_forward(100)
        assert (await snap())['mistakes']==0
        # Excess pressure has its own visible animation; three errors end the run.
        await position(.18); await press(950); await page.mouse.up(); await page.clock.fast_forward(350)
        await page.screenshot(path=str(OUT/'06-over.png'))
        await page.clock.fast_forward(1700)
        assert (await snap())['kind']=='over'
        for _ in range(2):
            await press(120); await page.mouse.up(); await page.clock.fast_forward(1600)
        assert (await snap())['phase']=='result'
        assert await page.evaluate('JSON.parse(localStorage.getItem("chiroBackBest"))')==best
        # Rotated phone: local pointer projection must still select the correct back segment.
        await page.set_viewport_size({'width':390,'height':844}); await page.clock.fast_forward(200)
        await page.click('#backAgain'); await page.clock.fast_forward(500)
        projected=await page.evaluate('window.__backShot.project(.18)')
        await page.mouse.click(390-projected['y'],projected['x']); await page.clock.fast_forward(200)
        s=await snap(); assert abs(s['position']-.18)<.08,('portrait picking',s['position'],projected)
        await page.screenshot(path=str(OUT/'07-portrait.png'))
        await page.set_viewport_size({'width':1280,'height':800}); await page.clock.fast_forward(500)
        await page.screenshot(path=str(OUT/'08-desktop.png'))
        await browser.close()
    assert not errors,errors
    print(json.dumps({'checks':'success/retry/weak/over/three-strikes/pause/portrait-picking','errors':errors,'shots':str(OUT)},ensure_ascii=False))
try: asyncio.run(run())
finally: server.shutdown()

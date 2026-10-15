"""Replay raw device-motion events through the real UI; no force-hit or state mutation hooks."""
import asyncio,functools,http.server,json,pathlib,threading,os
from playwright.async_api import async_playwright
ROOT=pathlib.Path(__file__).resolve().parent.parent
OUT=ROOT/'shots'/'back-motion';OUT.mkdir(parents=True,exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*a):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT/'dist-shot')))
threading.Thread(target=server.serve_forever,daemon=True).start()
URL=f'http://127.0.0.1:{server.server_address[1]}/back.html'
INIT="""window.__requests=[]; for(const name of ['DeviceMotionEvent','DeviceOrientationEvent']){
  if(!window[name])window[name]=function(){};
  Object.defineProperty(window[name],'requestPermission',{value:()=>{window.__requests.push(name);return Promise.resolve('granted')},configurable:true});
}"""
async def main():
 errors=[]
 async with async_playwright() as p:
  browser=await p.webkit.launch() if os.getenv('BACK_BROWSER','webkit')=='webkit' else await p.chromium.launch(args=['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist'])
  context=await browser.new_context(viewport={'width':812,'height':375},has_touch=True,is_mobile=True,device_scale_factor=1)
  await context.add_init_script(INIT)
  page=await context.new_page();page.set_default_timeout(45000)
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
  await page.clock.install(time=0);await page.clock.pause_at(1000)
  await page.goto(URL);await page.wait_for_selector('html[data-back-ready="true"]',state='attached',timeout=90000)
  await page.evaluate('document.fonts.ready'); await page.evaluate('window.requestAnimationFrame=callback=>setTimeout(()=>callback(performance.now()),200);window.cancelAnimationFrame=id=>clearTimeout(id)'); await page.clock.fast_forward(250)
  await page.screenshot(path=str(OUT/'01-welcome.png'))
  await page.click('#backStart');await page.clock.fast_forward(30)
  assert await page.evaluate('window.__requests.length')==2
  assert await page.locator('#backPress').is_hidden()
  async def state():return await page.evaluate('window.__backShot.snapshot()')
  async def advance_shot(seconds):
   elapsed=await page.evaluate('(performance.now()-window.__backShot.snapshot().animAt)/1000')
   await page.clock.fast_forward(max(0,round((seconds-elapsed)*1000)))
  pose={'lr':0.,'pt':0.}
  async def send(forward=0,side=0,down=0,rate=0,ms=60):
   await page.evaluate("""({lr,pt,forward,side,down,rate})=>{
     const a=((screen.orientation?.angle??window.orientation??0)+(innerHeight>innerWidth?90:0))*Math.PI/180;
     const r=Math.PI/180,gx=9.81*Math.sin(lr*r),gy=9.81*Math.cos(lr*r)*Math.sin(pt*r),gz=9.81*Math.cos(lr*r)*Math.cos(pt*r),c=Math.cos(a),s=Math.sin(a);
     const lin={x:side*c+forward*s,y:-side*s+forward*c,z:-down};
     const event=new Event('devicemotion');Object.defineProperties(event,{
       acceleration:{value:lin},accelerationIncludingGravity:{value:{x:gx*c+gy*s+lin.x,y:-gx*s+gy*c+lin.y,z:gz+lin.z}},rotationRate:{value:{alpha:rate,beta:0,gamma:0}}});
     dispatchEvent(event);
   }""",dict(pose,forward=forward,side=side,down=down,rate=rate))
   if ms:await page.clock.fast_forward(ms)
  async def warm():
   for i in range(25):
    await send(ms=100)
    if i%8==0:print('calibrating',i,flush=True)
   assert (await state())['motionReady']
  async def aim(target,pressure=.6):
   for _ in range(40):
    st=await state();dp=st['position']-target;df=st['pressure']-pressure
    if abs(dp)<.009 and abs(df)<.016:break
    # Correct pose gradually, just as a player follows the position and pressure feedback.
    d=((dp/.12)**2+(df/.18)**2)**.5;close=max(0,min(1,1-(d-.3)/2.2));gain=1-.6*close
    pose['lr']-=max(-4,min(4,dp/(1.5*.022*gain)*.45))
    pose['pt']+=max(-4,min(4,df/(1.5*.04*gain)*.45))
    await send(ms=80)
   for _ in range(6):await send(ms=70)
   st=await state();assert abs(st['position']-target)<.04 and abs(st['pressure']-pressure)<.06,st
  await warm();await page.screenshot(path=str(OUT/'02-motion-aim.png'));print('motion calibrated',flush=True)
  # Twisting, pulling back and sideways shaking must not fire a treatment.
  await send(side=24,ms=60);await send(forward=-16,ms=60);await send(forward=16,ms=60)
  assert (await state())['phase']=='play'
  for _ in range(6):await send(ms=70)
  for step,target in enumerate((await state())['targets']):
   await aim(target)
   if step==0:
    await page.screenshot(path=str(OUT/'03-preload.png'))
    before=await page.evaluate('[.25,.65].map(p=>window.__backShot.project(p))')
   await send(forward=12,ms=0)
   st=await state();assert st['phase']=='anim' and st['kind']=='ok',st
   await page.clock.fast_forward(140)
   if step==0:
    await send(forward=44,ms=0)
    assert (await state())['tier']==0,'a new burst outside 130ms must not change the completed press'
   await page.clock.fast_forward(100)
   if step==0:
    await page.screenshot(path=str(OUT/'04-thrust.png'))
    after=await page.evaluate('[.25,.65].map(p=>window.__backShot.project(p))')
    def span(points):return ((points[0]['x']-points[1]['x'])**2+(points[0]['y']-points[1]['y'])**2)**.5
    assert span(after)>=span(before)*.98,(before,after)
   await page.clock.fast_forward(950)
   if step==0:
    assert await page.locator('#backSpeech').is_hidden()
    await page.screenshot(path=str(OUT/'05-compressed-xray.png'))
    await page.clock.fast_forward(1200)
    await page.screenshot(path=str(OUT/'05-release-xray.png'))
   await page.clock.fast_forward(1500 if step==0 else 2700)
   st=await state();assert st['faceVisible'],st
   assert await page.locator('#backSpeech').is_visible()
   if step==0:await page.screenshot(path=str(OUT/'06-face-relief.png'))
   await page.clock.fast_forward(3700)
   st=await state();assert len(st['results'])==step+1,st
   if step<2:
    for _ in range(8):await send(ms=100)
  assert (await state())['phase']=='result';await page.screenshot(path=str(OUT/'07-result.png'));print('three motion successes and face/Xray sequencing passed',flush=True)
  # Every shove, even a well-aimed one, keeps the peak: normal onset -> crack or fracture.
  for force,tier,label in [(28,1,'crack'),(44,2,'fracture')]:
   await page.click('#backAgain');pose={'lr':0.,'pt':0.};await warm();await aim((await state())['targets'][0])
   await send(forward=12,ms=35);assert (await state())['pending'] is not None
   await send(forward=force,ms=400)
   st=await state();assert st['tier']==tier and st['kind']=='over' and st['score']==0,st
   timing=await page.evaluate('window.__backShot.timeline()')
   await advance_shot(1.3+timing['xrayDelay']);await page.screenshot(path=str(OUT/('08-'+label+'-xray.png')))
   await advance_shot(timing['faceAt']+.4);st=await state();assert st['faceVisible'] and st['sirenPlayed'],st
   assert await page.locator('#backEmergency').is_visible()
   await page.screenshot(path=str(OUT/('09-face-'+label+'.png')))
   await page.clock.fast_forward(800);await page.screenshot(path=str(OUT/('09-face-'+label+'-late.png')))
   await advance_shot(timing['end']+.2);assert (await state())['phase']=='result'
   assert '구급차' in await page.locator('#backResultTitle').inner_text()
  print('well-aimed rising peak, separate crack/fracture and ambulance overlay passed',flush=True)
  # No charge time or touch button is required in motion mode. A genuinely soft shove is a weak miss.
  await page.click('#backAgain');pose={'lr':0.,'pt':0.};await warm();await aim((await state())['targets'][0])
  await send(forward=7.5,ms=150)
  assert (await state())['kind']=='weak'
  await page.clock.fast_forward(1700);await page.screenshot(path=str(OUT/'10-face-weak.png'))
  assert await page.locator('#backSpeech').is_visible()
  await page.clock.fast_forward(2100)
  assert (await state())['phase']=='play'
  assert await page.locator('#backMissMark').is_visible()
  assert await page.locator('#backAnswer').is_visible()
  await page.screenshot(path=str(OUT/'11-failure-answer.png'))
  # Pausing discards pending sensor impulses.
  await page.click('#backPause');before=(await state())['mistakes'];await send(forward=45,ms=200)
  assert (await state())['mistakes']==before
  await page.click('#backResume')
  # The clinic's three harmless wrong-crack scenarios retain their distinct names and faces.
  for label,offset,pressure,expected in [('12-over',0,.86,'over'),('13-dud',.15,.6,'dud'),('14-finger',.65,.6,'finger')]:
   await page.reload();await page.wait_for_selector('html[data-back-ready="true"]',state='attached',timeout=90000)
   await page.evaluate('window.requestAnimationFrame=callback=>setTimeout(()=>callback(performance.now()),200);window.cancelAnimationFrame=id=>clearTimeout(id)')
   await page.click('#backStart');pose={'lr':0.,'pt':0.};await warm()
   await aim(min(.95,(await state())['targets'][0]+offset),pressure)
   await send(forward=12,ms=400)
   assert (await state())['outcome']['feedback']==expected,(await state())
   await page.clock.fast_forward(1550)
   assert await page.locator('#backSpeech').is_visible()
   await page.screenshot(path=str(OUT/(label+'.png')))
  print('clinic over/dud/finger scenarios passed',flush=True)
  # Permission denial has an explicit fallback, rather than silently becoming a button game.
  await page.reload();await page.wait_for_selector('html[data-back-ready="true"]',state='attached',timeout=90000)
  await page.evaluate("() => {Object.defineProperty(DeviceMotionEvent,'requestPermission',{value:()=>Promise.resolve('denied'),configurable:true});}")
  await page.click('#backStart');await page.clock.fast_forward(300)
  assert (await state())['sensorStatus']=='denied'
  assert await page.locator('#backPress').is_hidden()
  await page.click('#backTouchFallback');assert (await state())['control']=='touch'
  assert await page.locator('#backPress').is_visible()
  await browser.close()
 assert not errors,errors
 print(json.dumps({'errors':errors,'checks':'motion aiming/forward shove/recoil/250ms aim/130ms peak/face-only speech/Xray/weak/fracture/ambulance/pause/permission denial','shots':str(OUT)},ensure_ascii=False))
try:asyncio.run(main())
finally:server.shutdown()

"""patient08: capture the existing and repaired neck in the same real game camera.
Run after npm run build:cases, with vite preview serving dist-cases on 5291.
Uses the Metal renderer, not the very slow software renderer used by the first lab.
"""
import argparse, json, pathlib, importlib.util, math
from PIL import Image, ImageDraw, ImageFont
from playwright.sync_api import sync_playwright

HERE=pathlib.Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('neckshoot',HERE/'shoot.py')
lab=importlib.util.module_from_spec(spec);spec.loader.exec_module(lab)
POSES=[('rest',{}),('rot60',{'rot':60}),('rot75',{'rot':75}),('rotm75',{'rot':-75}),('bend32',{'bend':32}),('str16',{'stretch':.16}),('comp03',{'stretch':-.03}),('str16_rot75',{'stretch':.16,'rot':75}),('str16_bend32',{'stretch':.16,'bend':32})]
LABEL={'rest':'기본 자세','rot60':'회전 60°','rot75':'회전 75°','rotm75':'회전 -75°','bend32':'기울기 32°','str16':'신장 0.16m','comp03':'압축 0.03m','str16_rot75':'신장 + 회전 75°','str16_bend32':'신장 + 기울기 32°'}

def clean(value):
 if isinstance(value,float) and not math.isfinite(value):return None
 if isinstance(value,dict):return {k:clean(v) for k,v in value.items()}
 if isinstance(value,list):return [clean(v) for v in value]
 return value

def run(url,out):
 out.mkdir(parents=True,exist_ok=True);data={};cam=None
 with sync_playwright() as p:
  browser=p.chromium.launch(args=['--use-angle=metal'])
  for key,q in [('before','necklab=base'),('after','necklab=base&repair=1')]:
   d=out/key;d.mkdir(exist_ok=True)
   ctx=browser.new_context(viewport={'width':1280,'height':800},locale='ko-KR')
   ctx.add_init_script('let seed=1234567; Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};')
   pg=ctx.new_page();errors=[];pg.on('pageerror',lambda e:errors.append(str(e)))
   pg.on('console',lambda m:errors.append(m.text) if m.type=='error' and ('Shader Error' in m.text or 'VALIDATE_STATUS' in m.text) else None)
   pg.goto(f'{url}/index.html?{q}')
   pg.wait_for_function('window.__neckLab && (window.__neckLab.ready || window.__neckLab.error)',timeout=180000)
   if pg.evaluate('window.__neckLab.error'):raise RuntimeError(pg.evaluate('window.__neckLab.error'))
   if cam is None:
    cam=pg.evaluate('''() => {const c=window.__game.camera,p=c.position.clone(),v=c.getWorldDirection(p.clone());return {pos:p.toArray(),look:p.clone().add(v).toArray()};}''')
   data[key]={}
   for name,pose in POSES:
    data[key][name]={}
    for camera,c in [('game',cam),('collar',lab.CAMS2['collar'])]:
     m=lab.shot(pg,{**pose,'extra':True},c,d/f'{name}_{camera}.png',camera!='game')
     mask=m['holes'].pop('mask');lab.save_url(mask,d/f'{name}_{camera}_mask.png')
     data[key][name][camera]=m
    (out/'metrics.json').write_text(json.dumps(clean(data),ensure_ascii=False))
    print(key,name,'edge',data[key][name]['game']['holes']['edgePx'],'back',data[key][name]['game']['holes']['backPx'],flush=True)
   if key=='after':
    data['validation']=pg.evaluate('window.__neckLab.repairValidate()')
    assert all(data['validation'][k]==0 for k in ['positionBufferChanges','morphBufferChanges','nonFinite','protectedVertexChanges','headGeometryReplaced']),data['validation']
    data['boundary']=pg.evaluate('window.__neckLab.repairBoundary()')
    assert data['boundary'], 'No seam samples'
    assert data['boundary'][0]['max']<1.0,data['boundary']
    # Hold the game's own return curve at the same deterministic time instants.
    data['return']={}
    for kind in ['turn','stretch','crack']:
     curve=pg.evaluate('k=>window.__neckLab.curve(k)',kind)
     indices=sorted(set([0,len(curve)//2,len(curve)-1,max(range(len(curve)),key=lambda i:curve[i]['pull']+abs(curve[i]['rot']-curve[0]['rot'])/100)]))
     rows=[]
     for j in indices:
      f=curve[j];m=lab.shot(pg,{'rot':f['rot'],'bend':f['bend'],'stretch':f['pull']},cam,d/f'return_{kind}_{j}.png',False)
      m.get('holes',{}).pop('mask',None);rows.append({'t':f['t'],'rot':f['rot'],'pull':f['pull'],'seam':m['seam'],'area':m['minArea']})
     data['return'][kind]=rows
   if errors:raise RuntimeError(errors)
   (out/'metrics.json').write_text(json.dumps(clean(data),ensure_ascii=False))
   ctx.close()
  browser.close()
 font=ImageFont.truetype('/System/Library/Fonts/AppleSDGothicNeo.ttc',22)
 for name,_ in POSES:
  for camera in ['game','collar']:
   ims=[Image.open(out/r/f'{name}_{camera}.png').convert('RGB') for r in ['before','after']]
   g=Image.new('RGB',(2560,842),(23,29,28));draw=ImageDraw.Draw(g)
   for i,im in enumerate(ims):
    g.paste(im,(1280*i,42));draw.text((1280*i+20,8),('기존' if i==0 else '수정')+' · '+LABEL[name],font=font,fill='white')
   g.save(out/f'compare_{name}_{camera}.png')
 # Close-ups use the SAME crop of each original capture, without retouching pixels.
 selected=['rot75','rotm75','str16','str16_rot75']
 sheet=Image.new('RGB',(1170,400*len(selected)+45),(23,29,28));draw=ImageDraw.Draw(sheet)
 draw.text((180,8),'기존 patient08',font=font,fill='white');draw.text((680,8),'수정 patient08',font=font,fill='white')
 for row,name in enumerate(selected):
  draw.text((8,45+row*400+160),LABEL[name],font=font,fill='white')
  for col,r in enumerate(['before','after']):
   im=Image.open(out/r/f'{name}_game.png').crop((410,250,910,650));sheet.paste(im,(170+col*500,45+row*400))
 sheet.save(out/'report.png')
 lines=['# patient08 목 변형 수정 비교','','동일한 게임 카메라와 입력. 이미지 crop은 두 결과에 동일하게 적용. 열린 변/뒷면은 기존 실험 도구의 화면 진단값이며, 새 연결 메시의 뒤집힘까지 집계하는 수치가 아니다. 화면 품질 성공 판정에는 사용하지 않는다.','','|포즈|열린 변 px 기존→수정|뒷면 px 기존→수정|수정 접합 p95 mm|','|---|---|---|---|']
 for name,_ in POSES:
  a,b=data['before'][name]['game'],data['after'][name]['game'];lines.append(f"|{LABEL[name]}|{a['holes']['edgePx']} → {b['holes']['edgePx']}|{a['holes']['backPx']} → {b['holes']['backPx']}|{b['seam']['p95']:.4f}|")
 (out/'metrics.md').write_text('\n'.join(lines))
 print('Finished',out,flush=True)

if __name__=='__main__':
 ap=argparse.ArgumentParser();ap.add_argument('--url',default='http://127.0.0.1:5291');ap.add_argument('--out',default='shots/necklab3')
 a=ap.parse_args();run(a.url,pathlib.Path(a.out))

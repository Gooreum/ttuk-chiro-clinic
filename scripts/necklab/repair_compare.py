"""patient08: capture the existing and repaired neck in the same real game camera.
Run after npm run build:cases, with vite preview serving dist-cases on 5291.
Uses the Metal renderer, not the very slow software renderer used by the first lab.
--sets name:query,... picks the columns (default: the old before / repair=1 pair). With more than two sets the
close-up cameras (under the chin, side, collar) and a normal-colour sheet of the repaired neck are shot too.
"""
import argparse, json, pathlib, importlib.util, math
from PIL import Image, ImageDraw, ImageFont
from playwright.sync_api import sync_playwright

HERE=pathlib.Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('neckshoot',HERE/'shoot.py')
lab=importlib.util.module_from_spec(spec);spec.loader.exec_module(lab)
POSES=[('rest',{}),('rot60',{'rot':60}),('rot75',{'rot':75}),('rotm75',{'rot':-75}),('bend32',{'bend':32}),('str16',{'stretch':.16}),('comp03',{'stretch':-.03}),('str16_rot75',{'stretch':.16,'rot':75}),('str16_bend32',{'stretch':.16,'bend':32})]
LABEL={'rest':'기본 자세','rot60':'회전 60°','rot75':'회전 75°','rotm75':'회전 -75°','bend32':'기울기 32°','str16':'신장 0.16m','comp03':'압축 0.03m','str16_rot75':'신장 + 회전 75°','str16_bend32':'신장 + 기울기 32°'}
SET_LABEL={'before':'기존','after':'수정','codex':'Codex 수정(repair=1)','v2':'개선(repair=2)'}
DEFAULT_SETS='before:necklab=base,after:necklab=base&repair=1'
# close-ups: under the chin from the chest side, the neck side, the collar from beside the head
CLOSE={'chinC':{'pos':[0.10,1.16,0.02],'look':[0,1.02,0.17]},'sideC':{'pos':[-0.12,1.15,0.06],'look':[0,1.02,0.19]},'colB':{'pos':[0.10,1.30,0.0],'look':[0,1.0,0.28]}}
# three r149 announces each Scene to __THREE_DEVTOOLS__; the normal sheet finds the repaired meshes through it
DEVTOOLS="window.__scenes=[];window.__THREE_DEVTOOLS__=new EventTarget();window.__THREE_DEVTOOLS__.addEventListener('observe',e=>{if(e.detail&&e.detail.isScene)window.__scenes.push(e.detail)});"
NORMALS="""()=>{for(const sc of window.__scenes)sc.traverse(o=>{if(!o.isMesh||!o.geometry.attributes.aRepairRigid)return;const m=o.material,old=m.onBeforeCompile,k=m.customProgramCacheKey();
 m.onBeforeCompile=(s,r)=>{old.call(m,s,r);s.fragmentShader=s.fragmentShader.replace('#include <dithering_fragment>','#include <dithering_fragment>\\n gl_FragColor=vec4(normalize(normal)*.5+.5,1.);');};
 m.customProgramCacheKey=()=>k+'-normals';m.needsUpdate=true;});}"""

def clean(value):
 if isinstance(value,float) and not math.isfinite(value):return None
 if isinstance(value,dict):return {k:clean(v) for k,v in value.items()}
 if isinstance(value,list):return [clean(v) for v in value]
 return value

def open_page(browser,url,q):
 ctx=browser.new_context(viewport={'width':1280,'height':800},locale='ko-KR')
 ctx.add_init_script('let seed=1234567; Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};'+DEVTOOLS)
 pg=ctx.new_page();errors=[];pg.on('pageerror',lambda e:errors.append(str(e)))
 pg.on('console',lambda m:errors.append(m.text) if m.type=='error' and ('Shader Error' in m.text or 'VALIDATE_STATUS' in m.text) else None)
 pg.goto(f'{url}/index.html?{q}')
 pg.wait_for_function('window.__neckLab && (window.__neckLab.ready || window.__neckLab.error)',timeout=180000)
 if pg.evaluate('window.__neckLab.error'):raise RuntimeError(pg.evaluate('window.__neckLab.error'))
 return ctx,pg,errors

def run(url,out,sets):
 out.mkdir(parents=True,exist_ok=True);data={};cam=None;close=len(sets)>2
 with sync_playwright() as p:
  browser=p.chromium.launch(args=['--use-angle=metal'])
  for key,q in sets:
   d=out/key;d.mkdir(exist_ok=True)
   ctx,pg,errors=open_page(browser,url,q)
   if cam is None:
    cam=pg.evaluate('''() => {const c=window.__game.camera,p=c.position.clone(),v=c.getWorldDirection(p.clone());return {pos:p.toArray(),look:p.clone().add(v).toArray()};}''')
   data[key]={}
   for name,pose in POSES:
    data[key][name]={}
    for camera,c in [('game',cam),('collar',lab.CAMS2['collar'])]:
     m=lab.shot(pg,{**pose,'extra':True},c,d/f'{name}_{camera}.png',camera!='game')
     mask=m['holes'].pop('mask');lab.save_url(mask,d/f'{name}_{camera}_mask.png')
     data[key][name][camera]=m
    if close:
     for camera,c in CLOSE.items():lab.shot(pg,pose,c,d/f'{name}_{camera}.png',True)
    (out/'metrics.json').write_text(json.dumps(clean(data),ensure_ascii=False))
    print(key,name,'edge',data[key][name]['game']['holes']['edgePx'],'back',data[key][name]['game']['holes']['backPx'],flush=True)
   if 'repair=' in q:
    v=data[key]['validation']=pg.evaluate('window.__neckLab.repairValidate()')
    assert all(v[k]==0 for k in ['positionBufferChanges','morphBufferChanges','nonFinite','protectedVertexChanges','headGeometryReplaced']),v
    data[key]['boundary']=pg.evaluate('window.__neckLab.repairBoundary()')
    assert data[key]['boundary'], 'No seam samples'
    assert data[key]['boundary'][0]['max']<1.0,data[key]['boundary']
    # Hold the game's own return curve at the same deterministic time instants.
    data[key]['return']={}
    for kind in ['turn','stretch','crack']:
     curve=pg.evaluate('k=>window.__neckLab.curve(k)',kind)
     indices=sorted(set([0,len(curve)//2,len(curve)-1,max(range(len(curve)),key=lambda i:curve[i]['pull']+abs(curve[i]['rot']-curve[0]['rot'])/100)]))
     rows=[]
     for j in indices:
      f=curve[j];m=lab.shot(pg,{'rot':f['rot'],'bend':f['bend'],'stretch':f['pull']},cam,d/f'return_{kind}_{j}.png',False)
      m.get('holes',{}).pop('mask',None);rows.append({'t':f['t'],'rot':f['rot'],'pull':f['pull'],'seam':m['seam'],'area':m['minArea']})
     data[key]['return'][kind]=rows
    if close:     # normal colours of the three repaired meshes: stripes and folds show as colour jumps
     pg.evaluate(NORMALS)
     for name in ['rest','rot75','str16','str16_rot75','str16_bend32']:
      for camera in ['chinC','sideC']:lab.shot(pg,dict(POSES)[name],CLOSE[camera],d/f'normals_{name}_{camera}.png',True)
   if errors:raise RuntimeError(errors)
   (out/'metrics.json').write_text(json.dumps(clean(data),ensure_ascii=False))
   ctx.close()
  browser.close()
 # the old two-column layout keeps its keys at the top level (before / after / validation / boundary / return)
 if [k for k,_ in sets]==['before','after']:
  for k in ['validation','boundary','return']:data[k]=data['after'].pop(k)
  (out/'metrics.json').write_text(json.dumps(clean(data),ensure_ascii=False))
 assemble(out,[k for k,_ in sets],data,close)
 print('Finished',out,flush=True)

def assemble(out,keys,data,close):
 font=ImageFont.truetype('/System/Library/Fonts/AppleSDGothicNeo.ttc',22);N=len(keys)
 cams=['game','collar']+(list(CLOSE) if close else [])
 for name,_ in POSES:
  for camera in cams:
   ims=[Image.open(out/r/f'{name}_{camera}.png').convert('RGB') for r in keys]
   g=Image.new('RGB',(1280*N,842),(23,29,28));draw=ImageDraw.Draw(g)
   for i,im in enumerate(ims):
    g.paste(im,(1280*i,42));draw.text((1280*i+20,8),SET_LABEL.get(keys[i],keys[i])+' · '+LABEL[name],font=font,fill='white')
   g.save(out/f'compare_{name}_{camera}.png')
 # Close-ups use the SAME crop of each original capture, without retouching pixels.
 selected=['rot75','rotm75','str16','str16_rot75']
 sheet=Image.new('RGB',(170+500*N,400*len(selected)+45),(23,29,28));draw=ImageDraw.Draw(sheet)
 for col,r in enumerate(keys):draw.text((180+col*500,8),SET_LABEL.get(r,r)+' patient08',font=font,fill='white')
 for row,name in enumerate(selected):
  draw.text((8,45+row*400+160),LABEL[name],font=font,fill='white')
  for col,r in enumerate(keys):
   im=Image.open(out/r/f'{name}_game.png').crop((410,250,910,650));sheet.paste(im,(170+col*500,45+row*400))
 sheet.save(out/'report.png')
 if close:
  # close-up sheet: one row per pose, columns = sets, cameras side by side at half size
  rows=['rest','rot75','rotm75','str16','str16_rot75','str16_bend32']
  w,h=480,300
  sheet=Image.new('RGB',(170+w*N*3,h*len(rows)+45),(23,29,28));draw=ImageDraw.Draw(sheet)
  for c,camera in enumerate(CLOSE):
   for col,r in enumerate(keys):draw.text((180+(c*N+col)*w,8),SET_LABEL.get(r,r)+' · '+camera,font=font,fill='white')
  for row,name in enumerate(rows):
   draw.text((8,45+row*h+h//2),LABEL[name],font=font,fill='white')
   for c,camera in enumerate(CLOSE):
    for col,r in enumerate(keys):
     sheet.paste(Image.open(out/r/f'{name}_{camera}.png').convert('RGB').resize((w,h)),(170+(c*N+col)*w,45+row*h))
  sheet.save(out/'closeups.png')
  rep=[k for k in keys if (out/k/'normals_rest_chinC.png').exists()]
  nrows=['rest','rot75','str16','str16_rot75','str16_bend32']
  sheet=Image.new('RGB',(170+w*len(rep)*2,h*len(nrows)+45),(23,29,28));draw=ImageDraw.Draw(sheet)
  for c,camera in enumerate(['chinC','sideC']):
   for col,r in enumerate(rep):draw.text((180+(c*len(rep)+col)*w,8),SET_LABEL.get(r,r)+' 법선 · '+camera,font=font,fill='white')
  for row,name in enumerate(nrows):
   draw.text((8,45+row*h+h//2),LABEL[name],font=font,fill='white')
   for c,camera in enumerate(['chinC','sideC']):
    for col,r in enumerate(rep):
     sheet.paste(Image.open(out/r/f'normals_{name}_{camera}.png').convert('RGB').resize((w,h)),(170+(c*len(rep)+col)*w,45+row*h))
  sheet.save(out/'normals.png')
 lines=['# patient08 목 변형 수정 비교','','동일한 게임 카메라와 입력. 이미지 crop은 두 결과에 동일하게 적용. 열린 변/뒷면은 기존 실험 도구의 화면 진단값이며, 새 연결 메시의 뒤집힘까지 집계하는 수치가 아니다. 화면 품질 성공 판정에는 사용하지 않는다.','']
 if N==2:
  lines+=['|포즈|열린 변 px 기존→수정|뒷면 px 기존→수정|수정 접합 p95 mm|','|---|---|---|---|']
  for name,_ in POSES:
   a,b=data[keys[0]][name]['game'],data[keys[1]][name]['game'];lines.append(f"|{LABEL[name]}|{a['holes']['edgePx']} → {b['holes']['edgePx']}|{a['holes']['backPx']} → {b['holes']['backPx']}|{b['seam']['p95']:.4f}|")
 else:
  cols=' → '.join(SET_LABEL.get(k,k) for k in keys)
  lines+=[f'|포즈|열린 변 px ({cols})|뒷면 px|접합 p95 mm|','|---|---|---|---|']
  for name,_ in POSES:
   g=[data[k][name]['game'] for k in keys]
   lines.append(f"|{LABEL[name]}|{' → '.join(str(x['holes']['edgePx']) for x in g)}|{' → '.join(str(x['holes']['backPx']) for x in g)}|{' / '.join('%.4f' % x['seam']['p95'] for x in g[1:])}|")
  lines+=['','|세트|뒤집힌 머리 경계 면|압착 면(면적 30% 미만)|얼굴 보호 변경|접합 max mm|','|---|---|---|---|---|']
  for k in keys:
   v=data[k].get('validation')
   if v:lines.append(f"|{SET_LABEL.get(k,k)}|{v.get('rimFlips')}|{v.get('rimSquash')}|{v['protectedVertexChanges']}|{data[k]['boundary'][0]['max']:.4f}|")
 (out/'metrics.md').write_text('\n'.join(lines))

if __name__=='__main__':
 ap=argparse.ArgumentParser();ap.add_argument('--url',default='http://127.0.0.1:5291');ap.add_argument('--out',default='shots/necklab3')
 ap.add_argument('--sets',default=DEFAULT_SETS)
 a=ap.parse_args();run(a.url,pathlib.Path(a.out),[tuple(s.split(':',1)) for s in a.sets.split(',')])

"""Exercise the shipped clinic cache and the unchanged towel cache in the lab.
Requires build:cases served at 5291. Holds only poses; uses real model loaders.
"""
import json, pathlib, importlib.util
from playwright.sync_api import sync_playwright
HERE=pathlib.Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('compare',HERE/'repair_compare.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
with sync_playwright() as p:
 browser=p.chromium.launch(args=['--use-angle=metal'])
 for query in ['necklab=live','necklab=stage&mode=towel']:
  ctx,pg,errors=m.open_page(browser,'http://127.0.0.1:5291',query)
  if 'live' in query:
   v=pg.evaluate('window.__neckLab.repairValidate()');print('live validation',json.dumps(v),flush=True)
   assert v and all(v[k]==0 for k in ['faceTintVertices','protectedVertexChanges','positionBufferChanges','morphBufferChanges','nonFinite','headGeometryReplaced']),v
   assert v['rimSquash']<=12 and v['rimFlips']<=4,v
   for name,pose in m.POSES:
    pg.evaluate('(pose)=>window.__neckLab.pose(pose)',pose)
    pg.wait_for_timeout(100)
    seam=pg.evaluate('window.__neckLab.repairBoundary()')[0]
    assert seam['max']<1,seam
   pg.screenshot(path='shots/necklab5-live.png')
  else:
   assert pg.evaluate('window.__neckLab.repairValidate()') is None
  assert not errors,errors
  print(query,'PASS',flush=True);ctx.close()
 browser.close()

"""Plain matte resting-hand atlas derived from the existing CC0 body map.
No external source. Source terminal-phalanx geometry supplies nail landmarks.
Called by patient_rest_hands.mjs with a work stem. Requires existing numpy/Pillow.
"""
from pathlib import Path
import sys,json
import numpy as np
from PIL import Image
stem=Path(sys.argv[1]);d=json.loads(stem.with_suffix('.json').read_text());im=Image.open(stem.with_suffix('.input')).convert('RGB');a=np.asarray(im).astype(float);h,w=a.shape[:2]
uv=np.array(d['uv']).reshape(-1,2);faces=np.array(d['indices']).reshape(-1,3);hand=np.array(d['hand']);nails=np.array(d['nails']);uvp=uv*np.array([w-1,h-1]);sample=np.clip(np.rint(uvp[hand>.8]).astype(int),[0,0],[w-1,h-1]);tone=np.percentile(a[sample[:,1],sample[:,0]],58,axis=0)
mask=np.zeros((h,w));nmask=np.zeros((h,w))
for tri in faces:
 if hand[tri].max()<.001:continue
 v=uvp[tri];lo=np.maximum(0,np.floor(v.min(0)).astype(int));hi=np.minimum([w-1,h-1],np.ceil(v.max(0)).astype(int));gy,gx=np.mgrid[lo[1]:hi[1]+1,lo[0]:hi[0]+1];v0=v[1]-v[0];v1=v[2]-v[0];den=v0[0]*v1[1]-v1[0]*v0[1]
 if abs(den)<1e-10:continue
 dx=gx-v[0,0];dy=gy-v[0,1];u=(dx*v1[1]-v1[0]*dy)/den;v2=(v0[0]*dy-dx*v0[1])/den;inside=(u>=-.03)&(v2>=-.03)&(u+v2<=1.03);weights=np.stack([1-u-v2,u,v2],axis=-1);m=weights@hand[tri];n=weights@nails[tri];yy=gy[inside];xx=gx[inside];mask[yy,xx]=np.maximum(mask[yy,xx],m[inside]);nmask[yy,xx]=np.maximum(nmask[yy,xx],n[inside])
# A smooth, quiet skin color makes form and lighting carry the anatomy. Keep
# wrist-border texels unchanged so the patient's own arm/hand tone stays joined.
mask=np.clip(mask,0,1);skin=tone[None,None,:]*.995;a=a*(1-mask[...,None])+skin*mask[...,None]
nmask=np.clip((nmask-.08)/.70,0,1)*mask;nail=tone*.45+np.array([242,224,208])*.55;a=a*(1-nmask[...,None])+nail*nmask[...,None]
Image.fromarray(np.clip(a,0,255).astype('uint8')).save(stem.with_suffix('.webp'),'WEBP',quality=94,method=6)
print('resting hand tone',tone.tolist(),'painted texels',int((mask>.1).sum()),'nail texels',int((nmask>.2).sum()))

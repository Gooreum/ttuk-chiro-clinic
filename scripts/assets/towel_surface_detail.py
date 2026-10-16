"""Bake authored cloth/skin relief to the existing UV atlas; no external image source.
Input: work stem .json (world/canonical positions, UV, indices, kind), .image.
Output: WEBP color, tangent normal, packed R=AO/G=roughness/B=metalness.
"""
import sys,json
from pathlib import Path
import numpy as np
from PIL import Image,ImageFilter
stem=Path(sys.argv[1]);d=json.loads(stem.with_suffix('.json').read_text());kind=d['kind'];size=512 if kind in ('hem','leather') else 1024
im=Image.open(stem.with_suffix('.image')).convert('RGB').resize((size,size),Image.Resampling.LANCZOS)
base=np.asarray(im).astype(float)/255;P=np.array(d['positions']);uv=np.array(d['uv']);I=np.array(d['indices']).reshape(-1,3)
xyz=np.zeros((size,size,3));mask=np.zeros((size,size),bool)
for tri in I:
 v=uv[tri]*(size-1);lo=np.maximum(0,np.floor(v.min(0)).astype(int));hi=np.minimum(size-1,np.ceil(v.max(0)).astype(int))
 if np.any(hi<lo):continue
 gy,gx=np.mgrid[lo[1]:hi[1]+1,lo[0]:hi[0]+1];a=v[1]-v[0];b=v[2]-v[0];det=a[0]*b[1]-a[1]*b[0]
 if abs(det)<1e-9:continue
 dx=gx-v[0,0];dy=gy-v[0,1];u=(dx*b[1]-dy*b[0])/det;w=(a[0]*dy-a[1]*dx)/det;inside=(u>=-.015)&(w>=-.015)&(u+w<=1.015)
 xyz[gy[inside],gx[inside]]=P[tri[0]]+(P[tri[1]]-P[tri[0]])*u[inside,None]+(P[tri[2]]-P[tri[0]])*w[inside,None];mask[gy[inside],gx[inside]]=True
x,y,z=np.moveaxis(xyz,-1,0);yy,xx=np.mgrid[:size,:size];rng=np.random.default_rng(902)
noise=rng.normal(0,1,(size,size));smooth=lambda a,r:np.asarray(Image.fromarray(a.astype('float32'),'F').filter(ImageFilter.GaussianBlur(r)))
# Pillow does not filter F images on every version: use RGB-scale blur for low-frequency grain.
grain=np.asarray(Image.fromarray(np.clip(128+noise*24,0,255).astype('uint8')).filter(ImageFilter.GaussianBlur(.6))).astype(float)/255-.5
H=np.zeros((size,size));ao=np.ones((size,size));rough=np.full((size,size),.82)
gauss=lambda a,w:np.exp(-(a/w)**2)
if kind in ('shirt','sleeve','hem'):
 # Cloth folds are in metres on the posed garment, not arbitrary image noise.
 if kind=='shirt':
  waist=gauss(y-.91,.065);armpit=gauss(abs(x)-.145,.045)*gauss(y-1.15,.10)
  drag=gauss(y-1.10,.16)*np.clip(abs(x)/.2,0,1)
  H=.0017*waist*np.sin(y*215+abs(x)*43)+.0012*armpit*np.sin(y*260+abs(x)*130)+.0008*drag*np.sin(y*116+abs(x)*65)
  seam=gauss(abs(x)-.142,.0012)*gauss(y-1.07,.16)+gauss(y-.882,.0012)
 else:
  # New sleeve UV u is angle, v is shoulder-to-cuff distance / 0.42m.
  v=yy/(size-1);u=xx/(size-1)
  H=.0012*gauss(v-.62,.11)*np.sin(v*120+u*8)+.0007*gauss(v-.30,.20)*np.sin(v*75-u*12)
  for k in range(3):
   curve=.54+k*.057+.018*np.sin(u*7+k*1.3);H+=.0015*gauss(v-curve,.010+k*.002)*( .55+.45*np.sin(u*5+k)**2)
  seam=gauss(u-.055,.002)+gauss(v-.965,.003)+gauss(v-.94,.0015)
  if kind=='hem':seam+=gauss(v-.12,.012)+gauss(v-.88,.012)
  H+=.0006*seam
 stitch=np.maximum(0,np.cos(xx*1.30+yy*.17))**12
 H+=seam*.00022*stitch
 weave=.000055*(np.sin(xx*2.24)+np.sin(yy*2.05)+.4*np.sin((xx+yy)*1.57))
 H+=weave;ao=np.clip(1-.10*seam-.07*np.maximum(0,-H/.0018),.72,1)
 wear=.02*np.sin(x*43+y*31)*np.sin(y*65-z*29)
 base*=ao[...,None]*(1+wear[...,None]);rough=np.clip(.82+grain*.16-H*17,.68,.94)
elif kind=='skin':
 H=grain*.00011;rough=np.clip(.74+grain*.16,.66,.87)
 # Canonical face coordinates: x across, y up relative to eyes, z forwards.
 if d.get('face'):
  front=np.clip((z-.07)/.05,0,1)
  brow=gauss(y-.041,.024)*gauss(x,.065)*front
  eyes=gauss(abs(x)-.032,.022)*gauss(y+.013,.014)*front
  naso=gauss(abs(x)-(.024-.16*y),.0045)*gauss(y+.045,.030)*front
  H-=.00023*brow*np.maximum(0,np.cos(y*1050))**9+.00032*eyes*np.maximum(0,np.cos(y*680+x*65))**10+.00045*naso
  beard=gauss(y+.078,.038)*front*np.clip((abs(x)-.010)/.02,0,1)
  base*=1-beard[...,None]*(.025+np.maximum(0,grain[...,None])*.12)
  redness=gauss(x,.020)*gauss(y+.023,.025)*front*.045
 else:
  redness=np.zeros_like(x)
  for q in d.get('knuckles',[]):redness+=gauss(np.sqrt(((xyz-q)**2).sum(2)),.013)*.045
 for hand in d.get('hands',[]):
  r=xyz-hand['wrist'];D=np.array(hand['forward']);A=np.array(hand['across']);B=np.array(hand['back']);t=r@D;a=r@A;b=r@B;gate=np.clip((b+.002)/.014,0,1)*(t>-.008)*(t<.175)*(abs(a)<.065)
  for digit in hand['joints']:
   q=np.array(digit[0])-hand['wrist'];kt=q@D;ka=q@A
   H+=gate*(.00065*gauss(t-kt,.009)*gauss(a-ka,.008)+.00030*gauss(a-ka*np.clip(t/max(kt,.01),0,1),.0022)*gauss(t-kt*.5,.025))
   for joint in digit[1:]:
    q=np.array(joint)-hand['wrist'];H-=gate*.00016*gauss(t-q@D,.0014)*gauss(a-q@A,.007)
 base=base*(1-redness[...,None])+np.array([.72,.25,.19])*redness[...,None]
elif kind=='leather':
 H=.00012*grain+.00004*np.sin(xx*.61)*np.sin(yy*.43)
 wear=np.sin(xx*.022+yy*.010)*np.sin(yy*.031)*.018
 base*=1+wear[...,None];rough=np.clip(.72+grain*.3+wear,.62,.86)
elif kind=='towel':
 H=grain*.00008;rough=np.clip(.91+grain*.2,.79,1)
# Physical slope from world distance represented by each UV texel. Exclude island edges.
py,px=np.gradient(xyz,axis=(0,1));dy,dx=np.gradient(H);sx=np.maximum(np.linalg.norm(px,axis=2),.00025);sy=np.maximum(np.linalg.norm(py,axis=2),.00025)
nx=np.clip(-dx/sx,-.7,.7);ny=np.clip(-dy/sy,-.7,.7)
valid=mask & np.roll(mask,1,0)&np.roll(mask,-1,0)&np.roll(mask,1,1)&np.roll(mask,-1,1);nx*=valid;ny*=valid
n=np.dstack([nx,ny,np.ones_like(nx)]);n/=np.linalg.norm(n,axis=2)[...,None]
Image.fromarray(np.uint8(np.clip(base,0,1)*255)).save(str(stem)+'.webp',quality=92,method=6)
Image.fromarray(np.uint8((n*.5+.5)*255)).save(str(stem)+'-normal.webp',quality=94,method=6)
orm=np.dstack([ao,rough,np.zeros_like(ao)]);ormImage=Image.fromarray(np.uint8(np.clip(orm,0,1)*255));ormImage=ormImage.resize((256,256) if kind=='hem' else (512,512),Image.Resampling.LANCZOS);ormImage.save(str(stem)+'-orm.webp',quality=92,method=6)

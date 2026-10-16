"""Author towel wardrobe and skin atlases from existing CC0 MPFB maps, with physical-space textile patterns.
Called by towel_stage_characters.mjs. No downloaded images, logos, or new third-party source.
"""
import sys,json,io
from pathlib import Path
import numpy as np
from PIL import Image,ImageFilter
stem=Path(sys.argv[1]); data=json.loads(stem.with_suffix('.json').read_text()); pid=data['pid']; kind=data['kind']; idx=int(pid[-1]) if pid!='hands' else 0
im=Image.open(stem.with_suffix('.image')).convert('RGBA'); size=1024 if kind in ('face','skin') else 512;im=im.resize((size,size),Image.Resampling.LANCZOS)
a=np.array(im).astype(float)/255
rng=np.random.default_rng(321+idx)
# A sparse, subtle camera-real pore grain, kept under the baked AO and skin landmarks.
yy,xx=np.mgrid[:size,:size]; grain=rng.normal(0,.008,(size,size)); weave=(np.sin(xx*np.pi)*.01+np.sin(yy*np.pi)*.01)
P=np.array(data['positions']); UV=np.array(data['uv']).reshape(-1,2); I=np.array(data['indices']).reshape(-1,3)
# Each UV texel records the original, posed model-space position. Physical stripe/check widths do not vary by UV island.
xyz=np.full((size,size,3),np.nan); mask=np.zeros((size,size),bool)
for tri in I:
 uv=UV[tri].copy();uv[:,0]*=size-1;uv[:,1]*=size-1
 lo=np.maximum(0,np.floor(uv.min(0)).astype(int));hi=np.minimum(size-1,np.ceil(uv.max(0)).astype(int))
 if np.any(hi<lo):continue
 gy,gx=np.mgrid[lo[1]:hi[1]+1,lo[0]:hi[0]+1];v0=uv[1]-uv[0];v1=uv[2]-uv[0];den=v0[0]*v1[1]-v1[0]*v0[1]
 if abs(den)<1e-9:continue
 dx=gx-uv[0,0];dy=gy-uv[0,1];u=(dx*v1[1]-v1[0]*dy)/den;v=(v0[0]*dy-dx*v0[1])/den;inside=(u>=-.02)&(v>=-.02)&(u+v<=1.02)
 vals=P[tri[0]]+(P[tri[1]]-P[tri[0]])*u[...,None]+(P[tri[2]]-P[tri[0]])*v[...,None]
 xyz[gy[inside],gx[inside]]=vals[inside];mask[gy[inside],gx[inside]]=True
x,y,z=np.moveaxis(np.nan_to_num(xyz),-1,0)
room=np.array([23,49,44])/255;paper=np.array([244,239,228])/255;mint=np.array([138,223,191])/255;coral=np.array([255,122,89])/255
if kind in ('shirt','sleeve','pants'):
 ao=a[:,:,:3].mean(2);ao=np.clip(.38+.62*ao,.25,1)
 base=np.empty((size,size,3));base[:]=room if kind in ('pants','sleeve') else [paper,room,coral,mint,paper][idx-1]
 if kind=='shirt':
  top=P[:,1].max(); front=z>np.median(P[:,2]); chest=(y>top-.24)&front
  if idx==1:
   # Office shirt: fine woven vertical banker stripe, a sewn front placket and paper collar band.
   stripe=(np.mod(x+.002,.018)<.0024)&mask;base[stripe]=room*.12+paper*.88
  if idx==2:
   # Professor: muted room-green cardigan panel with an ivory inner V and narrow woven windowpane.
   inset=(np.abs(x)<np.clip((top-y)*.36,.008,.065))&front;base[inset]=paper
   check=((np.mod(x,.035)<.001)|(np.mod(y,.035)<.001))&~inset;base[check]=room*.94+mint*.06
  if idx==3:
   # Rider: functional shoulder panels, broad off-white safety tape and reinforced chest zip.
   shoulders=(np.abs(x)>.13)|(y>top-.075);base[shoulders]=room
   tape=(y>top-.18)&(y<top-.157)&front;base[tape]=paper
   seams=(np.abs(np.abs(x)-.12)<.002)&chest;base[seams]=mint
  if idx==4:
   # Artist: soft sage lounge jersey, shallow ivory yarn marling and dark neck binding.
   marl=(np.sin(y*880+x*220)+np.sin(y*490-x*360))*.018;base+=marl[...,None]
   collar=(y>top-.047);base[collar]=room
  if idx==5:
   # Golf polo: broad deep-green chest band, narrow mint selvedge and a proper front button placket.
   band=(y>top-.22)&(y<top-.135)&front;base[band]=room
   edge=((np.abs(y-(top-.22))<.003)|(np.abs(y-(top-.135))<.003))&front;base[edge]=mint
  if idx in (1,2,5):
   placket=(abs(x)<.009)&(y>top-.15)&front;base[placket]=paper*.9
   line=(np.abs(abs(x)-.008)<.0008)&(y>top-.15)&front;base[line]=room*.7+paper*.3
   for h in [top-.065,top-.102,top-.139]:
    button=((x/.0033)**2+((y-h)/.0033)**2<1)&front;base[button]=room
  # Small embroidered lozenge, avoiding branding or medical instruction.
  emblem=abs(x-.076)/.009+abs(y-(top-.11))/.007<1;base[emblem&front]=coral
 elif kind=='pants':
  rib=np.sin(y*160+x*80)*.012;base+=rib[...,None]
  double=(np.abs(np.mod(abs(x),.15)-.06)<.002);base[double]=room*.7+paper*.3
 else:
  # Therapist scrub sleeves: fine medical twill with an ivory turn-back seam, tied to the body uniform.
  base[:]=room;grain*=.6
 textile=(np.sin(xx*2.17+yy*.12)*np.sin(yy*2.31))*.018+grain
 a[:,:,:3]=np.clip(base*(ao[...,None])*(1+textile[...,None]),0,1)
elif kind=='hair':
 # Keep alpha and the photographed hair strands; restore neutral ink/soft silver rather than the old orange cast.
 lum=a[:,:,:3].mean(2)
 if idx==2:a[:,:,:3]=np.clip(lum[...,None]*np.array([.86,.91,.88])+.09,0,1)
 elif idx==4:a[:,:,:3]=np.clip(a[:,:,:3]*np.array([.62,.67,.65]),0,1)
 else:a[:,:,:3]=np.clip(a[:,:,:3]*np.array([.5,.58,.55]),0,1)
else:
 a[:,:,:3]*=(1+grain[...,None])
 if kind=='face':
  top=P[:,1].max();rel=top-y;front=np.clip((z-.065)/.055,0,1)
  cheek=np.exp(-((abs(x)-.045)/.026)**2-((rel-.155)/.035)**2)*front*mask
  blush=.035 if idx<5 else .024;a[:,:,:3]=a[:,:,:3]*(1-cheek[...,None]*blush)+coral*cheek[...,None]*blush
  tired=np.exp(-((abs(x)-.032)/.025)**2-((rel-.125)/.009)**2)*front*mask
  a[:,:,:3]*=1-tired[...,None]*(.04 if idx in (1,2,4) else .018)
  if idx in (2,5):
   # A restrained age texture, mapped in actual centimetres, across the forehead and outer eye corners.
   wrinkles=np.exp(-((rel-.068)/.019)**2)*np.maximum(0,np.cos((rel-.05)*1100))**12*front*mask
   a[:,:,:3]*=1-wrinkles[...,None]*.032
# Dilate into UV gutters to avoid dark filtering lines; preserve actual hair transparency.
out=(np.clip(a,0,1)*255).astype('uint8')
if kind!='hair':
 rgb=Image.fromarray(out[:,:,:3]);rgb=rgb.filter(ImageFilter.MaxFilter(3));out[:,:,:3]=np.where(mask[...,None],out[:,:,:3],np.array(rgb))
Image.fromarray(out,'RGBA').save(str(stem)+'.webp',quality=88,method=6)
# Low-amplitude subpixel textile / pore normals, independent of colour shading.
n=512;yy,xx=np.mgrid[:n,:n];r=np.random.default_rng(720+idx).normal(0,1,(n,n));r=np.array(Image.fromarray(((r+4)*28).clip(0,255).astype('uint8')).filter(ImageFilter.GaussianBlur(.45))).astype(float)/255
if kind in ('shirt','pants','sleeve'):h=.35*np.sin(xx*2.1)+.35*np.sin(yy*2.4)+r*.15
else:h=r*.5
ny,nx=np.gradient(h);normal=np.dstack([-nx,-ny,np.ones_like(nx)]);normal/=np.linalg.norm(normal,axis=2)[...,None]
Image.fromarray(((normal*.5+.5)*255).astype('uint8')).save(str(stem)+'-normal.webp',quality=82,method=6)

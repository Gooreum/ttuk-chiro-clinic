"""Authored garment construction, fold, skin and age detail on existing CC0 atlases.
Input stem.input + stem.json with world positions, normals, UVs, triangle indices.
Outputs 512/1024px -color/-normal/-orm WebP. No downloaded or newly licensed source.
Uses only the existing asset numpy/Pillow toolchain.
"""
import sys,json
from pathlib import Path
import numpy as np
from PIL import Image,ImageFilter
S=1024;stem=Path(sys.argv[1]);d=json.loads(stem.with_suffix('.json').read_text());kind=d['kind'];pid=d.get('pid','patient01');idx=int(pid[-2:]) if pid.startswith('patient') else 0
P=np.array(d['positions']);N=np.array(d.get('normals',np.zeros_like(P)));UV=np.array(d['uv']).reshape(-1,2);I=np.array(d['indices']).reshape(-1,3)
im=Image.open(stem.with_suffix('.input')).convert('RGB').resize((S,S),Image.Resampling.LANCZOS);color=np.asarray(im).astype(float)/255
xyz=np.zeros((S,S,3));normal=np.zeros_like(xyz);mask=np.zeros((S,S),bool);border=np.zeros((S,S),bool);hand_mask=np.zeros((S,S));hand_vertices=np.array(d.get('handMask',[]))
for tri in I:
 uv=UV[tri]*(S-1);lo=np.maximum(0,np.floor(uv.min(0)).astype(int));hi=np.minimum(S-1,np.ceil(uv.max(0)).astype(int))
 if np.any(hi<lo):continue
 yy,xx=np.mgrid[lo[1]:hi[1]+1,lo[0]:hi[0]+1];a=uv[1]-uv[0];b=uv[2]-uv[0];den=a[0]*b[1]-b[0]*a[1]
 if abs(den)<1e-12:continue
 dx=xx-uv[0,0];dy=yy-uv[0,1];u=(dx*b[1]-b[0]*dy)/den;v=(a[0]*dy-dx*a[1])/den;inside=(u>=-.002)&(v>=-.002)&(u+v<=1.002);w=np.stack([1-u-v,u,v],-1);y=yy[inside];x=xx[inside];xyz[y,x]=w[inside]@P[tri];normal[y,x]=w[inside]@N[tri];mask[y,x]=True
 if len(hand_vertices):hand_mask[y,x]=w[inside]@hand_vertices[tri]
# Extend position/normal fields a few texels into UV gutters. This prevents the
# differential normal bake from interpreting an island edge as a deep crack.
filled=mask.copy()
for _ in range(7):
 acc=np.zeros_like(xyz);nacc=np.zeros_like(normal);count=np.zeros((S,S))
 for ax,shift in [(0,-1),(0,1),(1,-1),(1,1)]:
  m=np.roll(filled,shift,axis=ax);acc+=np.roll(xyz,shift,axis=ax)*m[...,None];nacc+=np.roll(normal,shift,axis=ax)*m[...,None];count+=m
 take=(~filled)&(count>0);xyz[take]=acc[take]/count[take,None];normal[take]=nacc[take]/count[take,None];filled|=take
x,y,z=np.moveaxis(xyz,-1,0);nx,ny,nz=np.moveaxis(normal,-1,0);top=float(P[:,1].max());bottom=float(P[:,1].min());rel=top-y
rng=np.random.default_rng(4731+idx);grain=rng.normal(0,1,(S,S));coarse=np.asarray(Image.fromarray(rng.uniform(0,255,(48,48)).astype('uint8')).resize((S,S),Image.Resampling.BICUBIC)).astype(float)/255-.5
G=lambda a,w:np.exp(-(a/w)**2)
height=np.zeros((S,S));ao=np.ones((S,S));rough=np.ones((S,S))*.88
if kind in ('shirt','pants','sleeve'):
 # The same physical-space fields can be reused for a scrub/tunic. Folds have
 # centimetre-scale spacing, while weave remains below a millimetre.
 front=np.clip((nz+.20)/.75,0,1)
 if kind!='pants':
  arm=G(np.abs(x)-.165,.085)*G(rel-.20,.15)
  fold=(rel-.18)+.62*(np.abs(x)-.16)
  compression=np.sin(fold*230+np.sin(x*28))*arm
  drag=np.sin((rel+.28*np.abs(x))*138+np.sin(x*14))*G(rel-.31,.25)*G(np.abs(x)-.15,.11)
  waist=G(rel-.48,.085)*(np.sin(y*245+x*34)+.42*np.sin(y*420-x*56))
  belly=G(rel-.36,.13)*G(x,.18)*(np.sin((rel+.24*np.abs(x))*165)+.35*np.sin(y*310-x*55))
  height+=.00145*compression+.00155*drag+.00150*waist+.00095*belly
  # Set-in armholes and side seams: a recessed seam between two small welt
  # ridges, with regular topstitch dots separated by real thread-length gaps.
  side=np.abs(x)-(.165-.035*np.clip(rel/.6,0,1));seam=G(side,.0018)*G(rel-.30,.31)
  shoulder=np.sqrt(((np.abs(x)-.174)/.92)**2+(rel-.165)**2)-.090;armseam=G(shoulder,.0017)*G(rel-.18,.15)
  hem=G(y-(bottom+.008),.0020)
  height-=.0008*(seam+armseam+hem)
  height+=.00046*(G(np.abs(side)-.003,.0012)+G(np.abs(shoulder)-.003,.0012))*G(rel-.28,.28)
  thread=(np.mod(y*1000+np.abs(x)*500,3.4)<1.8)*(G(side-.0032,.00065)+G(shoulder-.0032,.00065))*G(rel-.28,.28)
  height+=thread*.00032;ao*=1-.12*np.clip(seam+armseam+hem,0,1)
  # Outfits retain their existing palette/panels. Add real placket/zip response,
  # rather than repainting the whole wardrobe with a generic cloth color.
  if idx in (1,5):
   placket=G(np.abs(x)-.008,.0010)*(rel<.16)*front;stitch=G(np.abs(x)-.0058,.0006)*(np.mod(rel,.0035)<.0018)*(rel<.155)*front
   height+=placket*.0013+stitch*.00030;ao*=1-placket*.09
   for t in [.065,.102,.139]:
    r=np.sqrt(x*x+(rel-t)**2);button=G(r,.0029)*front;height+=button*.0012;ao*=1-G(r-.0032,.0008)*.16*front
  elif idx==2:
   edge=np.abs(x)-np.clip(rel*.36,.008,.065);band=G(edge,.0018)*front;height+=band*.0016;ao*=1-band*.13
   for t in [.20,.255,.31]:
    button=G(x-.035,.003)*G(rel-t,.003)*front;height+=button*.0013;ao*=1-button*.12
  elif idx==3:
   zipline=G(x,.0015)*(rel>.045)*(rel<.33)*front;teeth=(np.mod(rel,.0048)<.0022)*G(np.abs(x)-.0022,.0010)*(rel>.045)*(rel<.33)*front
   height+=teeth*.0010-zipline*.0006;ao*=1-zipline*.16;color=color*(1-teeth[...,None]*.24)+np.array([.54,.57,.52])*teeth[...,None]*.24
  # Cuff compression folds, from the sleeve opening toward the elbow/armhole.
  height+=.0009*np.sin(rel*320+x*95)*G(np.abs(x)-.225,.045)*G(rel-.27,.11)
 else:
  # Waistband, hip drag and knee compression in woven trousers.
  height+=.0011*np.sin((y+.30*np.abs(x))*200)*G(y-(top-.16),.13)
  height+=.0014*np.sin(y*260+x*32)*G(y-(bottom+.33),.11)
  side=np.abs(x)-.095;seam=G(side,.0016);height-=seam*.00065;ao*=1-seam*.10
  height+=G(np.abs(side)-.0032,.0008)*(np.mod(y,.0038)<.002)*.00025
  height+=G(y-(top-.012),.002)*.0012
 weave=(np.sin(x*11000+y*850)*np.sin(y*10000-x*650))
 height+=weave*.000020+grain*.000012
 # Broad cavity darkening follows the folds, never the texture's checker grid.
 for f in d.get('handFrames',[]):
  r=xyz-np.array(f['wrist']);t=r@np.array(f['forward']);u=r@np.array(f['across']);foot=G(t-.068,.080)*G(u,.043)*front;ao*=1-foot*.18
 cavity=np.maximum(0,-height);ao*=1-np.clip(cavity/.0035,0,.18)
 color*=np.clip(1+height[...,None]*12+coarse[...,None]*.025,.83,1.07)
 rough=np.clip(.83+coarse*.08+np.abs(weave)*.045-cavity*8,.71,.96)
else:
 # Pores are microscopic height only. Low-frequency mottling and warmth are
 # separate so the skin doesn't become noisy fabric.
 pores=np.asarray(Image.fromarray(np.clip(grain*34+128,0,255).astype('uint8')).filter(ImageFilter.GaussianBlur(.42))).astype(float)/255-.5
 height+=pores*(.00022 if kind=='face' else .00019)
 color*=1+coarse[...,None]*.025
 rough=.84+coarse*.10+pores*.08
 if kind=='face':
  age={1:32,2:54,3:27,4:31,5:63,6:28,7:26,8:38,9:79,10:11}.get(idx,35);amount=np.clip((age-26)/38,.05,1)
  lm=d.get('landmarks',{});eyeY=lm.get('eyeY',top-.13);noseY=lm.get('noseY',eyeY-.040);mouthY=lm.get('mouthY',eyeY-.085);eyeRel=top-eyeY;noseRel=top-noseY;mouthRel=top-mouthY
  front=np.clip((nz-.10)/.55,0,1);cheeks=G(np.abs(x)-.047,.030)*G(y-(noseY-.005),.033)*front;nose=G(x,.014)*G(y-noseY,.022)*front;ears=G(np.abs(x)-.074,.014)*G(y-(eyeY-.015),.048)
  warm=(cheeks*.022+nose*.065+ears*.060);red=np.array([.66,.29,.22]);color=color*(1-warm[...,None])+red*warm[...,None]
  # Macro age relief must survive a 200 px head. Geometry/morphs remain
  # unchanged: these broad anatomical creases use normal, AO and restrained
  # albedo cavity together. Normal-facing gates avoid losing forehead detail
  # simply because its depth is less than the nose's.
  eye=G(np.abs(x)-.030,.024)*G(y-(eyeY-.011),.011)*front
  ao*=1-eye*(.045+.10*amount);color*=1-eye[...,None]*(.01+.045*amount)
  naso=(np.abs(x)-(.018+(noseY-y)*.37));groove=G(naso,.00135)*G(y-(noseY+mouthY)/2,.025)*front
  height-=groove*(.00008+(.0010*amount if age>=50 else .00006))
  height+=G(naso-.0025,.0020)*G(y-(noseY+mouthY)/2,.025)*front*(.00036 if age>=50 else .00010)
  if age>=50:
   ao*=1-groove*.22*amount;color*=1-groove[...,None]*.09*amount
   local=(np.abs(x)-.032)/.022;arcGate=np.maximum(0,1-local*local)**.45*front;bagY=eyeY-.015-.007*np.maximum(0,1-local*local)
   bag=G(y-bagY,.00145)*arcGate
   puff=G(y-(bagY+.0030),.0035)*arcGate
   height+=puff*.00080*amount-bag*.00085*amount
   ao*=1-bag*.23*amount;color*=1-bag[...,None]*.095*amount
   for k in range(3):
    lineY=eyeY+[.030,.042,.057][k]+np.cos(x*39+.25*k)*.0022+np.sin(x*79+.9*k)*.00065
    span=[.059,.052,.044][k];taper=G(x-[-.003,.004,-.001][k],span)*(.80+.20*np.sin(x*41+k)**2)
    brow=G(y-lineY,.0008+.00035*np.sin(x*35+k)**2)*taper*front
    height-=brow*[.00072,.00065,.00056][k]*amount;height+=G(y-(lineY+.0018),.0016)*taper*front*.00023*amount
    ao*=1-brow*.22*amount;color*=1-brow[...,None]*.095*amount
   outward=np.abs(x)-.055;cornerGate=np.clip(outward/.004,0,1)*np.clip((.024-outward)/.008,0,1)*front
   for angle in [-.70,-.12,.45]:
    corner=G(y-(eyeY+outward*angle),.00085)*cornerGate
    height-=corner*.00048*amount;ao*=1-corner*.20*amount;color*=1-corner[...,None]*.095*amount
   marX=np.abs(x)-(.027+(mouthY-y)*.18);mar=G(marX,.0015)*G(y-(mouthY-.017),.014)*front
   height-=mar*.00048*amount;ao*=1-mar*.12*amount;color*=1-mar[...,None]*.055*amount
  # A few restrained age spots; lighter young skin remains visibly younger.
  if age>=50:
   for cx,cy in [(-.054,.076),(.049,.081),(-.063,.158),(.056,.161),(.019,.052)]:
    spot=G(x-cx,.0017)*G(rel-cy,.0021)*front;color*=1-spot[...,None]*.055*amount
  # Stubble on the adult men's jaw, never painted across lips or cheeks (not the women or the kid).
  if idx in (1,2,3,5,6,8):
   beard=G(y-(mouthY-.018),.027)*G(x,.065)*front;stip=np.clip((pores+.18)*1.8,0,.6)*beard*(.035 if idx!=3 else .045);color*=1-stip[...,None];height+=pores*beard*.000055
  rough-=nose*.09+cheeks*.025
 else:
  # Anatomical warmth is strongest on hands. Detect their two UV-connected
  # 1,817-vertex components in the JS exporter, then fit a local wrist frame.
  frames=d.get('handFrames',[])
  for f in frames:
   W=np.array(f['wrist']);D=np.array(f['forward']);A=np.array(f['across']);r=xyz-W;t=r@D;u=r@A;up=r[...,2];dorsal=np.clip((nz-.05)/.65,0,1)*hand_mask
   scale=f['scale'];heat=np.zeros((S,S));creases=np.zeros((S,S))
   for ku,kt in [(-.025,.076),(-.008,.080),(.010,.075),(.027,.064)]:
    heat+=G(t-kt*scale,.010*scale)*G(u-ku*scale,.010*scale)
    creases+=G(t-(kt+.031)*scale,.0011*scale)*G(u-ku*scale,.007*scale)
   handgate=(t>-.014*scale)&(t<.18*scale)&(abs(u)<.070*scale)&(abs(up)<.045*scale)
   heat=np.clip(heat,0,1)*dorsal*handgate;warm=heat*.075;color=color*(1-warm[...,None])+np.array([.70,.31,.25])*warm[...,None];height-=creases*dorsal*handgate*.00011
  # Slightly paler inner forearms, with small broad color variation only.
  inner=np.clip(-nx*np.sign(x),0,1)*G(y-(top-.38),.24);color=color*(1-inner[...,None]*.025)+np.array([.79,.65,.54])*inner[...,None]*.025
# Height derivatives are scaled by the local physical UV metric. Clamps apply to
# UV discontinuities, not to the intended fold amplitude.
dhu,dhv=np.gradient(height);pu,pv=np.gradient(xyz,axis=(0,1))
# Orthogonalize the physical UV frame. A simple per-axis scale loses the
# cross term on stretched/skewed face and wrist islands.
uLength=np.maximum(np.linalg.norm(pv,axis=2),.00015);T=pv/uLength[...,None];vAlong=np.sum(pu*T,axis=2);vPerp=pu-vAlong[...,None]*T;vLength=np.maximum(np.linalg.norm(vPerp,axis=2),.00015)
slopeX=np.clip(dhv/uLength,-.90,.90);slopeY=np.clip((dhu-vAlong*slopeX)/vLength,-.90,.90);normalmap=np.stack([-slopeX,-slopeY,np.ones_like(height)],-1);normalmap/=np.linalg.norm(normalmap,axis=2)[...,None]
normalmap[~filled]=[0,0,1];ao=np.clip(ao,.48,1);rough=np.clip(rough,.62,.98);orm=np.stack([ao,rough,np.zeros_like(ao)],-1)
# UV-gutter normal/ORM dilation prevents filtering seams at clothing edges.
for suffix,a in [('-color',color),('-normal',normalmap*.5+.5),('-orm',orm)]:
 out=np.clip(a*255,0,255).astype('uint8');image=Image.fromarray(out,'RGB');size=512 if suffix=='-orm' or kind=='pants' or (suffix=='-color' and kind!='face') or (suffix=='-normal' and kind=='face' and idx in (1,3,4,6,7,10)) else 1024
 if size!=S:image=image.resize((size,size),Image.Resampling.LANCZOS)
 image.save(str(stem)+suffix+'.webp','WEBP',quality=93 if suffix=='-color' else 90,method=6)
print(pid,kind,'detail maps bytes',sum(Path(str(stem)+s+'.webp').stat().st_size for s in ['-color','-normal','-orm']))

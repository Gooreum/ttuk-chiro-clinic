"""Tailor towel-stage copies of existing MPFB therapist and Blender cloth simulations.

Original anatomy, seated pose, grip morphs and markers remain unchanged. This
geometry finish is intentionally deterministic and preserves the source glTF
buffers; it requires numpy, not Blender evaluation (Blender 5.2 Metal may be
unavailable in a sandbox). Source anatomy is MPFB/MakeHuman CC0; cloth colour/
normal source is Poly Haven Terry Cloth CC0. Added tailoring is original work.

Decode inputs with gltf-transform copy, then:
  python3 scripts/assets/towel_stage_props.py therapist decoded.glb raw.glb
  python3 scripts/assets/towel_stage_props.py towel decoded.glb raw.glb
Finally gltf-transform meshopt raw.glb public/models/towel-stage/... .
"""
import json, struct, sys, math, tempfile, subprocess
from pathlib import Path
import numpy as np

class GLB:
 def __init__(self,path):
  b=open(path,'rb').read(); n=struct.unpack_from('<I',b,12)[0]
  self.j=json.loads(b[20:20+n]); self.b=bytearray(b[28+n:]); self.j['asset']['generator']='Ttuk towel-stage tailoring / glTF-Transform'
 def array(self,i):
  a=self.j['accessors'][i]; v=self.j['bufferViews'][a['bufferView']]
  dt={5120:'i1',5121:'u1',5122:'<i2',5123:'<u2',5125:'<u4',5126:'<f4'}[a['componentType']]
  sz={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']]; d=np.dtype(dt)
  ar=np.ndarray((a['count'],sz),dtype=d,buffer=self.b,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',d.itemsize*sz),d.itemsize)).copy()
  if a.get('normalized'):
   ar=ar.astype(float)/np.iinfo(d).max
   if d.kind=='i':ar=np.maximum(ar,-1)
  return ar
 def acc(self,a,typ='VEC3'):
  a=np.asarray(a,dtype=np.float32); self.b+=b'\0'*((-len(self.b))%4); off=len(self.b); self.b+=a.tobytes()
  vi=len(self.j['bufferViews']); self.j['bufferViews'].append({'buffer':0,'byteOffset':off,'byteLength':a.nbytes})
  i=len(self.j['accessors']); self.j['accessors'].append({'bufferView':vi,'componentType':5126,'count':len(a),'type':typ,'min':a.min(0).tolist(),'max':a.max(0).tolist()}); return i
 def material(self,name,color,rough=.8,metal=0):
  i=len(self.j['materials']); self.j['materials'].append({'name':name,'doubleSided':True,'pbrMetallicRoughness':{'baseColorFactor':[*lin(color),1],'roughnessFactor':rough,'metallicFactor':metal}});return i
 def add(self,name,P,F,mi,morph=None,parent=None):
  P=np.asarray(P,float); F=np.asarray(F,int); N=np.zeros_like(P)
  for f in F:
   n=np.cross(P[f[1]]-P[f[0]],P[f[2]]-P[f[0]])
   for i in f:N[i]+=n
  N/=np.maximum(np.linalg.norm(N,axis=1)[:,None],1e-12)
  # Vertex-expanded triangles keep new primitives simple, with stable normals.
  ix=F.ravel(); pr={'attributes':{'POSITION':self.acc(P[ix]),'NORMAL':self.acc(N[ix])},'mode':4,'material':mi}
  me={'name':name,'primitives':[pr]}
  if morph is not None:
   pr['targets']=[{'POSITION':self.acc(np.asarray(morph)[ix]-P[ix])}];me['weights']=[0];me['extras']={'targetNames':['taut']}
  mid=len(self.j['meshes']);self.j['meshes'].append(me); ni=len(self.j['nodes']);self.j['nodes'].append({'name':name,'mesh':mid})
  if parent is None:self.j['scenes'][self.j.get('scene',0)]['nodes'].append(ni)
  else:self.j['nodes'][parent].setdefault('children',[]).append(ni)
 def save(self,path):
  self.j['buffers'][0]['byteLength']=len(self.b); jb=json.dumps(self.j,separators=(',',':')).encode();jb+=b' '*((-len(jb))%4);self.b+=b'\0'*((-len(self.b))%4)
  b=struct.pack('<III',0x46546c67,2,28+len(jb)+len(self.b))+struct.pack('<II',len(jb),0x4e4f534a)+jb+struct.pack('<II',len(self.b),0x004e4942)+self.b;open(path,'wb').write(b)
 def world(self,ni):
  n=self.j['nodes'][ni];t=np.array(n.get('translation',[0,0,0]));s=np.array(n.get('scale',[1,1,1]));q=n.get('rotation',[0,0,0,1]);x,y,z,w=q
  R=np.array([[1-2*y*y-2*z*z,2*x*y-2*z*w,2*x*z+2*y*w],[2*x*y+2*z*w,1-2*x*x-2*z*z,2*y*z-2*x*w],[2*x*z-2*y*w,2*y*z+2*x*w,1-2*x*x-2*y*y]])@np.diag(s)
  M=np.eye(4);M[:3,:3]=R;M[:3,3]=t
  if 'matrix'in n:M=np.array(n['matrix']).reshape(4,4).T
  for pi,p in enumerate(self.j['nodes']):
   if ni in p.get('children',[]):M=self.world(pi)@M;break
  return M
 def points(self,ni,pr):
  p=self.array(pr['attributes']['POSITION']);m=self.world(ni);return p@m[:3,:3].T+m[:3,3]

def lin(c):
 c=np.array([int(c[i:i+2],16)/255 for i in (0,2,4)]);return np.where(c<=.04045,c/12.92,((c+.055)/1.055)**2.4).tolist()

def tube(path,r=.0015,sides=6):
 P=[];F=[];path=np.array(path)
 for i,p in enumerate(path):
  d=path[min(i+1,len(path)-1)]-path[max(0,i-1)];d/=max(np.linalg.norm(d),1e-12);u=np.cross(d,[0,0,1]);
  if np.linalg.norm(u)<.1:u=np.cross(d,[0,1,0])
  u/=np.linalg.norm(u);v=np.cross(d,u)
  for k in range(sides):P.append(p+r*(u*math.cos(k*math.tau/sides)+v*math.sin(k*math.tau/sides)))
  if i:
   for k in range(sides):a=(i-1)*sides+k;b=(i-1)*sides+(k+1)%sides;c=i*sides+k;d=i*sides+(k+1)%sides;F.extend([(a,b,c),(b,d,c)])
 return np.array(P),F

def therapist(g):
 green=g.material('stage.scrub','17312c',.93);mint=g.material('stage.mint.stitch','8adfbf',.91);paper=g.material('stage.paper.badge','f4efe4',.7);coral=g.material('stage.coral','ff7a59',.63)
 for m in g.j['materials']:
  n=m.get('name','');p=m.setdefault('pbrMetallicRoughness',{})
  if n.endswith('.shirt') or n.endswith('.pants'):p['baseColorFactor']=[*lin('17312c'),1];p['roughnessFactor']=.94
  if n=='stool.seat':p['baseColorFactor']=[*lin('ff7a59'),1];p['roughnessFactor']=.72
  if n=='stool.black':p['baseColorFactor']=[*lin('17312c'),1]
  if n=='stool.chrome':p['baseColorFactor']=[*lin('f4efe4'),1];p['metallicFactor']=.55;p['roughnessFactor']=.3
  if n.endswith('.skin'):p['roughnessFactor']=.72
  if n.endswith('.short04'):p['roughnessFactor']=.8
 # A towel-only character sculpt: fuller squared jaw, higher cheek plane and a
 # compact nose. It edits only the head region; torso/neck joins/pose stay fixed.
 eye=np.array([0,1.392193,-.145397]);head_up=np.array([0,.82,.57]);head_fwd=np.array([0,-.57,.82])
 for ni,n in enumerate(g.j['nodes']):
  if n.get('name') not in ('therapist_skin','therapist_hair','therapist_brows'):continue
  pr=g.j['meshes'][n['mesh']]['primitives'][0];W=g.points(ni,pr);d=W-eye;h=d@head_up;f=d@head_fwd
  if n['name']=='therapist_skin':
   # Facial sculpt smoothly vanishes into the unmodified neck below the jaw.
   face=np.exp(-((f+.012)/.083)**4)*np.clip((h+.115)/.040,0,1)
   jaw=np.exp(-((h+.067)/.039)**2)*face
   cheek=np.exp(-((h+.012)/.035)**2)*face
   W[:,0]*=1+.10*jaw+.035*cheek
   nose=np.exp(-(d[:,0]/.018)**2-((h+.027)/.022)**2)*np.clip((f+.005)/.018,0,1)
   W+=nose[:,None]*head_fwd*.003
  elif n['name']=='therapist_hair':
   # Short side part: preserve temple card overlap, lift and sweep the upper crown across
   # the part. All source textured cards and alpha edges remain intact.
   crown=np.clip((h-.065)/.070,0,1);crown=crown*crown*(3-2*crown)
   left=np.clip((-W[:,0]+.025)/.065,0,1)
   W+=crown[:,None]*(head_up[None,:]*(.005+.006*left)[:,None]+np.array([.006,0,0]))
  else:
   W+=np.exp(-(h/.04)**2)[:,None]*head_up*.0015
  inv=np.linalg.inv(g.world(ni));pr['attributes']['POSITION']=g.acc(W@inv[:3,:3].T+inv[:3,3])
 # Re-bake skin finish through the shared source-atlas microdetail helper.
 # Canonical face axes make cheek colour follow the bowed head, not a UV guess.
 sni=next(i for i,n in enumerate(g.j['nodes']) if n.get('name')=='therapist_skin');sp=g.j['meshes'][g.j['nodes'][sni]['mesh']]['primitives'][0];sm=g.j['materials'][sp['material']];tex=g.j['textures'][sm['pbrMetallicRoughness']['baseColorTexture']['index']];ii=tex.get('source',tex.get('extensions',{}).get('EXT_texture_webp',{}).get('source'));im=g.j['images'][ii];view=g.j['bufferViews'][im['bufferView']]
 with tempfile.TemporaryDirectory(prefix='ttuk-therapist-') as td:
  stem=Path(td)/'skin';stem.with_suffix('.image').write_bytes(g.b[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']]);W=g.points(sni,sp);d=W-eye;canonical=np.column_stack([W[:,0],d@head_up,d@head_fwd+.1])
  stem.with_suffix('.json').write_text(json.dumps({'pid':'patient01','kind':'face','positions':canonical.tolist(),'uv':g.array(sp['attributes']['TEXCOORD_0']).tolist(),'indices':g.array(sp['indices']).astype(int).ravel().tolist()}))
  subprocess.run([sys.executable,str(Path(__file__).with_name('towel_stage_textures.py')),str(stem)],check=True)
  for imagepath,isnormal in [(str(stem)+'.webp',False),(str(stem)+'-normal.webp',True)]:
   ib=Path(imagepath).read_bytes();g.b+=b'\0'*((-len(g.b))%4);off=len(g.b);g.b+=ib;bv=len(g.j['bufferViews']);g.j['bufferViews'].append({'buffer':0,'byteOffset':off,'byteLength':len(ib)})
   if not isnormal:im['bufferView']=bv;im['mimeType']='image/webp'
   else:
    nii=len(g.j['images']);g.j['images'].append({'name':'therapist.pores','mimeType':'image/webp','bufferView':bv});nti=len(g.j['textures']);g.j['textures'].append({'sampler':0,'extensions':{'EXT_texture_webp':{'source':nii}}});sm['normalTexture']={'index':nti,'scale':.18}
 # Project tailoring onto the real posed shirt. x/y coordinates are world metres.
 ni=next(i for i,n in enumerate(g.j['nodes']) if n.get('name')=='therapist_shirt');pr=g.j['meshes'][g.j['nodes'][ni]['mesh']]['primitives'][0];V=g.points(ni,pr);F=g.array(pr['indices']).astype(int).reshape(-1,3);T=V[F]
 def surf(x,y,offset=.003):
  a=T[:,0,:2];b=T[:,1,:2]-a;c=T[:,2,:2]-a;d=np.array([x,y])-a;det=b[:,0]*c[:,1]-b[:,1]*c[:,0];safe=np.where(abs(det)<1e-12,1e-12,det);u=(d[:,0]*c[:,1]-d[:,1]*c[:,0])/safe;v=(b[:,0]*d[:,1]-b[:,1]*d[:,0])/safe;ok=(u>=-1e-5)&(v>=-1e-5)&(u+v<=1.00001)&(abs(det)>1e-12)
  zs=T[:,0,2]+u*(T[:,1,2]-T[:,0,2])+v*(T[:,2,2]-T[:,0,2]);z=max(zs[ok]) if ok.any() else V[np.argmin(np.linalg.norm(V[:,:2]-[x,y],axis=1)),2]
  return np.array([x,y,z+offset])
 def seam(name,xy,r,mat):
  P,F=tube([surf(x,y) for x,y in xy],r);g.add(name,P,F,mat)
 # Separate raised mint V neckline, chest pocket with folded welt, two waist pockets,
 # underarm tailoring and a paper badge pinned to a coral tab.
 seam('scrub.v.collar',[(x,y) for x,y in zip(np.r_[np.linspace(-.075,0,12),np.linspace(0,.075,12)],np.r_[np.linspace(1.245,1.145,12),np.linspace(1.145,1.245,12)])],.0033,mint)
 for side in (-1,1):
  xy=[(side*.04,.91),(side*.12,.91),(side*.13,1.005),(side*.05,1.005)]
  P=[surf(x,y,.0045) for x,y in xy];g.add('scrub.waist.pocket.'+str(side),P,[(0,1,2),(0,2,3)],green)
  seam('scrub.pocket.welt.'+str(side),[(x,1.006) for x in np.linspace(side*.05,side*.13,10)],.0018,mint)
  seam('scrub.tailor.'+str(side),[(side*(.14-.03*t),1.17-.29*t) for t in np.linspace(0,1,16)],.001,mint)
 xy=[(-.115,1.10),(-.055,1.10),(-.055,1.158),(-.115,1.158)];g.add('scrub.chest.pocket',[surf(x,y,.005) for x,y in xy],[(0,1,2),(0,2,3)],green)
 seam('scrub.chest.welt',[(x,1.158) for x in np.linspace(-.115,-.055,10)],.0018,mint)
 # Badge relief is intentionally glyph-free: embossed stacked bars and a traction ring mark.
 xy=[(.058,1.106),(.112,1.106),(.112,1.145),(.058,1.145)];g.add('therapist.badge',[surf(x,y,.008) for x,y in xy],[(0,1,2),(0,2,3)],paper)
 seam('badge.tab',[(.083,y) for y in np.linspace(1.145,1.167,4)],.004,coral)
 for y in [1.117,1.127]:seam('badge.emboss.'+str(y),[(x,y) for x in np.linspace(.07,.100,6)],.001,green)
 # Thin acetate spectacles are authored around the measured MPFB eye centres.
 # Opaque frames use geometry; no extra transparent shell or mobile draw pass.
 eni=next(i for i,n in enumerate(g.j['nodes']) if n.get('name')=='therapist_eyes');ev=g.points(eni,g.j['meshes'][g.j['nodes'][eni]['mesh']]['primitives'][0]);up=np.array([0,.82,.57]);forward=np.array([0,-.57,.82])
 for side in (-1,1):
  c=ev[ev[:,0]*side>0].mean(0)+forward*.014
  xy=[(-.018,-.011),(.018,-.011),(.020,-.008),(.020,.008),(.017,.012),(-.017,.012),(-.020,.008),(-.020,-.008),(-.018,-.011)]
  P,F=tube([c+np.array([x,0,0])+up*y for x,y in xy],.0017,5);g.add('therapist.spectacle.'+str(side),P,F,green)
  P,F=tube([c+np.array([side*.020,0,0]),c+np.array([side*.033,.015,-.035]),c+np.array([side*.035,.015,-.060])],.0018,5);g.add('therapist.spectacle.temple.'+str(side),P,F,green)
  P,F=tube([c+np.array([-side*.020,0,0]),c+np.array([-side*.029,0,0])+up*.003],.0014,5);g.add('therapist.spectacle.bridge.'+str(side),P,F,mint)
 # Padded stool perimeter welt and five caster hub trims.
 stool=next(i for i,n in enumerate(g.j['nodes']) if n.get('name')=='stool');mesh=g.j['meshes'][g.j['nodes'][stool]['mesh']];sv=g.points(stool,mesh['primitives'][0]);yc=(sv[:,1].max()-.042);zc=(sv[:,2].max()+sv[:,2].min())/2
 P,F=tube([(math.cos(t)*.177,yc,zc+math.sin(t)*.177) for t in np.linspace(0,math.tau,57)],.0025,6);g.add('stool.upholstery.welt',P,F,paper)
 # A visible paper foot ring, below the knees, keeps the casters and fall bounds exact.
 P,F=tube([(math.cos(t)*.19,.265,zc+math.sin(t)*.19) for t in np.linspace(0,math.tau,41)],.007,6);g.add('stool.foot.ring',P,F,paper)

def towel(g):
 # Add a sewn piping following the *exact existing simulated edge*, both states.
 # It is a second primitive within each patient's existing mesh, so the runtime
 # keeps its one-mesh-per-patient selector and drives the same taut morph.
 mi=g.material('stage.towel.cord','f4efe4',.98)
 for ni,n in list(enumerate(g.j['nodes'])):
  if not n.get('name','').startswith('towel_patient'):continue
  mesh=g.j['meshes'][n['mesh']];pr=mesh['primitives'][0];P=g.array(pr['attributes']['POSITION']);UV=g.array(pr['attributes']['TEXCOORD_0']);N=g.array(pr['attributes']['NORMAL']);D=g.array(pr['targets'][0]['POSITION'])
  # normalized quantized morph delta uses node's scale just as POSITION.
  M=g.world(ni);W=P@M[:3,:3].T+M[:3,3];Wt=(P+D)@M[:3,:3].T+M[:3,3]
  # The rounded outer rim owns the lowest/highest UV v. Half-resolution sampling
  # keeps piping comfortably inside the original mobile geometry budget.
  built=[];bs=[];fs=[]
  for edge in [UV[:,1].min(),UV[:,1].max()]:
   ids=np.flatnonzero(abs(UV[:,1]-edge)<.0001);ids=ids[np.argsort(UV[ids,0])];_,pick=np.unique(np.round(UV[ids,0],5),return_index=True);ids=ids[pick][::2]
   if len(ids)<2:continue
   q,f=tube(W[ids],.0009,4);qt,_=tube(Wt[ids],.0009,4);off=len(bs);bs.extend(q);built.extend(qt);fs.extend([(a+off,b+off,c+off)for a,b,c in f])
  # Parent the cord under the source's unquantized transform by storing local
  # positions under its node; original source mesh is completely untouched.
  if not bs:continue
  inv=np.linalg.inv(M);B=np.array(bs)@inv[:3,:3].T+inv[:3,3];Bt=np.array(built)@inv[:3,:3].T+inv[:3,3]
  old=len(g.j['meshes']);g.add('edge.tmp',B,fs,mi,Bt,parent=ni)
  extra=g.j['meshes'].pop()['primitives'][0];g.j['nodes'].pop();g.j['nodes'][ni]['children'].pop();mesh['primitives'].append(extra)
 # Updated yarn roughness while retaining the CC0 photo detail and exact folds.
 for m in g.j['materials']:
  p=m.setdefault('pbrMetallicRoughness',{});p['roughnessFactor']=.98

if __name__=='__main__':
 mode,src,out=sys.argv[1:];g=GLB(src);globals()[mode](g);g.save(out)
 print('WROTE',out,'triangles',sum((g.j['accessors'][p['indices']]['count'] if 'indices'in p else g.j['accessors'][p['attributes']['POSITION']]['count'])//3 for me in g.j['meshes'] for p in me['primitives']))

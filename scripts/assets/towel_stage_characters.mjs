/** Towel-only character art derivatives. Existing MPFB CC0 topology, expression targets and neck cut stay intact.
 * Usage: GLTF_MODULES=/path/to/cached/node_modules node scripts/assets/towel_stage_characters.mjs [workdir]
 * Requires the existing gltf-transform 4.5.1 asset toolchain, Pillow/numpy in .venv. No runtime dependency.
 */
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import * as THREE from 'three';
const modules=process.env.GLTF_MODULES;
if(!modules) throw Error('Set GLTF_MODULES to the asset toolchain node_modules (see README).');
const require=createRequire(path.resolve(modules,'@gltf-transform/core/package.json'));
const {NodeIO}=require('@gltf-transform/core');
const {ALL_EXTENSIONS}=require('@gltf-transform/extensions');
const {dequantize,meshopt,prune}=require('@gltf-transform/functions');
const {MeshoptDecoder,MeshoptEncoder}=require('meshoptimizer');
await Promise.all([MeshoptDecoder.ready,MeshoptEncoder.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder,'meshopt.encoder':MeshoptEncoder});
const work=process.argv[2]||'/private/tmp/towel-stage-characters'; fs.mkdirSync(work,{recursive:true});
const rgb=h=>new THREE.Color(h).convertSRGBToLinear().toArray();
const ROOM=0x17312c,PAPER=0xf4efe4,MINT=0x8adfbf,CORAL=0xff7a59;
const v3=new THREE.Vector3();
function worldPositions(node,p){
 const P=p.getAttribute('POSITION'), out=[];
 if(node.getSkin()){
  const sk=node.getSkin(), ib=sk.getInverseBindMatrices(), js=sk.listJoints(), SI=p.getAttribute('JOINTS_0'),SW=p.getAttribute('WEIGHTS_0');
  const mats=js.map((n,i)=>new THREE.Matrix4().fromArray(n.getWorldMatrix()).multiply(new THREE.Matrix4().fromArray(ib.getElement(i,[]))));
  for(let i=0;i<P.getCount();i++){const pos=P.getElement(i,[]), is=SI.getElement(i,[]),ws=SW.getElement(i,[]), w=new THREE.Vector3();for(let j=0;j<4;j++)if(ws[j])w.addScaledVector(new THREE.Vector3().fromArray(pos).applyMatrix4(mats[is[j]]),ws[j]);out.push(w.toArray());}
 } else {const m=new THREE.Matrix4().fromArray(node.getWorldMatrix());for(let i=0;i<P.getCount();i++)out.push(v3.fromArray(P.getElement(i,[])).applyMatrix4(m).toArray());}
 return out;
}
function accessor(d,a,type){return d.createAccessor().setType(type).setArray(a).setBuffer(d.getRoot().listBuffers()[0]);}
function addGeo(d,geo,name,color,parent){
 const p=d.createPrimitive().setAttribute('POSITION',accessor(d,geo.attributes.position.array,'VEC3')).setAttribute('NORMAL',accessor(d,geo.attributes.normal.array,'VEC3'));
 if(geo.index)p.setIndices(accessor(d,geo.index.array,'SCALAR'));
 const m=d.createMaterial(name).setBaseColorFactor([...rgb(color),1]).setRoughnessFactor(.65).setMetallicFactor(.08);p.setMaterial(m);
 const n=d.createNode(name).setMesh(d.createMesh(name).addPrimitive(p));(parent||d.getRoot().listScenes()[0]).addChild(n);return n;
}
function tube(d,points,r,name,color,parent){const c=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));return addGeo(d,new THREE.TubeGeometry(c,points.length*3,r,5,false),name,color,parent);}
function accessories(d,pid){
 const nodes=d.getRoot().listNodes(), eye=nodes.find(n=>n.getName().endsWith('.high-poly'));
 if(pid==='patient02'&&eye){
  const pts=worldPositions(eye,eye.getMesh().listPrimitives()[0]); const mn=[0,1,2].map(a=>Math.min(...pts.map(p=>p[a]))),mx=[0,1,2].map(a=>Math.max(...pts.map(p=>p[a])));const y=(mn[1]+mx[1])/2,z=mx[2]+.008,cx=(mx[0]+mn[0])/2;
  for(const s of [-1,1]){const ps=[];for(let i=0;i<=32;i++){const t=i/32*Math.PI*2;ps.push([cx+s*.034+Math.cos(t)*.030,y+Math.sin(t)*.019,z+.002*Math.cos(t)]);}tube(d,ps,.0017,'professor.frame.accessory',ROOM);tube(d,[[cx+s*.064,y,z],[cx+s*.073,y+.002,z-.028],[cx+s*.073,y-.002,z-.077]],.0013,'professor.temple.accessory',ROOM);}
  tube(d,[[cx-.005,y+.005,z],[cx,y+.009,z+.003],[cx+.005,y+.005,z]],.0014,'professor.bridge.accessory',PAPER);
 }
 if(pid==='patient04'){
  const skin=nodes.find(n=>n.getName().endsWith('.body')),pts=worldPositions(skin,skin.getMesh().listPrimitives()[0]); const top=Math.max(...pts.map(p=>p[1]));
  tube(d,[[.065,top-.045,.075],[.072,top-.058,.083],[.074,top-.071,.084]],.0022,'artist.clip.accessory',CORAL);
 }
}
function piping(d,node,p){
 // Weld UV splits before finding actual garment boundaries; carry the original skin and breath weights.
 const P=p.getAttribute('POSITION'),N=p.getAttribute('NORMAL'),I=p.getIndices().getArray(),keys=new Map(),ids=[];
 for(let i=0;i<P.getCount();i++){const a=P.getElement(i,[]),key=a.map(x=>Math.round(x*1e5)).join(',');if(!keys.has(key))keys.set(key,keys.size);ids.push(keys.get(key));}
 const edges=new Map();for(let j=0;j<I.length;j+=3)for(let e=0;e<3;e++){const a=I[j+e],b=I[j+(e+1)%3],k=[ids[a],ids[b]].sort((a,b)=>a-b).join(':');const ex=edges.get(k);if(ex)ex.count++;else edges.set(k,{a,b,count:1});}
 const pos=[],norm=[],inds=[],joints=[],weights=[],morphs=p.listTargets().map(()=>[]),SI=p.getAttribute('JOINTS_0'),SW=p.getAttribute('WEIGHTS_0');
 for(const {a,b,count} of edges.values()){
  if(count!==1)continue;const A=new THREE.Vector3().fromArray(P.getElement(a,[])),B=new THREE.Vector3().fromArray(P.getElement(b,[]));if(A.distanceTo(B)>.08)continue;
  const tang=B.clone().sub(A).normalize(),na=new THREE.Vector3().fromArray(N.getElement(a,[])).normalize(),bin=tang.clone().cross(na).normalize(),start=pos.length/3;
  for(const [q,pt] of [[a,A],[b,B]])for(let k=0;k<4;k++){const t=k/4*Math.PI*2,dir=na.clone().multiplyScalar(Math.cos(t)).addScaledVector(bin,Math.sin(t));pos.push(...pt.clone().addScaledVector(na,.001).addScaledVector(dir,.0013).toArray());norm.push(...dir.toArray());joints.push(...SI.getElement(q,[]));weights.push(...SW.getElement(q,[]));p.listTargets().forEach((tar,ti)=>morphs[ti].push(...tar.getAttribute('POSITION').getElement(q,[])));}
  for(let k=0;k<4;k++){const k1=(k+1)%4;inds.push(start+k,start+k1,start+4+k,start+k1,start+4+k1,start+4+k);}
 }
 if(!pos.length)return;
 const prim=d.createPrimitive().setAttribute('POSITION',accessor(d,new Float32Array(pos),'VEC3')).setAttribute('NORMAL',accessor(d,new Float32Array(norm),'VEC3')).setAttribute('JOINTS_0',accessor(d,new Uint16Array(joints),'VEC4')).setAttribute('WEIGHTS_0',accessor(d,new Float32Array(weights),'VEC4')).setIndices(accessor(d,new Uint16Array(inds),'SCALAR'));
 const mat=d.createMaterial('tailored.hem').setBaseColorFactor([...rgb(PAPER),1]).setRoughnessFactor(.92);prim.setMaterial(mat);
 morphs.forEach((arr,i)=>prim.addTarget(d.createPrimitiveTarget().setAttribute('POSITION',accessor(d,new Float32Array(arr),'VEC3'))));
 const mesh=d.createMesh('tailored_hem').addPrimitive(prim);mesh.setExtras(node.getMesh().getExtras());
 const n=d.createNode('tailored_hem').setMesh(mesh).setSkin(node.getSkin());n.setWeights(node.getWeights());
 for(const par of node.listParents())if(par.propertyType==='Node'||par.propertyType==='Scene'){par.addChild(n);break;}
}
const report=[];
for(const pid of (process.env.ASSET_IDS?.split(',') || ['patient01','patient02','patient03','patient04','patient05','hands']))for(const part of (pid==='hands'?['arms']:(process.env.ASSET_PARTS?.split(',') || ['head','body']))){
 const source=pid==='hands'?'public/models/hands/arms.glb':`public/models/${pid}/${part==='head'?pid:'body'}.glb`, dest=`public/models/towel-stage/${pid}/${part==='head'?pid:part}.glb`;
 const d=await io.read(source);await d.transform(dequantize());const before={bytes:fs.statSync(source).size,triangles:d.getRoot().listMeshes().reduce((a,m)=>a+m.listPrimitives().reduce((s,p)=>s+(p.getIndices()?.getCount()||p.getAttribute('POSITION').getCount())/3,0),0)};
 const out=path.join(work,`${pid}-${part}`);fs.mkdirSync(out,{recursive:true});const jobs=[];
 for(const node of d.getRoot().listNodes())for(const prim of node.getMesh()?.listPrimitives()||[]){
  const m=prim.getMaterial(),name=m.getName(),tex=m.getBaseColorTexture();if(!tex)continue;
  const kind=name.endsWith('.body')?'face':name.endsWith('.skin')?'skin':name.endsWith('.shirt')?'shirt':name.endsWith('.pants')?'pants':/\.(short|bob)/.test(name)?'hair':name.endsWith('.sleeve')?'sleeve':null;
  if(!kind)continue;
  const stem=path.join(out,kind);fs.writeFileSync(stem+'.image',tex.getImage());const wp=worldPositions(node,prim);
  fs.writeFileSync(stem+'.json',JSON.stringify({pid,kind,positions:wp,uv:prim.getAttribute('TEXCOORD_0')?.getArray()?Array.from(prim.getAttribute('TEXCOORD_0').getArray()):null,indices:Array.from(prim.getIndices().getArray())}));
  const py=spawnSync(process.env.ASSET_PYTHON||'python3',['scripts/assets/towel_stage_textures.py',stem],{encoding:'utf8'});if(py.status)throw Error(py.stderr);
  const nt=d.createTexture(name+'.tailored').setImage(fs.readFileSync(stem+'.webp')).setMimeType('image/webp');m.setBaseColorTexture(nt).setBaseColorFactor([1,1,1,1]);
  if(['face','skin','shirt','sleeve','pants'].includes(kind)){const normal=d.createTexture(name+'.micro').setImage(fs.readFileSync(stem+'-normal.webp')).setMimeType('image/webp');m.setNormalTexture(normal);m.setNormalScale(kind==='face'?.2:kind==='skin'?.13:.32);}
  m.setExtras({...m.getExtras(),towelStage:true});
  if(kind==='face'){
   // Individual facial planes, in metres. Preserve every point at and below the jaw/neck attachment.
   const P=prim.getAttribute('POSITION'),a=P.getArray(),W=new THREE.Matrix4().fromArray(node.getWorldMatrix()),inv=W.clone().invert(),top=Math.max(...wp.map(p=>p[1]));
   for(let i=0;i<P.getCount();i++){const [x,y,z]=wp[i],rel=top-y;if(rel<.055||rel>.225||z<.075)continue;const cheek=Math.exp(-(((Math.abs(x)-.045)/.026)**2)-((rel-.145)/.038)**2),nose=Math.exp(-((x/.018)**2)-((rel-.132)/.035)**2); const idx=Number(pid.slice(-1)),dx=(idx===3?.002:idx===5?.0025:idx===4?-.001:.001)*cheek*Math.sign(x),dz=(idx===1?.003:idx===2?-.001:idx===3?.004:idx===4?.002:.003)*nose;v3.set(x+dx,y,z+dz).applyMatrix4(inv);a.set(v3.toArray(),i*3);}
  }
  if(kind==='hair'){
   const P=prim.getAttribute('POSITION'),a=P.getArray(),W=new THREE.Matrix4().fromArray(node.getWorldMatrix()),inv=W.clone().invert(),top=Math.max(...wp.map(p=>p[1]));for(let i=0;i<P.getCount();i++){let [x,y,z]=wp[i];const t=Math.max(0,1-(top-y)/.12);if(pid==='patient01'){x+=t*.006;y+=Math.max(0,-x)*t*.12;}if(pid==='patient03'){y+=t*(.006+.004*Math.sin(x*190+z*90));x+=t*.004*Math.sin(z*110);}if(pid==='patient04')x*=1+.035*(1-t);v3.set(x,y,z).applyMatrix4(inv);a.set(v3.toArray(),i*3);}
  }
  if(kind==='shirt')jobs.push([node,prim]);
 }
 for(const [n,p]of jobs)piping(d,n,p);
 if(pid==='hands') for(const m of d.getRoot().listMaterials()) if(m.getName().endsWith('.hem')) m.setBaseColorFactor([...rgb(MINT),1]);
 if(part==='head')accessories(d,pid);
 await d.transform(prune(),meshopt({encoder:MeshoptEncoder,level:'medium'}));fs.mkdirSync(path.dirname(dest),{recursive:true});await io.write(dest,d);
 const after={bytes:fs.statSync(dest).size,triangles:d.getRoot().listMeshes().reduce((a,m)=>a+m.listPrimitives().reduce((s,p)=>s+(p.getIndices()?.getCount()||p.getAttribute('POSITION').getCount())/3,0),0)};report.push({source,dest,before,after});console.log(pid,part,before,after);
}
fs.writeFileSync(path.join(work,'character-metrics.json'),JSON.stringify(report,null,2));

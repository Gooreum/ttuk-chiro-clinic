/** Towel-only character detail: preserve all original skin/bone/morph buffers.
 * GLTF_MODULES=/existing/node_modules node scripts/assets/patient_detail.mjs <workdir>
 * Runs after patient_rest_hands.mjs. Repeated runs use workdir/source.
 */
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
const require=createRequire(path.resolve(process.env.GLTF_MODULES||'','@gltf-transform/core/package.json'));
const {NodeIO}=require('@gltf-transform/core');
const {ALL_EXTENSIONS}=require('@gltf-transform/extensions');
const {prune}=require('@gltf-transform/functions');
const {MeshoptDecoder,MeshoptEncoder}=require('meshoptimizer');
await Promise.all([MeshoptDecoder.ready,MeshoptEncoder.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder,'meshopt.encoder':MeshoptEncoder});
const work=process.argv[2]||'/private/tmp/ttuk-patient-detail';fs.mkdirSync(work,{recursive:true});
const ids=process.env.ASSET_IDS?.split(',')||['01','02','03','04','05'];
const files=ids.flatMap(id=>['body',`patient${id}`].map(part=>`public/models/towel-stage/patient${id}/${part}.glb`));
const V=a=>new THREE.Vector3().fromArray(a),triangleCount=d=>d.getRoot().listMeshes().reduce((s,m)=>s+m.listPrimitives().reduce((n,p)=>n+p.getIndices().getCount()/3,0),0);
function rawBuffers(d){const out={};for(const n of d.getRoot().listNodes())for(const[pIndex,p]of (n.getMesh()?.listPrimitives()||[]).entries()){const add=(key,a)=>{if(!a)return;const array=a.getArray();out[n.getName()+'/'+pIndex+'/'+key]=[a.getComponentType(),a.getNormalized(),a.getType(),a.getCount(),createHash('sha256').update(Buffer.from(array.buffer,array.byteOffset,array.byteLength)).digest('hex')].join(':');};for(const key of p.listSemantics())add(key,p.getAttribute(key));add('INDICES',p.getIndices());p.listTargets().forEach((t,j)=>{for(const key of t.listSemantics())add('morph'+j+'/'+key,t.getAttribute(key));});}return out;}
function compareBuffers(before,after){return Object.keys(before).filter(k=>before[k]!==after[k]);}
function rigBuffers(d){const out={};for(const n of d.getRoot().listNodes())out['node:'+n.getName()]=JSON.stringify(n.getMatrix());for(const [i,s]of d.getRoot().listSkins().entries()){const a=s.getInverseBindMatrices().getArray();out['skin:'+i]=JSON.stringify({joints:s.listJoints().map(n=>n.getName()),hash:createHash('sha256').update(Buffer.from(a.buffer,a.byteOffset,a.byteLength)).digest('hex')});}return out;}
function exportContact(d,pid){
 const out=[],shirt={name:'shirt',positions:[],breathDeltas:[],triangles:[]};
 for(const n of d.getRoot().listNodes())for(const p of n.getMesh()?.listPrimitives()||[]){const name=p.getMaterial()?.getName()||'',skin=name.endsWith('.skin'),cloth=name.endsWith('.shirt')||name.endsWith('.constructionHem');if(!skin&&!cloth)continue;const g=geometry(n,p),I=Array.from(p.getIndices().getArray()),tri=Array.from({length:I.length/3},(_,i)=>I.slice(i*3,i*3+3)),breath=p.listTargets()[0]?.getAttribute('POSITION'),delta=g.positions.map((_,i)=>breath?V(breath.getElement(i,[])).applyMatrix3(new THREE.Matrix3().setFromMatrix4(g.transforms[i])).toArray():[0,0,0]);
  if(skin){const hands=components(p).filter(ids=>ids.length===1817);for(const [h,ids]of hands.entries()){const own=new Set(ids);out.push({name:'hand'+h,positions:g.positions.map(v=>v.toArray()),breathDeltas:delta,triangles:tri.filter(t=>t.every(i=>own.has(i)))});}}
  else{const offset=shirt.positions.length;shirt.positions.push(...g.positions.map(v=>v.toArray()));shirt.breathDeltas.push(...delta);shirt.triangles.push(...tri.map(t=>t.map(i=>i+offset)));}
 }
 out.push(shirt);fs.writeFileSync(path.join(work,pid+'-collision.json'),JSON.stringify(out));
}
function geometry(n,p){
 const P=p.getAttribute('POSITION'),N=p.getAttribute('NORMAL'),positions=[],normals=[],transforms=[];
 if(n.getSkin()){
  const sk=n.getSkin(),ib=sk.getInverseBindMatrices(),js=sk.listJoints(),mats=js.map((b,i)=>new THREE.Matrix4().fromArray(b.getWorldMatrix()).multiply(new THREE.Matrix4().fromArray(ib.getElement(i,[])))),J=p.getAttribute('JOINTS_0'),W=p.getAttribute('WEIGHTS_0');
  for(let i=0;i<P.getCount();i++){const j=J.getElement(i,[]),w=W.getElement(i,[]),m=new THREE.Matrix4();m.elements.fill(0);for(let k=0;k<4;k++)if(w[k])for(let c=0;c<16;c++)m.elements[c]+=w[k]*mats[j[k]].elements[c];transforms.push(m);positions.push(V(P.getElement(i,[])).applyMatrix4(m));normals.push(V(N.getElement(i,[])).applyMatrix3(new THREE.Matrix3().getNormalMatrix(m)).normalize());}
 }else{const m=new THREE.Matrix4().fromArray(n.getWorldMatrix()),normal=new THREE.Matrix3().getNormalMatrix(m);for(let i=0;i<P.getCount();i++){transforms.push(m);positions.push(V(P.getElement(i,[])).applyMatrix4(m));normals.push(V(N.getElement(i,[])).applyMatrix3(normal).normalize());}}
 return{positions,normals,transforms};
}
function components(p){const count=p.getAttribute('POSITION').getCount(),par=Array.from({length:count},(_,i)=>i),root=i=>{while(par[i]!==i){par[i]=par[par[i]];i=par[i];}return i;},I=p.getIndices().getArray();for(let k=0;k<I.length;k+=3){par[root(I[k+1])]=root(I[k]);par[root(I[k+2])]=root(I[k]);}const groups=new Map();for(let i=0;i<count;i++){const r=root(i);if(!groups.has(r))groups.set(r,[]);groups.get(r).push(i);}return [...groups.values()];}
function handData(n,p){const g=geometry(n,p),groups=components(p),hands=groups.filter(ids=>ids.length===1817),frames=[],mask=new Float32Array(g.positions.length);for(const ids of hands){const own=new Set(ids),ring=ids.filter(i=>g.positions.some((v,j)=>!own.has(j)&&v.distanceToSquared(g.positions[i])<1e-8)),W=ring.reduce((v,i)=>v.add(g.positions[i]),new THREE.Vector3()).divideScalar(ring.length),center=ids.reduce((v,i)=>v.add(g.positions[i]),new THREE.Vector3()).divideScalar(ids.length),F=center.sub(W);F.z=0;F.normalize();const A=F.clone().cross(new THREE.Vector3(0,0,1)).normalize(),ts=ids.map(i=>g.positions[i].clone().sub(W).dot(F)).sort((a,b)=>a-b);frames.push({wrist:W.toArray(),forward:F.toArray(),across:A.toArray(),scale:ts[Math.floor(ts.length*.98)]/.165});ids.forEach(i=>mask[i]=1);}return{frames,mask:Array.from(mask)};}
function boundaryLoops(p,g){
 const I=p.getIndices().getArray(),keys=new Map(),weld=[],rep=[];g.positions.forEach((v,i)=>{const k=v.toArray().map(x=>Math.round(x/1e-5)).join(',');if(!keys.has(k)){keys.set(k,keys.size);rep.push(i);}weld.push(keys.get(k));});
 const edges=new Map();for(let k=0;k<I.length;k+=3)for(let e=0;e<3;e++){const a=weld[I[k+e]],b=weld[I[k+(e+1)%3]],key=[a,b].sort((a,b)=>a-b).join(':');if(edges.has(key))edges.get(key).count++;else edges.set(key,{a,b,count:1});}
 const adj=new Map();for(const e of edges.values())if(e.count===1){if(!adj.has(e.a))adj.set(e.a,[]);if(!adj.has(e.b))adj.set(e.b,[]);adj.get(e.a).push(e.b);adj.get(e.b).push(e.a);}
 const visited=new Set(),loops=[];for(const start of adj.keys()){if(visited.has(start))continue;let at=start,prev=-1;const loop=[];for(let k=0;k<2000;k++){loop.push(rep[at]);visited.add(at);const next=adj.get(at)?.find(v=>v!==prev);if(next===undefined||next===start)break;if(visited.has(next))break;prev=at;at=next;}if(loop.length>=6)loops.push(loop);}
 return loops;
}
function accessor(d,array,type){return d.createAccessor().setType(type).setArray(array).setBuffer(d.getRoot().listBuffers()[0]);}
function garmentThickness(d,node,p,g,loops,pid){
 const top=Math.max(...g.positions.map(v=>v.y)),positions=[],normals=[],texcoords=[],joints=[],weights=[],morphs=p.listTargets().map(()=>[]),indices=[];
 const adj=Array.from({length:g.positions.length},()=>new Set()),I=p.getIndices().getArray();for(let k=0;k<I.length;k+=3)for(let j=0;j<3;j++){adj[I[k+j]].add(I[k+(j+1)%3]);adj[I[k+j]].add(I[k+(j+2)%3]);}
 const chosen=[];
 for(const originalLoop of loops){const mean=originalLoop.reduce((v,i)=>v.add(g.positions[i]),new THREE.Vector3()).divideScalar(originalLoop.length),collar=mean.y>top-.10,cuff=Math.abs(mean.x)>.135;if(!collar&&!cuff)continue;
  const loop=originalLoop.filter((_,i)=>i%Math.max(1,Math.floor(originalLoop.length/32))===0),own=new Set(originalLoop),base=positions.length/3,width=collar?.008:.010,thick=collar?.0015:.0018;
  for(const id of loop){const P=g.positions[id],N=g.normals[id],inward=new THREE.Vector3(),sourceUV=p.getAttribute('TEXCOORD_0'),atUV=sourceUV.getElement(id,[]),uvIn=[0,0];let count=0;for(const j of adj[id])if(!own.has(j)&&g.positions[j].distanceToSquared(P)>1e-8){inward.add(g.positions[j].clone().sub(P));const uv=sourceUV.getElement(j,[]);uvIn[0]+=uv[0]-atUV[0];uvIn[1]+=uv[1]-atUV[1];count++;}if(count){inward.divideScalar(count);uvIn[0]/=count;uvIn[1]/=count;}const uvLength=Math.max(.001,inward.length());inward.addScaledVector(N,-inward.dot(N)).normalize();if(inward.lengthSq()<.2)inward.set(0,-1,0);const inv=g.transforms[id].clone().invert(),normalToLocal=new THREE.Matrix3().setFromMatrix4(g.transforms[id]).transpose();
   for(const [along,out]of [[0,thick],[width,thick*.65],[0,-thick*.45]]){const q=P.clone().addScaledVector(inward,along).addScaledVector(N,out);positions.push(...q.applyMatrix4(inv).toArray());texcoords.push(atUV[0]+uvIn[0]*along/uvLength,atUV[1]+uvIn[1]*along/uvLength);normals.push(...N.clone().multiplyScalar(out<0?-1:1).applyMatrix3(normalToLocal).normalize().toArray());joints.push(...p.getAttribute('JOINTS_0').getElement(id,[]));weights.push(...p.getAttribute('WEIGHTS_0').getElement(id,[]));p.listTargets().forEach((t,j)=>morphs[j].push(...t.getAttribute('POSITION').getElement(id,[])));}
  }
  for(let i=0;i<loop.length;i++){const a=base+i*3,b=base+((i+1)%loop.length)*3;for(let j=0;j<3;j++){const k=(j+1)%3;indices.push(a+j,b+j,a+k,b+j,b+k,a+k);}}
  chosen.push({type:collar?'collar':'cuff',segments:loop.length,center:mean.toArray(),thicknessMetres:thick});
 }
 if(!positions.length)return chosen;
 const pr=d.createPrimitive().setAttribute('POSITION',accessor(d,new Float32Array(positions),'VEC3')).setAttribute('NORMAL',accessor(d,new Float32Array(normals),'VEC3')).setAttribute('TEXCOORD_0',accessor(d,new Float32Array(texcoords),'VEC2')).setAttribute('JOINTS_0',accessor(d,new Uint16Array(joints),'VEC4')).setAttribute('WEIGHTS_0',accessor(d,new Float32Array(weights),'VEC4')).setIndices(accessor(d,new Uint16Array(indices),'SCALAR'));
 const color=pid==='patient04'?0x17312c:pid==='patient03'?0xf4efe4:pid==='patient02'?0x243c34:0xe5dfd3,mat=d.createMaterial(pid+'.constructionHem').setBaseColorFactor([...new THREE.Color(color).convertSRGBToLinear().toArray(),1]).setRoughnessFactor(.90).setMetallicFactor(0).setNormalTexture(p.getMaterial().getNormalTexture()).setNormalScale(.70).setOcclusionTexture(p.getMaterial().getOcclusionTexture()).setOcclusionStrength(.65).setMetallicRoughnessTexture(p.getMaterial().getMetallicRoughnessTexture()).setExtras({characterDetail:true,detailKind:'shirt'});pr.setMaterial(mat);morphs.forEach(a=>pr.addTarget(d.createPrimitiveTarget().setAttribute('POSITION',accessor(d,new Float32Array(a),'VEC3'))));const mesh=d.createMesh(pid+'.constructionHem').addPrimitive(pr).setExtras(node.getMesh().getExtras()),n=d.createNode(pid+'.constructionHem').setMesh(mesh).setSkin(node.getSkin()).setWeights(node.getWeights());for(const parent of node.listParents())if(parent.propertyType==='Node'||parent.propertyType==='Scene'){parent.addChild(n);break;}return chosen;
}
const report=[];
for(const file of files){
 const source=path.join(work,'source',file);fs.mkdirSync(path.dirname(source),{recursive:true});if(!fs.existsSync(source))fs.copyFileSync(file,source);const d=await io.read(source),pid=path.basename(path.dirname(file)),face=!file.endsWith('/body.glb'),before={bytes:fs.statSync(source).size,triangles:triangleCount(d)},maps=[],construction=[];
 // Do not run dequantize/quantize: existing skin, neck, skeleton and morph
 // accessors stay byte-identical. Meshopt re-encodes their existing typed arrays.
 const originalBuffers=rawBuffers(d);
 if(process.env.VERIFY_ONLY){const output=await io.read(file),changed=compareBuffers(originalBuffers,rawBuffers(output)),rig=rigBuffers(d),item={file,originalAttributeBuffersChecked:Object.keys(originalBuffers).length,changedOriginalAttributeBuffers:changed,originalRigEntriesChecked:Object.keys(rig).length,changedOriginalRigEntries:compareBuffers(rig,rigBuffers(output))};if(!face)exportContact(output,pid);report.push(item);console.log(item);continue;}
 // This source hair normal was 2048px while its alpha/color atlas is 512px.
 // Match that useful card resolution; leave material factors and hair geometry
 // untouched. The authored face and garment normals keep their own resolution.
 if(pid==='patient01'&&face&&!process.env.INSPECT_ONLY){const resized=new Set();for(const m of d.getRoot().listMaterials()){const t=m.getNormalTexture();if(!m.getName().includes('short02')||!t||resized.has(t))continue;resized.add(t);const stem=path.join(work,pid+'-hair-normal');fs.writeFileSync(stem+'.input',t.getImage());const run=spawnSync(process.env.ASSET_PYTHON||'python3',['-c',"from PIL import Image;import sys;Image.open(sys.argv[1]).convert('RGB').resize((512,512),Image.Resampling.LANCZOS).save(sys.argv[2],'WEBP',quality=90,method=6)",stem+'.input',stem+'.webp'],{encoding:'utf8'});if(run.status)throw Error(run.stderr);t.setImage(fs.readFileSync(stem+'.webp')).setMimeType('image/webp');maps.push({kind:'hair',normalSize:512});}}
 const jobs=d.getRoot().listNodes().flatMap(n=>(n.getMesh()?.listPrimitives()||[]).map(p=>({n,p})));
 const skinJob=jobs.find(({p})=>p.getMaterial()?.getName().endsWith('.skin')),hd=skinJob?handData(skinJob.n,skinJob.p):{frames:[],mask:[]},landmarks={};
 if(face){const eye=jobs.find(({n})=>/high.poly/.test(n.getName()));if(eye){const ep=geometry(eye.n,eye.p).positions;landmarks.eyeY=(Math.max(...ep.map(v=>v.y))+Math.min(...ep.map(v=>v.y)))/2;landmarks.eyeHalfWidth=.031;}const skin=jobs.find(({p})=>p.getMaterial()?.getName().endsWith('.body'));if(skin){const fp=geometry(skin.n,skin.p).positions,nose=fp.filter(v=>Math.abs(v.x)<.018&&v.y<(landmarks.eyeY||1.5)-.005&&v.y>(landmarks.eyeY||1.5)-.09).sort((a,b)=>b.z-a.z)[0];if(nose)landmarks.noseY=nose.y;landmarks.mouthY=(landmarks.eyeY||1.5)-.085;landmarks.chinY=(landmarks.eyeY||1.5)-.125;}}

 for(const {n,p}of jobs){const m=p.getMaterial(),name=m?.getName()||'',kind=name.endsWith('.skin')?'skin':face&&name.endsWith('.body')?'face':name.endsWith('.shirt')?'shirt':name.endsWith('.pants')?'pants':null;if(!kind||!m.getBaseColorTexture()||!p.getAttribute('TEXCOORD_0'))continue;const g=geometry(n,p),loops=kind==='shirt'?boundaryLoops(p,g):[],stem=path.join(work,pid+'-'+kind),uv=Array.from({length:p.getAttribute('TEXCOORD_0').getCount()},(_,i)=>p.getAttribute('TEXCOORD_0').getElement(i,[])).flat();
  if(process.env.INSPECT_ONLY){console.log(file,kind,loops.map(ids=>({count:ids.length,mean:ids.reduce((v,i)=>v.add(g.positions[i]),new THREE.Vector3()).divideScalar(ids.length).toArray()})));continue;}
  fs.writeFileSync(stem+'.input',m.getBaseColorTexture().getImage());fs.writeFileSync(stem+'.json',JSON.stringify({pid,kind,positions:g.positions.map(v=>v.toArray()),normals:g.normals.map(v=>v.toArray()),uv,indices:Array.from(p.getIndices().getArray()),boundaries:loops,handFrames:hd.frames,handMask:kind==='skin'?hd.mask:[],landmarks}));const run=spawnSync(process.env.ASSET_PYTHON||'python3',['scripts/assets/patient_detail_maps.py',stem],{encoding:'utf8'});if(run.status)throw Error(run.stderr);if(run.stdout.trim())console.log(run.stdout.trim());
  const texture=suffix=>d.createTexture(pid+'.'+kind+'.detail'+suffix).setImage(fs.readFileSync(stem+suffix+'.webp')).setMimeType('image/webp');m.setBaseColorTexture(texture('-color')).setNormalTexture(texture('-normal')).setNormalScale(kind==='face'?.60:kind==='skin'?.48:.85).setOcclusionTexture(texture('-orm')).setOcclusionStrength(.72).setMetallicRoughnessTexture(m.getOcclusionTexture()).setRoughnessFactor(kind==='face'?.75:kind==='skin'?.84:.94).setMetallicFactor(0).setExtras({...m.getExtras(),characterDetail:true,detailKind:kind});maps.push({kind,colorSize:kind==='face'?1024:512,normalSize:kind==='pants'||(kind==='face'&&['patient01','patient03','patient04'].includes(pid))?512:1024,ormSize:512});if(kind==='shirt')construction.push(...garmentThickness(d,n,p,g,loops,pid));
 }
 if(process.env.INSPECT_ONLY)continue;await d.transform(prune());await io.write(file,d);const after={bytes:fs.statSync(file).size,triangles:triangleCount(d)};report.push({file,before,after,maps,construction});console.log(file,before,after,construction);
}
if(!process.env.INSPECT_ONLY)fs.writeFileSync(path.join(work,process.env.VERIFY_ONLY?'patient-detail-invariants.json':'patient-detail-metrics.json'),JSON.stringify(report,null,2));
if(process.env.VERIFY_ONLY&&report.some(r=>r.changedOriginalAttributeBuffers.length||r.changedOriginalRigEntries.length))process.exitCode=1;

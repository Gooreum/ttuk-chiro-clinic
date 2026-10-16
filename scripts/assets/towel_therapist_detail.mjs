/** Towel-only garment tailoring and UV surface bakes. Uses the existing glTF toolchain.
 * GLTF_MODULES=/existing/node_modules node scripts/assets/towel_therapist_detail.mjs <workdir>
 * First run preserves inputs in workdir/source. Repeated runs start from those inputs.
 */
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import * as T from 'three';
const require=createRequire(path.resolve(process.env.GLTF_MODULES,'@gltf-transform/core/package.json'));
const {NodeIO}=require('@gltf-transform/core'),{ALL_EXTENSIONS}=require('@gltf-transform/extensions'),{dequantize,meshopt,prune}=require('@gltf-transform/functions'),{MeshoptDecoder,MeshoptEncoder}=require('meshoptimizer');
await Promise.all([MeshoptDecoder.ready,MeshoptEncoder.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder,'meshopt.encoder':MeshoptEncoder});
const work=process.argv[2]||'/private/tmp/ttuk-therapist-detail';fs.mkdirSync(work,{recursive:true});
const files=['public/models/towel-stage/hands/arms.glb','public/models/towel-stage/therapist/therapist.glb','public/models/towel-stage/room.glb','public/models/towel-stage/towel/towel_sim.glb'];
const vec=a=>new T.Vector3().fromArray(a),mat=a=>new T.Matrix4().fromArray(a),smooth=(a,b,x)=>{const t=T.MathUtils.clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
function geometry(node,p){
 const P=p.getAttribute('POSITION'),sk=node.getSkin(),positions=[],transforms=[];
 const js=sk?.listJoints(),ib=sk?.getInverseBindMatrices(),ms=js?.map((n,i)=>mat(n.getWorldMatrix()).multiply(mat(ib.getElement(i,[]))));
 for(let i=0;i<P.getCount();i++){
  let m=mat(node.getWorldMatrix());
  if(sk){m=new T.Matrix4();m.elements.fill(0);const ids=p.getAttribute('JOINTS_0').getElement(i,[]),ws=p.getAttribute('WEIGHTS_0').getElement(i,[]);for(let j=0;j<4;j++)if(ws[j])for(let k=0;k<16;k++)m.elements[k]+=ws[j]*ms[ids[j]].elements[k];}
  transforms.push(m);positions.push(vec(P.getElement(i,[])).applyMatrix4(m));
 }return{positions,transforms};
}
function acc(d,a,type){return d.createAccessor().setType(type).setArray(a).setBuffer(d.getRoot().listBuffers()[0]);}
function tailor(d,side){
 const ns=d.getRoot().listNodes(),bone=n=>ns.find(x=>x.getName()===n+'_'+side),at=n=>new T.Vector3().setFromMatrixPosition(mat(bone(n).getWorldMatrix())),S=at('upperarm'),E=at('lowerarm'),W=at('hand'),A=E.clone().sub(S).normalize(),B=W.clone().sub(E).normalize(),L=S.distanceTo(E),M=E.distanceTo(W),length=L+M*.52;
 const node=ns.find(n=>n.getName()==='arm_sleeve_'+side),skinNode=ns.find(n=>n.getName()==='arm_skin_'+side),source=node.getMesh().listPrimitives(),sk=node.getSkin(),js=sk.listJoints(),ib=sk.getInverseBindMatrices(),ui=js.indexOf(bone('upperarm')),li=js.indexOf(bone('lowerarm')),ms=js.map((n,i)=>mat(n.getWorldMatrix()).multiply(mat(ib.getElement(i,[]))));
 const skin=geometry(skinNode,skinNode.getMesh().listPrimitives()[0]).positions;
 const rings=[];for(let i=0;i<=20;i++)rings.push(L*.1+(length-L*.1)*i/20);
 // A rolled two-layer cuff: the lip stands off the arm, with a visible inside return.
 rings.push(length+.0025,length+.004,length-.005,length-.012);
 const P=[],N=[],UV=[],SI=[],SW=[],faces=[],hem=[],sides=28;
 for(let r=0;r<rings.length;r++){
  const t=rings[r],f=Math.min(1,t/L),center=t<L?S.clone().lerp(E,f):E.clone().addScaledVector(B,t-L),axis=A.clone().lerp(B,smooth(L-.025,L+.025,t)).normalize(),u=new T.Vector3(0,0,1).addScaledVector(axis,-axis.z).normalize(),v=axis.clone().cross(u).normalize();
  const candidates=skin.filter(p=>Math.abs(p.clone().sub(center).dot(axis))<.012).map(p=>p.clone().sub(center).addScaledVector(axis,-p.clone().sub(center).dot(axis)).length()).filter(x=>x>.012&&x<.09).sort((a,b)=>a-b);
  const skinR=candidates.length?candidates[Math.floor(candidates.length*.85)]:.037;
  const inner=r>=23,rolled=r>=20;let radius=skinR+(inner?.006:rolled?.012:.010);
  // Weight transition spans the anatomical hinge; the cloth shares the arm rig.
  const low=smooth(L-.045,L+.045,t),ws=[1-low,low,0,0],ids=[ui,li,0,0],blend=new T.Matrix4();blend.elements.fill(0);for(let j=0;j<2;j++)for(let k=0;k<16;k++)blend.elements[k]+=ws[j]*ms[ids[j]].elements[k];
  for(let k=0;k<=sides;k++){
   const angle=k/sides*Math.PI*2,fold=.0020*Math.sin(t*107+angle*2.2)*Math.exp(-(((t-L)/.055)**2))+.0007*Math.sin(t*69-angle*3),normal=u.clone().multiplyScalar(Math.cos(angle)).addScaledVector(v,Math.sin(angle));
   const world=center.clone().addScaledVector(normal,radius+fold),local=world.applyMatrix4(blend.clone().invert());P.push(...local.toArray());N.push(...normal.applyMatrix3(new T.Matrix3().setFromMatrix4(blend).transpose()).normalize().toArray());UV.push(k/sides,rolled?(r-20)/4:t/length);SI.push(...ids);SW.push(...ws);
   if(r&&k<sides){const a=(r-1)*(sides+1)+k,b=a+1,c=r*(sides+1)+k,e=c+1;(r>=20?hem:faces).push(a,b,c,b,e,c);}
  }
 }
 const common={POSITION:acc(d,new Float32Array(P),'VEC3'),NORMAL:acc(d,new Float32Array(N),'VEC3'),TEXCOORD_0:acc(d,new Float32Array(UV),'VEC2'),JOINTS_0:acc(d,new Uint16Array(SI),'VEC4'),WEIGHTS_0:acc(d,new Float32Array(SW),'VEC4')};
 for(const p of source)node.getMesh().removePrimitive(p);
 for(const [I,src]of [[faces,source[0]],[hem,source[1]]]){const pr=d.createPrimitive().setIndices(acc(d,new Uint16Array(I),'SCALAR')).setMaterial(src.getMaterial());for(const[n,a]of Object.entries(common))pr.setAttribute(n,a);node.getMesh().addPrimitive(pr);}
}
const report=[];
for(const file of files){
 const src=path.join(work,'source',file);fs.mkdirSync(path.dirname(src),{recursive:true});if(!fs.existsSync(src))fs.copyFileSync(file,src);
 const d=await io.read(src);await d.transform(dequantize());const markers=d.getRoot().listNodes().filter(n=>n.getName().startsWith('mark_')).map(n=>[n.getName(),n.getWorldMatrix()]);const count=()=>d.getRoot().listMeshes().reduce((s,m)=>s+m.listPrimitives().reduce((n,p)=>n+(p.getIndices()?.getCount()||p.getAttribute('POSITION').getCount())/3,0),0),before={bytes:fs.statSync(src).size,triangles:count()};
 if(file.endsWith('/hands/arms.glb'))for(const s of ['l','r'])tailor(d,s);
 const treated=new Set();
 for(const node of d.getRoot().listNodes())for(const p of node.getMesh()?.listPrimitives()||[]){
  const m=p.getMaterial(),name=m?.getName()||'';let kind=/\.(shirt|sleeve|hem)$/.test(name)?name.split('.').pop():name.endsWith('.skin')?'skin':name==='suite.leather'?'leather':name==='towel.cloth'?'towel':null;
  if(!kind||treated.has(m))continue;treated.add(m);
  const {positions}=geometry(node,p);let UV=p.getAttribute('TEXCOORD_0');
  if(!UV&&kind==='leather'){
   const normals=p.getAttribute('NORMAL'),worldN=new T.Matrix3().getNormalMatrix(mat(node.getWorldMatrix()));
   const a=positions.flatMap((v,i)=>{const n=vec(normals.getElement(i,[])).applyMatrix3(worldN);return Math.abs(n.y)>Math.max(Math.abs(n.x),Math.abs(n.z))?[v.x*2+.5,v.z*2]:Math.abs(n.x)>Math.abs(n.z)?[v.z*2,v.y*2]:[v.x*2+.5,v.y*2];});UV=acc(d,new Float32Array(a),'VEC2');p.setAttribute('TEXCOORD_0',UV);
  }
  if(!UV)continue;
  const stem=path.join(work,name.replaceAll('.','-')),base=m.getBaseColorTexture();
  if(base&&kind!=='sleeve'&&kind!=='hem')fs.writeFileSync(stem+'.image',base.getImage());else{
   const color=kind==='leather'?[23,49,44]:[27,60,53];const py=spawnSync(process.env.ASSET_PYTHON||'python3',['-c',`from PIL import Image;Image.new('RGB',(1024,1024),tuple(${JSON.stringify(color)})).save(${JSON.stringify(stem+'.image')},'PNG')`],{encoding:'utf8'});if(py.status)throw Error(py.stderr);m.setBaseColorFactor([1,1,1,1]);
  }
  const face=kind==='skin'&&file.includes('therapist/'),eye=new T.Vector3(0,1.392193,-.145397),up=new T.Vector3(0,.82,.57),forward=new T.Vector3(0,-.57,.82),world=face?positions.map(p=>{const q=p.clone().sub(eye);return[p.x,q.dot(up),q.dot(forward)+.1];}):positions.map(p=>p.toArray());
  const hands=kind==='skin'&&!face?['l','r'].map(side=>{const at=name=>new T.Vector3().setFromMatrixPosition(mat(d.getRoot().listNodes().find(n=>n.getName()===name+'_'+side).getWorldMatrix())),w=at('hand'),D=at('middle_01').sub(w).normalize(),A=at('index_01').sub(at('pinky_01')).normalize(),B=A.clone().cross(D).normalize();if(at('thumb_03').sub(w).dot(B)>0)B.negate();return{wrist:w.toArray(),forward:D.toArray(),across:A.toArray(),back:B.toArray(),joints:['index','middle','ring','pinky'].map(f=>['01','02','03'].map(j=>at(f+'_'+j).toArray()))};}):[];
  const knuckles=kind==='skin'&&!face?d.getRoot().listNodes().filter(n=>/^(index|middle|ring|pinky)_0[123]_/.test(n.getName())).map(n=>n.getWorldMatrix().slice(12,15)):[];
  const I=Array.from(p.getIndices()?.getArray()||Array.from({length:positions.length},(_,i)=>i));fs.writeFileSync(stem+'.json',JSON.stringify({kind,face,positions:world,uv:Array.from({length:UV.getCount()},(_,i)=>UV.getElement(i,[])),indices:I,knuckles,hands}));
  const py=spawnSync(process.env.ASSET_PYTHON||'python3',['scripts/assets/towel_surface_detail.py',stem],{encoding:'utf8'});if(py.status)throw Error(py.stderr);
  const texture=(suffix,label)=>d.createTexture(name+label).setImage(fs.readFileSync(stem+suffix+'.webp')).setMimeType('image/webp');
  // The terry photo and its measured tangent normal are already richer than procedural noise; retain both.
  if(kind!=='towel'){m.setBaseColorTexture(texture('',' color'));m.setNormalTexture(texture('-normal',' relief')).setNormalScale(kind==='skin'?.42:kind==='sleeve'?.90:.75);}
  const orm=texture('-orm',' AO roughness');m.setOcclusionTexture(orm).setOcclusionStrength(.7).setMetallicRoughnessTexture(orm).setRoughnessFactor(1).setMetallicFactor(0);
 }
 await d.transform(prune({keepLeaves:true}),meshopt({encoder:MeshoptEncoder,level:'medium'}));for(const [name,world]of markers){const n=d.getRoot().listNodes().find(n=>n.getName()===name);if(!n||n.getWorldMatrix().some((v,i)=>Math.abs(v-world[i])>1e-7))throw Error('Therapist marker changed: '+name);}
 await io.write(file,d);report.push({file,before,after:{bytes:fs.statSync(file).size,triangles:count()}});console.log(report.at(-1));
}
fs.writeFileSync(path.join(work,'therapist-detail-metrics.json'),JSON.stringify(report,null,2));

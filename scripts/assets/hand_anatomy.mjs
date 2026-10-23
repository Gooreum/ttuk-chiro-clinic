/** Local anatomical sculpt for the existing CC0 MPFB hands. No new source assets.
 * GLTF_MODULES=/cached/node_modules node scripts/assets/hand_anatomy.mjs <workdir>
 * First execution saves source GLBs in workdir/source; subsequent runs start there.
 * All edits are in skinned rest-world metres; inverse blended bind matrices put
 * positions back into the original quantized mesh space. Neck/morph data is not sculpted.
 */
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import * as THREE from 'three';
const require=createRequire(path.resolve(process.env.GLTF_MODULES||'','@gltf-transform/core/package.json'));
const {NodeIO}=require('@gltf-transform/core');
const {ALL_EXTENSIONS}=require('@gltf-transform/extensions');
const {dequantize,meshopt,prune}=require('@gltf-transform/functions');
const {MeshoptDecoder,MeshoptEncoder}=require('meshoptimizer');
await Promise.all([MeshoptDecoder.ready,MeshoptEncoder.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder,'meshopt.encoder':MeshoptEncoder});
const work=process.argv[2]||'/private/tmp/ttuk-hand-anatomy';fs.mkdirSync(work,{recursive:true});
// ASSET_IDS=06,07 (or patient06,...) sculpts only those towel patient bodies and leaves both arms GLBs alone;
// HAND_TEMPLATE (optional) is the unsculpted clinic arms GLB used for the landmark transfer.
const assetIds=process.env.ASSET_IDS?.split(',').map(n=>n.replace(/^patient/,'').padStart(2,'0'));
const files=assetIds?assetIds.map(n=>`public/models/towel-stage/patient${n}/body.glb`):['public/models/hands/arms.glb','public/models/towel-stage/hands/arms.glb',...['01','02','03','04','05'].map(n=>`public/models/towel-stage/patient${n}/body.glb`)];
const vec=a=>new THREE.Vector3().fromArray(a),gauss=(x,w)=>Math.exp(-((x/w)**2)),smooth=(a,b,x)=>{const t=THREE.MathUtils.clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
function acc(d,a,type){return d.createAccessor().setType(type).setArray(a).setBuffer(d.getRoot().listBuffers()[0]);}
function triangles(d){return d.getRoot().listMeshes().reduce((n,m)=>n+m.listPrimitives().reduce((s,p)=>s+p.getIndices().getCount()/3,0),0);}
function geometry(node,p){
 const sk=node.getSkin(),ib=sk.getInverseBindMatrices(),js=sk.listJoints(),SI=p.getAttribute('JOINTS_0'),SW=p.getAttribute('WEIGHTS_0'),P=p.getAttribute('POSITION');
 const mats=js.map((n,i)=>new THREE.Matrix4().fromArray(n.getWorldMatrix()).multiply(new THREE.Matrix4().fromArray(ib.getElement(i,[]))));
 const transforms=[],positions=[];
 for(let i=0;i<P.getCount();i++){
  const ids=SI.getElement(i,[]),ws=SW.getElement(i,[]),m=new THREE.Matrix4();m.elements.fill(0);
  for(let j=0;j<4;j++)if(ws[j])for(let k=0;k<16;k++)m.elements[k]+=ws[j]*mats[ids[j]].elements[k];
  transforms.push(m);positions.push(vec(P.getElement(i,[])).applyMatrix4(m));
 }
 return{positions,transforms};
}
function components(p){const count=p.getAttribute('POSITION').getCount(),parent=Array.from({length:count},(_,i)=>i);const root=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};const I=p.getIndices().getArray();for(let k=0;k<I.length;k+=3){parent[root(I[k+1])]=root(I[k]);parent[root(I[k+2])]=root(I[k]);}const out=new Map();for(let i=0;i<count;i++){let r=root(i);if(!out.has(r))out.set(r,[]);out.get(r).push(i);}return [...out.values()];}
function recomputeNormals(p,wp,changed,transforms){
 const normals=wp.map(()=>new THREE.Vector3()),I=p.getIndices().getArray();
 for(let k=0;k<I.length;k+=3){const ids=[I[k],I[k+1],I[k+2]],pts=ids.map(i=>wp[i]);const face=pts[1].clone().sub(pts[0]).cross(pts[2].clone().sub(pts[0])).normalize();for(let c=0;c<3;c++){const a=pts[(c+1)%3].clone().sub(pts[c]).normalize(),b=pts[(c+2)%3].clone().sub(pts[c]).normalize();normals[ids[c]].addScaledVector(face,Math.acos(THREE.MathUtils.clamp(a.dot(b),-1,1)));}}
 // Smooth across UV splits by location, not UV index. Never average distinct
 // nearby surfaces: the 0.04 mm key only joins true duplicate skin vertices.
 const groups=new Map();wp.forEach((v,i)=>{const key=v.toArray().map(x=>Math.round(x/0.00004)).join(',');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(i);});
 const N=p.getAttribute('NORMAL');for(const ids of groups.values()){if(!ids.some(i=>changed[i]))continue;const sum=new THREE.Vector3();for(const i of ids)sum.add(normals[i]);sum.normalize();for(const i of ids){const n=sum.clone().applyMatrix3(new THREE.Matrix3().setFromMatrix4(transforms[i]).transpose()).normalize();N.setElement(i,n.toArray());}}
}
function therapist(d,node,p,wp){
 const side=node.getName().endsWith('_l')?'l':'r',nodes=d.getRoot().listNodes(),bone=n=>nodes.find(b=>b.getName()===n+'_'+side),point=n=>new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(bone(n).getWorldMatrix()));
 const elbow=point('lowerarm'),wrist=point('hand'),D=point('middle_01').sub(wrist).normalize(),across=point('index_01').sub(point('pinky_01')).normalize();across.addScaledVector(D,-across.dot(D)).normalize();
 // back points away from the palm (same construction as runtime arm.back).
 const palm=across.clone().cross(D).normalize();if(point('thumb_03').sub(wrist).dot(palm)<0)palm.negate();
 const back=palm.clone().negate(),fore=wrist.clone().sub(elbow).normalize(),length=wrist.distanceTo(elbow),changed=wp.map(()=>false);
 for(let i=0;i<wp.length;i++){
  const v=wp[i],r=v.clone().sub(wrist),t=r.dot(D),u=r.dot(across),z=r.dot(back),f=v.clone().sub(elbow).dot(fore)/length;
  if(t<.018&&f>.04&&f<1.08){
   const center=elbow.clone().addScaledVector(fore,f*length),rad=v.clone().sub(center),n=back.clone().addScaledVector(fore,-back.dot(fore)).normalize(),a=fore.clone().cross(n).normalize();
   // Radius/ulna section: substantial proximal muscle belly, flatter distal wrist.
   const belly=.16*gauss(f-.30,.25),distal=smooth(.48,.94,f),end=1-smooth(1.0,1.08,f),gate=smooth(.04,.13,f)*end;
   const sx=1+gate*(belly-.06*distal),sz=1+gate*(belly*.65-.18*distal);
   const dx=rad.dot(a),dz=rad.dot(n);v.addScaledVector(a,dx*(sx-1)).addScaledVector(n,dz*(sz-1));
   // Small radial/ulnar styloid landmarks; no ring-shaped swelling.
   v.addScaledVector(a,Math.sign(dx)*.0014*gauss(f-.95,.055)*gauss(Math.abs(dx)-.022,.012));changed[i]=true;
  }
  if(t>-.013&&t<.105){
   const dorsal=smooth(.05,.75,vec(p.getAttribute('NORMAL').getElement(i,[])).dot(back)),fade=1-smooth(.085,.105,t);
   // Dorsal carpal plane and four metacarpal heads (1.3-2.1 mm), palm unchanged.
   let raise=0;for(const name of ['index','middle','ring','pinky']){const q=point(name+'_01').sub(wrist),kt=q.dot(D),ku=q.dot(across),line=ku*THREE.MathUtils.clamp(t/kt,0,1);raise+=.0021*gauss(t-kt,.011)*gauss(u-ku,.010)+.00075*gauss(u-line,.0035)*gauss(t-kt*.5,.027);}
   v.addScaledVector(back,(raise*dorsal-.00045*gauss(t+.001,.004)*dorsal)*fade);
   // Smooth transition from the flattened wrist into the back of the hand.
   if(t<.025)v.addScaledVector(back,-z*.07*gauss(t+.008,.032)*(1-dorsal*.15));
   changed[i]=true;
  }
  // Anatomical finger joints, preserving finger contact planes and bone anchors.
  for(const name of ['index','middle','ring','pinky'])for(const j of ['02','03']){const q=point(name+'_'+j),dist=v.distanceTo(q);if(dist<.012){const lift=.0014*gauss(dist,.010)*smooth(.05,.75,vec(p.getAttribute('NORMAL').getElement(i,[])).dot(back));v.addScaledVector(back,lift);changed[i]=true;}}
 }
 return changed;
}
function patient(p,wp,template){
 const comps=components(p),hands=comps.filter(ids=>ids.length>1200&&ids.length<2300&&ids.reduce((s,i)=>s+wp[i].y,0)/ids.length>.65),changed=wp.map(()=>false);
 // Hands are separate UV islands. Find their actual shared wrist-ring positions,
 // then use a local frame independent of body size, sex, and left/right stacking.
 const lookup=new Map();wp.forEach((v,i)=>{const k=v.toArray().map(x=>Math.round(x/0.0001)).join(',');if(!lookup.has(k))lookup.set(k,[]);lookup.get(k).push(i);});
 for(const ids of hands){const own=new Set(ids),ring=ids.filter(i=>{const k=wp[i].toArray().map(x=>Math.round(x/.0001)).join(',');return lookup.get(k).some(j=>!own.has(j));});if(ring.length<8)throw Error('Patient hand wrist ring not found');
  const wrist=new THREE.Vector3();ring.forEach(i=>wrist.add(wp[i]));wrist.divideScalar(ring.length);
  const mean=new THREE.Vector3();ids.forEach(i=>mean.add(wp[i]));mean.divideScalar(ids.length);const D=mean.sub(wrist);D.z=0;D.normalize();const B=new THREE.Vector3(0,0,1),A=D.clone().cross(B).normalize();
  const armComp=comps.find(group=>group.length>250&&group.length<900&&group.some(j=>ring.some(i=>wp[i].distanceTo(wp[j])<.0001)));
  if(armComp){const sign=Math.sign(wrist.x),outer=Math.max(...armComp.filter(i=>wp[i].y<wrist.y+.09).map(i=>wp[i].x*sign)),edge=armComp.filter(i=>wp[i].x*sign>outer-.028&&wp[i].y<wrist.y+.09),elbow=new THREE.Vector3();edge.forEach(i=>elbow.add(wp[i]));elbow.divideScalar(edge.length);const F=wrist.clone().sub(elbow).normalize(),L=wrist.distanceTo(elbow),N=B.clone().addScaledVector(F,-B.dot(F)).normalize(),X=F.clone().cross(N).normalize();
   for(const i of armComp){const r=wp[i].clone().sub(elbow),f=r.dot(F)/L,rad=r.clone().addScaledVector(F,-r.dot(F));if(f>.03&&f<.94&&rad.length()<.075){const gate=smooth(.03,.16,f)*(1-smooth(.74,.94,f)),belly=.13*gauss(f-.27,.25),distal=.08*smooth(.42,.87,f);wp[i].addScaledVector(X,rad.dot(X)*gate*(belly-distal)).addScaledVector(N,rad.dot(N)*gate*(belly*.65-distal*1.5));changed[i]=true;}}
  }
  const landmarks=transferredLandmarks(template,p,wp,ids);
  const locals=ids.map(i=>{const r=wp[i].clone().sub(wrist);return [r.dot(D),r.dot(A),r.dot(B)];});const sorted=locals.map(a=>a[0]).sort((a,b)=>a-b),len=sorted[Math.floor(sorted.length*.98)],scale=len/.165;
  // Keep volume around a flatter carpal oval and define the dorsal bones.
  for(let c=0;c<ids.length;c++){const i=ids[c],v=wp[i],[t,u,z]=locals[c],dorsal=smooth(.03,.75,vec(p.getAttribute('NORMAL').getElement(i,[])).dot(B)),palmFade=1-smooth(.087*scale,.105*scale,t);let raise=0;
   for(const [ku,kt,amp] of [[-.025,.076,.0018],[-.008,.080,.0022],[.010,.075,.0020],[.027,.064,.0016]]){
    const line=ku*THREE.MathUtils.clamp(t/(kt*scale),0,1);
    raise+=amp*scale*gauss(t-kt*scale,.011*scale)*gauss(u-ku*scale,.010*scale)+.0008*scale*gauss(u-line*scale,.0035*scale)*gauss(t-kt*scale*.5,.028*scale);
   }
   // Knuckles sit over heads of metacarpals; the wrist crease is shallow.
   v.addScaledVector(B,raise*dorsal*palmFade*smooth(.007*scale,.020*scale,t)-.00035*scale*gauss(t-.012*scale,.0035*scale)*dorsal*smooth(.004*scale,.008*scale,t));
   const wristGate=gauss(t,.021*scale);v.addScaledVector(B,-z*.16*wristGate).addScaledVector(A,u*.035*wristGate);changed[i]=true;
   // Actual metacarpal and finger-joint positions transferred through the shared
   // CC0 hand topology, rather than painted rows across the whole hand.
   for(const {point,amplitude,radius} of landmarks){const dist=v.distanceTo(point);if(dist<radius*2.5)v.addScaledVector(B,amplitude*gauss(dist,radius)*dorsal);}
   // Joint pads and subtle phalangeal taper on the exposed fingers.
   if(t>.09*scale){const wave=.00055*scale*(gauss(t-.109*scale,.006*scale)+gauss(t-.139*scale,.005*scale));v.addScaledVector(B,wave*dorsal);}
  }
  // Apply exactly the same wrist-section field to the duplicate forearm ring and
  // the adjacent lower forearm, avoiding a positional or normal seam at the UV cut.
  for(let i=0;i<wp.length;i++){if(own.has(i))continue;const r=wp[i].clone().sub(wrist),t=r.dot(D),u=r.dot(A),z=r.dot(B);if(t>-.06*scale&&t<.007*scale&&Math.abs(u)<.045*scale&&Math.abs(z)<.034*scale){const gate=gauss(t,.021*scale);wp[i].addScaledVector(B,-z*.16*gate).addScaledVector(A,u*.035*gate);changed[i]=true;}}
 }
 return changed;
}
// Triangulation can differ at a few quads, so use unique five-hop topology
// signatures; unmatched vertices are simply excluded from the landmark transfer.
function adjacency(p){const n=p.getAttribute('POSITION').getCount(),adj=Array.from({length:n},()=>new Set()),I=p.getIndices().getArray();for(let k=0;k<I.length;k+=3)for(let j=0;j<3;j++){adj[I[k+j]].add(I[k+(j+1)%3]);adj[I[k+j]].add(I[k+(j+2)%3]);}return adj;}
function transferredLandmarks(template,p,wp,ids){
 const adj=adjacency(p),groups=[template.ids,ids],adjs=[template.adj,adj];let labels=groups.map((g,k)=>new Map(g.map(i=>[i,adjs[k][i].size])));
 for(let iteration=0;iteration<5;iteration++){const signatures=groups.map((g,k)=>g.map(i=>`${labels[k].get(i)}:${[...adjs[k][i]].map(j=>labels[k].get(j)).sort((a,b)=>a-b).join(',')}`)),dictionary=new Map();for(const g of signatures)for(const sig of g)if(!dictionary.has(sig))dictionary.set(sig,dictionary.size);labels=groups.map((g,k)=>new Map(g.map((i,n)=>[i,dictionary.get(signatures[k][n])])));}
 const maps=labels.map(m=>{const out=new Map();for(const[i,label]of m){if(!out.has(label))out.set(label,[]);out.get(label).push(i);}return out;}),pairs=[];
 for(const [label,source]of maps[0]){const dest=maps[1].get(label);if(source.length===1&&dest?.length===1)pairs.push([source[0],dest[0]]);}
 const out=[];for(const [name,point]of template.joints){const candidates=pairs.filter(([i])=>template.normals[i].dot(template.back)>.2).sort((a,b)=>template.wp[a[0]].distanceTo(point)-template.wp[b[0]].distanceTo(point)).slice(0,6);if(!candidates.length)continue;const center=new THREE.Vector3();let sum=0;for(const[i,j]of candidates){const weight=1/(.002+template.wp[i].distanceTo(point))**3;center.addScaledVector(wp[j],weight);sum+=weight;}center.divideScalar(sum);out.push({point:center,amplitude:name.endsWith('01')?.0027:.0013,radius:name.endsWith('01')?.010:.0065});}
 return out;
}
const templateSource=path.join(work,'source/public/models/hands/arms.glb');fs.mkdirSync(path.dirname(templateSource),{recursive:true});if(!fs.existsSync(templateSource))fs.copyFileSync(process.env.HAND_TEMPLATE||'public/models/hands/arms.glb',templateSource);
const td=await io.read(templateSource);await td.transform(dequantize());const tn=td.getRoot().listNodes().find(n=>n.getName()==='arm_skin_l'),tp=tn.getMesh().listPrimitives()[0],tg=geometry(tn,tp),tj=td.getRoot().listNodes(),atBone=name=>new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(tj.find(n=>n.getName()===name+'_l').getWorldMatrix()));
const tw=atBone('hand'),tf=atBone('middle_01').sub(tw).normalize(),ta=atBone('pinky_01').sub(atBone('index_01'));ta.addScaledVector(tf,-ta.dot(tf)).normalize();const tb=tf.clone().cross(ta);if(atBone('thumb_03').sub(tw).dot(tb)<0)tb.negate();tb.negate();
const template={ids:components(tp).find(g=>g.length===1817),adj:adjacency(tp),wp:tg.positions,back:tb,normals:tg.positions.map((_,i)=>vec(tp.getAttribute('NORMAL').getElement(i,[]))),joints:['index','middle','ring','pinky'].flatMap(f=>['01','02','03'].map(j=>[f+j,atBone(f+'_'+j)]))};
const report=[];
for(const file of files){
 const source=path.join(work,'source',file);fs.mkdirSync(path.dirname(source),{recursive:true});if(!fs.existsSync(source))fs.copyFileSync(file,source);
 const d=await io.read(source);await d.transform(dequantize());const before={bytes:fs.statSync(source).size,triangles:triangles(d)},edits=[];
 for(const node of d.getRoot().listNodes())for(const p of node.getMesh()?.listPrimitives()||[]){if(!p.getMaterial()?.getName().endsWith('.skin'))continue;
  const{positions:wp,transforms}=geometry(node,p),original=wp.map(v=>v.clone());const changed=file.endsWith('arms.glb')?therapist(d,node,p,wp):patient(p,wp,template);
  const duplicateGroups=new Map();original.forEach((v,i)=>{const key=v.toArray().map(x=>Math.round(x/1e-7)).join(',');if(!duplicateGroups.has(key))duplicateGroups.set(key,[]);duplicateGroups.get(key).push(i);});
  for(const ids of duplicateGroups.values())if(ids.length>1&&ids.some(i=>changed[i])){const mean=new THREE.Vector3();ids.forEach(i=>mean.add(wp[i]));mean.divideScalar(ids.length);ids.forEach(i=>{wp[i].copy(mean);changed[i]=true;});}
  const P=p.getAttribute('POSITION');let max=0,count=0;for(let i=0;i<wp.length;i++)if(changed[i]){const dist=wp[i].distanceTo(original[i]);if(dist>1e-9){count++;max=Math.max(max,dist);P.setElement(i,wp[i].clone().applyMatrix4(transforms[i].clone().invert()).toArray());}}
  recomputeNormals(p,wp,changed,transforms);edits.push({mesh:node.getName(),editedVertices:count,maxChangeMetres:max});
 }
 await d.transform(prune(),meshopt({encoder:MeshoptEncoder,level:'medium'}));await io.write(file,d);const after={bytes:fs.statSync(file).size,triangles:triangles(d)};report.push({file,before,after,edits});console.log(file,before,after,edits);
}
fs.writeFileSync(path.join(work,'metrics.json'),JSON.stringify(report,null,2));

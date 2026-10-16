/** Resting patient hands derived from the existing CC0 MPFB hand topology.
 * GLTF_MODULES=/cached/node_modules node scripts/assets/patient_rest_hands.mjs <workdir>
 * Optional HAND_SOURCE points to a clean MPFB arms GLB (defaults to clinic arms).
 * First execution saves source GLBs in workdir/source; subsequent runs start there.
 * All edits are in skinned rest-world metres; inverse blended bind matrices put
 * positions back into the original quantized mesh space. Neck/morph data is not sculpted.
 */
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import * as THREE from 'three';
const require=createRequire(path.resolve(process.env.GLTF_MODULES||'','@gltf-transform/core/package.json'));
const {NodeIO}=require('@gltf-transform/core');
const {ALL_EXTENSIONS}=require('@gltf-transform/extensions');
const {dequantize,meshopt,prune}=require('@gltf-transform/functions');
const {MeshoptDecoder,MeshoptEncoder}=require('meshoptimizer');
await Promise.all([MeshoptDecoder.ready,MeshoptEncoder.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder,'meshopt.encoder':MeshoptEncoder});
const work=process.argv[2]||'/private/tmp/ttuk-patient-rest-hands';fs.mkdirSync(work,{recursive:true});
const files=(process.env.ASSET_IDS?.split(',')||['01','02','03','04','05']).map(n=>`public/models/towel-stage/patient${n}/body.glb`);
const vec=a=>new THREE.Vector3().fromArray(a),gauss=(x,w)=>Math.exp(-((x/w)**2)),smooth=(a,b,x)=>{const t=THREE.MathUtils.clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
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
function adjacency(p){const n=p.getAttribute('POSITION').getCount(),adj=Array.from({length:n},()=>new Set()),I=p.getIndices().getArray();for(let k=0;k<I.length;k+=3)for(let j=0;j<3;j++){adj[I[k+j]].add(I[k+(j+1)%3]);adj[I[k+j]].add(I[k+(j+2)%3]);}return adj;}
function mapping(a,p,ids){
 const adj=adjacency(p),groups=[a.ids,ids],adjs=[a.adj,adj];let labels=groups.map((g,k)=>new Map(g.map(i=>[i,adjs[k][i].size])));
 for(let it=0;it<8;it++){const sig=groups.map((g,k)=>g.map(i=>`${labels[k].get(i)}:${[...adjs[k][i]].map(j=>labels[k].get(j)).sort((a,b)=>a-b).join(',')}`)),dic=new Map();for(const list of sig)for(const s of list)if(!dic.has(s))dic.set(s,dic.size);labels=groups.map((g,k)=>new Map(g.map((i,j)=>[i,dic.get(sig[k][j])])));}
 const maps=labels.map(m=>{const out=new Map();for(const[i,l]of m){if(!out.has(l))out.set(l,[]);out.get(l).push(i);}return out;}),pairs=[];
 for(const [l,s]of maps[0]){const d=maps[1].get(l);if(s.length===1&&d?.length===1)pairs.push([s[0],d[0]]);}
 const s2d=new Map(pairs),d2s=new Map(pairs.map(([s,d])=>[d,s]));
 // A quad's alternate diagonal breaks the WL label in a neighborhood. Recover
 // these vertices using already matched edge neighbors before harmonic fill.
 for(let it=0;it<20;it++){let count=0;for(const dest of ids)if(!d2s.has(dest)){const known=[...adj[dest]].filter(n=>d2s.has(n)).map(n=>d2s.get(n));if(known.length<2)continue;const cand=new Map();for(const k of known)for(const v of a.adj[k])if(!s2d.has(v))cand.set(v,(cand.get(v)||0)+1);const best=[...cand].sort((a,b)=>b[1]-a[1]);if(!best.length||best[0][1]<2||(best[1]&&best[1][1]===best[0][1]))continue;const source=best[0][0];s2d.set(source,dest);d2s.set(dest,source);pairs.push([source,dest]);count++;}if(!count)break;}
 return pairs;
}
const templateSource=process.env.HAND_SOURCE||'public/models/hands/arms.glb';
const td=await io.read(templateSource);await td.transform(dequantize());
let tn,tp,tg,js,template,wrist,D,A,B,sd,curled;
function setTemplate(side){sd=side;tn=td.getRoot().listNodes().find(n=>n.getName()==='arm_skin_'+sd);tp=tn.getMesh().listPrimitives()[0];tg=geometry(tn,tp);js=tn.getSkin().listJoints();
 template={ids:components(tp).find(g=>g.length===1817),adj:adjacency(tp),wp:tg.positions};
 wrist=atBone('hand');D=atBone('middle_01').sub(wrist).normalize();A=atBone('index_01').sub(atBone('pinky_01'));A.addScaledVector(D,-A.dot(D)).normalize();B=A.clone().cross(D).normalize();if(atBone('thumb_03').sub(wrist).dot(B)>0)B.negate();curled=curlTemplate();
}
const atBone=name=>new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(js.find(n=>n.getName()===name+'_'+sd).getWorldMatrix()));
const point=n=>atBone(n),frame=(x,y,z)=>new THREE.Matrix4().makeBasis(x,y,z);
function curlTemplate(){
 const out=template.wp.map(v=>v.clone()),trans=new Map();
 for(const finger of ['thumb','index','middle','ring','pinky']){
  let prevOld=null,prevNew=null,prevQ=null;
  for(let j=1;j<=3;j++){
   const name=finger+'_'+String(j).padStart(2,'0'),old=point(name),next=j<3?point(finger+'_'+String(j+1).padStart(2,'0')):old.clone().addScaledVector(j===3?old.clone().sub(point(finger+'_02')).normalize():D,.025),dir=next.sub(old).normalize();
   const isThumb=finger==='thumb',flat=dir.clone().addScaledVector(B,-dir.dot(B)).normalize(),base=isThumb?flat.clone().lerp(D,.45).normalize():D.clone().addScaledVector(A,({index:.015,middle:0,ring:-.025,pinky:-.06})[finger]).normalize();
   const angle=THREE.MathUtils.degToRad((isThumb?[3,8,13]:[3,9,16])[j-1]),desired=base.multiplyScalar(Math.cos(angle)).addScaledVector(B,-Math.sin(angle)).normalize(),q=new THREE.Quaternion().setFromUnitVectors(dir,desired);
   const dest=j===1?old.clone():prevNew.clone().add(old.clone().sub(prevOld).applyQuaternion(prevQ));
   trans.set(name+'_'+sd,new THREE.Matrix4().makeTranslation(...dest.toArray()).multiply(new THREE.Matrix4().makeRotationFromQuaternion(q)).multiply(new THREE.Matrix4().makeTranslation(...old.clone().negate().toArray())));
   prevOld=old;prevNew=dest;prevQ=q;
  }
 }
 const I=tp.getAttribute('JOINTS_0'),W=tp.getAttribute('WEIGHTS_0');for(const i of template.ids){const ids=I.getElement(i,[]),ws=W.getElement(i,[]),v=new THREE.Vector3(),base=template.wp[i].clone(),normal=vec(tp.getAttribute('NORMAL').getElement(i,[])).applyMatrix3(new THREE.Matrix3().getNormalMatrix(tg.transforms[i])).normalize(),dorsal=smooth(.1,.7,normal.dot(B));let relief=0;for(const finger of ['index','middle','ring','pinky'])for(const j of ['01','02','03']){const dist=base.distanceTo(point(finger+'_'+j)),r=j==='01'?.014:.008;relief+=(j==='01'?.0018:.0010)*gauss(dist,r)*dorsal;}base.addScaledVector(B,relief);for(let k=0;k<4;k++)if(ws[k]){const m=trans.get(js[ids[k]].getName());v.addScaledVector(m?base.clone().applyMatrix4(m):base,ws[k]);}out[i]=v;}
 return out;
}
setTemplate('l');
if(process.env.DEBUG_ONLY){const keep=new Set(template.ids),I=Array.from(tp.getIndices().getArray());fs.writeFileSync(path.join(work,'template.json'),JSON.stringify({positions:template.wp.map(v=>{const r=v.clone().sub(wrist);return[r.dot(A),r.dot(D),r.dot(B)];}),triangles:Array.from({length:I.length/3},(_,i)=>I.slice(i*3,i*3+3)).filter(t=>t.every(j=>keep.has(j))),curled:curled.map(v=>{const r=v.clone().sub(wrist);return[r.dot(A),r.dot(D),r.dot(B)];})}));process.exit(0);}
function leastSquares(pairs,wp,ring){
 const K=new THREE.Matrix4();K.elements.fill(0);const rhs=[0,1,2].map(()=>[0,0,0,0]);let count=0;
 const weights=tp.getAttribute('WEIGHTS_0'),ind=tp.getAttribute('JOINTS_0'),hi=js.findIndex(n=>n.getName()==='hand_'+sd);
 for(const[i,j]of pairs){const ids=ind.getElement(i,[]),ws=weights.getElement(i,[]);if(ids.reduce((s,v,k)=>s+(v===hi?ws[k]:0),0)<.75)continue;const a=template.wp[i].clone().sub(wrist),x=[a.x,a.y,a.z,1],y=wp[j].clone().sub(ring).toArray();for(let r=0;r<4;r++)for(let c=0;c<4;c++)K.elements[c*4+r]+=x[r]*x[c];for(let k=0;k<3;k++)for(let r=0;r<4;r++)rhs[k][r]+=x[r]*y[k];count++;}
 if(count<30)throw Error('Insufficient palm anchors');const inv=K.invert().elements,rows=rhs.map(y=>[0,1,2,3].map(r=>y.reduce((s,v,c)=>s+inv[c*4+r]*v,0)));return v=>new THREE.Vector3(...rows.map(a=>a[0]*(v.x-wrist.x)+a[1]*(v.y-wrist.y)+a[2]*(v.z-wrist.z)+a[3])).add(ring);
}
function ringOf(ids,wp,comps){const own=new Set(ids),lookup=new Map();wp.forEach((v,i)=>{const k=v.toArray().map(x=>Math.round(x/.00012)).join(',');if(!lookup.has(k))lookup.set(k,[]);lookup.get(k).push(i);});return ids.filter(i=>lookup.get(wp[i].toArray().map(x=>Math.round(x/.00012)).join(',')).some(j=>!own.has(j)));}
function mean(ids,wp){return ids.reduce((v,i)=>v.add(wp[i]),new THREE.Vector3()).divideScalar(ids.length);}
function surfaceAt(x,y,tris){let top=-Infinity;for(const t of tris){const [a,b,c]=t;if(x<Math.min(a.x,b.x,c.x)||x>Math.max(a.x,b.x,c.x)||y<Math.min(a.y,b.y,c.y)||y>Math.max(a.y,b.y,c.y))continue;const den=(b.y-c.y)*(a.x-c.x)+(c.x-b.x)*(a.y-c.y);if(Math.abs(den)<1e-12)continue;const u=((b.y-c.y)*(x-c.x)+(c.x-b.x)*(y-c.y))/den,v=((c.y-a.y)*(x-c.x)+(a.x-c.x)*(y-c.y))/den,w=1-u-v;if(u>=-1e-7&&v>=-1e-7&&w>=-1e-7)top=Math.max(top,u*a.z+v*b.z+w*c.z);}return top;}
function repose(p,wp,shirts){
 const original=wp.map(v=>v.clone()),comps=components(p),adj=adjacency(p),hands=comps.filter(ids=>ids.length===1817),changed=wp.map(()=>false),out=[],infos=[],paintWeights=new Float32Array(wp.length),nailWeights=new Float32Array(wp.length);
 for(const ids of hands){
  const sourceWrist=mean(ringOf(ids,wp,comps),wp);setTemplate(sourceWrist.x>0?'l':'r');
  const own=new Set(ids),ring=ringOf(ids,wp,comps),wr=mean(ring,wp),pairs=mapping(template,p,ids),fit=leastSquares(pairs,wp,wr),oldOrigin=fit(wrist),oldD=fit(wrist.clone().add(D)).sub(oldOrigin).normalize(),oldB=fit(wrist.clone().add(B)).sub(oldOrigin).normalize(),oldA=oldD.clone().cross(oldB).normalize();oldB.copy(oldA).cross(oldD).normalize();
  const side=Math.sign(wr.x),top=wr.z>mean(hands.find(h=>h!==ids),wp).z,nd=new THREE.Vector3(-side*.74,-.673,0).normalize(),nb=new THREE.Vector3(side*.07,-.07,1).normalize();nb.addScaledVector(nd,-nb.dot(nd)).normalize();const na=nd.clone().cross(nb).normalize(),rot=frame(na,nd,nb).multiply(frame(oldA,oldD,oldB).invert()),lift=top?.008:.010;
  const desired=new Map();for(const[i,j]of pairs){desired.set(j,fit(curled[i]).sub(wr).applyMatrix4(rot).add(wr).addScaledVector(nb,lift));const v=template.wp[i],r=v.clone().sub(wrist);paintWeights[j]=smooth(.004,.032,r.dot(D));

  }
  // Keep the exact wrist cross-section from the patient's own mesh; its 18 mm
  // collar blends into the reconstructed palm rather than introducing a cut.
  const dis=new Map();for(const i of ids){const r=wp[i].clone().sub(wr),t=r.dot(oldD),transformed=r.applyMatrix4(rot).add(wr).addScaledVector(nb,lift),canonical=desired.get(i);if(canonical){const a=smooth(.006,.027,t);canonical.lerp(transformed,1-a);dis.set(i,canonical.sub(wp[i]));}}
  // Harmonic extension across vertices whose triangle diagonal differs from the
  // source hand. Fixed corresponding anchors retain the phalangeal landmarks.
  const fixed=new Set(dis.keys());for(const i of ids)if(!dis.has(i))dis.set(i,new THREE.Vector3());for(let iter=0;iter<180;iter++)for(const i of ids)if(!fixed.has(i)){const v=new THREE.Vector3();let n=0;for(const j of adj[i])if(own.has(j)){v.add(dis.get(j));n++;}if(n)dis.get(i).copy(v.divideScalar(n));}
  for(const i of ids){wp[i].add(dis.get(i));changed[i]=true;nailWeights[i]=0;}
  const sourceJ=tp.getAttribute('JOINTS_0'),sourceW=tp.getAttribute('WEIGHTS_0'),nailAnchors=[];
  for(const finger of ['thumb','index','middle','ring','pinky']){const group=j=>pairs.filter(([i])=>{const ii=sourceJ.getElement(i,[]),ww=sourceW.getElement(i,[]),bone=js.findIndex(n=>n.getName()===finger+'_'+j+'_'+sd);return ii.reduce((s,b,k)=>s+(b===bone?ww[k]:0),0)>.4;}).map(([,i])=>i),distal=group('03'),proximal=group('02');if(!distal.length||!proximal.length)continue;const center=mean(distal,wp),axis=center.clone().sub(mean(proximal,wp)).normalize(),cross=axis.clone().cross(nb).normalize(),tip=Math.max(...distal.map(i=>wp[i].clone().sub(center).dot(axis)));let count=0;for(const i of distal){const off=wp[i].clone().sub(center),t=off.dot(axis),u=off.dot(cross),z=off.dot(nb),nail=smooth(.0005,.0035,z)*Math.exp(-((u/.0065)**4))*smooth(tip-.021,tip-.015,t)*(1-smooth(tip-.004,tip-.0005,t));nailWeights[i]=Math.max(nailWeights[i],nail);if(nail>.4)count++;}nailAnchors.push({digit:finger,distalPhalanxVertices:distal.length,dorsalNailVertices:count,dorsalUpDot:nb.z});}

  // A broad bend through the distal forearm carries the wrist with the hand.
  // This is rigid at the wrist and fades to zero before the elbow, so no skin
  // ring is pulled apart and the resting wrist itself remains nearly straight.
  const arm=comps.find(a=>a.length===483&&a.some(j=>ring.some(i=>original[j].distanceTo(original[i])<.00015)));
  if(!arm)throw Error('Lower forearm island not found');for(const i of arm)changed[i]=true;
  const far=arm.map(i=>[i,original[i].distanceTo(wr)]).sort((a,b)=>b[1]-a[1]).slice(0,24),elbow=mean(far.map(a=>a[0]),original),F=wr.clone().sub(elbow).normalize(),swing=new THREE.Quaternion().setFromUnitVectors(oldD,nd),rolledBack=oldB.clone().applyQuaternion(swing),roll=Math.atan2(nd.dot(rolledBack.clone().cross(nb)),rolledBack.dot(nb));
  let nearest=0;for(const i of arm){const r=original[i].clone().sub(wr),dist=r.length(),gate=1-smooth(.025,.20,dist);if(gate<=0)continue;const center=F.clone().multiplyScalar(r.dot(F)),rad=r.clone().sub(center),axis=F.clone().lerp(oldD,1-smooth(.005,.040,dist)).normalize();rad.applyAxisAngle(axis,roll*gate);const mix=new THREE.Quaternion().slerp(swing,gate),dest=center.add(rad).applyQuaternion(mix).add(wr).addScaledVector(nb,lift*gate),delta=dest.sub(original[i]);wp[i].add(delta);changed[i]=true;nearest=Math.max(nearest,delta.length());}
  // Preserve all wrist seam duplicates using the identical deformation field.
  for(const i of ring){for(let j=0;j<wp.length;j++)if(!own.has(j)&&original[i].distanceTo(original[j])<.00012){wp[j].copy(wp[i]);changed[j]=true;}}
  infos.push({ids,arm,wr,ring,top});
  out.push({side:side>0?'left':'right',top,anchors:pairs.length,wrist:wr.toArray(),rotationDegrees:oldD.angleTo(nd)*180/Math.PI,nailAnchors,handVertices:ids.length,armVertices:arm.filter(i=>changed[i]).length,maxForearmMetres:nearest});
 }
 // Establish real resting contact: the lower hand settles above the shirt,
 // the upper settles above that hand. Keep a 2.2 mm tolerance for compression
 // quantization and the existing breathing morph; no buried fingertips.
 const I=Array.from(p.getIndices().getArray());let support=shirts;
 for(const info of [...infos].sort((a,b)=>Number(a.top)-Number(b.top))){let dz=-Infinity;for(const i of info.ids){const v=wp[i],z=surfaceAt(v.x,v.y,support);if(Number.isFinite(z))dz=Math.max(dz,z+.0022-v.z);}if(!Number.isFinite(dz))throw Error('Resting hand lacks support');
  const own=new Set(info.ids);for(const i of info.ids)wp[i].z+=dz;for(const i of info.arm){const gate=1-smooth(.025,.20,original[i].distanceTo(info.wr));wp[i].z+=dz*gate;changed[i] ||=gate>0;}for(const i of info.ring)for(const j of info.arm)if(original[i].distanceTo(original[j])<.00012)wp[j].copy(wp[i]);
  out.find(e=>e.top===info.top).supportShiftMM=dz*1000;
  const tri=[];for(let k=0;k<I.length;k+=3)if(own.has(I[k])&&own.has(I[k+1])&&own.has(I[k+2]))tri.push([wp[I[k]],wp[I[k+1]],wp[I[k+2]]]);support=[...support,...tri];
 }
 return{changed,hands,out,original,paintWeights,nailWeights};
}
const report=[];
for(const file of files){
 const source=path.join(work,'source',file);fs.mkdirSync(path.dirname(source),{recursive:true});if(!fs.existsSync(source))fs.copyFileSync(file,source);
 const d=await io.read(source);await d.transform(dequantize());const before={bytes:fs.statSync(source).size,triangles:triangles(d)},edits=[];
 const shirts=[];for(const n of d.getRoot().listNodes())for(const pr of n.getMesh()?.listPrimitives()||[])if(pr.getMaterial()?.getName().endsWith('.shirt')){const g=geometry(n,pr),I=pr.getIndices().getArray();for(let k=0;k<I.length;k+=3)shirts.push([g.positions[I[k]],g.positions[I[k+1]],g.positions[I[k+2]]]);}
 for(const node of d.getRoot().listNodes())for(const p of node.getMesh()?.listPrimitives()||[]){if(!p.getMaterial()?.getName().endsWith('.skin'))continue;const {positions:wp,transforms}=geometry(node,p),{changed,hands,out,original,paintWeights,nailWeights}=repose(p,wp,shirts),P=p.getAttribute('POSITION');
  // Keep the original world-space belly lift and all breathing target arrays.
  for(let i=0;i<wp.length;i++)if(changed[i])P.setElement(i,wp[i].clone().applyMatrix4(transforms[i].clone().invert()).toArray());
  recomputeNormals(p,wp,changed,transforms);edits.push(...out);
  const stem=path.join(work,path.basename(path.dirname(file))+'-rest-atlas'),tex=p.getMaterial().getBaseColorTexture();fs.writeFileSync(stem+'.input',tex.getImage());fs.writeFileSync(stem+'.json',JSON.stringify({uv:Array.from(p.getAttribute('TEXCOORD_0').getArray()),indices:Array.from(p.getIndices().getArray()),hand:Array.from(paintWeights),nails:Array.from(nailWeights)}));const py=spawnSync(process.env.ASSET_PYTHON||'python3',['scripts/assets/patient_hand_atlas.py',stem],{encoding:'utf8'});if(py.status)throw Error(py.stderr);tex.setImage(fs.readFileSync(stem+'.webp')).setMimeType('image/webp');
  const idx=Array.from(p.getIndices().getArray()),groups=hands.map(ids=>new Set(ids));
  const meshes=[];for(let h=0;h<hands.length;h++)meshes.push({name:'hand'+h,positions:wp.map(v=>v.toArray()),triangles:Array.from({length:idx.length/3},(_,i)=>idx.slice(i*3,i*3+3)).filter(t=>t.every(j=>groups[h].has(j))),breathDeltas:wp.map((_,i)=>{const a=p.listTargets()[0]?.getAttribute('POSITION');return a?vec(a.getElement(i,[])).applyMatrix3(new THREE.Matrix3().setFromMatrix4(transforms[i])).toArray():[0,0,0];})});
  for(const n of d.getRoot().listNodes())for(const pr of n.getMesh()?.listPrimitives()||[])if(pr.getMaterial()?.getName().endsWith('.shirt')){const gg=geometry(n,pr);meshes.push({name:'shirt',positions:gg.positions.map(v=>v.toArray()),breathDeltas:gg.positions.map((_,i)=>{const a=pr.listTargets()[0]?.getAttribute('POSITION');return a?vec(a.getElement(i,[])).applyMatrix3(new THREE.Matrix3().setFromMatrix4(gg.transforms[i])).toArray():[0,0,0];}),triangles:(()=>{const a=Array.from(pr.getIndices().getArray());return Array.from({length:a.length/3},(_,i)=>a.slice(i*3,i*3+3));})()});}
  fs.writeFileSync(path.join(work,path.basename(path.dirname(file))+'-collision.json'),JSON.stringify(meshes));
 }
 await d.transform(prune(),meshopt({encoder:MeshoptEncoder,level:'medium'}));await io.write(file,d);const after={bytes:fs.statSync(file).size,triangles:triangles(d)};report.push({file,before,after,edits});console.log(file,before,after,edits);
}
fs.writeFileSync(path.join(work,'patient-rest-metrics.json'),JSON.stringify(report,null,2));

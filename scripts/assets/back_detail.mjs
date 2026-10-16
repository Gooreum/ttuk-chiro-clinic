/** Back-only derivatives of the existing MPFB CC0 working poses.
 * GLTF_MODULES=/path/to/asset/node_modules ASSET_PYTHON=python3
 * node scripts/assets/back_detail.mjs <workdir> [source-directory]
 * Inputs are preserved on first execution. Re-running never accumulates sculpt.
 * Uses the same authored cloth/skin maps and face/hand landmarks as towel-stage.
 * No browser assets outside public/models/back are written.
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
const work=process.argv[2]||'/private/tmp/ttuk-back-detail',sourceDir=process.argv[3]||'public/models/back',outDir='public/models/back';
fs.mkdirSync(work,{recursive:true});
const V=a=>new T.Vector3().fromArray(a),M=a=>new T.Matrix4().fromArray(a),rgb=h=>new T.Color(h).convertSRGBToLinear().toArray(),G=(a,w)=>Math.exp(-((a/w)**2)),smooth=(a,b,x)=>{const t=T.MathUtils.clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const count=d=>d.getRoot().listMeshes().reduce((s,m)=>s+m.listPrimitives().reduce((n,p)=>n+p.getIndices().getCount()/3,0),0);
function acc(d,a,type){return d.createAccessor().setType(type).setArray(a).setBuffer(d.getRoot().listBuffers()[0]);}
function geometry(n,p){
 const P=p.getAttribute('POSITION'),N=p.getAttribute('NORMAL'),positions=[],normals=[],transforms=[],sk=n.getSkin(),js=sk?.listJoints(),ib=sk?.getInverseBindMatrices(),ms=js?.map((b,i)=>M(b.getWorldMatrix()).multiply(M(ib.getElement(i,[]))));
 for(let i=0;i<P.getCount();i++){
  let m=M(n.getWorldMatrix());if(sk){m=new T.Matrix4();m.elements.fill(0);const ids=p.getAttribute('JOINTS_0').getElement(i,[]),ws=p.getAttribute('WEIGHTS_0').getElement(i,[]);for(let j=0;j<4;j++)if(ws[j])for(let k=0;k<16;k++)m.elements[k]+=ws[j]*ms[ids[j]].elements[k];}
  transforms.push(m);positions.push(V(P.getElement(i,[])).applyMatrix4(m));normals.push(V(N.getElement(i,[])).applyMatrix3(new T.Matrix3().getNormalMatrix(m)).normalize());
 }return{positions,normals,transforms};
}
function update(p,g){
 const P=p.getAttribute('POSITION'),N=p.getAttribute('NORMAL'),norm=g.positions.map(()=>new T.Vector3()),I=p.getIndices().getArray();
 for(let k=0;k<I.length;k+=3){const a=I[k],b=I[k+1],c=I[k+2],n=g.positions[b].clone().sub(g.positions[a]).cross(g.positions[c].clone().sub(g.positions[a]));for(const j of [a,b,c])norm[j].add(n);}
 const weld=new Map();g.positions.forEach((v,i)=>{const key=v.toArray().map(x=>Math.round(x/.00003)).join(',');if(!weld.has(key))weld.set(key,[]);weld.get(key).push(i);});
 for(const ids of weld.values()){const n=new T.Vector3();ids.forEach(i=>n.add(norm[i]));n.normalize();for(const i of ids){P.setElement(i,g.positions[i].clone().applyMatrix4(g.transforms[i].clone().invert()).toArray());g.normals[i]=n.clone();N.setElement(i,n.clone().applyMatrix3(new T.Matrix3().setFromMatrix4(g.transforms[i]).transpose()).normalize().toArray());}}
}
function components(p){const par=Array.from({length:p.getAttribute('POSITION').getCount()},(_,i)=>i),root=i=>{while(par[i]!==i){par[i]=par[par[i]];i=par[i];}return i;},I=p.getIndices().getArray();for(let i=0;i<I.length;i+=3){par[root(I[i+1])]=root(I[i]);par[root(I[i+2])]=root(I[i]);}const out=new Map();for(let i=0;i<par.length;i++){const r=root(i);if(!out.has(r))out.set(r,[]);out.get(r).push(i);}return[...out.values()];}
function basis(d,name){const n=d.getRoot().listNodes().find(n=>n.getName()===name),m=M(n.getWorldMatrix());return{node:n,origin:new T.Vector3().setFromMatrixPosition(m),across:new T.Vector3().setFromMatrixColumn(m,0).normalize(),up:new T.Vector3().setFromMatrixColumn(m,1).normalize(),forward:new T.Vector3().setFromMatrixColumn(m,2).normalize()};}
function handFrames(d){return['l','r'].map(side=>{const at=name=>basis(d,name+'_'+side).origin,wrist=at('hand'),forward=at('middle_01').sub(wrist).normalize(),across=at('index_01').sub(at('pinky_01')).normalize(),back=across.clone().cross(forward).normalize();if(at('thumb_03').sub(wrist).dot(back)>0)back.negate();return{side,wrist,forward,across,back,elbow:at('lowerarm'),joints:['index','middle','ring','pinky'].map(f=>['01','02','03'].map(j=>at(f+'_'+j)))};});}
function patientFrames(p,g){
 const key=v=>v.toArray().map(x=>Math.round(x/.0001)).join(','),lookup=new Map();g.positions.forEach((v,i)=>{const k=key(v);if(!lookup.has(k))lookup.set(k,[]);lookup.get(k).push(i);});
 return components(p).filter(ids=>ids.length>1200&&ids.length<2300).flatMap(ids=>{const own=new Set(ids),ring=ids.filter(i=>lookup.get(key(g.positions[i])).some(j=>!own.has(j)));if(ring.length<8)return[];const wrist=ring.reduce((a,i)=>a.add(g.positions[i]),new T.Vector3()).divideScalar(ring.length),center=ids.reduce((a,i)=>a.add(g.positions[i]),new T.Vector3()).divideScalar(ids.length),forward=center.sub(wrist);forward.y=0;forward.normalize();const back=new T.Vector3(0,-1,0),across=forward.clone().cross(back).normalize(),joints=[[-.025,.076],[-.008,.080],[.010,.075],[.027,.064]].map(([u,t])=>[0,.030,.052].map(dt=>wrist.clone().addScaledVector(forward,t+dt).addScaledVector(across,u)));return[{wrist,forward,across,back,elbow:wrist.clone().addScaledVector(forward,-.24),joints,ids}];});
}
function sculptHands(p,g,frames){
 for(const f of frames){const {wrist:W,forward:D,across:A,back:B,elbow:E}=f,fore=W.clone().sub(E).normalize(),L=W.distanceTo(E);
  for(let i=0;i<g.positions.length;i++){const v=g.positions[i],r=v.clone().sub(W),t=r.dot(D),u=r.dot(A),z=r.dot(B),f0=v.clone().sub(E).dot(fore)/L,dorsal=smooth(.1,.8,g.normals[i].dot(B));
   if(t<.018&&f0>.04&&f0<1.05){const rad=v.clone().sub(E).addScaledVector(fore,-f0*L);if(rad.length()<.080){const n=B.clone().addScaledVector(fore,-B.dot(fore)).normalize(),a=fore.clone().cross(n).normalize(),gate=smooth(.04,.14,f0)*(1-smooth(1,1.05,f0)),belly=.16*G(f0-.3,.25),distal=smooth(.48,.94,f0);v.addScaledVector(a,rad.dot(a)*gate*(belly-.06*distal)).addScaledVector(n,rad.dot(n)*gate*(belly*.65-.18*distal));}}
   if(t>-.013&&t<.105&&Math.abs(u)<.06&&Math.abs(z)<.035){let raise=0;for(const digit of f.joints){const q=digit[0].clone().sub(W),kt=q.dot(D),ku=q.dot(A),line=ku*T.MathUtils.clamp(t/kt,0,1);raise+=.0021*G(t-kt,.011)*G(u-ku,.010)+.00075*G(u-line,.0035)*G(t-kt*.5,.027);}v.addScaledVector(B,(raise*dorsal-.0004*G(t+.001,.004)*dorsal)*(1-smooth(.085,.105,t)));if(t<.025)v.addScaledVector(B,-z*.07*G(t+.008,.032));}
   for(const digit of f.joints)for(const q of digit.slice(1)){const dist=v.distanceTo(q);if(dist<.012)v.addScaledVector(B,.0014*G(dist,.010)*dorsal);}
  }
 }
 update(p,g);
}
// A solid stitched return at the actual UV-welded garment boundary. Skin weights
// are copied from the garment so collars/cuffs follow every existing animation.
function hems(d,node,p,g){
 const I=p.getIndices().getArray(),keys=new Map(),ids=[],edges=new Map();g.positions.forEach(v=>{const key=v.toArray().map(x=>Math.round(x/1e-5)).join(',');if(!keys.has(key))keys.set(key,keys.size);ids.push(keys.get(key));});
 for(let k=0;k<I.length;k+=3)for(let j=0;j<3;j++){const a=I[k+j],b=I[k+(j+1)%3],key=[ids[a],ids[b]].sort((a,b)=>a-b).join(':');if(edges.has(key))edges.get(key).count++;else edges.set(key,{a,b,count:1});}
 const P=[],N=[],UV=[],SI=[],SW=[],F=[],hasSkin=!!node.getSkin(),isTherapist=node.getName().includes('therapist'),top=Math.max(...g.positions.map(v=>isTherapist?v.y:-v.z));
 for(const{a,b,count}of edges.values())if(count===1){const A=g.positions[a],B=g.positions[b],mid=A.clone().add(B).multiplyScalar(.5),rel=top-(isTherapist?mid.y:-mid.z),across=Math.abs(isTherapist?mid.z-.25:mid.x),collar=rel<.095&&across<.12,cuff=across>.145&&rel<.30;if(!collar&&!cuff)continue;if(A.distanceTo(B)>.035)continue;const tang=B.clone().sub(A).normalize(),start=P.length/3;
  for(const [id,pt]of [[a,A],[b,B]]){const n=g.normals[id],bin=tang.clone().cross(n).normalize(),inv=g.transforms[id].clone().invert();for(let k=0;k<6;k++){const theta=k/6*Math.PI*2,dir=n.clone().multiplyScalar(Math.cos(theta)).addScaledVector(bin,Math.sin(theta));P.push(...pt.clone().addScaledVector(n,.0007).addScaledVector(dir,.0016).applyMatrix4(inv).toArray());N.push(...dir.clone().applyMatrix3(new T.Matrix3().setFromMatrix4(g.transforms[id]).transpose()).normalize().toArray());UV.push(...p.getAttribute('TEXCOORD_0').getElement(id,[]));if(hasSkin){SI.push(...p.getAttribute('JOINTS_0').getElement(id,[]));SW.push(...p.getAttribute('WEIGHTS_0').getElement(id,[]));}}}
  for(let k=0;k<6;k++){const j=(k+1)%6;F.push(start+k,start+j,start+6+k,start+j,start+6+j,start+6+k);}
 }
 if(!P.length)return;const pr=d.createPrimitive().setAttribute('POSITION',acc(d,new Float32Array(P),'VEC3')).setAttribute('NORMAL',acc(d,new Float32Array(N),'VEC3')).setAttribute('TEXCOORD_0',acc(d,new Float32Array(UV),'VEC2')).setIndices(acc(d,new Uint16Array(F),'SCALAR')).setMaterial(d.createMaterial('back.tailored.cuff').setBaseColorFactor([...rgb(0x8adfbf),1]).setRoughnessFactor(.92));if(hasSkin){pr.setAttribute('JOINTS_0',acc(d,new Uint16Array(SI),'VEC4')).setAttribute('WEIGHTS_0',acc(d,new Float32Array(SW),'VEC4'));}const n=d.createNode('back_tailored_hem').setMesh(d.createMesh('back_tailored_hem').addPrimitive(pr)).setSkin(node.getSkin());for(const par of node.listParents())if(['Node','Scene'].includes(par.propertyType)){par.addChild(n);break;}
}
function addRigid(d,geo,name,color,parent){
 const world=M(parent.getWorldMatrix()),inv=world.clone().invert(),P=geo.attributes.position,N=geo.attributes.normal,normalM=new T.Matrix3().setFromMatrix4(world).transpose();for(let i=0;i<P.count;i++){P.setXYZ(i,...new T.Vector3().fromBufferAttribute(P,i).applyMatrix4(inv).toArray());N.setXYZ(i,...new T.Vector3().fromBufferAttribute(N,i).applyMatrix3(normalM).normalize().toArray());}
 const p=d.createPrimitive().setAttribute('POSITION',acc(d,P.array,'VEC3')).setAttribute('NORMAL',acc(d,N.array,'VEC3')).setIndices(acc(d,geo.index.array,'SCALAR')).setMaterial(d.createMaterial(name).setBaseColorFactor([...rgb(color),1]).setRoughnessFactor(.76));parent.addChild(d.createNode(name).setMesh(d.createMesh(name).addPrimitive(p)));
}
function tube(d,points,r,name,color,parent){addRigid(d,new T.TubeGeometry(new T.CatmullRomCurve3(points),Math.max(points.length*3,18),r,6,false),name,color,parent);}
function uniformDetails(d,node,p,g){
 // Project the pocket, neckline and badge onto the posed shirt itself. Added
 // stitches inherit the nearest garment skin weights, including shoulder flex.
 const geo=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(g.positions.flatMap(v=>v.toArray()),3));geo.setIndex(Array.from(p.getIndices().getArray()));const mesh=new T.Mesh(geo,new T.MeshBasicMaterial({side:T.DoubleSide}));mesh.updateMatrixWorld(true);const ray=new T.Raycaster(),direction=new T.Vector3(1,0,0),center=.25,ys=g.positions.map(v=>v.y),top=Math.max(...ys),bottom=Math.min(...ys);
 function at(x,y,out=.003){ray.set(new T.Vector3(-2,y,center+x),direction);const hit=ray.intersectObject(mesh)[0];if(hit)return hit.point.addScaledVector(direction,-out);const q=g.positions.reduce((best,v)=>Math.abs(v.z-center-x)+Math.abs(v.y-y)<Math.abs(best.z-center-x)+Math.abs(best.y-y)?v:best,g.positions[0]);return q.clone().addScaledVector(direction,-out);}
 function attach(geometry,name,color){const P=geometry.attributes.position,N=geometry.attributes.normal,positions=[],normals=[],joints=[],weights=[];for(let i=0;i<P.count;i++){const v=new T.Vector3().fromBufferAttribute(P,i);let nearest=0,dist=Infinity;for(let j=0;j<g.positions.length;j++){const dd=v.distanceToSquared(g.positions[j]);if(dd<dist){dist=dd;nearest=j;}}const inv=g.transforms[nearest].clone().invert();positions.push(...v.applyMatrix4(inv).toArray());normals.push(...new T.Vector3().fromBufferAttribute(N,i).applyMatrix3(new T.Matrix3().setFromMatrix4(g.transforms[nearest]).transpose()).normalize().toArray());joints.push(...p.getAttribute('JOINTS_0').getElement(nearest,[]));weights.push(...p.getAttribute('WEIGHTS_0').getElement(nearest,[]));}const pr=d.createPrimitive().setAttribute('POSITION',acc(d,new Float32Array(positions),'VEC3')).setAttribute('NORMAL',acc(d,new Float32Array(normals),'VEC3')).setAttribute('JOINTS_0',acc(d,new Uint16Array(joints),'VEC4')).setAttribute('WEIGHTS_0',acc(d,new Float32Array(weights),'VEC4')).setIndices(acc(d,geometry.index.array,'SCALAR')).setMaterial(d.createMaterial(name).setBaseColorFactor([...rgb(color),1]).setRoughnessFactor(.9));const n=d.createNode(name).setMesh(d.createMesh(name).addPrimitive(pr)).setSkin(node.getSkin());for(const par of node.listParents())if(['Node','Scene'].includes(par.propertyType)){par.addChild(n);break;}}
 function seam(name,xy,r,color=0x8adfbf){attach(new T.TubeGeometry(new T.CatmullRomCurve3(xy.map(([x,y])=>at(x,y))),xy.length*3,r,5,false),name,color);}
 function panel(name,xy,color,out=.0045){const pos=xy.flatMap(([x,y])=>at(x,y,out).toArray()),geo=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(pos,3));geo.setIndex([0,1,2,0,2,3]);geo.computeVertexNormals();attach(geo,name,color);}
 const collarY=top-.045,chestY=top-.17,waistY=bottom+.085;
 seam('scrub.v.collar',[[-.063,collarY],[0,collarY-.07],[.063,collarY]],.0022);
 panel('scrub.chest.pocket',[[-.11,chestY-.046],[-.052,chestY-.046],[-.052,chestY+.008],[-.11,chestY+.008]],0x17312c);
 seam('scrub.chest.welt',[[-.111,chestY+.009],[-.08,chestY+.010],[-.051,chestY+.009]],.0017);
 for(const s of [-1,1]){seam('scrub.side.seam.'+s,[[s*.14,chestY+.035],[s*.125,chestY-.06],[s*.115,waistY]],.0008);seam('scrub.waist.welt.'+s,[[s*.04,waistY],[s*.08,waistY+.003],[s*.12,waistY]],.0013);}
 panel('therapist.badge',[[.049,chestY-.02],[.103,chestY-.02],[.103,chestY+.020],[.049,chestY+.020]],0xf4efe4,.008);
 seam('badge.tab',[[.076,chestY+.021],[.076,chestY+.039]],.0032,0xff7a59);
 for(const y of [chestY-.007,chestY+.003])seam('badge.emboss.'+y,[[.060,y],[.091,y]],.00085,0x17312c);
}
function glasses(d,frame,eyePositions){
 const {across:A,up:U,forward:F,node}=frame,mean=eyePositions.reduce((a,p)=>a.add(p),new T.Vector3()).divideScalar(eyePositions.length);frame.eye=mean;
 for(const side of [-1,1]){const pts=eyePositions.filter(p=>p.clone().sub(mean).dot(A)*side>0),c=pts.reduce((a,p)=>a.add(p),new T.Vector3()).divideScalar(pts.length).addScaledVector(F,.014),xy=[[-.018,-.011],[.018,-.011],[.020,-.008],[.020,.008],[.017,.012],[-.017,.012],[-.020,.008],[-.020,-.008],[-.018,-.011]];tube(d,xy.map(([x,y])=>c.clone().addScaledVector(A,x).addScaledVector(U,y)),.0017,'therapist.spectacle.'+side,0x17312c,node);tube(d,[c.clone().addScaledVector(A,side*.020),c.clone().addScaledVector(A,side*.033).addScaledVector(F,-.035).addScaledVector(U,.015),c.clone().addScaledVector(A,side*.035).addScaledVector(F,-.060).addScaledVector(U,.015)],.0018,'therapist.temple.'+side,0x17312c,node);tube(d,[c.clone().addScaledVector(A,-side*.020),c.clone().addScaledVector(A,-side*.029).addScaledVector(U,.003)],.0014,'therapist.bridge.'+side,0x8adfbf,node);}
}
function runMaps(d,p,g,kind,stem,canonical,frames=[]){
 const m=p.getMaterial(),UV=p.getAttribute('TEXCOORD_0'),base=m.getBaseColorTexture();if(!base||!UV)return;
 const origin=V(canonical(new T.Vector3())),direction=v=>V(canonical(v)).sub(origin).normalize().toArray(),mask=new Float32Array(g.positions.length);for(const f of frames)for(const i of f.ids||[])mask[i]=1;
 fs.writeFileSync(stem+'.input',base.getImage());const data={pid:'patient01',kind,positions:g.positions.map(canonical),normals:g.normals.map(direction),uv:Array.from(UV.getArray()),indices:Array.from(p.getIndices().getArray()),boundaries:[],handFrames:frames.map(f=>({wrist:canonical(f.wrist),forward:direction(f.forward),across:direction(f.across),scale:1})),handMask:Array.from(mask)};
 fs.writeFileSync(stem+'.json',JSON.stringify(data));const r=spawnSync(process.env.ASSET_PYTHON||'python3',['scripts/assets/patient_detail_maps.py',stem],{encoding:'utf8'});if(r.status)throw Error(r.stderr);const texture=suffix=>d.createTexture(m.getName()+'.detail'+suffix).setImage(fs.readFileSync(stem+suffix+'.webp')).setMimeType('image/webp');m.setBaseColorTexture(texture('-color')).setNormalTexture(texture('-normal')).setNormalScale(kind==='skin'?.48:.85).setOcclusionTexture(texture('-orm')).setOcclusionStrength(.72).setMetallicRoughnessTexture(m.getOcclusionTexture()).setRoughnessFactor(.94).setMetallicFactor(0).setExtras({backDetail:true,detailKind:kind});
}
function therapistMaps(d,p,g,frame,frames,stem){
 const m=p.getMaterial(),UV=p.getAttribute('TEXCOORD_0');fs.writeFileSync(stem+'.image',m.getBaseColorTexture().getImage());const canonical=v=>{const q=v.clone().sub(frame.eye);return[q.dot(frame.across),q.dot(frame.up),q.dot(frame.forward)+.1];},direction=v=>[v.dot(frame.across),v.dot(frame.up),v.dot(frame.forward)];
 fs.writeFileSync(stem+'.json',JSON.stringify({kind:'skin',face:true,positions:g.positions.map(canonical),uv:Array.from({length:UV.getCount()},(_,i)=>UV.getElement(i,[])),indices:Array.from(p.getIndices().getArray()),knuckles:frames.flatMap(f=>f.joints.flatMap(d=>d.map(canonical))),hands:frames.map(f=>({wrist:canonical(f.wrist),forward:direction(f.forward),across:direction(f.across),back:direction(f.back),joints:f.joints.map(d=>d.map(canonical))}))}));const r=spawnSync(process.env.ASSET_PYTHON||'python3',['scripts/assets/towel_surface_detail.py',stem],{encoding:'utf8'});if(r.status)throw Error(r.stderr);const texture=s=>d.createTexture('therapist.skin.detail'+s).setImage(fs.readFileSync(stem+s+'.webp')).setMimeType('image/webp');m.setBaseColorTexture(texture('')).setNormalTexture(texture('-normal')).setNormalScale(.42).setOcclusionTexture(texture('-orm')).setOcclusionStrength(.7).setMetallicRoughnessTexture(m.getOcclusionTexture()).setRoughnessFactor(1).setMetallicFactor(0).setExtras({backDetail:true});
}
function surface(d,input){
 const out=JSON.parse(fs.readFileSync(input,'utf8')),objects=[];
 for(const n of d.getRoot().listNodes())for(const p of n.getMesh()?.listPrimitives()||[]){const g=geometry(n,p),geo=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(g.positions.flatMap(v=>v.toArray()),3));geo.setIndex(Array.from(p.getIndices().getArray()));const mesh=new T.Mesh(geo,new T.MeshBasicMaterial({side:T.DoubleSide}));mesh.updateMatrixWorld(true);objects.push(mesh);}
 const ray=new T.Raycaster(),down=new T.Vector3(0,-1,0);out.y=[];for(let j=0;j<out.nz;j++)for(let i=0;i<out.nx;i++){ray.set(new T.Vector3(out.x0+i*out.step,3,out.z0+j*out.step),down);const hit=ray.intersectObjects(objects)[0];out.y.push(hit?Number(hit.point.y.toFixed(4)):null);}fs.writeFileSync(outDir+'/back_surface.json',JSON.stringify(out));return out;
}
const report=[];
for(const who of ['patient','therapist']){
 const source=path.join(work,'source',who+'.glb');fs.mkdirSync(path.dirname(source),{recursive:true});if(!fs.existsSync(source))fs.copyFileSync(path.join(sourceDir,who+'.glb'),source);const d=await io.read(source);await d.transform(dequantize());const before={bytes:fs.statSync(source).size,triangles:count(d)},isTherapist=who==='therapist',frame=isTherapist?basis(d,'head'):null,frames=isTherapist?handFrames(d):[],jobs=d.getRoot().listNodes().flatMap(n=>(n.getMesh()?.listPrimitives()||[]).map(p=>({n,p})));
 if(frame){const eye=jobs.find(({n})=>n.getName()==='back_therapist_eyes');glasses(d,frame,geometry(eye.n,eye.p).positions);}
 for(const{n,p}of jobs){const name=p.getMaterial()?.getName()||'',kind=name.endsWith('.skin')?'skin':name.endsWith('.shirt')?'shirt':name.endsWith('.pants')?'pants':null;
  if(/\.(short04|eyebrow001)$/.test(name)&&isTherapist){const g=geometry(n,p);for(const v of g.positions){const q=v.clone().sub(frame.eye),h=q.dot(frame.up),x=q.dot(frame.across);if(name.endsWith('.short04')){const crown=smooth(.065,.135,h),left=T.MathUtils.clamp((-x+.025)/.065,0,1);v.addScaledVector(frame.up,crown*(.005+.006*left)).addScaledVector(frame.across,.006*crown);}else v.addScaledVector(frame.up,G(h,.04)*.0015);}update(p,g);}
  if(!kind)continue;const g=geometry(n,p),stem=path.join(work,who+'-'+kind);
  if(isTherapist&&kind==='skin'){
   sculptHands(p,g,frames);
   // Identical towel-stage squared jaw, cheek plane and compact nose, expressed
   // in the standing character's actual head basis rather than seated world axes.
   for(const v of g.positions){const q=v.clone().sub(frame.eye),x=q.dot(frame.across),h=q.dot(frame.up),f=q.dot(frame.forward),face=Math.exp(-(((f+.012)/.083)**4))*smooth(-.115,-.075,h),jaw=G(h+.067,.039)*face,cheek=G(h+.012,.035)*face;v.addScaledVector(frame.across,x*(.10*jaw+.035*cheek));const nose=G(x,.018)*G(h+.027,.022)*T.MathUtils.clamp((f+.005)/.018,0,1);v.addScaledVector(frame.forward,nose*.003);}
   update(p,g);therapistMaps(d,p,g,frame,frames,stem);continue;
  }
  const canonical=isTherapist?v=>[v.z-.25,v.y,-v.x]:v=>[-v.x,-v.z,-v.y];
  if(kind==='shirt'||kind==='pants'){
   update(p,g);const top=Math.max(...g.positions.map(v=>canonical(v)[1]));for(let i=0;i<g.positions.length;i++){const q=canonical(g.positions[i]),rel=top-q[1],fold=.00075*Math.sin(rel*180+Math.abs(q[0])*75)*G(rel-.24,.16)+.00065*Math.sin(rel*260-q[0]*60)*G(rel-.46,.08);g.positions[i].addScaledVector(g.normals[i],fold);}update(p,g);
  }
  const staticHands=!isTherapist&&kind==='skin'?patientFrames(p,g):[];if(staticHands.length)sculptHands(p,g,staticHands);
  runMaps(d,p,g,kind,stem,canonical,isTherapist?frames:staticHands);if(kind==='shirt'){p.getMaterial().setBaseColorFactor([...rgb(isTherapist?0x17312c:0xf4efe4),1]);hems(d,n,p,g);if(isTherapist)uniformDetails(d,n,p,g);}if(kind==='pants')p.getMaterial().setBaseColorFactor([...rgb(0x17312c),1]);
 }
 if(who==='patient'){
  const source=path.join(work,'source/back_surface.json');if(!fs.existsSync(source))fs.copyFileSync(path.join(sourceDir,'back_surface.json'),source);surface(d,source);
 }
 await d.transform(prune({keepLeaves:true}),meshopt({encoder:MeshoptEncoder,level:'medium'}));const dest=path.join(outDir,who+'.glb');await io.write(dest,d);report.push({file:dest,before,after:{bytes:fs.statSync(dest).size,triangles:count(d)}});console.log(report.at(-1));
}
fs.writeFileSync(path.join(work,'metrics.json'),JSON.stringify(report,null,2));

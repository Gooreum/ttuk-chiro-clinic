import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/examples/jsm/libs/meshopt_decoder.module.js';

// Game-only thoracolumbar reconstruction from real BodyParts3D T1–T8 surfaces.
// Lower levels reuse enlarged thoracic shapes; these are not measured lumbar anatomy.
// No cervical vertebra is included. Baked vertex AO is retained on every bone.
const clamp=v=>Math.max(0,Math.min(1,v));
const ease=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};
const RED=new THREE.Color(0xff4a42), BLUE=new THREE.Color(0x48dafa);
export async function createBackXray(){
  const group=new THREE.Group();group.name='BackReleaseXray';group.visible=false;
  const geometries=new Set(),materials=new Set(),textures=new Set();
  const geo=g=>(geometries.add(g),g),mat=m=>(materials.add(m),m);
  const basic=(color,opacity=1)=>mat(new THREE.MeshBasicMaterial({color,opacity,transparent:true,depthWrite:false,side:THREE.DoubleSide}));
  const boneMat=()=>mat(new THREE.MeshStandardMaterial({color:0xdde6dc,roughness:.96,metalness:0,envMapIntensity:.04,vertexColors:true,transparent:true,depthWrite:true}));
  const cylinder=geo(new THREE.CylinderGeometry(1,1,1,24));
  function mesh(g,m,parent,pos=[0,0,0],scale=[1,1,1]){const o=new THREE.Mesh(g,m);o.position.fromArray(pos);o.scale.fromArray(scale);parent.add(o);return o;}
  function link(a,b,r,m,parent){const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),v=bv.clone().sub(av);const o=mesh(cylinder,m,parent,av.add(bv).multiplyScalar(.5).toArray(),[r,v.length(),r]);o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize());return o;}
  const source=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(import.meta.env.BASE_URL+'models/spine/cervical.glb');
  source.scene.updateMatrixWorld(true);
  const prone=new THREE.Matrix4().set(-1,0,0,0, 0,0,-1,0, 0,-1,0,0, 0,0,0,1);
  const templates=[];
  for(let n=1;n<=8;n++){
    const node=source.scene.getObjectByName('T'+n);let found;
    node?.traverse(o=>{if(o.isMesh&&!found)found=o;});
    if(!found)throw new Error('Missing thoracic vertebra T'+n);
    const g=geo(found.geometry.clone());g.applyMatrix4(found.matrixWorld);g.applyMatrix4(prone);g.computeBoundingBox();
    const center=g.boundingBox.getCenter(new THREE.Vector3());g.translate(-center.x,-center.y,-center.z);g.computeBoundingBox();
    const size=g.boundingBox.getSize(new THREE.Vector3());
    // Respect the transverse shape, fitting each real vertebra into a 45 mm pitch.
    g.scale(.083/size.x,.060/size.y,.037/size.z);g.computeBoundingBox();templates.push(g);
  }
  const disposed=new Set();source.scene.traverse(o=>{if(o.isMesh){if(!disposed.has(o.geometry)){o.geometry.dispose();disposed.add(o.geometry);}for(const m of Array.isArray(o.material)?o.material:[o.material])if(!disposed.has(m)){m.dispose();disposed.add(m);}}});
  // A soft local radiograph window rather than a full-body blue rectangle.
  const data=new Uint8Array(64*64*4);
  for(let y=0;y<64;y++)for(let x=0;x<64;x++){const r=Math.sqrt(((x-31.5)/31.5)**2+((y-31.5)/31.5)**2),k=(y*64+x)*4;data[k]=4;data[k+1]=15;data[k+2]=22;data[k+3]=Math.round((1-ease(.45,1,r))*.88*255);}
  const filmTex=new THREE.DataTexture(data,64,64,THREE.RGBAFormat);filmTex.needsUpdate=true;textures.add(filmTex);
  const filmMat=mat(new THREE.MeshBasicMaterial({map:filmTex,transparent:true,depthWrite:false,side:THREE.DoubleSide}));
  const film=mesh(geo(new THREE.PlaneGeometry(.24,.34)),filmMat,group,[0,.904,.25]);film.rotation.x=-Math.PI/2;
  const crackMat=basic(0xff3535), discGeos=[],bones=[],discs=[];
  const shardGeo=geo(new THREE.TetrahedronGeometry(.0045));
  function halfGeometry(original,sign){
    // Clamp the cut boundary to a jagged seam, retaining real surface/AO detail.
    const g=geo(original.clone()),p=g.attributes.position;
    for(let i=0;i<p.count;i++){const seam=Math.sin(p.getY(i)*430+p.getZ(i)*170)*.0017;const x=p.getX(i);if(sign*x<sign*seam)p.setX(i,seam);}
    p.needsUpdate=true;g.computeVertexNormals();return g;
  }
  for(let i=0;i<17;i++){
    const lower=clamp((i-10)/6),g=templates[Math.min(i,7)],z=-.09+i*.045;
    const v=new THREE.Group();v.position.set(0,.95,z);v.scale.set(1+lower*.19,1+lower*.08,1);group.add(v);
    const m=boneMat(),body=mesh(g,m,v),split=new THREE.Group();v.add(split);split.visible=false;
    const halves=[-1,1].map(sign=>({sign,object:mesh(halfGeometry(g,sign),m,split)}));
    const cracks=new THREE.Group();v.add(cracks);cracks.visible=false;
    const pts=[[-.035,.031,-.010],[-.023,.032,-.004],[-.014,.033,-.009],[-.003,.034,.002],[.009,.033,-.005],[.021,.032,.007],[.035,.030,.001]];
    for(let j=1;j<pts.length;j++)link(pts[j-1],pts[j],.0015,crackMat,cracks);
    const shards=Array.from({length:5},()=>mesh(shardGeo,m,split));
    bones.push({object:v,body,split,halves,cracks,shards,mat:m,z});
    if(i<16){const dm=basic(0x48dafa,.85),d=mesh(cylinder,dm,group,[0,.942,z+.0225],[.028+lower*.006,.009,.019]);d.rotation.x=Math.PI/2;discs.push({object:d,mat:dm,z:z+.0225});}
  }
  const cordMat=basic(0x40b9e8,.5),cord=mesh(geo(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0,.971,-.12),new THREE.Vector3(0,.973,.28),new THREE.Vector3(0,.97,.66)]),36,.0015,5,false)),cordMat,group);
  const pulseMat=basic(0xa8ffff,.6),ring=mesh(geo(new THREE.TorusGeometry(.021,.001,5,32)),pulseMat,group,[0,.989,0]);ring.rotation.x=-Math.PI/2;
  const sphere=geo(new THREE.SphereGeometry(.002,8,6)),bubbles=Array.from({length:6},()=>mesh(sphere,pulseMat,group));
  function update({time=-1,step=0,kind='ok',position,forceTier=0}={}){
    group.visible=time>=.25&&time<2.8;if(!group.visible)return;
    const alpha=ease(.25,.48,time)*(1-ease(2.25,2.8,time));
    const target=-.05+(Number.isFinite(position)?clamp(position):[.18,.5,.82][Math.max(0,Math.min(2,step))])*.6;
    const tier=Math.max(0,Math.min(2,Math.round(forceTier))),success=kind==='ok'&&tier===0,release=ease(.55,1.16,time),opening=ease(.48,.92,time);
    const rubber=kind==='over'?Math.exp(-Math.max(0,time-.4)*3.3)*Math.sin(Math.max(0,time-.4)*21):0;
    const nearest=bones.reduce((a,b)=>Math.abs(b.z-target)<Math.abs(a.z-target)?b:a,bones[0]);
    film.position.z=target;filmMat.opacity=alpha;
    for(const b of bones){
      const dist=b.z-target,local=1-ease(.075,.16,Math.abs(dist));
      b.mat.opacity=alpha*(.035+local*.965);b.object.visible=local>.01;
      b.object.position.z=b.z+Math.sign(dist)*local*(success?release*.008:rubber*.004);
      b.object.position.y=.95-local*(success?1-release:1)*.005;
      const damaged=tier>0&&b===nearest;
      b.cracks.visible=damaged&&time>.4;b.split.visible=damaged&&tier===2;b.body.visible=!b.split.visible;
      for(const h of b.halves){h.object.position.set(h.sign*.016*opening,opening*.004,0);h.object.rotation.z=h.sign*.20*opening;}
      b.shards.forEach((s,j)=>{const a=j*2.399;s.position.set(Math.cos(a)*opening*.042,.015+Math.sin(j+1)*opening*.014,Math.sin(a)*opening*.023);s.rotation.set(j+time*.3,j*.8,j*.6);});
    }
    for(const d of discs){
      const dist=Math.abs(d.z-target),near=1-ease(.035,.105,dist),local=1-ease(.075,.15,dist);
      d.mat.color.copy(BLUE).lerp(RED,near*(success?1-release:1));d.mat.opacity=alpha*local*(.6+near*.4);
      d.object.scale.y=.009*(1-near*.60+(success?near*release*1.10:0)-near*rubber*.45);
      d.object.position.y=.942-near*(success?1-release:1)*.004;
    }
    cordMat.color.set(tier>0||kind==='over'?0xff393a:0x40b9e8);cordMat.opacity=alpha*(tier>0?.8:.32);
    // Restrict the nerve highlight to the same local window.
    cord.scale.z=.32;cord.position.z=target-.28*.32;
    crackMat.opacity=alpha*(.78+Math.sin(time*18)*.18);
    const burst=clamp((time-.67)/.55);ring.position.z=target;ring.scale.setScalar(1+burst*2.5);pulseMat.opacity=success&&time>.67?alpha*(1-burst)*.6:0;
    bubbles.forEach((b,i)=>{const a=i*2.399,r=.012+burst*.045;b.position.set(Math.cos(a)*r,.987+burst*.012,target+Math.sin(a)*r);});
  }
  function dispose(){group.removeFromParent();for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const t of textures)t.dispose();group.clear();}
  group.userData.reconstruction='Real BodyParts3D T1–T8 surfaces, reused and enlarged for a game-only thoracolumbar reconstruction';
  return {group,update,dispose};
}

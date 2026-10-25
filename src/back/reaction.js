import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import {expressionWeights} from '../core/faceRig.js';
import {PAINTED,faceDecals,updateDecals} from '../scene/faceDecals.js';

// A separate, real-model cinematic: the viewer is under the face cradle,
// looking up through its aperture. It never mutates the playing scene.
// model: an image-to-3D patient (scene/faceDecals.js PAINTED: its own head, painted faces instead of blendshapes);
// otherwise 박대리's towel-stage head
export async function createBackReaction(renderer,model=null){
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x071b17);
  const camera = new THREE.PerspectiveCamera(34, 1, .015, 8);
  const resources = new Set(), textures = new Set(), morphs = [];
  const pmrem = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment();
  const environment = pmrem.fromScene(room,.045);
  pmrem.dispose(); room.dispose(); scene.environment = environment.texture;
  function track(mesh){
    resources.add(mesh.geometry);
    for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]) resources.add(material);
    return mesh;
  }
  function box(w,h,d,color,x,y,z){
    const mesh=track(new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color,roughness:.72,metalness:.08})));
    mesh.position.set(x,y,z); scene.add(mesh); return mesh;
  }
  // A continuous oval opening leaves eyes, nose, mouth and chin unobstructed.
  const outline=new THREE.Shape(); outline.absellipse(0,0,.207,.238,0,Math.PI*2,false,0);
  const opening=new THREE.Path(); opening.absellipse(0,0,.113,.155,0,Math.PI*2,true,0); outline.holes.push(opening);
  const cushion=track(new THREE.Mesh(new THREE.ExtrudeGeometry(outline,{depth:.045,bevelEnabled:true,bevelSize:.016,bevelThickness:.012,bevelSegments:4,steps:1,curveSegments:64}),new THREE.MeshStandardMaterial({color:0xaaa994,roughness:.96,metalness:0})));
  cushion.position.set(0,.002,-.004); scene.add(cushion);
  // The near lip of the face cradle hides the head export's cut neck.
  // Its upper edge is below the chin, leaving mouth and expressions unobstructed.
  const lowerLip=box(.34,.145,.065,0x315e50,0,-.229,.115);
  lowerLip.material.roughness=.96;
  // Upholstered rim and the bed's underside visibly establish the unusual POV.
  box(.82,.075,.07,0x1c5b50,0,.253,-.045);
  box(.82,.065,.07,0x17483f,0,-.253,-.045);
  box(.055,.61,.06,0x284139,-.30,0,-.085);
  box(.055,.61,.06,0x284139,.30,0,-.085);
  const railMat=new THREE.MeshStandardMaterial({color:0x7d9289,roughness:.43,metalness:.72}); resources.add(railMat);
  for(const x of [-.265,.265]){
    const rail=track(new THREE.Mesh(new THREE.CylinderGeometry(.008,.008,.7,12),railMat));
    rail.position.set(x,-.02,-.15); rail.rotation.z=.08*Math.sign(x); scene.add(rail);
  }
  const light=new THREE.HemisphereLight(0xf4ede1,0x244b3e,.5); scene.add(light);
  const key=new THREE.DirectionalLight(0xffe8d0,.9); key.position.set(-.45,.5,1.1); scene.add(key);
  const fill=new THREE.DirectionalLight(0xb9f3e0,.3); fill.position.set(.5,-.05,.5); scene.add(fill);
  const head=new THREE.Group(); scene.add(head);
  const painted=PAINTED[model], M=import.meta.env.BASE_URL+'models/';
  const gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(painted?`${M}${model}/${model}.glb`:M+'towel-stage/patient01/patient01.glb');
  gltf.scene.position.y=painted?-(painted.crown+painted.chin)/2:-(1.625+1.358)/2;
  head.add(gltf.scene);
  const skins=[];
  let decalHead=null;
  gltf.scene.traverse(o=>{
    if(!o.isMesh)return;
    resources.add(o.geometry);
    const src=o.material, name=src.name||'';
    for(const v of Object.values(src))if(v?.isTexture)textures.add(v);
    let material=new THREE.MeshStandardMaterial({map:src.map,normalMap:src.normalMap||null,roughness:.6,metalness:0,envMapIntensity:.17});
    if(painted&&name.endsWith('.body')){
      // the scan's own texture (no normal map); the paintings clone this material (faceDecals)
      material=new THREE.MeshStandardMaterial({map:src.map,roughness:.6,metalness:0,envMapIntensity:.12,emissive:0xff6b50,emissiveIntensity:0,side:THREE.DoubleSide}); skins.push(material);
      decalHead={id:model,skinMesh:o,skin:material};
    }else if(name.endsWith('.body')){
      material=new THREE.MeshPhysicalMaterial({map:src.map,normalMap:src.normalMap||null,roughness:.57,metalness:0,sheen:.4,sheenColor:new THREE.Color(0xb04030),sheenRoughness:.65,specularIntensity:.42,envMapIntensity:.12,emissive:0xff6b50,emissiveIntensity:0}); skins.push(material);
    }else if(name.endsWith('.cornea')){
      material=new THREE.MeshPhysicalMaterial({color:0x000000,roughness:.05,transparent:true,opacity:.16,depthWrite:false,envMapIntensity:.8});
    }else if(name.endsWith('.high-poly')){
      material.roughness=.32; material.alphaTest=.5; material.emissive=new THREE.Color(0xffffff); material.emissiveMap=src.map; material.emissiveIntensity=.08;
    }else if(/\.(short0\d|long0\d|bob0\d|ponytail0\d|braid0\d|afro0\d)$/.test(name)){
      material.color.set(0x4a3a30); material.envMapIntensity=.12; material.alphaTest=.35; material.alphaToCoverage=true; material.side=THREE.DoubleSide; material.depthWrite=true;
    }else if(name.includes('teeth')){
      material.color.set(0xb8ad99); material.roughness=.55;
    }else if(name.includes('tongue')){
      material.color.set(0xb0a0a0);
    }else{
      material.transparent=true; material.depthWrite=false; material.alphaTest=.02; material.side=THREE.DoubleSide;
    }
    resources.add(src); resources.add(material); o.material=material; o.frustumCulled=false;
    if(o.morphTargetDictionary)morphs.push(o);
  });
  if(decalHead){
    faceDecals(decalHead,painted.face,gltf.scene,M);
    for(const {mesh} of decalHead.decals){resources.add(mesh.geometry);resources.add(mesh.material);textures.add(mesh.material.map);}
  }
  let lastNow=null, previousTime=-1;
  const clamp=THREE.MathUtils.clamp;
  function update({time=0,kind='ok',forceTier=0,force=1,now=time*1000,faceName='rest'}={}){
    const t=Math.max(0,time), fresh=t<previousTime||lastNow===null;
    const dt=fresh?1/30:clamp((now-lastNow)/1000,0,.1);
    lastNow=now; previousTime=t;
    const fracture=forceTier>=2, hairline=forceTier===1, success=kind==='ok'&&!forceTier;
    const weak=kind==='weak'&&!forceTier;
    // a painted face rests with its eyes open and blinking (faceRig "idle", as in the neck modes)
    const face=decalHead&&faceName==='rest'?'idle':faceName, blink=!fracture&&(t%3.1>2.63&&t%3.1<2.75);
    const breath=fracture?.65+.3*Math.sin(t*10):hairline?.25+.15*Math.sin(t*6):Math.max(0,Math.sin(t*2.1))*.22;
    // Keep the original clinic's expression units; layer only the physical strength of the reaction.
    const weights=expressionWeights(face,blink,t,Math.max(0,breath));
    const mix=fresh?1:1-Math.exp(-dt*15), settle=1-Math.exp(-t*2.2);
    if(fracture){
      weights['mouth-open']=.65+.065*Math.sin(t*10);
      weights['mouth-compression']=0;
      weights['mouth-corner-puller']=0;
      for(const side of ['left','right']){
        if(t>=.25){weights[`eye-${side}-closure`]=1;weights[`eye-${side}-slit`]=1;weights[`eye-${side}-opened-up`]=0;}
        weights[`eyebrows-${side}-down`]=t>=.25?1:weights[`eyebrows-${side}-down`];
        weights[`nose-${side}-elevation`]=.7;
      }
    }else if(hairline){
      const wince=Math.max(0,Math.sin(t*7))*Math.exp(-t*.8);
      weights['mouth-open']=Math.min(weights['mouth-open'],.20+.06*wince);
      weights['mouth-compression']=Math.max(weights['mouth-compression'],.7-.15*settle);
      weights['mouth-corner-puller']=0;
      for(const side of ['left','right']){
        weights[`eye-${side}-closure`]=Math.max(weights[`eye-${side}-closure`],.7+.3*wince);
        weights[`eyebrows-${side}-down`]=Math.max(weights[`eyebrows-${side}-down`],.65);
      }
    }else if(weak){
      weights['mouth-corner-puller']=Math.min(weights['mouth-corner-puller'],.08);
      weights['mouth-compression']=Math.max(weights['mouth-compression'],.35);
    }else if(success&&t<.65){
      weights['mouth-pursing']=Math.max(weights['mouth-pursing'],.36*(1-t/.65));
    }
    for(const mesh of morphs)for(const [name,value]of Object.entries(weights)){
      const i=mesh.morphTargetDictionary[name]; if(i!==undefined)mesh.morphTargetInfluences[i]+=(value-mesh.morphTargetInfluences[i])*mix;
    }
    if(decalHead)updateDecals(decalHead,weights,mix);
    const strength=clamp(Number.isFinite(force)?force:1,.5,4);
    const flinch=Math.exp(-t*7)*Math.sin(t*28)*(weak?.0015:.005+strength*.001);
    const tremor=fracture?(Math.sin(t*29)+.35*Math.sin(t*47))*.0017:hairline?Math.sin(t*19)*.0015*Math.exp(-t*1.4):0;
    const exhale=success?settle*.004:0;
    head.position.set(tremor,-.006-exhale+Math.sin(t*(fracture?10:2.1))*(fracture?.0018:.0012),flinch-exhale*.6);
    const tilt=weak?settle*.045:fracture?Math.sin(t*23)*.015:hairline?Math.sin(t*15)*.009*Math.exp(-t):Math.sin(t*.9)*.008;
    head.rotation.set(-.035+(success?settle*.025:0)+flinch*.7,weak?settle*.025:Math.sin(t*1.3)*.01,tilt);
    cushion.position.z=-.004+flinch*.2;
    for(const skin of skins){
      // A mild diffuse flush rather than a glowing red mask; original skin detail stays intact.
      skin.color.setRGB(1,fracture?.94:hairline?.98:1,fracture?.92:hairline?.97:1);
      skin.emissiveIntensity=fracture?.014:hairline?.006*Math.exp(-t):0;
    }
    // Slow, restrained push-in rather than a jump during the change of expression.
    const distance=camera.userData.baseDistance||.69;
    camera.position.set(.008,-.038,distance-Math.min(t,2)*.008);
    camera.lookAt(0,-.012,.025);
  }
  function resize(width,height){
    camera.aspect=width/Math.max(1,height);
    // A landscape close-up leaves space at the sides for the speech bubble.
    camera.userData.baseDistance=camera.aspect<1?.91:.69;
    camera.updateProjectionMatrix();
    camera.position.set(.008,-.038,camera.userData.baseDistance);camera.lookAt(0,-.012,.025);
  }
  function dispose(){
    for(const resource of resources)resource.dispose();
    for(const texture of textures)texture.dispose();
    environment.dispose(); scene.clear();
  }
  resize(812,375); update({time:0,kind:'ok',now:0});
  return {scene,camera,update,resize,dispose};
}

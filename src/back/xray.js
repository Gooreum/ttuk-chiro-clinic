import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import {therapistStyle} from './therapistMotion.js';
import {clinicFilm,pressedSegment,TARGETS} from './core.js';
import {createClinicXray} from 'virtual:clinic-xray';

/* Adapter only. Rendering, film, disc release, bubbles and fracture animation run
   through the original clinic x-ray engine, supplied verbatim by the Vite factory.
   The active chain consists exclusively of actual BodyParts3D T1–T8 bones/discs.
   No copied/enlarged thoracic bones or procedural replacement discs are used. */
const clamp=v=>Math.max(0,Math.min(1,v));
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};

/* Soft-tissue density reference: PA chest/abdominal radiographs, Radiology Assistant
   https://radiologyassistant.nl/chest/chest-x-ray/basic-interpretation
   Surfaces below are real BodyParts3D meshes; only the rupture overlay is stylized. */
function organMaterial(id,centre,size){
  const lung=id.startsWith('lung'),bowel=id==='bowel';
  const U={organCentre:{value:centre},organSize:{value:size},organTime:{value:0},organDamage:{value:0},
    organAir:{value:lung?1:bowel?.5:0},organDense:{value:id==='heart'?1:0},
    organCoral:{value:new THREE.Color(0xff7a59).convertSRGBToLinear()}};
  const mat=new THREE.MeshBasicMaterial({color:lung?0x17312c:0xf4efe4,transparent:true,opacity:0,depthWrite:false,depthTest:false,side:THREE.FrontSide,toneMapped:false});
  mat.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,U);
    shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
      uniform vec3 organCentre,organSize; varying vec3 vOrgan,vOrganNormal,vOrganView;`)
      .replace('#include <begin_vertex>',`#include <begin_vertex>
        vOrgan=(position-organCentre)/organSize;
        vOrganNormal=normalize(normalMatrix*normal);`)
      .replace('#include <project_vertex>',`#include <project_vertex>
        vOrganView=-mvPosition.xyz;`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      uniform float organTime,organDamage,organAir,organDense; uniform vec3 organCoral;
      varying vec3 vOrgan,vOrganNormal,vOrganView;`)
      .replace('#include <tonemapping_fragment>',`
        float rim=pow(1.0-abs(dot(normalize(vOrganNormal),normalize(vOrganView))),2.0);
        float gas=sin(vOrgan.x*87.0+sin(vOrgan.z*73.0)*1.2)*sin(vOrgan.z*101.0+vOrgan.x*12.0);
        float density=organAir>.75?.12+rim*.26:organAir>.25?.15+.025*gas:.28+rim*.12;
        vec3 tissue=organAir>.75?mix(vec3(.012,.04,.032),vec3(.20,.39,.32),rim*.4):gl_FragColor.rgb;
        if(organAir>.25&&organAir<.75)tissue*=.78+.025*gas;
        float pulse=.88+.12*sin(organTime*11.0);
        // Filled silhouettes, with a denser heart on the patient's left.
        vec3 injured=organCoral*(.88+.32*rim)*pulse*(1.0-organDense*.45);
        float injuredDensity=(organAir>.75?.64:.76)+rim*.16+organDense*.12;
        gl_FragColor.rgb=mix(tissue,injured,organDamage);
        gl_FragColor.a*=mix(density,injuredDensity*(.94+.06*pulse),organDamage);
        #include <tonemapping_fragment>`);
  };
  mat.customProgramCacheKey=()=>`back-organ-density-v2`;
  return {mat,U};
}

// Camera-facing damage decal: closed organ surfaces contain overlapping walls.
// Projecting the fissure onto those walls makes several competing zigzags. One
// small billboard per organ keeps the branching crack and pooled bleed legible.
function ruptureMaterial(){
  return new THREE.ShaderMaterial({transparent:true,depthWrite:false,depthTest:false,toneMapped:false,
    uniforms:{amount:{value:0},time:{value:0},coral:{value:new THREE.Color(0xff7a59).convertSRGBToLinear()},dark:{value:new THREE.Color(0x17312c).convertSRGBToLinear()}},
    vertexShader:`varying vec2 vUv;
      void main(){
        vUv=uv;
        vec4 centre=modelViewMatrix*vec4(0.0,0.0,0.0,1.0);
        centre.xy+=position.xy*vec2(length(modelMatrix[0].xyz),length(modelMatrix[1].xyz));
        gl_Position=projectionMatrix*centre;
      }`,
    fragmentShader:`uniform float amount,time; uniform vec3 coral,dark; varying vec2 vUv;
      float segment(vec2 p,vec2 a,vec2 b){vec2 ab=b-a;return length(p-a-ab*clamp(dot(p-a,ab)/dot(ab,ab),0.0,1.0));}
      void main(){
        vec2 p=vUv-.5;
        float d=segment(p,vec2(-.44,-.08),vec2(-.22,.07));
        d=min(d,segment(p,vec2(-.22,.07),vec2(-.09,-.04)));
        d=min(d,segment(p,vec2(-.09,-.04),vec2(.07,.08)));
        d=min(d,segment(p,vec2(.07,.08),vec2(.24,-.04)));
        d=min(d,segment(p,vec2(.24,-.04),vec2(.44,.10)));
        d=min(d,segment(p,vec2(-.09,-.04),vec2(-.14,-.24)));
        d=min(d,segment(p,vec2(.07,.08),vec2(.19,.30)));
        float grow=1.0-exp(-time*5.0);
        float r=length((p-vec2(.015,.015))/vec2(.23,.18));
        float pool=(1.0-smoothstep(.55,1.0,r+.11*sin(p.x*38.0)*sin(p.y*32.0)))*grow;
        float glow=exp(-dot(p,p)*19.0)*grow;
        float halo=1.0-smoothstep(.022,.045,d);
        float crack=1.0-smoothstep(.008,.016,d);
        vec3 color=mix(coral,dark,pool*.72);
        color=mix(color,coral,halo);
        color=mix(color,dark,crack*.96);
        float pulse=.88+.12*sin(time*11.0);
        gl_FragColor=vec4(color,amount*pulse*max(glow*.48,max(pool*.94,halo*.96)));
        #include <encodings_fragment>
      }`});
}

function createOrgans(source,scene){
  const group=new THREE.Group();group.name='BackOrganXray';group.visible=false;scene.add(group);
  source.scene.updateMatrixWorld(true);
  const t1=source.scene.getObjectByName('ref_T1').getWorldPosition(new THREE.Vector3());
  const l5=source.scene.getObjectByName('ref_L5').getWorldPosition(new THREE.Vector3());
  const length=t1.y-l5.y,scale=.6/length;
  const entries=[];
  const markGeometry=new THREE.PlaneGeometry(1,1);
  source.scene.traverse(o=>{
    if(!o.isMesh)return;
    const geometry=o.geometry.clone();
    const raw=geometry.attributes.position,float=new Float32Array(raw.count*3);
    for(let i=0;i<raw.count;i++){float[i*3]=raw.getX(i);float[i*3+1]=raw.getY(i);float[i*3+2]=raw.getZ(i);}
    geometry.setAttribute('position',new THREE.BufferAttribute(float,3));geometry.applyMatrix4(o.matrixWorld);
    const a=geometry.attributes.position,positions=new Float32Array(a.count*3);
    // Prone posterior projection: patient left +x, superior -z, anterior -y.
    // The AP reflection is deliberate; reverse winding so front faces stay outward.
    for(let i=0;i<a.count;i++){
      positions[i*3]=(a.getX(i)-t1.x)*1.5;
      positions[i*3+1]=.92-(a.getZ(i)-t1.z)*.22;
      positions[i*3+2]=-.05+(t1.y-a.getY(i))*scale;
    }
    geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
    if(geometry.index){const ix=geometry.index;for(let i=0;i<ix.count;i+=3){const b=ix.getX(i+1);ix.setX(i+1,ix.getX(i+2));ix.setX(i+2,b);}ix.needsUpdate=true;}
    geometry.deleteAttribute('normal');geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
    const centre=geometry.boundingBox.getCenter(new THREE.Vector3()),size=geometry.boundingBox.getSize(new THREE.Vector3());
    const {mat,U}=organMaterial(o.name,centre,size);
    const mesh=new THREE.Mesh(geometry,mat);mesh.name=o.name;mesh.renderOrder=998.5;mesh.frustumCulled=false;group.add(mesh);
    const mark=new THREE.Mesh(markGeometry,ruptureMaterial());mark.name=o.name+'_rupture';
    mark.position.copy(centre);mark.renderOrder=o.name==='heart'?1000.95:1000.85;mark.frustumCulled=false;mesh.add(mark);
    const markSize=Math.min(.13,Math.min(size.x,size.z)*.82);mark.scale.setScalar(markSize);
    entries.push({id:o.name,mesh,mat,U,mark,box:geometry.boundingBox.clone()});
  });
  function update(ids,amount,fractureTime,worldZ){
    group.visible=ids.length>0&&amount>0;
    const damage=smooth(0,.12,fractureTime-.35);
    for(const e of entries){
      const hit=ids.includes(e.id);
      // Only faint nearby context; it must never paint over a ruptured organ.
      const near=Math.abs(e.U.organCentre.value.z-worldZ)<=.12;
      e.mesh.visible=group.visible&&(near||hit);
      e.mat.opacity=e.mesh.visible?amount*(hit?.94:e.id==='bowel'?.045:.14):0;
      // Above context and bone surfaces, below the existing fracture flashes.
      // Heart last: its denser silhouette stays on the patient's left lung.
      e.mesh.renderOrder=hit?(e.id==='heart'?1000.7:1000.5):998.5;
      e.U.organDamage.value=hit?damage:0;e.U.organTime.value=Math.max(0,fractureTime-.35);
      e.mark.visible=e.mesh.visible&&hit&&damage>0;
      e.mark.material.uniforms.amount.value=hit?amount*damage:0;
      e.mark.material.uniforms.time.value=e.U.organTime.value;
    }
  }
  function framing(ids,worldZ){
    const box=new THREE.Box3(new THREE.Vector3(-.075,.90,worldZ-.12),new THREE.Vector3(.075,.96,worldZ+.12));
    for(const e of entries)if(ids.includes(e.id))box.union(e.box);
    return box;
  }
  return {group,update,framing,opacity:()=>Math.max(0,...entries.map(e=>e.mat.opacity))};
}

export async function createBackXray({scene,camera,env,renderer}){
  const pivot=new THREE.Group();pivot.name='BackClinicXrayAdapter';scene.add(pivot);
  if(renderer)renderer.localClippingEnabled=true;
  const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const [source,organSource]=await Promise.all([loader.loadAsync(import.meta.env.BASE_URL+'models/spine/cervical.glb'),loader.loadAsync(import.meta.env.BASE_URL+'models/back/organs.glb')]);
  const organLayer=createOrgans(organSource,scene);
  source.scene.updateMatrixWorld(true);
  const adapted=new THREE.Group();adapted.name='ThoracicEngineInput';
  const geometries=new Set();
  const worldPosition=name=>{const node=source.scene.getObjectByName(name);if(!node)throw new Error('Missing anatomical part '+name);return node.getWorldPosition(new THREE.Vector3());};
  const oldLevels=Array.from({length:8},(_,i)=>worldPosition(i<7?'C'+(i+1):'T1'));
  const thoracicLevels=Array.from({length:8},(_,i)=>worldPosition('T'+(i+1)));
  const yOffset=.107-thoracicLevels[0].y;
  function nervePoint(p){
    let i=0;while(i<6&&p.y<oldLevels[i+1].y)i++;
    const t=(oldLevels[i].y-p.y)/(oldLevels[i].y-oldLevels[i+1].y);
    const next=thoracicLevels[i].clone().lerp(thoracicLevels[i+1],t),previous=oldLevels[i].clone().lerp(oldLevels[i+1],t);
    return new THREE.Vector3(p.x,next.y+yOffset,p.z+next.z-previous.z);
  }
  function floatGeometry(mesh){
    const geometry=mesh.geometry.clone();
    for(const key of ['position','normal']){
      const a=geometry.attributes[key];if(!a)continue;
      const array=new Float32Array(a.count*3);for(let i=0;i<a.count;i++){array[i*3]=a.getX(i);array[i*3+1]=a.getY(i);array[i*3+2]=a.getZ(i);}
      geometry.setAttribute(key,new THREE.BufferAttribute(array,3));
    }
    geometry.applyMatrix4(mesh.matrixWorld);geometries.add(geometry);return geometry;
  }
  function part(oldName,newName,nerve=false){
    const original=source.scene.getObjectByName(oldName);if(!original)throw new Error('Missing anatomical part '+oldName);
    const origin=worldPosition(oldName),destination=nerve?nervePoint(origin):origin.clone().add(new THREE.Vector3(0,yOffset,0));
    const node=new THREE.Group();node.name=newName;node.position.copy(destination);adapted.add(node);
    original.traverse(mesh=>{
      if(!mesh.isMesh)return;
      const geometry=floatGeometry(mesh);
      if(nerve){const p=geometry.attributes.position;for(let i=0;i<p.count;i++){const point=nervePoint(new THREE.Vector3(p.getX(i),p.getY(i),p.getZ(i)));p.setXYZ(i,point.x,point.y,point.z);}p.needsUpdate=true;geometry.computeVertexNormals();}
      else geometry.translate(0,yOffset,0);
      geometry.translate(-destination.x,-destination.y,-destination.z);
      const copy=new THREE.Mesh(geometry,mesh.material);copy.name=newName+'_actual_surface';node.add(copy);
    });
  }
  for(let i=1;i<=7;i++)part('T'+i,'C'+i);
  part('T8','T1');
  // Engine D[1..6] means C2/3..C7/T1: map actual T2/3..T7/8.
  for(let i=2;i<=7;i++)part(`Disc_T${i}_T${i+1}`,`Disc_C${i}_${i<7?'C'+(i+1):'T1'}`);
  for(let i=0;i<7;i++)for(const side of ['L','R'])part(`Root_${i}_${side}`,`Root_${i}_${side}`,true);
  part('Cord','Cord',true);
  adapted.updateMatrixWorld(true);
  const engine=createClinicXray({pivot,scene,camera,loadModel:async()=>({scene:adapted}),getEnv:async()=>env||null});
  await engine.loadSpine();
  // The original engine bakes its own geometry/materials. Keep source resources
  // alive until disposal so async model initialization remains safe.
  const target={name:'박대리',seg:3,side:1,xr:'disc'};
  function update({time=-1,step=0,kind='ok',position,forceTier=0,force=1,organs=[]}={}){
    const tier=Math.max(0,Math.min(2,Math.round(forceTier))),fracture=tier>0,success=kind==='ok'&&!fracture;
    const amount=clinicFilm(time,kind,tier,force);
    time-=therapistStyle(force,tier).xrayDelay;
    target.seg=pressedSegment(Number.isFinite(position)?position:TARGETS[Math.max(0,Math.min(2,step))]);
    const worldZ=-.05+(Number.isFinite(position)?clamp(position):[.18,.5,.82][Math.max(0,Math.min(2,step))])*.6;
    pivot.position.set(0,.95,worldZ-engine.XRAY_LEVEL(target.seg-1));
    organLayer.update(organs,amount,time-.45,worldZ);
    const crackT=success?time-.7:-1;
    engine.updateXray(Math.max(0,time)*1000,amount,crackT,success?0:Math.max(0,1-Math.max(0,time-.7)*1.4),target,fracture?{lvl:tier,t:time-.45}:null,null);
  }
  function dispose(){
    const allGeometry=new Set(geometries),allMaterials=new Set(),allTextures=new Set();
    function collect(root){root.traverse(o=>{if(o.geometry)allGeometry.add(o.geometry);if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material]){allMaterials.add(m);for(const value of Object.values(m))if(value?.isTexture&&value!==env)allTextures.add(value);}});}
    collect(pivot);collect(source.scene);collect(engine.film);collect(organLayer.group);collect(organSource.scene);
    engine.film.removeFromParent();pivot.removeFromParent();organLayer.group.removeFromParent();
    for(const g of allGeometry)g.dispose();for(const m of allMaterials)m.dispose();for(const t of allTextures)t.dispose();pivot.clear();
  }
  pivot.userData.anatomy='Actual T1–T8 and T2/3–T7/8 discs; original clinic x-ray engine';
  return {group:pivot,update,dispose,organFraming:organLayer.framing,organOpacity:organLayer.opacity};
}

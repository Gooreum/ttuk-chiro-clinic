import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import {clinicFilm} from './core.js';
import {createClinicXray} from 'virtual:clinic-xray';

/* Adapter only. Rendering, film, disc release, bubbles and fracture animation run
   through the original clinic x-ray engine, supplied verbatim by the Vite factory.
   The active chain consists exclusively of actual BodyParts3D T1–T8 bones/discs.
   No copied/enlarged thoracic bones or procedural replacement discs are used. */
const clamp=v=>Math.max(0,Math.min(1,v));
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};

export async function createBackXray({scene,camera,env,renderer}){
  const pivot=new THREE.Group();pivot.name='BackClinicXrayAdapter';scene.add(pivot);
  if(renderer)renderer.localClippingEnabled=true;
  const source=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(import.meta.env.BASE_URL+'models/spine/cervical.glb');
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
  function update({time=-1,step=0,kind='ok',position,forceTier=0}={}){
    const tier=Math.max(0,Math.min(2,Math.round(forceTier))),fracture=tier>0,success=kind==='ok'&&!fracture;
    const amount=clinicFilm(time,kind,tier);
    target.seg=[3,4,5][Math.max(0,Math.min(2,step))];
    const worldZ=-.05+(Number.isFinite(position)?clamp(position):[.18,.5,.82][Math.max(0,Math.min(2,step))])*.6;
    pivot.position.set(0,.95,worldZ-engine.XRAY_LEVEL(target.seg-1));
    const crackT=success?time-.7:-1;
    engine.updateXray(Math.max(0,time)*1000,amount,crackT,success?0:Math.max(0,1-Math.max(0,time-.7)*1.4),target,fracture?{lvl:tier,t:time-.45}:null,null);
  }
  function dispose(){
    const allGeometry=new Set(geometries),allMaterials=new Set(),allTextures=new Set();
    function collect(root){root.traverse(o=>{if(o.geometry)allGeometry.add(o.geometry);if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material]){allMaterials.add(m);for(const value of Object.values(m))if(value?.isTexture&&value!==env)allTextures.add(value);}});}
    collect(pivot);collect(source.scene);collect(engine.film);
    engine.film.removeFromParent();pivot.removeFromParent();
    for(const g of allGeometry)g.dispose();for(const m of allMaterials)m.dispose();for(const t of allTextures)t.dispose();pivot.clear();
  }
  pivot.userData.anatomy='Actual T1–T8 and T2/3–T7/8 discs; original clinic x-ray engine';
  return {group:pivot,update,dispose};
}

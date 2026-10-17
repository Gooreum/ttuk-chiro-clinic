import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import {therapistStyle} from './therapistMotion.js';
import {clinicFilm,pressedSegment,TARGETS} from './core.js';
import {organTagName} from './organs.js';
import {createClinicXray} from 'virtual:clinic-xray';

/* Adapter only. Rendering, film, disc release, bubbles and fracture animation run
   through the original clinic x-ray engine, supplied verbatim by the Vite factory.
   The active chain consists exclusively of actual BodyParts3D T1–T8 bones/discs.
   No copied/enlarged thoracic bones or procedural replacement discs are used. */
const clamp=v=>Math.max(0,Math.min(1,v));
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};

// Actual BodyParts3D surfaces: smooth transmitted density and broad paper rims.
function organMaterial(id,centre,size,bleed=false){
  const lung=id.startsWith('lung'),bowel=id==='bowel';
  const U={organCentre:{value:centre},organSize:{value:size},organTime:{value:0},organDamage:{value:0},
    organAmount:{value:0},organFill:{value:lung?.05:bowel?.06:id==='stomach'?.10:id==='heart'?.18:.15},
    organPower:{value:bleed?(id.startsWith('kidney')?.2:.5):1.35},organBleed:{value:bleed?1:0},
    organColor:{value:new THREE.Color(0xf4efe4).convertSRGBToLinear()},
    organCoral:{value:new THREE.Color(0xff7a59).convertSRGBToLinear()}};
  const mat=new THREE.ShaderMaterial({transparent:true,opacity:0,blending:THREE.NormalBlending,
    depthWrite:false,depthTest:!bleed,side:THREE.DoubleSide,toneMapped:false,uniforms:U,
    vertexShader:`uniform vec3 organCentre,organSize; varying vec3 vOrgan,vOrganNormal,vOrganView;
      void main(){
        vOrgan=(position-organCentre)/organSize;
        // Undo the AP depth compression for shading; it must not crush every rim
        // down to a subpixel line. Geometry remains registered to the spine.
        vOrganNormal=normalize(normalMatrix*vec3(normal.x,normal.y*.16,normal.z));
        vec4 mv=modelViewMatrix*vec4(position,1.0);vOrganView=-mv.xyz;
        gl_Position=projectionMatrix*mv;
      }`,
    fragmentShader:`uniform float organTime,organDamage,organAmount,organFill,organPower,organBleed;
      uniform vec3 organColor,organCoral; varying vec3 vOrgan,vOrganNormal,vOrganView;
      float segment(vec2 p,vec2 a,vec2 b){vec2 ab=b-a;return length(p-a-ab*clamp(dot(p-a,ab)/dot(ab,ab),0.0,1.0));}
      void main(){
        float edge=1.0-abs(dot(normalize(vOrganNormal),normalize(vOrganView)));
        float rim=pow(edge,mix(organPower,1.2,organDamage));
        rim=mix(rim,smoothstep(.02,.50,rim),organDamage);
        float pulse=.94+.06*sin(organTime*9.0);
        if(organBleed>.5){
          gl_FragColor=vec4(organCoral,organAmount*organDamage*pow(edge,organPower)*.78*pulse);
        }else{
          float fill=mix(organFill,.28+.07*pow(edge,.7),organDamage);
          float alpha=fill+(1.0-fill)*rim;
          vec2 p=vOrgan.xz;
          float d=segment(p,vec2(-.42,-.12),vec2(-.23,.04));
          d=min(d,segment(p,vec2(-.23,.04),vec2(-.10,-.06)));
          d=min(d,segment(p,vec2(-.10,-.06),vec2(.08,.10)));
          d=min(d,segment(p,vec2(.08,.10),vec2(.23,-.03)));
          d=min(d,segment(p,vec2(.23,-.03),vec2(.42,.14)));
          d=min(d,segment(p,vec2(-.10,-.06),vec2(-.16,-.27)));
          d=min(d,segment(p,vec2(.08,.10),vec2(.17,.30)));
          float fissure=(1.0-smoothstep(.012,.032,d))*organDamage;
          float glow=exp(-d*26.0)*organDamage*.20;
          vec3 color=mix(organColor,organCoral,organDamage);
          color=mix(color,organCoral,fissure);
          alpha=max(alpha+glow,fissure);
          gl_FragColor=vec4(color,organAmount*min(1.0,alpha)*mix(1.0,pulse,organDamage));
        }
        #include <encodings_fragment>
      }`});
  return {mat,U};
}

function organTag(id){
  const text=organTagName(id),canvas=document.createElement('canvas'),g=canvas.getContext('2d');
  const font='34px "Black Han Sans", sans-serif';g.font=font;
  const width=Math.ceil(g.measureText(text).width/2)+24,height=32;
  canvas.width=width*2;canvas.height=height*2;
  const texture=new THREE.CanvasTexture(canvas);texture.encoding=THREE.sRGBEncoding;
  let alive=true;texture.addEventListener('dispose',()=>{alive=false;});
  function draw(){
    if(!alive)return;
    g.clearRect(0,0,canvas.width,canvas.height);g.fillStyle='#17312c';g.strokeStyle='#ff7a59';g.lineWidth=2;
    const w=canvas.width,h=canvas.height,r=14;
    g.beginPath();g.moveTo(r,1);g.arcTo(w-1,1,w-1,h-1,r);g.arcTo(w-1,h-1,1,h-1,r);
    g.arcTo(1,h-1,1,1,r);g.arcTo(1,1,w-1,1,r);g.closePath();g.fill();g.stroke();
    g.font=font;g.textAlign='center';g.textBaseline='middle';g.fillStyle='#f4efe4';g.fillText(text,w/2,h/2+2);
    texture.needsUpdate=true;
  }
  draw();document.fonts?.ready.then(draw);
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthWrite:false,depthTest:false,toneMapped:false}));
  sprite.name=id+'_tag';sprite.renderOrder=1003;sprite.frustumCulled=false;sprite.visible=false;
  const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3()]),
    new THREE.LineBasicMaterial({color:0xff7a59,transparent:true,opacity:0,depthWrite:false,depthTest:false,toneMapped:false}));
  line.renderOrder=1002.5;line.frustumCulled=false;line.visible=false;
  return {sprite,line,text,width,height};
}

function createOrgans(source,scene){
  const group=new THREE.Group();group.name='BackOrganXray';group.visible=false;scene.add(group);
  source.scene.updateMatrixWorld(true);
  const t1=source.scene.getObjectByName('ref_T1').getWorldPosition(new THREE.Vector3());
  const l5=source.scene.getObjectByName('ref_L5').getWorldPosition(new THREE.Vector3());
  const length=t1.y-l5.y,scale=.6/length;
  const entries=[];let hitIds=[];
  // Posterior film layers: retain the heart over the left lung and the kidneys
  // over the bowel, instead of relying on the GLB's arbitrary object order.
  const layerOrder=['lungL','lungR','bowel','liver','kidneyL','kidneyR','stomach','spleen','heart'];
  const surfaces=[];source.scene.traverse(o=>{if(o.isMesh)surfaces.push(o);});
  surfaces.sort((a,b)=>layerOrder.indexOf(a.name)-layerOrder.indexOf(b.name));
  for(const o of surfaces){
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
    // Film clears depth at 998; the engine's bones start at 999.
    // A per-organ depth pass selects just its visible skin. In particular the
    // bowel's overlapping internal walls must not accumulate into green static.
    const order=998.3+entries.length*.025;
    const depth=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({colorWrite:false,depthWrite:true,depthTest:true,transparent:true,side:THREE.DoubleSide,
      stencilWrite:true,stencilRef:1,stencilFunc:THREE.AlwaysStencilFunc,stencilZPass:THREE.ReplaceStencilOp}));
    depth.renderOrder=order;depth.frustumCulled=false;
    depth.onBeforeRender=r=>{
      r.state.buffers.depth.setMask(true);r.state.buffers.stencil.setMask(0xff);
      r.clear(false,true,true);
    };group.add(depth);
    const mesh=new THREE.Mesh(geometry,mat);mesh.name=o.name;mesh.renderOrder=order+.01;mesh.frustumCulled=false;group.add(mesh);
    const bleedMat=organMaterial(o.name,centre,size,true),bleed=new THREE.Mesh(geometry,bleedMat.mat);
    // Bleed stays outside the actual silhouette. Otherwise it accumulates under
    // the .28–.35 interior and turns translucent ruptures into solid red blobs.
    Object.assign(bleed.material,{stencilWrite:true,stencilWriteMask:0,stencilRef:1,stencilFunc:THREE.NotEqualStencilFunc});
    bleed.name=o.name+'_bleed';bleed.renderOrder=order+.005;bleed.frustumCulled=false;group.add(bleed);
    const tag=organTag(o.name);group.add(tag.sprite,tag.line);
    const side=['lungR','liver','kidneyR','bowel'].includes(o.name)?-1:1;
    entries.push({id:o.name,order,mesh,depth,mat,U,bleed,bleedU:bleedMat.U,tag,side,box:geometry.boundingBox.clone(),hit:false});
  }
  function update(ids,amount,fractureTime){
    group.visible=ids.length>0&&amount>0;
    hitIds=ids.filter(id=>entries.some(e=>e.id===id));
    const damage=smooth(0,.12,fractureTime-.35);
    for(const e of entries){
      const hit=e.hit=ids.includes(e.id);
      // Injured anatomy must remain visible through healthy overlapping organs.
      const order=e.order+(hit?.3:0);
      e.bleed.renderOrder=order+.005;e.depth.renderOrder=order;e.mesh.renderOrder=order+.01;
      e.mesh.visible=e.depth.visible=group.visible;
      e.mat.opacity=group.visible?amount:0;
      e.U.organAmount.value=e.mat.opacity;
      e.U.organDamage.value=hit?damage:0;e.U.organTime.value=Math.max(0,fractureTime-.35);
      e.bleed.visible=group.visible&&hit&&damage>0;
      const halo=e.id.startsWith('kidney')?1.45:.22;
      const spread=1+halo*damage*(1-Math.exp(-e.U.organTime.value*4))*(1+.15*Math.sin(e.U.organTime.value*9));
      e.bleed.scale.setScalar(spread);e.bleed.position.copy(e.U.organCentre.value).multiplyScalar(1-spread);
      e.bleedU.organDamage.value=hit?damage:0;e.bleedU.organAmount.value=e.mat.opacity;e.bleedU.organTime.value=e.U.organTime.value;
      e.tag.sprite.visible=e.tag.line.visible=group.visible&&hit&&damage>0;
      e.tag.sprite.material.opacity=amount*damage;e.tag.line.material.opacity=amount*damage*.7;
    }
  }
  function framing(){
    // Fit the organ union, without padding for the long spinal cord or target.
    const box=new THREE.Box3();
    for(const e of entries)box.union(e.box);
    return box;
  }
  function layout(camera,width,height){
    if(!group.visible)return;
    camera.updateMatrixWorld(true);
    const project=p=>{const q=p.clone().project(camera);return new THREE.Vector3((q.x+1)*width/2,(1-q.y)*height/2,q.z);};
    const unproject=(x,y,z)=>new THREE.Vector3(x/width*2-1,1-y/height*2,z).unproject(camera);
    const bounds={left:width,right:0};
    for(const e of entries)for(const x of [e.box.min.x,e.box.max.x])for(const z of [e.box.min.z,e.box.max.z]){
      const p=project(new THREE.Vector3(x,e.U.organCentre.value.y,z));bounds.left=Math.min(bounds.left,p.x);bounds.right=Math.max(bounds.right,p.x);
    }
    for(const side of [-1,1]){
      const tags=entries.filter(e=>e.side===side&&e.tag.sprite.visible).map(e=>{
        const anchor=e.U.organCentre.value.clone();anchor.x+=side*e.box.getSize(new THREE.Vector3()).x*.32;
        return {e,anchor,p:project(anchor)};
      }).sort((a,b)=>a.p.y-b.p.y);
      const top=Math.min(100,height*.25),bottom=height-24,gap=42;
      for(let i=0;i<tags.length;i++)tags[i].y=Math.max(top,Math.min(bottom,tags[i].p.y),i?tags[i-1].y+gap:top);
      if(tags.length&&tags.at(-1).y>bottom){
        tags.at(-1).y=bottom;
        for(let i=tags.length-2;i>=0;i--)tags[i].y=Math.min(tags[i].y,tags[i+1].y-gap);
      }
      for(const {e,anchor,p,y} of tags){
        const tag=e.tag,half=tag.width/2;
        const x=THREE.MathUtils.clamp((side<0?bounds.left:bounds.right)+side*(half+22),half+12,width-half-12);
        tag.sprite.position.copy(unproject(x,y,p.z));
        const depth=-tag.sprite.position.clone().applyMatrix4(camera.matrixWorldInverse).z;
        const pixel=2*depth*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))/height;
        tag.sprite.scale.set(tag.width*pixel,tag.height*pixel,1);
        const end=unproject(x-side*half,y,p.z),elbow=unproject(x-side*(half+10),y,p.z);
        const points=tag.line.geometry.attributes.position;
        [anchor,elbow,end].forEach((v,i)=>points.setXYZ(i,v.x,v.y,v.z));points.needsUpdate=true;
      }
    }
  }
  const state=()=>({visible:group.visible?entries.filter(e=>e.mesh.visible).length:0,
    hit:group.visible?[...hitIds]:[],tags:group.visible?entries.filter(e=>e.tag.sprite.visible).map(e=>e.tag.text):[]});
  return {group,update,framing,layout,state,opacity:()=>Math.max(0,...entries.map(e=>e.mat.opacity))};
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
  function update({time=-1,step=0,kind='ok',position,forceTier=0,force=1,organs=[],zoom=0}={}){
    const tier=Math.max(0,Math.min(2,Math.round(forceTier))),fracture=tier>0,success=kind==='ok'&&!fracture;
    const amount=clinicFilm(time,kind,tier,force,organs.length>0);
    time-=therapistStyle(force,tier).xrayDelay;
    target.seg=pressedSegment(Number.isFinite(position)?position:TARGETS[Math.max(0,Math.min(2,step))]);
    const worldZ=-.05+(Number.isFinite(position)?clamp(position):[.18,.5,.82][Math.max(0,Math.min(2,step))])*.6;
    pivot.position.set(0,.95,worldZ-engine.XRAY_LEVEL(target.seg-1));
    organLayer.update(organs,amount*zoom,time-.45);
    const crackT=success?time-.7:-1;
    engine.updateXray(Math.max(0,time)*1000,amount,crackT,success?0:Math.max(0,1-Math.max(0,time-.7)*1.4),target,fracture?{lvl:tier,t:time-.45}:null,null);
    if(organs.length)engine.film.material.opacity=amount;
  }
  function dispose(){
    const allGeometry=new Set(geometries),allMaterials=new Set(),allTextures=new Set();
    function collect(root){root.traverse(o=>{if(o.geometry)allGeometry.add(o.geometry);if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material]){allMaterials.add(m);for(const value of Object.values(m))if(value?.isTexture&&value!==env)allTextures.add(value);}});}
    collect(pivot);collect(source.scene);collect(engine.film);collect(organLayer.group);collect(organSource.scene);
    engine.film.removeFromParent();pivot.removeFromParent();organLayer.group.removeFromParent();
    for(const g of allGeometry)g.dispose();for(const m of allMaterials)m.dispose();for(const t of allTextures)t.dispose();pivot.clear();
  }
  pivot.userData.anatomy='Actual T1–T8 and T2/3–T7/8 discs; original clinic x-ray engine';
  return {group:pivot,update,dispose,organFraming:organLayer.framing,layoutOrgans:organLayer.layout,organState:organLayer.state,organOpacity:organLayer.opacity};
}

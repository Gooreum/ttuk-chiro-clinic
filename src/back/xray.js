import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import {therapistStyle} from './therapistMotion.js';
import {clinicFilm,pressedSegment,TARGETS,ORGAN_BEAT} from './core.js';
import {organTagName} from './organs.js';
import {t} from '../i18n/index.js';
import {createClinicXray} from 'virtual:clinic-xray';

/* Adapter only. Rendering, film, disc release, bubbles and fracture animation run
   through the original clinic x-ray engine, supplied verbatim by the Vite factory.
   The active chain consists exclusively of actual BodyParts3D T1–T8 bones/discs.
   No copied/enlarged thoracic bones or procedural replacement discs are used. */
const clamp=v=>Math.max(0,Math.min(1,v));
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};

// Posterior neon-film holograms; the GLB supplies anatomical landmarks only.
// In the prone overhead shot world +x is the patient's and viewer's right.
const INFLATE=.4,HIT_STOP=.05;
const SHARD_COLORS=[0xff795b,0x83ffe0,0xffb695];
const ORGAN_ART=['lungL','lungR','heart','liver','stomach','spleen','kidneyL','kidneyR','bowel'];
const ART_HEIGHT={lungL:.29,lungR:.29,heart:.135,liver:.215,stomach:.18,spleen:.15,kidneyL:.18,kidneyR:.18,bowel:.27};
async function loadOrganArt(){
  const loader=new THREE.TextureLoader(),art={};
  await Promise.all(ORGAN_ART.map(async id=>{
    art[id]={};
    await Promise.all(['calm','strain','dead'].map(async mood=>{
      const map=await loader.loadAsync(import.meta.env.BASE_URL+`models/back/organ-art/${id}-${mood}.webp`);
      map.encoding=THREE.sRGBEncoding;art[id][mood]=map;
    }));
  }));
  return art;
}
function organTag(id,customText){
  const text=customText||organTagName(id),tag={text,width:0,height:0};
  // Upload each style once. Resizing a canvas already cached by WebGL can retain
  // the old dim texture even while its sprite changes size at rupture time.
  const styles=[false,true].map(ruptured=>{
    const canvas=document.createElement('canvas'),g=canvas.getContext('2d');
    // Black Han Sans packs 폐 into a solid block at this size; the bold Plex reads.
    const font=ruptured?'700 30px "IBM Plex Sans KR", sans-serif':'26px "IBM Plex Sans KR", sans-serif';g.font=font;
    const width=Math.ceil(g.measureText(text).width/2)+18,height=ruptured?30:24;
    canvas.width=width*2;canvas.height=height*2;
    function draw(){
      g.clearRect(0,0,canvas.width,canvas.height);
      g.fillStyle=ruptured?'#17312c':'#0f231f';g.strokeStyle=ruptured?'#ff7a59':'rgba(244,239,228,.5)';g.lineWidth=ruptured?4:2;
      const inset=g.lineWidth/2;
      g.beginPath();g.roundRect(inset,inset,canvas.width-inset*2,canvas.height-inset*2,ruptured?10:6);g.fill();g.stroke();
      g.font=font;g.textAlign='center';g.textBaseline='middle';g.fillStyle=ruptured?'#f4efe4':'rgba(244,239,228,.72)';
      g.fillText(text,canvas.width/2,canvas.height/2+1,canvas.width-16);
    }
    draw();
    const map=new THREE.CanvasTexture(canvas);map.encoding=THREE.sRGBEncoding;
    // Google Fonts ships Korean in unicode-range slices that load only on use; redraw once ours arrive.
    document.fonts?.load(font,text).then(()=>{draw();map.needsUpdate=true;}).catch(()=>{});
    return {map,width,height};
  });
  let hot=null;
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:styles[0].map,transparent:true,depthWrite:false,depthTest:false,toneMapped:false}));
  sprite.name=id+'_tag';sprite.renderOrder=1003;sprite.frustumCulled=false;sprite.visible=false;
  const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3()]),
    new THREE.LineBasicMaterial({color:0xf4efe4,transparent:true,opacity:0,depthWrite:false,depthTest:false,toneMapped:false}));
  line.renderOrder=1002.5;line.frustumCulled=false;line.visible=false;
  Object.assign(tag,{sprite,line,prewarm(renderer){for(const style of styles)renderer.initTexture(style.map);},disposeMaps(){for(const style of styles)style.map.dispose();},setHot(value){
    if(value!==hot){const style=styles[Number(value)];sprite.material.map=style.map;tag.width=style.width;tag.height=style.height;hot=value;}
    line.material.color.setHex(value?0xff7a59:0xf4efe4).convertSRGBToLinear();
  }});
  tag.setHot(false);return tag;
}

function filmSprite(type){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const g=canvas.getContext('2d');
  g.strokeStyle='#ff7a59';g.fillStyle='#ff7a59';g.lineWidth=type==='ring'?5:4;
  if(type==='ring'||type==='shock'){
    if(type==='shock'){g.strokeStyle='#e0fff5';g.lineWidth=12;}
    g.beginPath();g.arc(64,64,type==='shock'?52:56,0,Math.PI*2);g.stroke();
  }
  else if(type==='crack'){
    g.lineJoin='miter';g.lineWidth=7;g.beginPath();g.moveTo(7,67);g.lineTo(30,48);g.lineTo(44,75);g.lineTo(65,40);g.lineTo(79,67);g.lineTo(119,47);g.stroke();
    g.lineWidth=3;g.beginPath();g.moveTo(65,40);g.lineTo(75,18);g.moveTo(44,75);g.lineTo(34,105);g.stroke();
  }else if(type==='flash'){
    const glow=g.createRadialGradient(64,64,0,64,64,60);
    glow.addColorStop(0,'rgba(244,239,228,.9)');glow.addColorStop(.35,'rgba(244,239,228,.45)');glow.addColorStop(1,'rgba(244,239,228,0)');
    g.fillStyle=glow;g.fillRect(0,0,128,128);
  }else{g.beginPath();g.arc(64,64,24,0,Math.PI*2);g.fill();}
  const map=new THREE.CanvasTexture(canvas);map.encoding=THREE.sRGBEncoding;
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map,transparent:true,depthTest:false,depthWrite:false,toneMapped:false}));
  sprite.renderOrder=1001;sprite.frustumCulled=false;sprite.visible=false;return sprite;
}

function createOrgans(source,scene,art){
  const group=new THREE.Group();group.name='BackOrganXray';group.visible=false;scene.add(group);
  source.scene.updateMatrixWorld(true);
  const t1=source.scene.getObjectByName('ref_T1').getWorldPosition(new THREE.Vector3());
  const l5=source.scene.getObjectByName('ref_L5').getWorldPosition(new THREE.Vector3());
  const scale=.6/(t1.y-l5.y);
  const entries=[];let hitIds=[],lastAmount=0,lastZoom=0,burstIds=[],swells={},moods={};
  // Faceted light fragments and needle sparks share one instanced draw per organ.
  // All colours/attributes exist before prewarming: no first-burst shader variant.
  const shardGeometry=new THREE.OctahedronGeometry(1,0),shardColors=[];
  const shardPositions=shardGeometry.attributes.position;
  for(let i=0;i<shardPositions.count;i++){
    const light=[1,.52,.8,.66][Math.floor(i/3)%4];
    shardColors.push(light,light,light);
  }
  shardGeometry.setAttribute('color',new THREE.Float32BufferAttribute(shardColors,3));
  const shardPose=new THREE.Object3D();
  const spineOnTop=new THREE.Mesh(new THREE.PlaneGeometry(1e-4,1e-4),new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false,depthTest:false}));
  spineOnTop.renderOrder=998.99;spineOnTop.frustumCulled=false;spineOnTop.onBeforeRender=r=>r.clearDepth();group.add(spineOnTop);
  for(const id of ORGAN_ART){
    const o=source.scene.getObjectByName(id),raw=new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3());
    const side=['lungR','liver','kidneyR'].includes(id)?1:id==='bowel'?0:-1;
    const centre=new THREE.Vector3(side*Math.abs(raw.x-t1.x)*1.8,.92,-.05+(t1.y-raw.y)*scale);
    // Separate overlapping abdominal silhouettes while preserving patient sides.
    if(id==='liver')centre.x=.11;
    if(id==='stomach')centre.x=-.115;
    if(id==='spleen')centre.x=-.23;
    if(id==='heart'){centre.x=-.075;centre.z+=.055;}
    const map=art[id].calm,h=ART_HEIGHT[id],w=h*map.image.width/map.image.height;
    const size=new THREE.Vector3(w,.025,h);
    const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map,transparent:true,depthWrite:false,depthTest:false,toneMapped:false}));
    sprite.name=id+'_painted';sprite.frustumCulled=false;group.add(sprite);
    const ring=filmSprite('shock'),echo=filmSprite('shock'),flash=filmSprite('flash');
    const shards=new THREE.InstancedMesh(shardGeometry,new THREE.MeshBasicMaterial({vertexColors:true,blending:THREE.AdditiveBlending,transparent:true,depthWrite:false,depthTest:false,toneMapped:false}),18);
    for(let i=0;i<shards.count;i++)shards.setColorAt(i,new THREE.Color(SHARD_COLORS[i%SHARD_COLORS.length]).convertSRGBToLinear());
    shards.instanceColor.needsUpdate=true;
    shards.instanceMatrix.setUsage(THREE.DynamicDrawUsage);shards.frustumCulled=false;shards.visible=false;
    shards.name=id+'_light_shards';shards.renderOrder=998.84;shards.position.copy(centre);
    ring.material.color.setHex(0xff9478);echo.material.color.setHex(0x83ffe0);
    ring.material.blending=echo.material.blending=THREE.AdditiveBlending;
    const tag=organTag(id);group.add(ring,echo,flash,shards,tag.sprite,tag.line);
    flash.renderOrder=998.8;ring.renderOrder=echo.renderOrder=998.82;
    tag.sprite.renderOrder=998.9;tag.line.renderOrder=998.88;
    entries.push({id,sprite,tag,side,centre,size,ring,echo,flash,shards,hit:false,burst:false});
  }
  // Both markers are back-only; the shared clinic engine stays unchanged.
  const marker=filmSprite('ring'),spineCrack=filmSprite('crack'),spineFlash=filmSprite('flash');
  // Cache every fracture label as well: rebuilding this canvas during a shot
  // would upload a new texture even if all burst effects were already warm.
  const markerTags=Array.from({length:7},(_,i)=>{const tag=organTag('fracture',t("T{n} 골절!",{n:i+1}));tag.setHot(true);scene.add(tag.sprite,tag.line);return tag;});
  let markerTag=markerTags[2];
  scene.add(marker,spineCrack,spineFlash);
  const markerPos=new THREE.Vector3();
  function update(ids,amount,fractureTime,zoom,spine){
    group.visible=ids.length>0&&amount>.001;lastAmount=group.visible?amount:0;lastZoom=group.visible?zoom:0;
    hitIds=ids.filter(id=>entries.some(e=>e.id===id));burstIds=[];swells={};moods={};
    for(const e of entries){
      e.hit=ids.includes(e.id);
      const burstAge=fractureTime+.45-(ORGAN_BEAT.burstAt+hitIds.indexOf(e.id)*ORGAN_BEAT.stagger);
      const age=burstAge+INFLATE;e.burst=e.hit&&burstAge>=0;
      if(e.burst&&group.visible)burstIds.push(e.id);
      const grow=e.hit&&age>=0?1-Math.pow(1-clamp(age/INFLATE),3):0;
      // Hold only the organ pose for 50 ms; the game clock and burstAt stay intact.
      const release=Math.max(0,burstAge-HIT_STOP),popped=e.hit?smooth(0,.115,release):0;
      const recoil=Math.sin(release*30)*Math.exp(-release*7)*popped;
      const swell=e.hit?1+.82*grow*(1-popped)-.32*popped+.16*recoil:1;
      const jitter=e.hit&&burstAge<0?.025*grow*grow*Math.sin(Math.max(0,age)*125):0;
      const mood=e.hit&&release>0?'dead':e.hit&&age>=0?'strain':'calm';
      if(e.hit){moods[e.id]=mood;swells[e.id]=+swell.toFixed(3);}
      e.sprite.material.map=art[e.id][e.hit?mood:'calm'];
      e.sprite.material.color.set(e.hit?0xffffff:0xa7f6df);
      e.sprite.material.opacity=amount*(e.hit?1:.16);
      e.sprite.material.rotation=jitter+(e.burst?.16*recoil:0);
      e.sprite.renderOrder=e.hit?998.45+ORGAN_ART.indexOf(e.id)*.009:998.08;
      e.sprite.position.copy(e.centre);
      e.sprite.scale.set(e.size.x*swell*(1+jitter+.16*popped),e.size.z*swell*(1-jitter-.36*popped),1);
      const fx=e.hit&&burstAge>=0&&group.visible,diameter=Math.max(e.size.x,e.size.z);
      e.flash.visible=fx&&burstAge<.19;e.flash.position.copy(e.centre);
      e.flash.scale.setScalar(diameter*(1.4+.5*smooth(0,.19,burstAge)));
      e.flash.material.opacity=amount*(1-smooth(HIT_STOP,.19,burstAge));
      e.ring.visible=fx&&release<.46;e.ring.position.copy(e.centre);
      e.ring.scale.setScalar(diameter*(.65+1.65*(1-Math.pow(1-clamp(release/.46),3))));
      e.ring.material.opacity=amount*.95*(1-smooth(.08,.46,release));
      const echoAge=release-.07;
      e.echo.visible=fx&&echoAge>=0&&echoAge<.44;e.echo.position.copy(e.centre);
      e.echo.scale.setScalar(diameter*(.65+1.25*smooth(0,.44,echoAge)));
      e.echo.material.opacity=amount*.5*(1-smooth(0,.44,echoAge));
      e.shards.visible=fx&&release>0&&release<.85;
      if(e.shards.visible){
        for(let i=0;i<e.shards.count;i++){
          // Even angular coverage with deterministic variation; leave game RNG alone.
          const angle=i*2.399963,dx=Math.cos(angle),dy=Math.sin(angle),speed=diameter*(.8+(i%5)*.15);
          const travel=speed*release,radius=diameter*(.025+(i%3)*.009)*(1-smooth(.45,.85,release));
          shardPose.position.set(dx*(diameter*.18+travel),dy*(diameter*.18+travel)-diameter*.9*release*release,.002+(i%3)*.001);
          const spark=i%3===0;
          shardPose.rotation.set(spark?0:release*(i%2?5:-4),spark?0:i*.7+release*3,angle);
          const stretch=1+1.6*Math.exp(-release*8);
          shardPose.scale.set(radius*stretch*(spark?2.2:1),radius/stretch*(spark?.15:.7),radius*(spark?.12:.5));shardPose.updateMatrix();
          e.shards.setMatrixAt(i,shardPose.matrix);
        }
        e.shards.instanceMatrix.needsUpdate=true;
        e.shards.material.opacity=amount*(1-smooth(.5,.85,release));
      }
      // No per-organ captions: they chased the swelling outline. The burst reads from one DOM stamp (user, 2026-10-18).
      e.tag.setHot(e.burst);e.tag.sprite.visible=e.tag.line.visible=false;
    }
    markerPos.copy(spine.position);
    markerTag.sprite.visible=markerTag.line.visible=false;
    markerTag=markerTags[spine.seg-1];
    marker.visible=markerTag.sprite.visible=markerTag.line.visible=spine.on&&zoom>0&&spine.amount>.001;
    // Once an organ pops the top stamp names the fracture too; a second caption hopping around the spine is noise.
    if(burstIds.length)markerTag.sprite.visible=markerTag.line.visible=false;
    marker.material.opacity=amount*(.75+.25*Math.sin(fractureTime*9));marker.position.copy(markerPos);
    markerTag.sprite.material.opacity=amount;markerTag.line.material.opacity=amount;
    // Side close-up first (small crack), then it grows a little in the organ view.
    spineCrack.visible=spine.on&&spine.time>=.8&&spine.amount>.001;
    spineCrack.position.copy(markerPos);spineCrack.material.opacity=spine.amount;spineCrack.scale.set(.075+.06*zoom,.045+.035*zoom,1);
    spineFlash.visible=spineCrack.visible&&spine.time<1.02;spineFlash.position.copy(markerPos);
    spineFlash.scale.setScalar(.07+.06*zoom);spineFlash.material.opacity=spine.amount*(1-smooth(.81,1.02,spine.time));
  }
  function framing(ids=[]){
    const box=new THREE.Box3();
    for(const e of entries){
      if(!ids.includes(e.id))continue; // frame only the burst organs so they read big (user, 2026-10-18)
      // Fit the swollen silhouette and ring, rather than zooming an
      // uninflated GLB tightly and letting the next beat cover the entire phone.
      const extent=new THREE.Vector3(e.size.x*.96,.025,e.size.z*.96);
      box.union(new THREE.Box3(e.centre.clone().sub(extent),e.centre.clone().add(extent)));
    }
    return box;
  }
  function layout(camera,width,height){
    camera.updateMatrixWorld(true);
    const project=p=>{const q=p.clone().project(camera);return new THREE.Vector3((q.x+1)*width/2,(1-q.y)*height/2,q.z);};
    const unproject=(x,y,z)=>new THREE.Vector3(x/width*2-1,1-y/height*2,z).unproject(camera);
    const pixelAt=p=>2*(-p.clone().applyMatrix4(camera.matrixWorldInverse).z)*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))/height;
    if(!group.visible)return;
    for(const e of entries)if(e.shards.visible)e.shards.quaternion.copy(camera.quaternion);
    const occupied=[];
    if(marker.visible){
      const p=project(markerPos),pixel=pixelAt(markerPos);marker.scale.setScalar(46*pixel);
      const pill=document.getElementById('backCutLabel');
      if(pill&&!pill.hidden)occupied.push({left:pill.offsetLeft-pill.offsetWidth/2-8,right:pill.offsetLeft+pill.offsetWidth/2+8,top:pill.offsetTop-8,bottom:pill.offsetTop+pill.offsetHeight+8});
      const half=markerTag.width/2,hh=markerTag.height/2;
      let best=null;
      for(const dy of [43,-43,58,-58,74,-74])for(const dx of [0,24,-24]){
        const x=THREE.MathUtils.clamp(p.x+dx,half+12,width-half-12),y=THREE.MathUtils.clamp(p.y+dy,101+hh,height-12-hh);
        const collision=occupied.some(r=>x+half>r.left&&x-half<r.right&&y+hh>r.top&&y-hh<r.bottom);
        const score=(collision?100000:0)+dx*dx+(y-p.y)*(y-p.y);
        if(!best||score<best.score)best={x,y,score};
      }
      markerTag.sprite.position.copy(unproject(best.x,best.y,p.z));
      markerTag.sprite.scale.set(markerTag.width*pixel,markerTag.height*pixel,1);
      const dy=best.y-p.y,dx=best.x-p.x,edgeY=best.y-Math.sign(dy)*hh,length=Math.max(1,Math.hypot(dx,dy));
      const points=markerTag.line.geometry.attributes.position;
      [unproject(p.x+dx*23/length,p.y+dy*23/length,p.z),unproject(best.x,edgeY,p.z),unproject(best.x,edgeY,p.z)]
        .forEach((v,i)=>points.setXYZ(i,v.x,v.y,v.z));points.needsUpdate=true;
    }
  }
  const state=()=>({visible:group.visible?entries.length:0,hit:group.visible?[...hitIds]:[],
    tags:group.visible?entries.filter(e=>e.burst).map(e=>e.tag.text):[],burst:group.visible?hitIds.filter(id=>burstIds.includes(id)):[],swell:group.visible?{...swells}:{},labels:group.visible?entries.length:0,zoom:lastZoom,
    faded:group.visible?entries.filter(e=>!e.hit).map(e=>e.id):[],mood:group.visible?{...moods}:{}});
  function disposeMarkers(){
    for(const e of entries){e.tag.disposeMaps();for(const map of Object.values(art[e.id]))map.dispose();}
    for(const tag of markerTags){tag.disposeMaps();tag.sprite.removeFromParent();tag.sprite.material.dispose();tag.line.removeFromParent();tag.line.geometry.dispose();tag.line.material.dispose();}
    for(const s of [marker,spineCrack,spineFlash]){s.removeFromParent();s.material.map?.dispose();s.material.dispose();}
  }
  function prewarm(renderer){
    for(const e of entries){e.tag.prewarm(renderer);for(const s of [e.ring,e.echo,e.flash])renderer.initTexture(s.material.map);}
    for(const tag of markerTags)tag.prewarm(renderer);
    for(const s of [marker,spineCrack,spineFlash])renderer.initTexture(s.material.map);
  }
  return {group,update,framing,layout,state,opacity:()=>lastAmount,disposeMarkers,prewarm};
}

export async function createBackXray({scene,camera,env,renderer}){
  const pivot=new THREE.Group();pivot.name='BackClinicXrayAdapter';scene.add(pivot);
  if(renderer)renderer.localClippingEnabled=true;
  const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const [source,organSource,art]=await Promise.all([loader.loadAsync(import.meta.env.BASE_URL+'models/spine/cervical.glb'),loader.loadAsync(import.meta.env.BASE_URL+'models/back/organs.glb'),loadOrganArt()]);
  // Upload all 27 paintings now; first-use uploads stalled the organ shot by over a second.
  if(renderer)for(const moods of Object.values(art))for(const map of Object.values(moods))renderer.initTexture(map);
  const organLayer=createOrgans(organSource,scene,art);
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
  // Finish sliced Korean font loads before the one-time canvas uploads.
  await document.fonts?.ready;
  if(renderer)organLayer.prewarm(renderer);
  const originalFilmColor=engine.film.material.color.clone(),originalFilmToneMapped=engine.film.material.toneMapped;
  const organFilmColor=new THREE.Color(0x0f231f).convertSRGBToLinear();
  // The original engine bakes its own geometry/materials. Keep source resources
  // alive until disposal so async model initialization remains safe.
  const target={name:'박대리',seg:3,side:1,xr:'disc'},boneNodes=new Map(),fracturePoint=new THREE.Vector3();
  function update({time=-1,step=0,kind='ok',position,forceTier=0,force=1,organs=[],zoom=0}={}){
    const tier=Math.max(0,Math.min(2,Math.round(forceTier))),fracture=tier>0,success=kind==='ok'&&!fracture;
    const amount=clinicFilm(time,kind,tier,force,organs.length>0);
    time-=therapistStyle(force,tier).xrayDelay;
    target.seg=pressedSegment(Number.isFinite(position)?position:TARGETS[Math.max(0,Math.min(2,step))]);
    const worldZ=-.05+(Number.isFinite(position)?clamp(position):[.18,.5,.82][Math.max(0,Math.min(2,step))])*.6;
    pivot.position.set(0,.95,worldZ-engine.XRAY_LEVEL(target.seg-1));
    // In the wide organ shot a true-size spine is a thin thread; blow the column up around the broken level so the
    // fracture reads next to the bursting organs (user, 2026-10-18 "척추랑 장기 파열되는거 같이").
    pivot.scale.setScalar(1);
    // Cache the real vertebral pivots while they are still in their rest pose.
    // Read their animated positions thereafter; a guessed world height floats
    // above the bone when the spine camera is close.
    if(!boneNodes.size)for(let i=1;i<=7;i++){
      const rest=adapted.getObjectByName('C'+i).position;
      const node=engine.root.children.find(o=>o.isGroup&&o.children[0]?.isMesh&&o.position.distanceToSquared(rest)<1e-10);
      if(node)boneNodes.set(i,node);
    }
    const crackT=success?time-.7:-1;
    engine.updateXray(Math.max(0,time)*1000,amount,crackT,success?0:Math.max(0,1-Math.max(0,time-.7)*1.4),target,fracture?{lvl:tier,t:time-.45}:null,null);
    engine.root.updateWorldMatrix(true,false);
    fracturePoint.copy(boneNodes.get(target.seg)?.position||adapted.getObjectByName('C'+target.seg).position).add(new THREE.Vector3(0,.004,.007));
    engine.root.localToWorld(fracturePoint);
    organLayer.update(organs,amount*zoom,time-.45,zoom,{on:fracture&&organs.length>0,seg:target.seg,position:fracturePoint,amount,time});
    engine.film.material.color.copy(originalFilmColor).lerp(organFilmColor,zoom);
    if(engine.film.material.toneMapped!==(zoom>0?false:originalFilmToneMapped)){
      engine.film.material.toneMapped=zoom>0?false:originalFilmToneMapped;engine.film.material.needsUpdate=true;
    }
    if(organs.length)engine.film.material.opacity=amount;
  }
  function dispose(){
    organLayer.disposeMarkers();
    const allGeometry=new Set(geometries),allMaterials=new Set(),allTextures=new Set();
    function collect(root){root.traverse(o=>{if(o.geometry)allGeometry.add(o.geometry);if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material]){allMaterials.add(m);for(const value of Object.values(m))if(value?.isTexture&&value!==env)allTextures.add(value);}});}
    collect(pivot);collect(source.scene);collect(engine.film);collect(organLayer.group);collect(organSource.scene);
    engine.film.removeFromParent();pivot.removeFromParent();organLayer.group.removeFromParent();
    for(const g of allGeometry)g.dispose();for(const m of allMaterials)m.dispose();for(const t of allTextures)t.dispose();pivot.clear();
  }
  pivot.userData.anatomy='Actual T1–T8 and T2/3–T7/8 discs; original clinic x-ray engine';
  return {group:pivot,update,dispose,organFraming:organLayer.framing,layoutOrgans:organLayer.layout,organState:organLayer.state,organOpacity:organLayer.opacity,fractureFocus:()=>fracturePoint};
}

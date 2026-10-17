import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import {therapistStyle} from './therapistMotion.js';
import {clinicFilm,pressedSegment,TARGETS,ORGAN_BEAT} from './core.js';
import {organTagName} from './organs.js';
import {createClinicXray} from 'virtual:clinic-xray';

/* Adapter only. Rendering, film, disc release, bubbles and fracture animation run
   through the original clinic x-ray engine, supplied verbatim by the Vite factory.
   The active chain consists exclusively of actual BodyParts3D T1–T8 bones/discs.
   No copied/enlarged thoracic bones or procedural replacement discs are used. */
const clamp=v=>Math.max(0,Math.min(1,v));
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};

// Every surface masks the layers beneath it. The diagnostic marks use organ-local
// coordinates, so the anatomy stays registered while the three clipped pieces move.
const INFLATE=.4;
const ORGAN_KIND={lungL:0,lungR:0,heart:1,liver:2,stomach:3,spleen:4,kidneyL:5,kidneyR:5,bowel:6};
function organMaterial(id,centre,size){
  const U={organCentre:{value:centre},organSize:{value:size},organKind:{value:ORGAN_KIND[id]},
    organSide:{value:['lungL','kidneyL'].includes(id)?1:-1},organTime:{value:0},organDamage:{value:0},organHeat:{value:0},organAmount:{value:0},
    organColor:{value:new THREE.Color(0xf4efe4).convertSRGBToLinear()},organMint:{value:new THREE.Color(0x7fd1b9).convertSRGBToLinear()},
    organFilm:{value:new THREE.Color(0x0f231f).convertSRGBToLinear()},organCoral:{value:new THREE.Color(0xff7a59).convertSRGBToLinear()}};
  const mat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,depthTest:true,side:THREE.DoubleSide,toneMapped:false,clipping:true,uniforms:U,
    vertexShader:`uniform vec3 organCentre,organSize; varying vec3 vOrgan;
      #include <clipping_planes_pars_vertex>
      void main(){vOrgan=(position-organCentre)/organSize;vec4 mvPosition=modelViewMatrix*vec4(position,1.0);
        gl_Position=projectionMatrix*mvPosition;
        #include <clipping_planes_vertex>
      }`,
    fragmentShader:`uniform float organKind,organSide,organTime,organDamage,organHeat,organAmount;
      uniform vec3 organColor,organMint,organFilm,organCoral; varying vec3 vOrgan;
      #include <clipping_planes_pars_fragment>
      float segment(vec2 p,vec2 a,vec2 b){vec2 ab=b-a;return length(p-a-ab*clamp(dot(p-a,ab)/max(dot(ab,ab),.00001),0.0,1.0));}
      float ink(float d,float w){return 1.0-smoothstep(w,w+max(fwidth(d),.002),d);}
      float branch(vec2 p){
        float d=segment(p,vec2(-.03,-.04),vec2(.16,.04));
        d=min(d,segment(p,vec2(.16,.04),vec2(.33,-.30)));
        d=min(d,segment(p,vec2(.16,.04),vec2(.37,.28)));
        d=min(d,segment(p,vec2(.27,-.19),vec2(.06,-.35)));
        d=min(d,segment(p,vec2(.30,.18),vec2(.10,.36)));
        d=min(d,segment(p,vec2(.16,.04),vec2(.41,-.03)));return d;
      }
      void main(){
        #include <clipping_planes_fragment>
        vec2 p=vOrgan.xz;float d=1.0,mark=0.0,density=.035;vec3 tint=organColor;
        if(organKind<.5){
          vec2 q=vec2(p.x*organSide+.34,p.y);d=branch(q);
          d=min(d,segment(q,vec2(-.03,-.04),vec2(.04,-.36)));
          d=min(d,segment(q,vec2(.04,-.21),vec2(.25,-.42)));
          d=min(d,segment(q,vec2(-.03,-.04),vec2(.02,.31)));
          mark=ink(d,.007)*.58;density=.045;tint=organMint;
        }else if(organKind<1.5){
          float a=abs(p.x-.07*sin(p.y*7.0)+.02);
          float b=abs(p.y+.12+.13*cos(p.x*7.0));
          mark=max(ink(a,.009),ink(b,.008)*(1.0-smoothstep(.18,.35,abs(p.x))))*.65;density=.35;
        }else if(organKind<2.5){
          d=abs(p.x+.02+.14*sin(p.y*5.0));
          mark=max(ink(d,.008),ink(branch(vec2(p.x+.08,p.y)),.005)*.6)*.65;density=.22;
        }else if(organKind<3.5){
          float stripe=abs(sin((p.y+.045*sin(p.x*13.0))*57.0));
          mark=(1.0-smoothstep(.12,.23,stripe))*.44*(1.0-smoothstep(.33,.49,abs(p.x)));density=.07;
        }else if(organKind<4.5){
          vec2 cell=fract(p*vec2(31.0,27.0))-.5;
          mark=(1.0-smoothstep(.10,.20,length(cell)))*.5;density=.10;
        }else if(organKind<5.5){
          vec2 q=vec2(p.x*organSide+.32,p.y);d=branch(q);
          d=min(d,segment(q,vec2(-.06,-.27),vec2(-.03,-.04)));
          mark=ink(d,.010)*.78;density=.12;
        }else{
          // Five folded barium-filled tubes, with separate walls and dark lumen.
          // Distance to one meandering centreline avoids concentric contour rings.
          vec2 a=vec2(-.31,-.35);float tube=1.0;
          for(int i=1;i<=64;i++){
            float t=float(i)/64.0;
            vec2 b=vec2(-.31*cos(t*15.707963)+.018*sin(t*41.0),-.35+.70*t);
            tube=min(tube,segment(p,a,b));a=b;
          }
          mark=max(0.0,ink(tube,.035)-ink(tube,.022))*.78;density=.025;
        }
        // Three radial tears and small jagged branches remain after the burst.
        float tear=1.0;
        for(int i=0;i<3;i++){
          float a=float(i)*2.0943951+.22;vec2 n=vec2(cos(a),sin(a)),q=vec2(dot(p,n),dot(p,vec2(-n.y,n.x)));
          float jag=.012*sin(q.x*65.0);float line=abs(q.y+jag);
          tear=min(tear,max(line,-q.x));
        }
        float seam=ink(tear,.050)*organDamage;
        vec3 color=mix(organFilm,tint,density*(1.0-.82*organDamage));
        color=mix(color,organColor,mark*(1.0-.8*organDamage));
        color=mix(color,organCoral,seam*.96);
        gl_FragColor=vec4(color,organAmount);
        #include <encodings_fragment>
      }`});
  mat.extensions.derivatives=true;
  return {mat,U};
}

// Dim anatomy uses a fine hull; a ruptured silhouette gets four CSS pixels of coral.
function organOutline(U){
  return new THREE.ShaderMaterial({transparent:true,depthTest:false,depthWrite:false,side:THREE.BackSide,toneMapped:false,clipping:true,
    uniforms:{...U,organViewport:{value:new THREE.Vector2(844,390)}},
    vertexShader:`uniform vec2 organViewport;uniform float organHeat;
      #include <clipping_planes_pars_vertex>
      void main(){vec4 mvPosition=modelViewMatrix*vec4(position,1.0);vec4 clip=projectionMatrix*mvPosition;
        vec3 n=normalMatrix*normal;vec2 direction=normalize(n.xy+vec2(.00001));
        clip.xy+=direction*vec2(mix(5.4,8.0,organHeat))/organViewport*clip.w;gl_Position=clip;
        #include <clipping_planes_vertex>
      }`,
    fragmentShader:`uniform vec3 organColor,organCoral;uniform float organAmount,organHeat;
      #include <clipping_planes_pars_fragment>
      void main(){
        #include <clipping_planes_fragment>
        gl_FragColor=vec4(mix(organColor*.55,organCoral,organHeat),organAmount);
        #include <encodings_fragment>
      }`});
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
  Object.assign(tag,{sprite,line,disposeMaps(){for(const style of styles)style.map.dispose();},setHot(value){
    if(value!==hot){const style=styles[Number(value)];sprite.material.map=style.map;tag.width=style.width;tag.height=style.height;hot=value;}
    line.material.color.setHex(value?0xff7a59:0xf4efe4).convertSRGBToLinear();
  }});
  tag.setHot(false);return tag;
}

function filmSprite(type){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const g=canvas.getContext('2d');
  g.strokeStyle='#ff7a59';g.fillStyle='#ff7a59';g.lineWidth=type==='ring'?5:4;
  if(type==='ring'){g.beginPath();g.arc(64,64,56,0,Math.PI*2);g.stroke();}
  else if(type==='crack'){
    g.lineJoin='miter';g.lineWidth=7;g.beginPath();g.moveTo(7,67);g.lineTo(30,48);g.lineTo(44,75);g.lineTo(65,40);g.lineTo(79,67);g.lineTo(119,47);g.stroke();
    g.lineWidth=3;g.beginPath();g.moveTo(65,40);g.lineTo(75,18);g.moveTo(44,75);g.lineTo(34,105);g.stroke();
  }else if(type==='flash'){
    g.fillStyle='#f4efe4';g.beginPath();for(let i=0;i<24;i++){const a=i*Math.PI/12,r=i%2?15:60;g.lineTo(64+Math.cos(a)*r,64+Math.sin(a)*r);}g.closePath();g.fill();
  }else{g.beginPath();g.arc(64,64,24,0,Math.PI*2);g.fill();}
  const map=new THREE.CanvasTexture(canvas);map.encoding=THREE.sRGBEncoding;
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map,transparent:true,depthTest:false,depthWrite:false,toneMapped:false}));
  sprite.renderOrder=1001;sprite.frustumCulled=false;sprite.visible=false;return sprite;
}

function createOrgans(source,scene){
  const group=new THREE.Group();group.name='BackOrganXray';group.visible=false;scene.add(group);
  source.scene.updateMatrixWorld(true);
  const t1=source.scene.getObjectByName('ref_T1').getWorldPosition(new THREE.Vector3());
  const l5=source.scene.getObjectByName('ref_L5').getWorldPosition(new THREE.Vector3());
  const length=t1.y-l5.y,scale=.6/length;
  const entries=[];let hitIds=[],lastAmount=0,lastZoom=0,burstIds=[],swells={};
  const layerOrder=['lungL','lungR','bowel','liver','kidneyL','kidneyR','stomach','spleen','heart'];
  // The spine stays the brightest thing in the shot (user, 2026-10-18): drop the organ depth before the engine's
  // bones (renderOrder 999+) so the vertebrae and their fracture draw over the opaque organ fills.
  const spineOnTop=new THREE.Mesh(new THREE.PlaneGeometry(1e-4,1e-4),new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false,depthTest:false}));
  spineOnTop.renderOrder=998.99;spineOnTop.frustumCulled=false;spineOnTop.onBeforeRender=r=>r.clearDepth();group.add(spineOnTop);
  const surfaces=[];source.scene.traverse(o=>{if(o.isMesh)surfaces.push(o);});
  surfaces.sort((a,b)=>layerOrder.indexOf(a.name)-layerOrder.indexOf(b.name));
  for(const o of surfaces){
    const geometry=o.geometry.clone();const raw=geometry.attributes.position,float=new Float32Array(raw.count*3);
    for(let i=0;i<raw.count;i++){float[i*3]=raw.getX(i);float[i*3+1]=raw.getY(i);float[i*3+2]=raw.getZ(i);}
    geometry.setAttribute('position',new THREE.BufferAttribute(float,3));geometry.applyMatrix4(o.matrixWorld);
    const a=geometry.attributes.position,positions=new Float32Array(a.count*3);
    for(let i=0;i<a.count;i++){
      positions[i*3]=(a.getX(i)-t1.x)*1.5;
      positions[i*3+1]=.92-(a.getZ(i)-t1.z)*.22;
      positions[i*3+2]=-.05+(t1.y-a.getY(i))*scale;
    }
    geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
    if(geometry.index){const ix=geometry.index;for(let i=0;i<ix.count;i+=3){const b=ix.getX(i+1);ix.setX(i+1,ix.getX(i+2));ix.setX(i+2,b);}ix.needsUpdate=true;}
    geometry.deleteAttribute('normal');geometry.computeVertexNormals();geometry.computeBoundingBox();
    const box=geometry.boundingBox.clone(),centre=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());
    geometry.translate(-centre.x,-centre.y,-centre.z);geometry.computeBoundingSphere();
    const parts=[],order=998.3+entries.length*.05;
    for(let j=0;j<3;j++){
      const angle=j*Math.PI*2/3+.22+Math.PI/3;
      const normals=[new THREE.Vector3(-Math.sin(angle-Math.PI/3),0,Math.cos(angle-Math.PI/3)),new THREE.Vector3(Math.sin(angle+Math.PI/3),0,-Math.cos(angle+Math.PI/3))];
      const planes=normals.map(n=>new THREE.Plane(n.clone(),0));
      const {mat,U}=organMaterial(o.name,new THREE.Vector3(),size);mat.clippingPlanes=planes;
      const hullMat=organOutline(U);hullMat.clippingPlanes=planes;
      const root=new THREE.Group();root.position.copy(centre);group.add(root);
      const depth=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({colorWrite:false,depthWrite:true,depthTest:true,transparent:true,side:THREE.DoubleSide,clippingPlanes:planes}));
      depth.renderOrder=order+j*.001;depth.frustumCulled=false;
      if(j===0)depth.onBeforeRender=r=>{r.state.buffers.depth.setMask(true);r.clearDepth();};
      const hull=new THREE.Mesh(geometry,hullMat);hull.renderOrder=order+.01+j*.001;hull.frustumCulled=false;
      const mesh=new THREE.Mesh(geometry,mat);mesh.name=o.name+'_piece'+j;mesh.renderOrder=order+.02+j*.001;mesh.frustumCulled=false;
      root.add(depth,hull,mesh);parts.push({root,depth,hull,mesh,mat,U,planes,normals,angle});
    }
    const ring=filmSprite('ring'),flash=filmSprite('flash');group.add(ring,flash);
    const tag=organTag(o.name);group.add(tag.sprite,tag.line);
    const side=['lungR','liver','kidneyR','bowel'].includes(o.name)?-1:1;
    entries.push({id:o.name,parts,tag,side,box,centre,size,ring,flash,hit:false,burst:false});
  }
  // Both markers are back-only; the shared clinic engine stays unchanged.
  const marker=filmSprite('ring'),spineCrack=filmSprite('crack'),spineFlash=filmSprite('flash');
  const markerTag=organTag('fracture','T3 골절!');markerTag.setHot(true);
  scene.add(marker,markerTag.sprite,markerTag.line,spineCrack,spineFlash);
  let markerSeg=3,markerPos=new THREE.Vector3();
  function update(ids,amount,fractureTime,zoom,spine){
    group.visible=ids.length>0&&amount>.001;lastAmount=group.visible?amount:0;lastZoom=group.visible?zoom:0;
    hitIds=ids.filter(id=>entries.some(e=>e.id===id));burstIds=[];swells={};
    for(const e of entries){
      e.hit=ids.includes(e.id);
      // Grow for .4s (ease-in, 1 to 1.6), then 팡: collapse with one flash and one ring (user, 2026-10-18 "간결하게 … 임팩트 있게").
      const age=fractureTime+.45-(ORGAN_BEAT.burstAt-INFLATE+hitIds.indexOf(e.id)*ORGAN_BEAT.stagger);
      const burstAge=age-INFLATE;e.burst=e.hit&&burstAge>=0;
      if(e.burst&&group.visible)burstIds.push(e.id);
      const grow=e.hit&&age>=0?Math.pow(Math.min(1,age/INFLATE),2.2):0,popped=e.hit?smooth(0,.08,burstAge):0;
      const split=e.hit?smooth(0,.3,burstAge):0,heat=e.hit?smooth(0,INFLATE*.8,age):0;
      const swell=e.hit?1+.6*grow*(1-popped):1;
      if(e.hit)swells[e.id]=+swell.toFixed(3);
      for(const p of e.parts){
        p.root.visible=group.visible;p.root.scale.setScalar(swell);
        const drift=.2*split;
        p.root.position.copy(e.centre).add(new THREE.Vector3(Math.cos(p.angle)*e.size.x*drift,0,Math.sin(p.angle)*e.size.z*drift));
        p.root.rotation.set(0,(p.angle-2)*.05*split,0);
        p.root.updateWorldMatrix(true,false);
        p.planes.forEach((plane,i)=>plane.setFromNormalAndCoplanarPoint(p.normals[i],new THREE.Vector3()).applyMatrix4(p.root.matrixWorld));
        p.U.organAmount.value=amount;p.U.organDamage.value=e.hit?smooth(0,.10,burstAge):0;p.U.organHeat.value=heat;p.U.organTime.value=Math.max(0,age);
      }
      const fx=e.hit&&burstAge>=0&&group.visible,diameter=Math.max(e.size.x,e.size.z);
      e.flash.visible=fx&&burstAge<.18;e.flash.position.copy(e.centre);e.flash.position.y=1.03;
      e.flash.scale.setScalar(diameter*(1+.8*smooth(0,.15,burstAge)));
      e.flash.material.color.setHex(burstAge<.06?0xf4efe4:0xff7a59);e.flash.material.opacity=amount*(1-smooth(.04,.18,burstAge));
      e.ring.visible=fx&&burstAge<.4;e.ring.position.copy(e.centre);e.ring.position.y=1.03;
      e.ring.scale.setScalar(diameter*(.7+1.1*smooth(0,.35,burstAge)));e.ring.material.opacity=amount*(1-smooth(.15,.4,burstAge));
      e.tag.setHot(e.burst);e.tag.sprite.visible=e.tag.line.visible=group.visible;
      e.tag.sprite.material.opacity=amount;e.tag.line.material.opacity=amount*(e.burst?.8:.35);
    }
    markerPos.copy(spine.position);
    if(markerSeg!==spine.seg){
      markerSeg=spine.seg;markerTag.disposeMaps();
      const replacement=organTag('fracture',`T${spine.seg} 골절!`);replacement.setHot(true);
      markerTag.sprite.material.map=replacement.sprite.material.map;markerTag.width=replacement.width;markerTag.height=replacement.height;markerTag.disposeMaps=replacement.disposeMaps;
      replacement.sprite.material.dispose();replacement.line.geometry.dispose();replacement.line.material.dispose();
    }
    marker.visible=markerTag.sprite.visible=markerTag.line.visible=spine.on&&zoom>0&&spine.amount>.001;
    marker.material.opacity=amount*(.75+.25*Math.sin(fractureTime*9));marker.position.copy(markerPos);
    markerTag.sprite.material.opacity=amount;markerTag.line.material.opacity=amount;
    // The spine snaps in the same wide shot as the organs, so its crack is drawn big enough to read there.
    spineCrack.visible=spine.on&&spine.time>=.8&&spine.amount>.001;
    spineCrack.position.copy(markerPos);spineCrack.material.opacity=spine.amount;spineCrack.scale.set(.17,.1,1);
    spineFlash.visible=spineCrack.visible&&spine.time<1.02;spineFlash.position.copy(markerPos);
    spineFlash.scale.setScalar(.16);spineFlash.material.opacity=spine.amount*(1-smooth(.81,1.02,spine.time));
  }
  function framing(ids=[]){
    const box=new THREE.Box3();
    for(const e of entries){
      if(!ids.includes(e.id)){box.union(e.box);continue;}
      // Reserve the 1.6 swell and the 1.8-diameter ring, even before that organ has burst.
      const diameter=Math.max(e.size.x,e.size.z),extent=new THREE.Vector3(
        Math.max(e.size.x*.85+.02,diameter*.95),e.size.y*.8+.03,
        Math.max(e.size.z*.85+.02,diameter*.95));
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
    const bounds={left:width,right:0},occupied=[];
    for(const e of entries){
      for(const p of e.parts)p.hull.material.uniforms.organViewport.value.set(width,height);
      // Keep the expanded shock front and its finer inner echo legible after
      // the flashes, without a halo or any coral wash inside the organs.
      if(e.ring.visible){
        const pixels=e.ring.scale.x/pixelAt(e.ring.position);
        const map=e.ring.material.map,stroke=(pixels<110?16:11)*128/pixels;
        if(Math.abs((map.userData.stroke||5)-stroke)>.2){
          const g=map.image.getContext('2d');g.clearRect(0,0,128,128);g.strokeStyle='#ff7a59';g.lineWidth=stroke;
          g.beginPath();g.arc(64,64,56,0,Math.PI*2);g.stroke();
          map.userData.stroke=stroke;map.needsUpdate=true;
        }
      }
      for(const x of [e.box.min.x,e.box.max.x])for(const z of [e.box.min.z,e.box.max.z]){
        const p=project(new THREE.Vector3(x,e.centre.y,z));bounds.left=Math.min(bounds.left,p.x);bounds.right=Math.max(bounds.right,p.x);
      }
    }
    for(const side of [-1,1]){
      const tags=entries.filter(e=>e.side===side).map(e=>{const anchor=e.centre.clone();anchor.x+=side*e.size.x*.32;return {e,anchor,p:project(anchor)};}).sort((a,b)=>a.p.y-b.p.y);
      const top=Math.min(105,height*.25),bottom=height-24;
      // Use the actual mixed 24/30px heights; all five left-side labels fit a phone.
      for(let i=0;i<tags.length;i++){
        const half=tags[i].e.tag.height/2,prev=i?tags[i-1]:null;
        tags[i].y=Math.max(top+half,Math.min(bottom-half,tags[i].p.y),prev?prev.y+(prev.e.tag.height+tags[i].e.tag.height)/2+8:0);
      }
      if(tags.length&&tags.at(-1).y+tags.at(-1).e.tag.height/2>bottom){
        tags.at(-1).y=bottom-tags.at(-1).e.tag.height/2;
        for(let i=tags.length-2;i>=0;i--)tags[i].y=Math.min(tags[i].y,tags[i+1].y-(tags[i].e.tag.height+tags[i+1].e.tag.height)/2-8);
      }
      for(const {e,anchor,p,y} of tags){
        const tag=e.tag,half=tag.width/2;
        const x=THREE.MathUtils.clamp((side<0?bounds.left:bounds.right)+side*(half+24),half+12,width-half-12);
        tag.sprite.position.copy(unproject(x,y,p.z));const pixel=pixelAt(tag.sprite.position);
        tag.sprite.scale.set(tag.width*pixel,tag.height*pixel,1);
        occupied.push({left:x-half-6,right:x+half+6,top:y-tag.height/2-6,bottom:y+tag.height/2+6});
        const points=tag.line.geometry.attributes.position;
        [anchor,unproject(x-side*(half+10),y,p.z),unproject(x-side*half,y,p.z)].forEach((v,i)=>points.setXYZ(i,v.x,v.y,v.z));points.needsUpdate=true;
      }
    }
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
    tags:group.visible?entries.filter(e=>e.burst).map(e=>e.tag.text):[],burst:group.visible?hitIds.filter(id=>burstIds.includes(id)):[],swell:group.visible?{...swells}:{},labels:group.visible?entries.length:0,zoom:lastZoom});
  function disposeMarkers(){
    for(const e of entries)e.tag.disposeMaps();markerTag.disposeMaps();
    for(const s of [marker,markerTag.sprite,spineCrack,spineFlash]){s.removeFromParent();s.material.map?.dispose();s.material.dispose();}
    markerTag.line.removeFromParent();markerTag.line.geometry.dispose();markerTag.line.material.dispose();
  }
  return {group,update,framing,layout,state,opacity:()=>lastAmount,disposeMarkers};
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
    pivot.scale.setScalar(organs.length?1+.8*zoom:1);
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

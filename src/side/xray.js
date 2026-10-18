import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

/* Lumbar x-ray film for the side-posture mode (user 2026-10-19: no organ ruptures here, "장기파열은 하지마 여기선").
   Its own small scene and camera drawn over the clinic render while the film is up (the clinic fades under it).
   public/models/side/lumbar.glb (scripts/assets/lumbar_build.py, BodyParts3D CC BY 4.0): L1..L5, sacrum, discs; local
   frame +x = the patient's left, +y up the spine, +z posterior, origin at the L4/L5 disc centre. Everything above that
   disc turns together about +y (the lumbar roll), so the L4/L5 facet on the up side is the joint that jams and opens.
   Beats by kind:
     ok    jammed (coral facet) -> swings open past neutral, the facet gap glows mint, one gas bubble pops
     weak  starts to open, sticks, the facet stays coral
     over  ratchets one notch too far, the L4/5 disc squirts out sideways ("디스크 탈주")
     tier  1: a coral crack across L4; 2: L4 snaps in two (clipped halves drift apart) */
const COL = {bone: 0xf4efe4, mint: 0x7fd1b9, coral: 0xff7a59};
const clamp01 = v => Math.min(1, Math.max(0, v));
const smooth = (a, b, x) => { const t = clamp01((x - a)/(b - a)); return t*t*(3 - 2*t); };
const DEG = Math.PI/180;
const VERT = /* glsl */`
#include <common>
#include <clipping_planes_pars_vertex>
varying vec3 vN; varying vec3 vV;
void main(){
  #include <begin_vertex>
  vec4 mv = modelViewMatrix*vec4(transformed, 1.0);
  vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix*mv;
  vec4 mvPosition = mv;
  #include <clipping_planes_vertex>
}`;
const FRAG = /* glsl */`
#include <clipping_planes_pars_fragment>
uniform vec3 uColor; uniform float uAlpha; uniform float uRim;
varying vec3 vN; varying vec3 vV;
void main(){
  #include <clipping_planes_fragment>
  float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
  float a = uAlpha*(0.24 + uRim*1.3*pow(f, 1.8));
  gl_FragColor = vec4(uColor*a, a);
}`;
function filmMaterial(color, alpha = 1, rim = 1.1){
  return new THREE.ShaderMaterial({vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthTest: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide, clipping: true,
    uniforms: {uColor: {value: new THREE.Color(color)}, uAlpha: {value: alpha}, uRim: {value: rim}}});
}
function dot(color, r){
  const m = new THREE.Mesh(new THREE.RingGeometry(r*.62, r, 40), new THREE.MeshBasicMaterial({color, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false}));
  m.renderOrder = 5; return m;
}

export async function createSideXray({renderer}){
  renderer.localClippingEnabled = true;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, .01, 4);
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(import.meta.env.BASE_URL + "models/side/lumbar.glb");
  const meta = await fetch(import.meta.env.BASE_URL + "models/side/lumbar.json").then(r => r.json());
  // the film itself: a dark backing over the whole clinic, a little lighter in the middle
  const backing = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({transparent: true, depthTest: false, depthWrite: false,
    uniforms: {uAlpha: {value: 0}},
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
    fragmentShader: "uniform float uAlpha; varying vec2 vUv; void main(){ float v = smoothstep(0.85, 0.2, length(vUv - 0.5)); gl_FragColor = vec4(mix(vec3(0.035, 0.09, 0.08), vec3(0.07, 0.16, 0.14), v), uAlpha); }"}));
  backing.frustumCulled = false; backing.renderOrder = -10; scene.add(backing);
  const root = new THREE.Group(); scene.add(root);
  const upper = new THREE.Group(); root.add(upper);          // L1..L4 + the discs above L4/L5: turns about +y
  const parts = {};
  for(const o of [...gltf.scene.children]){
    parts[o.name] = o;
    (/^(L[1-4]|disc_L[1-3])$/.test(o.name) ? upper : root).add(o);
  }
  const mats = {};
  for(const [name, o] of Object.entries(parts)){
    const disc = name.startsWith("disc");
    const m = filmMaterial(disc ? COL.mint : COL.bone, disc ? .55 : 1, disc ? .7 : 1.15);
    mats[name] = m;
    o.traverse(c => { if(c.isMesh){ c.material = m; c.renderOrder = disc ? 1 : 2; c.frustumCulled = false; } });
  }
  // L4 split for a break: two clipped copies of L4 replace it
  const L4 = parts.L4, pivotY = L4.position.y;
  const cutUp = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), cutDown = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
  const halves = [cutUp, cutDown].map((plane, i) => {
    const h = L4.clone(); const m = filmMaterial(COL.coral, 1, 1.3); m.clippingPlanes = [plane];
    h.traverse(c => { if(c.isMesh){ c.material = m; c.renderOrder = 3; } }); h.visible = false; upper.add(h); return {h, m, sign: i ? -1 : 1};
  });
  // facet markers on both L4/5 joints, the gas bubble, a crack bar
  const J = meta.joints["L4/L5"];
  const facet = {left: dot(COL.coral, .009), right: dot(COL.coral, .009)};
  facet.left.position.set(...J.left); facet.right.position.set(...J.right); root.add(facet.left, facet.right);
  const bubble = dot(0xffffff, .006); root.add(bubble);
  const crack = new THREE.Mesh(new THREE.PlaneGeometry(.05, .0025), new THREE.MeshBasicMaterial({color: COL.coral, transparent: true, depthTest: false, depthWrite: false, toneMapped: false}));
  crack.renderOrder = 6; crack.position.set(0, pivotY + .002, .01); upper.add(crack);
  const discRest = parts.disc_L4.position.clone(), discScale = parts.disc_L4.scale.clone();   // quantized meshes keep a node scale

  let film = 0, sx = 1, cssAspect = 1;
  // posterior oblique toward the worked facet, the spine upright on screen
  function frame(side){
    sx = side === "R" ? 1 : -1;     // side L (left down): the right facet is up and opens; R: the left one
    const dir = new THREE.Vector3(sx*Math.sin(35*DEG), .12, Math.cos(35*DEG)).normalize();
    const look = new THREE.Vector3(0, .035, .01), h = .34;
    const fov = camera.fov*DEG, d = Math.max(h/2/Math.tan(fov/2), .22/2/Math.tan(fov/2)/Math.min(1, cssAspect))*1.08;
    camera.position.copy(look).addScaledVector(dir, d); camera.up.set(0, 1, 0); camera.lookAt(look);
  }
  function update({film: f = 0, side = "L", kind = "ok", tier = 0, time = -1, height = .78} = {}){
    film = f;
    if(f <= .01){ root.visible = false; backing.material.uniforms.uAlpha.value = 0; return; }
    root.visible = true; backing.material.uniforms.uAlpha.value = .97*f; frame(side);
    const t = time - (tier ? .45 : .7);              // seconds since the film came up (clinicFilm's start)
    const s = sx;                                    // the worked facet is on +x for side R, -x for side L
    const jam = 8*DEG*s;
    let rot = jam;
    if(kind === "ok") rot = jam + (-12*DEG*s - jam)*smooth(.35, .6, t) + (4*DEG*s)*smooth(.6, 1.5, t);
    else if(kind === "weak") rot = jam - 5*DEG*s*Math.sin(Math.PI*clamp01((t - .35)/.5));
    else if(kind === "over" && !tier) rot = jam - (t > .4 ? 14 : 0)*DEG*s - (t > .62 ? 12 : 0)*DEG*s;
    else if(tier) rot = jam - 10*DEG*s*smooth(.2, .4, t);
    upper.rotation.y = rot;
    // facet glow: the worked joint jams coral, opens mint on a good release
    const worked = s > 0 ? facet.left : facet.right, idle = s > 0 ? facet.right : facet.left;
    const open = kind === "ok" ? smooth(.45, .65, t) : 0;
    worked.material.color.set(open > .5 ? COL.mint : COL.coral);
    worked.scale.setScalar(1 + open*.8 + (kind === "ok" ? 0 : .25*Math.sin(t*14)));
    worked.material.opacity = f; idle.material.opacity = f*.25; idle.material.color.set(COL.mint);
    for(const m of [worked, idle]) m.quaternion.copy(camera.quaternion);
    // one gas bubble at the opening facet
    const pop = kind === "ok" ? clamp01((t - .5)/.35) : 0;
    bubble.visible = pop > 0 && pop < 1; bubble.position.copy(worked.position).addScaledVector(camera.getWorldDirection(new THREE.Vector3()), -.01);
    bubble.scale.setScalar(.6 + pop*2.4); bubble.material.opacity = f*(1 - pop); bubble.quaternion.copy(camera.quaternion);
    // disc escape on an overload without a fracture
    const escape = kind === "over" && !tier ? smooth(.62, .9, t) : 0;
    parts.disc_L4.position.copy(discRest).add(new THREE.Vector3(-s*.065*escape, -.004*escape, .02*escape));
    parts.disc_L4.scale.copy(discScale).multiply(new THREE.Vector3(1 + .7*escape, 1 - .5*escape, 1 + .3*escape));
    mats.disc_L4.uniforms.uColor.value.set(escape > .1 ? COL.coral : COL.mint);
    // fractures
    crack.visible = tier === 1 && t > .3; crack.material.opacity = f; crack.quaternion.copy(camera.quaternion);
    const split = tier === 2 ? smooth(.3, .55, t) : 0;
    L4.visible = split === 0;
    for(const {h, m, sign} of halves){ h.visible = split > 0; h.position.set(sign*.008*split, pivotY + sign*.022*split, sign*.006*split); h.rotation.z = sign*.2*split; m.uniforms.uAlpha.value = f; }
    for(const [name, m] of Object.entries(mats)) m.uniforms.uAlpha.value = f*(name.startsWith("disc") ? .55 : 1)*(name === "L4" && tier === 1 && t > .3 ? 1.2 : 1);
    mats.L4.uniforms.uColor.value.set(tier ? COL.coral : COL.bone);
  }
  function render(r){
    if(film <= .01) return;
    const auto = r.autoClear; r.autoClear = false; r.clearDepth(); r.render(scene, camera); r.autoClear = auto;
  }
  function resize(w, h){ cssAspect = w/Math.max(1, h); camera.aspect = cssAspect; camera.updateProjectionMatrix(); }
  function dispose(){
    scene.traverse(o => { if(o.geometry) o.geometry.dispose(); if(o.material) o.material.dispose(); });
  }
  root.visible = false;
  return {update, render, resize, dispose, scene, camera};
}

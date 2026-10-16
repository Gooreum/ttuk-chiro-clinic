import {therapistMotion} from './therapistMotion.js';
import * as THREE from "three";
import {BACK_XRAY,cameraPreload,TARGETS,clinicFilm,impactFeel} from './core.js';
import {flinchProfile} from '../core/fail.js';
import {createBackXray} from "./xray.js";
import {createBackReaction} from "./reaction.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

/* Back-press mode scene ("허리 위에서 누르기"): its own renderer, scene and camera (nothing shared with scene/renderer.js).
   Patient01 (박대리) lies prone on the treatment table, face in the face-hole headpiece, arms along the sides
   (public/models/back/patient.glb, scripts/assets/back_patient.py). The therapist stands at the patient's left side
   (+x), leans over and presses with stacked hands on the spine (therapist.glb, back_therapist.py: skinned, bind pose =
   that working pose). The camera looks across the table at the therapist's face, 40 degrees down.

   Coordinates (three.js world, metres): +y up, the patient's head at -z, feet at +z, the pad top at y 0.82. The back
   zone runs z -0.05 (T1, base of the neck) .. 0.55 (L5): position 0..1 maps to z = -0.05 + position*0.6.

   render() inputs (all driven from outside; the scene keeps no game state beyond animation memory):
     now        ms (performance.now style)
     position   0..1 hands along the back zone
     pressure   0..1 preload: hands settle, the therapist starts leaning in
     impulse    0..1 the thrust (the caller supplies the profile); kind scales it:
     kind       "ok" | "weak" | "miss" | "over" (null = ok)
     step       0..2 the active target ring
     completed  0..3 rings done (dim mint)
   The scene detects the end of a thrust itself and plays the cushion rebound (over: an exaggerated trampoline bounce
   and a ripple through the shirt) and the ring pulses. */

const BASE = import.meta.env.BASE_URL + "models/back/";
export const BACK_Z0 = -0.05, BACK_LEN = 0.6;
export const RING_POS = [0.18, 0.50, 0.82];
const zAt = p => BACK_Z0 + p*BACK_LEN;
const TABLE_TOP = 0.82;
const COL = {room: 0x17312c, paper: 0xf4efe4, coral: 0xff7a59, mint: 0x8adfbf, gown: 0xf4efe4, pants: 0x17312c};
const lin = hex => new THREE.Color(hex).convertSRGBToLinear();

/* how far the tissue under the hands goes in at impulse 1 (m), and how the rebound overshoots */
const DEPTH = {ok: 0.034, weak: 0.013, miss: 0.026, over: 0.055};
const PRELOAD = 0.012;
const LEAN = {pre: 2.5, ok: 6, weak: 3, miss: 5, over: 11};    // trunk flex (degrees) at pressure 1 / impulse 1
const RING_R = 0.045, RING_W = 0.0065;
const CAM_ELEV = 40, CAM_AZ = 128;            // opposite side (-x), facing the therapist
const CAM_FOV = 38;

const clamp01 = v => Math.min(1, Math.max(0, v));
const smooth = (a, b, x) => { const t = clamp01((x - a)/(b - a)); return t*t*(3 - 2*t); };

/* ---------- shared shader patch: local compression of the back + target rings ---------- */
function makeUniforms(){
  return {
    bkPress: {value: new THREE.Vector4(0, 1, 0.25, 0)},      // x, y(unused), z, depth (m, + = in)
    bkWave: {value: new THREE.Vector4(0, 0.25, 0, 0)},       // x, z, time since start (s), amplitude (m)
    bkRing: {value: [0, 1, 2].map(i => new THREE.Vector3(0, zAt(RING_POS[i]), RING_R))},
    bkRingCol: {value: [0, 1, 2].map(() => new THREE.Vector4(0, 0, 0, 0))},
    bkRingFill: {value: [0, 0, 0]},
    bkPulse: {value: [new THREE.Vector4(0, 0, 0, 0), new THREE.Vector4(0, 0, 0, 0)]}, // x, z, radius, alpha
    bkPulseCol: {value: [new THREE.Color(), new THREE.Color()]},
    bkTable: {value: TABLE_TOP}
  };
}
const DISP_GLSL = /* glsl */`
uniform vec4 bkPress; uniform vec4 bkWave; uniform float bkTable;
varying vec3 vBackW;
float bkHeight(vec3 p){
  vec2 d = p.xz - bkPress.xz;
  float g = exp(-(d.x*d.x)/(2.0*0.058*0.058) - (d.y*d.y)/(2.0*0.075*0.075));
  float r = length(d*vec2(1.0, 0.8));
  float rim = exp(-pow((r - 0.12)/0.045, 2.0));             // the tissue pushed aside bulges around the hands
  float h = -bkPress.w*g + max(bkPress.w, 0.0)*0.16*rim;
  float wd = length(p.xz - bkWave.xy), wt = bkWave.z;
  if (bkWave.w > 0.0){
    float front = wt*0.9;
    h += bkWave.w*sin(30.0*wd - 21.0*wt)*smoothstep(front + 0.02, front - 0.10, wd)*exp(-wd*2.2);
  }
  return h*smoothstep(bkTable + 0.04, bkTable + 0.15, p.y);  // the side against the pad stays put
}`;
const FRAG_GLSL = /* glsl */`
uniform vec3 bkRing[3]; uniform vec4 bkRingCol[3]; uniform float bkRingFill[3];
uniform vec4 bkPulse[2]; uniform vec3 bkPulseCol[2];
varying vec3 vBackW;
float bkLine(float d, float r, float w){ return 1.0 - smoothstep(w*0.55, w*0.55 + 0.0025, abs(d - r)); }`;
const FRAG_APPLY = /* glsl */`
{
  vec3 bkN = normalize((vec4(normal, 0.0)*viewMatrix).xyz);
  float up = smoothstep(0.2, 0.55, bkN.y);
  for (int i = 0; i < 3; i++){
    float d = length(vBackW.xz - bkRing[i].xy);
    float k = max(bkLine(d, bkRing[i].z, ${RING_W.toFixed(4)}), (1.0 - smoothstep(bkRing[i].z*0.32, bkRing[i].z*0.32 + 0.003, d))*bkRingFill[i]);
    k = max(k, (1.0 - smoothstep(0.0, bkRing[i].z, d))*0.22*bkRingFill[i]);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, bkRingCol[i].rgb, k*bkRingCol[i].a*up);
  }
  for (int i = 0; i < 2; i++){
    float d = length(vBackW.xz - bkPulse[i].xy);
    float k = bkLine(d, bkPulse[i].z, 0.006 + bkPulse[i].z*0.08);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, bkPulseCol[i], k*bkPulse[i].w*up);
  }
}`;
function patchBack(mat, U, deform){
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\n" + DISP_GLSL)
      .replace("#include <project_vertex>", deform ? /* glsl */`
        vec4 bkW = modelMatrix*vec4(transformed, 1.0);
        float bkH0 = bkHeight(bkW.xyz);
        float bkHx = bkHeight(bkW.xyz + vec3(0.008, 0.0, 0.0)), bkHz = bkHeight(bkW.xyz + vec3(0.0, 0.0, 0.008));
        vec3 bkNw = normalize((vec4(vNormal, 0.0)*viewMatrix).xyz);
        bkNw = normalize(bkNw + vec3(-(bkHx - bkH0)/0.008, 0.0, -(bkHz - bkH0)/0.008)*max(bkNw.y, 0.0));
        vNormal = normalize((viewMatrix*vec4(bkNw, 0.0)).xyz);
        bkW.y += bkH0;
        vBackW = bkW.xyz;
        vec4 mvPosition = viewMatrix*bkW;
        gl_Position = projectionMatrix*mvPosition;` : `#include <project_vertex>
        vBackW = (modelMatrix*vec4(transformed, 1.0)).xyz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\n" + FRAG_GLSL)
      .replace("#include <tonemapping_fragment>", FRAG_APPLY + "\n#include <tonemapping_fragment>");
  };
  mat.customProgramCacheKey = () => "back" + (deform ? 1 : 0);
}

/* ---------- height field of the patient's back (back_surface.json) ---------- */
function heightField(S){
  const {x0, z0, step, nx, nz} = S, Y = S.y;
  const at = (i, j) => { const v = Y[j*nx + i]; return v == null ? NaN : v; };
  /* top of the patient (y) at x, z; NaN where the ray misses him */
  function y(x, z){
    const fx = (x - x0)/step, fz = (z - z0)/step;
    if (fx < 0 || fz < 0 || fx > nx - 1 || fz > nz - 1) return NaN;
    const i = Math.min(nx - 2, Math.floor(fx)), j = Math.min(nz - 2, Math.floor(fz)), u = fx - i, v = fz - j;
    const a = at(i, j), b = at(i + 1, j), c = at(i, j + 1), d = at(i + 1, j + 1);
    if ([a, b, c, d].some(Number.isNaN)){
      const vals = [a, b, c, d].filter(q => !Number.isNaN(q));
      return vals.length >= 3 ? Math.max(...vals) : NaN;
    }
    return (a*(1 - u) + b*u)*(1 - v) + (c*(1 - u) + d*u)*v;
  }
  /* what a flat palm rests on: the highest point within +-4 cm (the paraspinal muscles either side of the spine) */
  function palm(x, z){
    let m = -Infinity;
    for (const dx of [-0.04, -0.02, 0, 0.02, 0.04]) for (const dz of [-0.03, 0, 0.03]){
      const v = y(x + dx, z + dz); if (v > m) m = v;
    }
    return Number.isFinite(m) ? m : TABLE_TOP + 0.2;
  }
  return {y, palm};
}

/* ---------- clinic suite and prone face cradle ---------- */
function canvasTex(w, h, draw){
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
  return t;
}
function roundedRect(w, d, r, hole){
  const s = new THREE.Shape(), x = -w/2, y = -d/2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + d - r); s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  s.lineTo(x + r, y + d); s.quadraticCurveTo(x, y + d, x, y + d - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  if (hole){
    const p = new THREE.Path();
    p.absellipse(hole.x, hole.y, hole.rx, hole.ry, 0, Math.PI*2, true);
    s.holes.push(p);
  }
  return s;
}
/* a padded slab: shape in x/z, `h` thick, rounded edges, top at y = 0 */
function padGeo(w, d, h, r, bevel, hole){
  const g = new THREE.ExtrudeGeometry(roundedRect(w - 2*bevel, d - 2*bevel, Math.max(0.005, r - bevel), hole),
    {depth: h - 2*bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 18});
  g.rotateX(Math.PI/2);                      // extrude along -y; shape y -> z
  g.translate(0, -bevel, 0);
  return g;
}
// The same traction suite and stitched bed as the neck/towel modes. Only the
// prone face cradle is specific to this table; its aperture stays under the face.
function buildRoom(scene, track, suite){
  suite.position.y = -.022; scene.add(suite);
  const materials = new Map();
  suite.traverse(o => {
    if(!o.isMesh) return;
    o.castShadow = o.receiveShadow = true;
    const m = o.material; m.envMapIntensity = .16; materials.set(m.name,m);
    if(m.name === "suite.mint"){
      // The shared bed's square Catmull-Rom welt overshoots its corners. Keep
      // this scene's stitching on the upholstery instead of loose arcs in space.
      o.geometry = track(o.geometry.clone());
      const p = o.geometry.attributes.position;
      for(let i=0;i<p.count;i++)if(Math.abs(p.getY(i)-.78)<.005 && Math.abs(p.getX(i))<.7 && p.getZ(i)>-.2 && p.getZ(i)<2.4)
        {
          p.setX(i,THREE.MathUtils.clamp(p.getX(i),-.355,.355));
          if(p.getZ(i)<.43)p.setZ(i,THREE.MathUtils.clamp(p.getZ(i),-.0275,.3875));
        }
      p.needsUpdate=true; o.geometry.computeVertexNormals();
    }
  });
  const vinyl = materials.get("suite.leather"), paper = materials.get("suite.paper");
  const cradle = new THREE.Group(); scene.add(cradle);
  const add = (geo,mat,y,z) => {const m = new THREE.Mesh(track(geo),mat);m.position.set(0,y,z);m.castShadow=m.receiveShadow=true;cradle.add(m);return m;};
  add(padGeo(.36,.345,.085,.07,.03,{x:0,y:.0675,rx:.068,ry:.085}),vinyl,TABLE_TOP-.005,-.2575);
  const cover=add(new THREE.ShapeGeometry(roundedRect(.27,.3,.06,{x:0,y:-.0675,rx:.072,ry:.09}),24),paper,TABLE_TOP-.004,-.2575);
  cover.rotation.x=-Math.PI/2;
  const rail=track(new THREE.MeshStandardMaterial({color:COL.mint,roughness:.5,metalness:.6}));
  add(new THREE.BoxGeometry(.22,.03,.05),rail,TABLE_TOP-.11,-.23);
  add(new THREE.BoxGeometry(.05,.03,.2),rail,TABLE_TOP-.11,-.12);
  // Match the clinic's paper plaque typography; wait for the actual Korean fonts.
  const sign=track(canvasTex(1024,512,(g,w,h)=>{
    g.fillStyle="#f4efe4";g.fillRect(0,0,w,h);g.strokeStyle="#17312c";g.lineWidth=5;g.strokeRect(22,22,980,468);
    g.fillStyle="#17312c";g.font='80px "Black Han Sans"';g.fillText("물리치료실",66,175);
    g.font='500 32px "IBM Plex Sans KR"';g.fillText("뚝 카이로 클리닉",70,245);
    g.fillStyle="#ff7a59";g.fillRect(70,298,110,12);g.fillStyle="#17312c";g.font='128px "Black Han Sans"';g.fillText("03",700,384);
  }));
  const plaque=new THREE.Mesh(track(new THREE.PlaneGeometry(.57,.285)),track(new THREE.MeshStandardMaterial({map:sign,roughness:.84})));
  plaque.position.set(.08,1.91,-2.289);scene.add(plaque);
}

/* ---------- glTF ---------- */
function loadGLB(loader, url){ return new Promise((res, rej) => loader.load(url, res, undefined, rej)); }
function stdMat(m){ return m && (m.isMeshStandardMaterial || m.isMeshPhysicalMaterial); }
/* alpha-tested hair: GLTFLoader leaves depthWrite off on BLEND materials, which lets the scalp (drawn later) cover it */
function hairOver(m){ m.transparent = false; m.depthWrite = true; m.alphaTest = 0.02; m.side = THREE.DoubleSide; }

/* ---------- the scene ---------- */
export async function createBackScene(canvas, view = {}){
  const renderer = new THREE.WebGLRenderer({canvas, antialias: true, powerPreference: "high-performance"});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const owned = new Set();
  const track = x => { owned.add(x); return x; };
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COL.room);
  scene.fog = new THREE.Fog(COL.room, 5, 11);
  const camera = new THREE.PerspectiveCamera(CAM_FOV, 16/9, 0.03, 20);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  scene.environment = env;

  // Clinic palette: a paper key (the only soft shadow), restrained fill and mint rim.
  scene.add(new THREE.HemisphereLight(COL.paper, COL.room, .43));
  const key = new THREE.SpotLight(COL.paper, 1.9, 0, 0.58, 0.9, 1);
  key.position.set(-1.2, 3.1, .4); key.target.position.set(0, 0.95, 0.3);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.bias = -0.0003; key.shadow.normalBias = 0.015;
  key.shadow.camera.near = 0.8; key.shadow.camera.far = 3.2;
  key.shadow.radius = 4;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(COL.paper, .19);
  fill.position.set(-1.6, 1.8, -0.6); scene.add(fill);
  const rim = new THREE.DirectionalLight(COL.mint, .16);
  rim.position.set(-0.8, 1.4, 1.8); scene.add(rim);


  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const [pg, tg, surf, room] = await Promise.all([
    loadGLB(loader, BASE + "patient.glb"),
    loadGLB(loader, BASE + "therapist.glb"),
    fetch(BASE + "back_surface.json").then(r => { if (!r.ok) throw new Error("back_surface.json " + r.status); return r.json(); }),
    loadGLB(loader, import.meta.env.BASE_URL + "models/towel-stage/room.glb"),
    document.fonts.ready
  ]);
  buildRoom(scene, track, room.scene);
  const hf = heightField(surf);
  const [xray, reaction] = await Promise.all([createBackXray({scene,camera,env,renderer}),createBackReaction(renderer)]);
  scene.add(xray.group);
  const patientFade=[], therapistFade=[];
  const roomBackground=scene.background.clone(), xrayBackground=new THREE.Color(0x0f231f);

  // ---- patient ----
  const U = makeUniforms();
  const patient = pg.scene;
  patient.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    const m = o.material; if (!stdMat(m)) return;
    m.envMapIntensity = 0.28;
    const n = m.name || "";
    if (/short02/.test(n)){ m.transparent = false; m.alphaTest = 0.02; m.side = THREE.DoubleSide; m.roughness = 0.55; m.color.copy(lin(0x4a3a30)); hairOver(m); return; }
    if (/shirt/.test(n)){ m.roughness = 0.9; }
    else if (/pants/.test(n)){ m.roughness = 0.88; }
    else if (/skin/.test(n)){ m.roughness = 0.58; }
    m.transparent=true; m.depthWrite=true; patientFade.push(m);
    patchBack(m, U, true);
  });
  const patientRoot = new THREE.Group(); patientRoot.add(patient); scene.add(patientRoot);

  // ---- therapist ----
  const ther = tg.scene;
  const bones = {};
  ther.traverse(o => {
    if (o.isBone) bones[o.name] = o;
    if (o.isMesh){
      o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
      const m = o.material; if (!stdMat(m)) return;
      m.envMapIntensity = 0.28;
      if (!/short04|eyebrow|eyelash/.test(m.name)){m.transparent=true;m.depthWrite=true;therapistFade.push(m);}
      // MakeHuman hair textures are light brown; the game tints them (roster hairTint)
      if (/short04/.test(m.name)){ m.transparent = false; m.alphaTest = 0.02; m.side = THREE.DoubleSide; m.roughness = 0.5; m.color.copy(lin(0x1c1816)); hairOver(m); }
      else if (/eyebrow|eyelash/.test(m.name)){ m.transparent = true; m.depthWrite = false; m.alphaTest = 0.02; m.side = THREE.DoubleSide; }
    }
  });
  const mark = n => { const o = tg.scene.getObjectByName(n); return o ? o.getWorldPosition(new THREE.Vector3()) : null; };
  ther.updateMatrixWorld(true);
  const C0 = mark("mark_contact") || new THREE.Vector3(0.027, 1.062, 0.26);
  const theRoot = new THREE.Group(); theRoot.add(ther); scene.add(theRoot);
  ther.updateMatrixWorld(true);
  // bind pose (= rest) in world space with the root at the origin
  const REST = {};
  for (const [n, b] of Object.entries(bones)) REST[n] = b.quaternion.clone();
  const W = n => bones[n].getWorldPosition(new THREE.Vector3());
  const WQ = n => bones[n].getWorldQuaternion(new THREE.Quaternion());
  const ARM = {};
  for (const sd of ["l", "r"]){
    const S = W("upperarm_" + sd), E = W("lowerarm_" + sd), H = W("hand_" + sd);
    const ax = H.clone().sub(S).normalize();
    const pole = E.clone().sub(S); pole.sub(ax.clone().multiplyScalar(pole.dot(ax))).normalize();
    ARM[sd] = {Lu: E.distanceTo(S), Lf: H.distanceTo(E), H0: H, pole, Qh: WQ("hand_" + sd)};
  }
  const C0surf = hf.palm(C0.x, C0.z);
  const contactLift = C0.y - C0surf;          // the palm sits this far over the back in the bind pose

  // ---- bone helpers (world-space rotations on a pose that is reset to the bind pose every frame) ----
  const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
  function worldRotate(bone, dq){
    // bone.local = parentWorld^-1 * dq * parentWorld * bone.local
    bone.parent.getWorldQuaternion(_q2);
    _q.copy(_q2).invert().multiply(dq).multiply(_q2);
    bone.quaternion.premultiply(_q);
    bone.updateMatrixWorld(true);
  }
  function setWorldQuat(bone, q){
    bone.parent.getWorldQuaternion(_q2);
    bone.quaternion.copy(_q2.invert().multiply(q));
    bone.updateMatrixWorld(true);
  }
  function aimBone(bone, child, target){
    const a = bone.getWorldPosition(new THREE.Vector3());
    const cur = child.getWorldPosition(_v).sub(a).normalize();
    const want = _v2.copy(target).sub(a).normalize();
    worldRotate(bone, new THREE.Quaternion().setFromUnitVectors(cur, want));
  }
  const ZAXIS = new THREE.Vector3(0, 0, 1);
  function poseTherapist(contact, lean, move){
    for (const [n, b] of Object.entries(bones)) b.quaternion.copy(REST[n]);
    ther.updateMatrixWorld(true);
    // the body weight drops onto the hands: hip hinge + rounded upper back (+ about z = forward, toward -x)
    const r = THREE.MathUtils.degToRad(lean),hip=r*.3;
    if(bones.pelvis)worldRotate(bones.pelvis,new THREE.Quaternion().setFromAxisAngle(ZAXIS,hip));
    const knee=THREE.MathUtils.degToRad(move.knee);
    for(const sd of ['l','r'])for(const [name,angle] of [['thigh_',-hip-knee*.5],['calf_',knee],['foot_',-knee*.5]]){
      if(bones[name+sd])worldRotate(bones[name+sd],new THREE.Quaternion().setFromAxisAngle(ZAXIS,angle));
    }
    for (const [n, s] of [["spine_01", 0.45], ["spine_02", 0.3], ["spine_03", 0.25]])
      if (bones[n]) worldRotate(bones[n], new THREE.Quaternion().setFromAxisAngle(ZAXIS, r*s*.7));
    if (bones.head) worldRotate(bones.head, new THREE.Quaternion().setFromAxisAngle(ZAXIS, -r*0.4));
    // arms: two-bone IK to the stacked hands; hands keep their bind orientation
    const shift = contact.clone().sub(C0);
    for (const sd of ["l", "r"]){
      const A = ARM[sd], ua = bones["upperarm_" + sd], la = bones["lowerarm_" + sd], hd = bones["hand_" + sd];
      const S = ua.getWorldPosition(new THREE.Vector3());
      const T = A.H0.clone().add(shift);
      const dv = T.clone().sub(S); const d = Math.min(dv.length(), 0.999*(A.Lu + A.Lf)); const e = dv.normalize();
      const a = (A.Lu*A.Lu - A.Lf*A.Lf + d*d)/(2*d), h = Math.sqrt(Math.max(A.Lu*A.Lu - a*a, 0));
      const p = A.pole.clone(); p.sub(e.clone().multiplyScalar(p.dot(e))).normalize();
      const E = S.clone().addScaledVector(e, a).addScaledVector(p, h);
      aimBone(ua, la, E);
      aimBone(la, hd, S.clone().addScaledVector(e, d));
      setWorldQuat(hd, A.Qh);
    }
  }

  // ---- animation memory ----
  const st = {
    t: null, rootZ: C0.z, lastImp: 0, peak: 0, peakKind: "ok", pressing: false, pressStep: 0,
    rebound: null,          // {t0, amp, kind}
    wave: null,             // {t0, x, z, amp}
    pulses: [],             // {t0, x, z, col, dur, r0, r1, a}
    lastCompleted: null, shake: 0
  };
  const ringCol = {mint: lin(COL.mint), dim: lin(0x5fa58f), paper: lin(COL.paper), coral: lin(COL.coral)};
  function pulse(now, x, z, col, dur, r0, r1, a){
    st.pulses.push({t0: now, x, z, col, dur, r0, r1, a});
    if (st.pulses.length > 2) st.pulses.shift();
  }

  // ---- camera fit ----
  let cssW = 1, cssH = 1;
  // (view: optional {elev, az, fov} overrides for tuning in scripts/assets/back_preview.html)
  const camTarget = new THREE.Vector3(...(view.target || [0.12, 1.10, 0.24]));
  const EL = THREE.MathUtils.degToRad(view.elev ?? CAM_ELEV), AZ = THREE.MathUtils.degToRad(view.az ?? CAM_AZ);
  const camDir = new THREE.Vector3(Math.cos(EL)*Math.cos(AZ), Math.sin(EL), Math.cos(EL)*Math.sin(AZ));
  // Frame the patient's back, the face cradle and the therapist's face from across the table.
  const FIT = [[0, .94, -.40], [0, .90, .88], [-.34, .86, .25], [.72, 1.72, .25]].map(p => new THREE.Vector3(...p));
  const camBase = new THREE.Vector3();
  function fitCamera(){
    camera.aspect = cssW/cssH;
    const portrait = cssW < cssH;
    camera.fov = view.fov ?? (portrait ? 50 : CAM_FOV);
    camera.updateProjectionMatrix();
    const margin = portrait ? 0.9 : 0.86;
    let lo = 0.6, hi = 8;
    for (let i = 0; i < 24; i++){
      const mid = (lo + hi)/2;
      camera.position.copy(camTarget).addScaledVector(camDir, mid); camera.lookAt(camTarget); camera.updateMatrixWorld();
      const ok = FIT.every(p => { const q = p.clone().project(camera); return Math.abs(q.x) <= margin && Math.abs(q.y) <= margin && q.z < 1; });
      if (ok) hi = mid; else lo = mid;
    }
    camBase.copy(camTarget).addScaledVector(camDir, hi);
    camera.position.copy(camBase); camera.lookAt(camTarget); camera.updateMatrixWorld();
  }

  function contactAt(position, depth){
    const z = zAt(clamp01(position));
    return new THREE.Vector3(C0.x, hf.palm(C0.x, z) + contactLift - depth + patientRoot.position.y, z);
  }

  function render({now = performance.now(), position = 0.5, pressure = 0, impulse = 0, kind = "ok", step = 0, completed = 0, shotTime=-1, forceTier=0, faceVisible=false, faceTime=0, breath=0, peakPressure=0, feedback='dud',faceName='rest',force=1, organs=[], targets=TARGETS, showTargets=true, revealTarget=false} = {}){
    if(faceVisible){
      reaction.update({time:faceTime,kind,forceTier,now,faceName,force});
      renderer.render(reaction.scene,reaction.camera);return;
    }
    const k = kind || "ok",feel=impactFeel(force,forceTier),move=therapistMotion(shotTime,force,forceTier);
    const film=clinicFilm(shotTime,kind,forceTier,force);
    xray.update({time:shotTime,step,kind,position,forceTier,force,organs});
    for(const m of patientFade){m.opacity=1-film*.78;m.depthWrite=film<.05;}
    for(const m of therapistFade){m.opacity=1-film*.8;m.depthWrite=film<.05;}
    renderer.toneMappingExposure=1-film*.35;
    scene.background.copy(roomBackground).lerp(xrayBackground,film*.8);
    const dt = st.t == null ? 1/60 : Math.min(0.1, Math.max(0, (now - st.t)/1000));
    st.t = now;
    if (st.lastCompleted == null) st.lastCompleted = completed;
    pressure = clamp01(pressure); impulse=THREE.MathUtils.clamp(impulse,-.5,3);

    // Original clinic profiles supply the whole thrust; do not add the old back-only spring/gag.
    if(shotTime>=0&&shotTime>=move.impactAt-.10&&shotTime<move.impactAt+.03)st.shake=Math.max(st.shake,feel.shake);
    if(forceTier&&shotTime>=.8+move.xrayDelay&&shotTime<.96+move.xrayDelay)st.shake=Math.max(st.shake,forceTier===2?.8:.5);
    // a ring got done: mint pulse from it
    if (completed > st.lastCompleted){
      const i = Math.min(2, completed - 1), z = zAt(targets[i]);
      pulse(now, 0, z, ringCol.mint, 0.85, RING_R, RING_R*3.6, 1);
      pulse(now + 140, 0, z, ringCol.mint, 0.7, RING_R, RING_R*2.4, 0.7);
    }
    st.lastCompleted = completed;

    // depth under the hands: preload + thrust + the cushion rebound (negative = springs above the rest)
    let depth = pressure*PRELOAD + impulse*DEPTH.ok+move.compression;
    const snap=Math.max(0,impulse);
    patientRoot.rotation.x=0;
    patientRoot.rotation.z=forceTier&&shotTime>=0?Math.sin(shotTime*(forceTier===2?32:23))*feel.settle*Math.exp(-shotTime*(forceTier===2?1.6:3)):0;
    patientRoot.position.y=-snap*.008-move.compression*.45;
    depth=Math.max(depth,-.028);

    // the press point on the back follows the hands
    const contact = contactAt(position, depth*0.92);
    if(kind!=='ok'&&feedback==='finger'&&!forceTier&&shotTime>=0){const f=flinchProfile(shotTime);contact.y+=f.away*.12;contact.x+=f.shake*.025;}
    U.bkPress.value.set(contact.x, 0, contact.z, depth);
    U.bkWave.value.w=0;

    // rings
    const breathe = 0.5 + 0.5*Math.sin(now/1000*Math.PI*1.6);
    for (let i = 0; i < 3; i++){
      const c = U.bkRingCol.value[i];
      U.bkRing.value[i].y=zAt(targets[i]);
      if (i < completed){ c.set(ringCol.dim.r, ringCol.dim.g, ringCol.dim.b, 0.62); U.bkRingFill.value[i] = 0.9; U.bkRing.value[i].z = RING_R*0.85; }
      else if (i === step){
        const m = ringCol.mint;
        c.set(m.r*1.35, m.g*1.35, m.b*1.35, 0.78 + 0.22*breathe); U.bkRingFill.value[i] = 0.55 + 0.45*breathe;
        U.bkRing.value[i].z = RING_R*(1 + 0.08*breathe);
      } else { const p = ringCol.paper; c.set(p.r, p.g, p.b, 0.22); U.bkRingFill.value[i] = 0; U.bkRing.value[i].z = RING_R*0.85; }
    }
    for(let i=completed;i<3;i++){if(i>step||(!showTargets&&!revealTarget)){U.bkRingCol.value[i].w=0;U.bkRingFill.value[i]=0;}}
    st.pulses = st.pulses.filter(p => now - p.t0 < p.dur*1000);
    for (let i = 0; i < 2; i++){
      const p = st.pulses[i], v = U.bkPulse.value[i];
      if (!p || now < p.t0){ v.w = 0; continue; }
      const t = (now - p.t0)/(p.dur*1000), e = 1 - Math.pow(1 - t, 3);
      v.set(p.x, p.z, p.r0 + (p.r1 - p.r0)*e, p.a*(1 - t)*(1 - t));
      U.bkPulseCol.value[i].copy(p.col).multiplyScalar(1.3);
    }

    // therapist: the body follows the hands along the table (a step behind), leans in with the press
    const kk = 1 - Math.exp(-dt*5);
    st.rootZ += (contact.z - st.rootZ)*kk;
    theRoot.position.set(move.x,move.y,st.rootZ-C0.z+move.handAway*.35);
    theRoot.rotation.set(0,move.yaw,move.roll);
    const lean=pressure*LEAN.pre+impulse*LEAN.ok+move.lean+Math.max(0,-depth)*-40;
    theRoot.updateMatrixWorld(true);
    const handContact=contact.clone();handContact.y+=move.handLift;handContact.x+=move.handAway;
    poseTherapist(handContact,lean,move);

    // camera: a small dip with the thrust, a shake on "over"
    st.shake = Math.max(0, st.shake - dt*1.6);
    camera.position.copy(camBase);
    const handLook=new THREE.Vector3(.08,1.11,zAt(clamp01(position)));
    const loaded=cameraPreload(pressure,peakPressure,shotTime);
    const leanZoom=smooth(.15,.6,loaded)*.48*(1-film);
    camera.position.lerp(handLook.clone().add(camBase.clone().sub(camTarget).multiplyScalar(.72)),leanZoom);
    camera.position.addScaledVector(camDir,-loaded*.035-impulse*.075);
    const focus = new THREE.Vector3(0,.96,zAt(clamp01(position)));
    const wideLook=new THREE.Vector3(.25,1.12,zAt(clamp01(position)));
    camera.position.lerp(wideLook.clone().add(camDir.clone().multiplyScalar(3.2)),move.wide);
    let filmCamera=new THREE.Vector3(-.24,1.06,focus.z+.06);
    if(organs.length){
      const box=xray.organFraming(organs,focus.z),centre=box.getCenter(new THREE.Vector3());
      focus.x=centre.x*.3;focus.z=focus.z*.65+centre.z*.35;
      const dir=new THREE.Vector3(-.32,.94,.13).normalize();
      const right=new THREE.Vector3().crossVectors(camera.up,dir).normalize(),up=new THREE.Vector3().crossVectors(dir,right);
      const tan=Math.tan(THREE.MathUtils.degToRad(camera.fov/2));let distance=.52;
      for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
        const v=new THREE.Vector3(x,y,z).sub(focus),near=v.dot(dir);
        distance=Math.max(distance,near+Math.abs(v.dot(up))/(tan*.78),near+Math.abs(v.dot(right))/(tan*camera.aspect*.82));
      }
      filmCamera=focus.clone().addScaledVector(dir,distance);
    }
    camera.position.lerp(filmCamera,film*.92);
    if (st.shake > 0){
      const s = st.shake*st.shake*0.012, t = now/1000;
      camera.position.x += Math.sin(t*61)*s; camera.position.y += Math.sin(t*47 + 1)*s; camera.position.z += Math.sin(t*53 + 2)*s;
    }
    camera.lookAt(camTarget.clone().lerp(handLook,leanZoom*.8).lerp(wideLook,move.wide).lerp(focus,film*.95));
    st.metrics={depth,lean,force,tier:forceTier,impulse,shake:st.shake,therapist:{...move},...(import.meta.env.MODE==='shot'?{organOpacity:xray.organOpacity()}: {})};
    renderer.render(scene, camera);
  }

  function resize(width, height){
    cssW = Math.max(1, width|0); cssH = Math.max(1, height|0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(cssW, cssH, false);
    fitCamera(); reaction.resize(cssW,cssH);
  }

  /* back position (0..1) -> canvas-local CSS pixels of the spine's surface there */
  function projectPosition(position){
    const z = zAt(clamp01(position));
    const y = hf.y(0, z);
    const p = new THREE.Vector3(0, (Number.isFinite(y) ? y : TABLE_TOP + 0.2) + patientRoot.position.y, z);
    camera.updateMatrixWorld();
    p.project(camera);
    return {x: (p.x + 1)/2*cssW, y: (1 - p.y)/2*cssH};
  }

  /* canvas-local CSS pixels -> back position 0..1, or null off the back. Marches the camera ray down onto the height
     field (the therapist's arms do not block the pick). */
  const ray = new THREE.Ray();
  function pickPosition(x, y){
    camera.updateMatrixWorld();
    const ndc = new THREE.Vector3(x/cssW*2 - 1, -(y/cssH)*2 + 1, 0.5);
    ray.origin.copy(camera.position);
    ray.direction.copy(ndc.unproject(camera)).sub(camera.position).normalize();
    const lift = patientRoot.position.y;
    const above = t => { const p = ray.at(t, _v); const h = hf.y(p.x, p.z); return Number.isFinite(h) ? p.y - (h + lift) : Infinity; };
    let prev = 0.2, hit = null;
    for (let t = 0.2; t < 6; t += 0.01){
      const a = above(t);
      if (a <= 0){
        let lo = prev, hi = t;
        for (let i = 0; i < 12; i++){ const m = (lo + hi)/2; if (above(m) <= 0) hi = m; else lo = m; }
        hit = ray.at(hi, new THREE.Vector3()); break;
      }
      prev = t;
      if (ray.at(t, _v).y < TABLE_TOP - 0.05) break;
    }
    if (!hit || Math.abs(hit.x) > 0.17) return null;
    const pos = (hit.z - BACK_Z0)/BACK_LEN;
    if (pos < -0.04 || pos > 1.04) return null;
    return clamp01(pos);
  }

  function dispose(){
    xray.dispose();reaction.dispose();
    scene.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of ms){
        for (const key of Object.keys(m)){ const v = m[key]; if (v && v.isTexture) v.dispose(); }
        m.dispose();
      }
    });
    for (const x of owned) if (x.dispose) x.dispose();
    env.dispose();
    key.shadow.map?.dispose();
    renderer.renderLists.dispose();
    renderer.dispose();
  }

  resize(canvas.clientWidth || canvas.width || 1, canvas.clientHeight || canvas.height || 1);
  // compile now so the first frame does not hitch
  renderer.compile(scene, camera);
  renderer.compile(reaction.scene,reaction.camera);
  return {screenAxis: 1, render, resize, dispose, projectPosition, pickPosition, metrics:()=>st.metrics, renderer, scene, camera};
}

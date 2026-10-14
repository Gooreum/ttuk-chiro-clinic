import * as THREE from "three";
import { mats } from "./materials.js";
import { renderer } from "./renderer.js";
import { head, hands, handParts, xrayMats } from "./patientModel.js";
import { expressionWeights } from "../core/faceRig.js";

/* Realistic glTF models for the first patient (AGENTS.md 2, "realistic assets").
   Patient head: MakeHuman/MPFB2 character (CC0), built by scripts/assets/*.py, optimized copy in public/models/patient01.
   Loaded once in the background; until a model is ready (or if it fails) the primitive version stays.
   Everything is parented under the existing `head` group, so the neck pivot, camera, aiming and judging are untouched.

   Therapist hands: WebXR generic-hand (MIT, @webxr-input-profiles/assets 1.0.20, public/models/hands/LICENSE.md).
   Rest pose: fingers along -Y, thumb toward -Z, real size (~18 cm). Right hand palm faces -X, left hand +X. */
const BASE = import.meta.env.BASE_URL + "models/";
// GLTFLoader + meshopt decoder are loaded on demand (own chunk), so the main bundle stays as small as before
let loaderP = null;
function getLoader(){
  return loaderP || (loaderP = Promise.all([
    import("three/examples/jsm/loaders/GLTFLoader.js"),
    import("three/examples/jsm/libs/meshopt_decoder.module.js")
  ]).then(([{GLTFLoader}, {MeshoptDecoder}]) => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)));
}
/* Soft studio reflections for the realistic head only (eye catchlights, skin sheen). Built once, lazily. */
let envP = null;
export function getEnv(){
  return envP || (envP = import("three/examples/jsm/environments/RoomEnvironment.js").then(({RoomEnvironment}) => {
    const pm = new THREE.PMREMGenerator(renderer);
    const tex = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();
    return tex;
  }));
}
const load = url => getLoader().then(loader => new Promise((res, rej) => loader.load(url, res, undefined, rej)));
/* Shared with scene/xray.js (the spine model): path under public/models. */
export const loadModel = path => load(BASE + path);

// head-local frame: +y = face (ceiling), -z = top of head (camera side), +z = toward the feet, x = sides
// s = +1 on world +x (screen left, therapist's left hand), s = -1 on world -x (screen right, right hand)
// Three poses per hand, blended every frame (updateRealHands):
//   rest    both palms on the sides of the jaw, fingers toward the neck, back of the hand toward the camera
//   contact the hand opposite the turn slides down to the side of the neck at the stuck level, palm flat on it,
//           fingers wrapping behind the neck; on the crack it gives a short inward push and a squeeze
//   cradle  the hand on the turning side cups behind the ear and under the skull and carries the head's weight
const POSES = {
  rest:    {at: [0.1, 0.015, 0.03],   fingers: [0, -0.35, 1],  tilt: 0.55},
  contact: {at: [0.084, -0.004, 0.1], fingers: [0, -0.75, 0.65], tilt: 0.2},
  cradle:  {at: [0.092, -0.035, -0.01], fingers: [0, -0.9, 0.45], tilt: 0.85}
};
function handBasis(s, pose){
  const fModel = new THREE.Vector3(0, -1, 0), nModel = new THREE.Vector3(s > 0 ? 1 : -1, 0, 0);
  const fingers = new THREE.Vector3(...pose.fingers);
  const nTarget = new THREE.Vector3(-s, -pose.tilt, 0).normalize();          // palm faces the head
  const fTarget = fingers.addScaledVector(nTarget, -fingers.dot(nTarget)).normalize();
  const m = new THREE.Matrix4().makeBasis(fModel, nModel, fModel.clone().cross(nModel));
  const t = new THREE.Matrix4().makeBasis(fTarget, nTarget, fTarget.clone().cross(nTarget));
  return new THREE.Quaternion().setFromRotationMatrix(t.multiply(m.transpose()));
}
const poseOf = (s, name) => ({pos: new THREE.Vector3(POSES[name].at[0]*s, POSES[name].at[1], POSES[name].at[2]), quat: handBasis(s, POSES[name])});
// palm centre in model space (between wrist and finger roots, palm side)
const PALM_MODEL = {"-1": new THREE.Vector3(0.025, 0.0, 0.012), "1": new THREE.Vector3(-0.025, 0.0, 0.012)};

/* Finger pose, rebuilt from the rest skeleton every frame. The generic-hand joints are siblings (no bone hierarchy),
   so curling a finger means rotating every later joint of that finger around the knuckle by hand. Model axes:
   +z runs index -> pinky, palm faces -x (right) or +x (left): a curl is a rotation about z, a spread is a rotation
   about x (the palm normal), and moving the thumb in toward the palm is a rotation about y. */
const FINGERS = ["index-finger", "middle-finger", "ring-finger", "pinky-finger"];
const JOINTS = ["phalanx-proximal", "phalanx-intermediate", "phalanx-distal", "tip"];
const CURL = [0.42, 0.32, 0.16];     // proximal, intermediate, distal (radians) at grip 0
const SPREAD = [-0.07, -0.02, 0.03, 0.09];
const X_AXIS = new THREE.Vector3(1, 0, 0), Y_AXIS = new THREE.Vector3(0, 1, 0), Z_AXIS = new THREE.Vector3(0, 0, 1);
const _q = new THREE.Quaternion(), _v = new THREE.Vector3();
function bend(bones, pivotName, names, axis, angle){
  const pivot = bones[pivotName].position.clone();
  _q.setFromAxisAngle(axis, angle);
  names.forEach(n => {
    const b = bones[n];
    b.position.copy(_v.copy(b.position).sub(pivot).applyQuaternion(_q).add(pivot));
    b.quaternion.premultiply(_q);
  });
}
// grip: 0 loose cradle .. 1 firm hold. t: seconds, drives small independent drifts so fingers never freeze.
// phase: per-hand offset so the two hands don't move in step.
function poseFingers(h, grip, spread, t){
  const {bones, rest, s, phase} = h.userData;
  rest.forEach(([b, p, q]) => { b.position.copy(p); b.quaternion.copy(q); });
  FINGERS.forEach((f, fi) => {
    const j = JOINTS.map(x => `${f}-${x}`);
    const drift = 0.05*Math.sin(t*1.1 + phase + fi*1.7) + 0.025*Math.sin(t*2.9 + phase*2 + fi*0.9);
    bend(bones, j[0], j.slice(1), X_AXIS, s * SPREAD[fi] * spread);
    j.slice(0, 3).forEach((pivot, i) => bend(bones, pivot, j.slice(i + 1), Z_AXIS, s * (CURL[i]*(1 + 0.55*grip) + drift*(1 - i*0.3))));
  });
  const thumbDrift = 0.04*Math.sin(t*1.4 + phase*1.3);
  bend(bones, "thumb-metacarpal", ["thumb-phalanx-proximal", "thumb-phalanx-distal", "thumb-tip"], Y_AXIS, -s * (0.45 + 0.2*grip + thumbDrift));
  bend(bones, "thumb-phalanx-proximal", ["thumb-phalanx-distal", "thumb-tip"], Z_AXIS, s * (0.15 + 0.25*grip));
}

const real = {hands: null, head: null, morphs: [], skin: null, hair: null};
let wantHands = false, wantHead = false, lastLook = null;

/* ---- patient head ----
   GLB space: metres, +Y up (crown), +Z = face. Measured on the export (scripts/assets/mpfb_export_head.py):
   crown y 1.625, chin y 1.358, back of skull z -0.062. The primitive head (head-local) has its crown at z -0.134,
   chin at z +0.142 and the back of the skull (resting on the pillow) at y -0.110. Fit crown/chin exactly with a
   uniform scale, rest the back of the skull where the old one rested, keep x centred. */
const GLB = {crown: 1.625, chin: 1.358, back: -0.062};
const PRIM = {crown: -0.134, chin: 0.142, back: -0.110};
const HEAD_SCALE = (PRIM.chin - PRIM.crown) / (GLB.crown - GLB.chin);
function placeHead(gltf, env){
  const root = new THREE.Group();
  root.rotation.x = -Math.PI/2;                          // +Y (crown) -> -z (camera side), +Z (face) -> +y (ceiling)
  root.scale.setScalar(HEAD_SCALE);
  root.position.set(0, PRIM.back - GLB.back*HEAD_SCALE, PRIM.crown + GLB.crown*HEAD_SCALE);
  gltf.scene.traverse(o => {
    if(!o.isMesh) return;
    const src = o.material, name = src.name || "";
    let m = new THREE.MeshStandardMaterial({map: src.map, normalMap: src.normalMap || null, roughness: 0.6, metalness: 0, envMap: env, envMapIntensity: 0.35});
    if(name.endsWith(".body")){
      // skin: a reddish sheen on grazing angles stands in for light scattering under the skin
      m = new THREE.MeshPhysicalMaterial({map: src.map, normalMap: src.normalMap || null, roughness: 0.52, metalness: 0,
        sheen: 0.45, sheenColor: new THREE.Color(0xb04030), sheenRoughness: 0.6, specularIntensity: 0.5,
        envMap: env, envMapIntensity: 0.22});
      m.emissive = new THREE.Color(0xff7a59); m.emissiveIntensity = 0; real.skin = m;
    }
    else if(name.endsWith(".cornea")){
      // clear glossy shell over the eye: only reflections (catchlights), nothing diffuse
      m = new THREE.MeshPhysicalMaterial({color: 0x000000, roughness: 0.04, metalness: 0, envMap: env, envMapIntensity: 1.6,
        transparent: true, opacity: 0.18, depthWrite: false});
    }
    else if(name.endsWith(".high-poly")){
      // eyeball. Older exports carry the cornea shell in a fully transparent texture corner: discard it.
      // A little self-light keeps the sclera readable in the sockets.
      m.roughness = 0.3; m.alphaTest = 0.5; m.emissive = new THREE.Color(0xffffff); m.emissiveMap = src.map; m.emissiveIntensity = 0.1;
    }
    else if(name.endsWith(".short02")){
      // hair cards: alpha-to-coverage gives soft MSAA edges instead of a jagged cutout
      m.alphaTest = 0.35; m.alphaToCoverage = true; m.side = THREE.DoubleSide; m.roughness = 0.5; m.envMapIntensity = 0.25; real.hair = m;
    }
    else if(/teeth|tongue/.test(name)){ m.roughness = name.includes("teeth") ? 0.35 : 0.5; }
    else { m.transparent = true; m.depthWrite = false; m.alphaTest = 0.02; m.side = THREE.DoubleSide; }   // soft brows/lashes
    o.material = m;
    const face = name.endsWith(".high-poly") || name.endsWith(".cornea") || name.endsWith(".eyebrow001") || name.endsWith(".eyelashes01") || /teeth|tongue/.test(name);
    o.castShadow = !face; o.receiveShadow = !face;          // eyeballs sit inside the skull: no self-shadow on them
    o.frustumCulled = false;
    if(o.morphTargetDictionary) real.morphs.push(o);
    // the x-ray fade toggles `transparent` on its materials every frame, which would turn the soft brows/lashes
    // into solid strips, so those two stay out of it (they are thin enough to read through anyway)
    if(!m.transparent) xrayMats.push(m);
  });
  root.add(gltf.scene);
  root.visible = false;
  head.add(root);
  return root;
}

function placeHand(gltf, s){
  const root = new THREE.Group();
  const model = gltf.scene;
  model.traverse(o => {
    if(o.isMesh){ o.material = mats.doc; o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; }
  });
  const bones = {}, rest = [];
  model.traverse(o => { if(o.isBone){ bones[o.name] = o; rest.push([o, o.position.clone(), o.quaternion.clone()]); } });
  const poses = {rest: poseOf(s, "rest"), contact: poseOf(s, "contact"), cradle: poseOf(s, "cradle")};
  root.userData = {s, bones, rest, poses, phase: s > 0 ? 0 : 2.1};
  poseFingers(root, 0, 1, 0);
  root.quaternion.copy(poses.rest.quat);
  model.position.copy(PALM_MODEL[s]).multiplyScalar(-1);
  root.add(model);
  root.position.copy(poses.rest.pos);
  root.visible = false;
  head.add(root);
  // where the wrist ends up in head space: the coat sleeve (forearm anchor) starts there so it covers the cut
  root.updateMatrixWorld(true);
  let wrist = null;
  model.traverse(o => { if(o.isBone && o.name === "wrist") wrist = o; });
  const p = new THREE.Vector3();
  wrist.getWorldPosition(p);
  root.userData.wrist = wrist;
  root.userData.wristLocal = head.worldToLocal(p).clone();
  return root;
}

export function loadRealAssets(){
  Promise.all([load(BASE + "patient01/patient01.glb"), getEnv()]).then(([g, env]) => {
    real.head = placeHead(g, env);
    setRealHead(wantHead, lastLook);
    document.documentElement.dataset.head = "ready";
  }).catch(err => {
    console.warn("realistic head not loaded, keeping primitives", err);
    document.documentElement.dataset.head = "failed";
  });
  Promise.all([load(BASE + "hands/left.glb"), load(BASE + "hands/right.glb")]).then(([l, r]) => {
    real.hands = [placeHand(r, -1), placeHand(l, 1)];
    setRealHands(wantHands);
    document.documentElement.dataset.hands = "ready";
  }).catch(err => {
    console.warn("realistic hands not loaded, keeping primitives", err);
    document.documentElement.dataset.hands = "failed";
  });
}

/* Called from applyLook: realistic hands only while the first patient is on the table. */
const anchorHome = hands.map(h => h.position.clone());
export function setRealHands(on){
  wantHands = on;
  const use = on && !!real.hands;
  if(real.hands) real.hands.forEach(h => { h.visible = use; });
  handParts.forEach(m => { m.visible = !use; });
  // hands[] (invisible while realistic) are the forearm anchors: move them to the realistic wrists, or back home
  hands.forEach((h, i) => { h.position.copy(use ? real.hands[i].userData.wristLocal : anchorHome[i]); });
}

/* Per frame from the loop while the realistic hands are shown.
   turn: sign of the target rotation (+1 = face turns to world -x). The hand on the opposite side (s === turn) is the
   contact hand, the other one cradles. setup 0..1: how far the hands have moved from rest into their roles (grows as
   the aim closes in). push 0..1: the crack impulse. t: seconds. */
const _p = new THREE.Vector3(), _qa = new THREE.Quaternion(), _w = new THREE.Vector3();
export function updateRealHands(turn, setup, push, t){
  if(!real.hands || !real.hands[0].visible) return;
  real.hands.forEach((h, i) => {
    const {s, poses, phase} = h.userData;
    const role = turn === 0 ? null : s === turn ? "contact" : "cradle";
    const k = role ? setup : 0;
    const to = role ? poses[role] : poses.rest;
    _p.copy(poses.rest.pos).lerp(to.pos, k);
    _qa.copy(poses.rest.quat).slerp(to.quat, k);
    // breathing-slow sway of the whole hand, and the crack: the contact hand drives in, the cradle hand lifts a touch
    _p.x += 0.0015*Math.sin(t*0.9 + phase); _p.z += 0.0012*Math.sin(t*0.7 + phase*1.7);
    if(role === "contact") _p.x -= s*0.014*push;
    if(role === "cradle") _p.y -= 0.006*push;
    h.position.copy(_p); h.quaternion.copy(_qa);
    const grip = role === "contact" ? 0.35*k + 0.65*push : role === "cradle" ? 0.25*k + 0.3*push : 0;
    poseFingers(h, grip, 1 - 0.6*grip, t);
    // keep the sleeve (forearm anchor) on the wrist
    h.updateMatrixWorld(true);
    h.userData.wrist.getWorldPosition(_w);
    hands[i].position.copy(head.worldToLocal(_w));
  });
}

/* Primitive head parts = everything under `head` except the therapist hands and the realistic models. */
function primitiveHeadParts(){
  return head.children.filter(o => o !== real.head && !(real.hands || []).includes(o) && !handParts.includes(o) && !hands.includes(o));
}
let hiddenPrims = [];
/* applyLook calls restorePrimitiveHead() first, sets the primitive look, then setRealHead() last,
   so the next patient's own hair/glasses choices are never overwritten. */
export function restorePrimitiveHead(){
  hiddenPrims.forEach(o => { o.visible = o.userData.wasVisible; });
  hiddenPrims = [];
}
export function setRealHead(on, look){
  wantHead = on; lastLook = look || lastLook;
  const use = on && !!real.head;
  restorePrimitiveHead();
  if(use){
    hiddenPrims = primitiveHeadParts();
    hiddenPrims.forEach(o => { o.userData.wasVisible = o.visible; o.visible = false; });
    if(look && real.hair) real.hair.color.setHex(look.hairTint || 0xffffff);
  }
  if(real.head) real.head.visible = use;
}
export const realHeadActive = () => !!(real.head && real.head.visible);

/* Per frame from the loop: ease blendshapes toward the face state, and mirror the in-zone glow on the skin. */
export function updateRealFace(face, blinking, k, glow){
  const w = expressionWeights(face, blinking);
  real.morphs.forEach(o => {
    const dict = o.morphTargetDictionary, inf = o.morphTargetInfluences;
    for(const name in w){
      const i = dict[name];
      if(i !== undefined) inf[i] += (w[name] - inf[i]) * k;
    }
  });
  if(real.skin) real.skin.emissiveIntensity = glow;
}

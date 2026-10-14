import * as THREE from "three";
import { mats } from "./materials.js";
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
const load = url => getLoader().then(loader => new Promise((res, rej) => loader.load(url, res, undefined, rej)));

// head-local frame: +y = face (ceiling), -z = top of head (camera side), +z = toward the feet, x = sides
// s = +1 on world +x (screen left, therapist's left hand), s = -1 on world -x (screen right, right hand)
// The camera looks from behind and above the crown, so the hands cradle the head from above:
// palm on the side of the head tilted slightly downward (back of the hand toward the camera),
// fingers running along the side of the head toward the jaw and neck, wrist toward the sleeve.
const HAND_FINGERS = new THREE.Vector3(0, -0.35, 1);
const HAND_PALM_TILT = 0.3;   // how far the palm normal points down (0 = flat against the side)
function handBasis(s){
  const fModel = new THREE.Vector3(0, -1, 0), nModel = new THREE.Vector3(s > 0 ? 1 : -1, 0, 0);
  const nTarget = new THREE.Vector3(-s, -HAND_PALM_TILT, 0).normalize();          // palm faces the head
  const fTarget = HAND_FINGERS.clone().addScaledVector(nTarget, -HAND_FINGERS.dot(nTarget)).normalize();
  const m = new THREE.Matrix4().makeBasis(fModel, nModel, fModel.clone().cross(nModel));
  const t = new THREE.Matrix4().makeBasis(fTarget, nTarget, fTarget.clone().cross(nTarget));
  return new THREE.Quaternion().setFromRotationMatrix(t.multiply(m.transpose()));
}
// palm centre in model space (between wrist and finger roots, palm side)
const PALM_MODEL = {"-1": new THREE.Vector3(0.025, 0.0, 0.012), "1": new THREE.Vector3(-0.025, 0.0, 0.012)};
// palm on the side of the realistic head (half width ~0.09 at ear height after fitting); wrist ends inside the sleeve
const HAND_AT = s => new THREE.Vector3(0.094*s, -0.012, -0.012);

/* Cupped pose. The generic-hand joints are siblings (no bone hierarchy), so curling a finger means rotating every
   later joint of that finger around the knuckle by hand. Model axes: +z runs index -> pinky, palm faces -x (right)
   or +x (left), so a curl is a rotation about z, and moving the thumb in toward the palm is a rotation about y. */
const FINGERS = ["index-finger", "middle-finger", "ring-finger", "pinky-finger"];
const CURL = [0.42, 0.32, 0.16];     // proximal, intermediate, distal (radians)
const THUMB_IN = 0.45;
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
function cupHand(model, s){
  const bones = {};
  model.traverse(o => { if(o.isBone) bones[o.name] = o; });
  const zAxis = new THREE.Vector3(0, 0, 1), yAxis = new THREE.Vector3(0, 1, 0);
  FINGERS.forEach(f => {
    const j = ["phalanx-proximal", "phalanx-intermediate", "phalanx-distal", "tip"].map(x => `${f}-${x}`);
    j.slice(0, 3).forEach((pivot, i) => bend(bones, pivot, j.slice(i + 1), zAxis, s * CURL[i]));
  });
  bend(bones, "thumb-metacarpal", ["thumb-phalanx-proximal", "thumb-phalanx-distal", "thumb-tip"], yAxis, -s * THUMB_IN);
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
function placeHead(gltf){
  const root = new THREE.Group();
  root.rotation.x = -Math.PI/2;                          // +Y (crown) -> -z (camera side), +Z (face) -> +y (ceiling)
  root.scale.setScalar(HEAD_SCALE);
  root.position.set(0, PRIM.back - GLB.back*HEAD_SCALE, PRIM.crown + GLB.crown*HEAD_SCALE);
  gltf.scene.traverse(o => {
    if(!o.isMesh) return;
    const src = o.material, name = src.name || "";
    // plain MeshStandardMaterial everywhere (no clearcoat), opaque skin, alpha-tested hair/brows/lashes
    const m = new THREE.MeshStandardMaterial({map: src.map, normalMap: src.normalMap || null, roughness: 0.6, metalness: 0});
    m.name = name;
    if(name.endsWith(".body")){ m.roughness = 0.55; m.emissive = new THREE.Color(0xff7a59); m.emissiveIntensity = 0; real.skin = m; }
    else if(name.endsWith(".high-poly")){
      // MakeHuman eyes carry a cornea shell mapped to a fully transparent corner of the texture: discard it,
      // otherwise it covers the eye as a dark film. A little self-light keeps the sclera readable in the sockets.
      m.roughness = 0.25; m.alphaTest = 0.5; m.emissive = new THREE.Color(0xffffff); m.emissiveMap = src.map; m.emissiveIntensity = 0.15;
    }
    else if(name.endsWith(".short02")){ m.alphaTest = 0.4; m.side = THREE.DoubleSide; real.hair = m; }
    else { m.transparent = true; m.depthWrite = false; m.alphaTest = 0.02; m.side = THREE.DoubleSide; }   // soft brows/lashes
    o.material = m;
    const face = name.endsWith(".high-poly") || name.endsWith(".eyebrow001") || name.endsWith(".eyelashes01");
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
  cupHand(model, s);
  root.quaternion.copy(handBasis(s));
  model.position.copy(PALM_MODEL[s]).multiplyScalar(-1);
  root.add(model);
  root.position.copy(HAND_AT(s));
  root.visible = false;
  head.add(root);
  // where the wrist ends up in head space: the coat sleeve (forearm anchor) starts there so it covers the cut
  root.updateMatrixWorld(true);
  let wrist = null;
  model.traverse(o => { if(o.isBone && o.name === "wrist") wrist = o; });
  const p = new THREE.Vector3();
  wrist.getWorldPosition(p);
  root.userData.wristLocal = head.worldToLocal(p).clone();
  return root;
}

export function loadRealAssets(){
  load(BASE + "patient01/patient01.glb").then(g => {
    real.head = placeHead(g);
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

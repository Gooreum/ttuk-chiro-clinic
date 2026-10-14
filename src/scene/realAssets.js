import * as THREE from "three";
import { renderer, scene } from "./renderer.js";
import { mats } from "./materials.js";
import { head, pivot, bodyParts, hands, handParts, forearms, xrayMats, crackFadeMats } from "./patientModel.js";
import { expressionWeights } from "../core/faceRig.js";

/* Realistic glTF models for every patient (AGENTS.md 2, "realistic assets"), one MakeHuman/MPFB2 character (CC0) each,
   built by scripts/assets/*.py from the presets in scripts/assets/patients.py, optimized copies in public/models/<id>.
   The roster's look.model names the id. The first patient loads first, the rest one after another in the background;
   until a patient's model is ready (or if it fails) the primitive version stays.
   Everything is parented under the existing `head` group, so the neck pivot, camera, aiming and judging are untouched.

   Therapist hands: MakeHuman/MPFB2 hands and wrist half of the forearms (CC0, game_engine rig, baked skin), built by
   scripts/assets/mpfb_export_hands.py into public/models/hands/hands.glb. Real size, one armature per side.

   Patient body: the same character below mid-neck (scripts/assets/mpfb_export_body.py, public/models/patient01/body.glb),
   T-shirt and jeans tinted with the gown / pants palette, arms along the sides. It shares the head's GLB space, so it
   is placed with the head's transform at rest; its neck bone turns with the pivot, so the seam with the head stays shut. */
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
// Three poses per hand, blended every frame (updateRealHands). `at` is where the palm centre goes, `fingers` the
// direction the fingers point, `tilt` how far the palm turns from facing the head straight on to facing up (back of
// the hand toward the camera):
//   rest    both palms on the sides of the jaw, fingers toward the neck, back of the hand toward the camera
//   contact the hand opposite the turn slides down to the side of the neck at the stuck level, palm flat on it,
//           fingers wrapping behind the neck; on the crack it gives a short inward push and a squeeze
//   cradle  the hand on the turning side cups behind the ear and under the skull and carries the head's weight
const POSES = {
  rest:    {at: [0.1, -0.012, 0.085],  fingers: [0, -0.55, 0.85], tilt: 0.3},
  contact: {at: [0.08, -0.02, 0.14],   fingers: [0, -0.25, 1],    tilt: 0.15},
  cradle:  {at: [0.095, -0.03, 0.0],   fingers: [0, -0.5, 0.85],  tilt: 0.6}
};
const v3 = a => new THREE.Vector3(...a);
// frame: the hand's own axes (fingers, palm normal) measured on the rest skeleton, see placeHand
function handBasis(s, pose, frame){
  const fModel = v3(frame.fingers), nModel = v3(frame.normal);
  const fingers = v3(pose.fingers);
  const nTarget = new THREE.Vector3(-s, -pose.tilt, 0).normalize();          // palm faces the head
  const fTarget = fingers.addScaledVector(nTarget, -fingers.dot(nTarget)).normalize();
  const m = new THREE.Matrix4().makeBasis(fModel, nModel, fModel.clone().cross(nModel));
  const t = new THREE.Matrix4().makeBasis(fTarget, nTarget, fTarget.clone().cross(nTarget));
  return new THREE.Quaternion().setFromRotationMatrix(t.multiply(m.transpose()));
}
const poseOf = (s, name, frame) => ({pos: new THREE.Vector3(POSES[name].at[0]*s, POSES[name].at[1], POSES[name].at[2]), quat: handBasis(s, POSES[name], frame)});

/* Finger pose, rebuilt from the rest skeleton every frame (game_engine rig: lowerarm -> hand -> <finger>_01..03).
   Every joint turns about an axis fixed in the hand frame, converted once into that bone's own rest frame:
   curl about fingers x normal (tips move toward the palm), spread about fingers x across (toward the pinky side). */
const FINGERS = ["index", "middle", "ring", "pinky"];
const CURL = [0.3, 0.38, 0.22];      // _01, _02, _03 (radians) at grip 0
const SPREAD = [-0.08, -0.02, 0.04, 0.11];
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
function turn(bone, axis, angle){ bone.quaternion.multiply(_q.setFromAxisAngle(axis, angle)); }
// grip: 0 loose cradle .. 1 firm hold. t: seconds, drives small independent drifts so fingers never freeze.
// phase: per-hand offset so the two hands don't move in step.
function poseFingers(h, grip, spread, t){
  const {joints, rest, phase} = h.userData;
  rest.forEach(([b, q, p]) => { b.quaternion.copy(q); b.position.copy(p); });
  FINGERS.forEach((f, fi) => {
    const drift = 0.05*Math.sin(t*1.1 + phase + fi*1.7) + 0.025*Math.sin(t*2.9 + phase*2 + fi*0.9);
    joints[f].forEach((j, i) => {
      if(i === 0) turn(j.bone, j.spread, SPREAD[fi]*spread);
      turn(j.bone, j.curl, CURL[i]*(1 + 0.7*grip) + drift*(1 - i*0.3));
    });
  });
  const thumbDrift = 0.04*Math.sin(t*1.4 + phase*1.3);
  const th = joints.thumb;
  turn(th[0].bone, th[0].curl, 0.15 + 0.2*grip + thumbDrift);
  turn(th[1].bone, th[1].curl, 0.12 + 0.25*grip);
  turn(th[2].bone, th[2].curl, 0.1 + 0.2*grip);
}

const real = {hands: null, models: {}};     // models[id] = {head, body, morphs, skin, hair}
let wantHands = false, wantModel = null, lastLook = null;

/* ---- patient head ----
   GLB space: metres, +Y up (crown), +Z = face. Measured on each export (mpfb_export_head.py, the MEASURE log line):
   crown y, chin y, back of skull z. The primitive head (head-local) has its crown at z -0.134, chin at z +0.142 and the
   back of the skull (resting on the pillow) at y -0.110. Fit crown/chin exactly with a uniform scale, rest the back of
   the skull where the old one rested, keep x centred. */
const MODELS = {
  patient01: {crown: 1.625, chin: 1.358, back: -0.062},
  patient02: {crown: 1.6154, chin: 1.3592, back: -0.0647},
  patient03: {crown: 1.6278, chin: 1.3606, back: -0.0611},
  patient04: {crown: 1.495, chin: 1.2016, back: -0.0559},
  patient05: {crown: 1.6113, chin: 1.3546, back: -0.0749}
};
const PRIM = {crown: -0.134, chin: 0.142, back: -0.110};
function glbRoot(g){
  const scale = (PRIM.chin - PRIM.crown) / (g.crown - g.chin);
  const root = new THREE.Group();
  root.rotation.x = -Math.PI/2;                          // +Y (crown) -> -z (camera side), +Z (face) -> +y (ceiling)
  root.scale.setScalar(scale);
  root.position.set(0, PRIM.back - g.back*scale, PRIM.crown + g.crown*scale);
  return root;
}
// MakeHuman hair proxies (material name ends with the asset name)
const HAIR = /\.(short0\d|long0\d|bob0\d|ponytail0\d|braid0\d|afro0\d)$/;
function placeHead(gltf, env, g, model){
  const root = glbRoot(g);
  gltf.scene.traverse(o => {
    if(!o.isMesh) return;
    const src = o.material, name = src.name || "";
    let m = new THREE.MeshStandardMaterial({map: src.map, normalMap: src.normalMap || null, roughness: 0.6, metalness: 0, envMap: env, envMapIntensity: 0.35});
    if(name.endsWith(".body")){
      // skin: a reddish sheen on grazing angles stands in for light scattering under the skin
      m = new THREE.MeshPhysicalMaterial({map: src.map, normalMap: src.normalMap || null, roughness: 0.52, metalness: 0,
        sheen: 0.45, sheenColor: new THREE.Color(0xb04030), sheenRoughness: 0.6, specularIntensity: 0.5,
        envMap: env, envMapIntensity: 0.22});
      m.emissive = new THREE.Color(0xff7a59); m.emissiveIntensity = 0; model.skin = m;
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
    else if(HAIR.test(name)){
      // hair cards: alpha-to-coverage gives soft MSAA edges instead of a jagged cutout
      m.alphaTest = 0.35; m.alphaToCoverage = true; m.side = THREE.DoubleSide; m.roughness = 0.5; m.envMapIntensity = 0.25; model.hair = m;
    }
    else if(/teeth|tongue/.test(name)){ m.roughness = name.includes("teeth") ? 0.35 : 0.5; }
    else { m.transparent = true; m.depthWrite = false; m.alphaTest = 0.02; m.side = THREE.DoubleSide; }   // soft brows/lashes
    o.material = m;
    const face = name.endsWith(".high-poly") || name.endsWith(".cornea") || /eyebrow|eyelash/.test(name) || /teeth|tongue/.test(name);
    o.castShadow = !face; o.receiveShadow = !face;          // eyeballs sit inside the skull: no self-shadow on them
    o.frustumCulled = false;
    if(o.morphTargetDictionary) model.morphs.push(o);
    // the x-ray fade toggles `transparent` on its materials every frame, which would turn the soft brows/lashes
    // into solid strips, so those two stay out of it (they are thin enough to read through anyway)
    if(!m.transparent) xrayMats.push(m);
  });
  root.add(gltf.scene);
  root.visible = false;
  head.add(root);
  return root;
}

/* ---- patient body ----
   Head space at rest = the pivot's rest position plus the head offset (the pivot has no rotation at rest), so a frame
   there plus the head's GLB root puts the body exactly under the head. Every frame the neck bone gets the pivot's
   current turn about the pivot itself (D = pivot * pivotRest^-1), the same motion the head makes. */
const _D = new THREE.Matrix4(), _P0 = new THREE.Matrix4(), _M = new THREE.Matrix4();
function placeBody(gltf, env, g){
  const frame = new THREE.Group();
  frame.position.copy(pivot.position).add(head.position);
  const root = glbRoot(g);
  frame.add(root); root.add(gltf.scene);
  const morphs = [];
  gltf.scene.traverse(o => {
    if(!o.isMesh) return;
    const src = o.material, name = src.name || "";
    let m;
    if(name.endsWith(".skin")){
      // plain standard skin: the body covers a lot of screen, the sheen of the face and hands would cost fill rate
      m = new THREE.MeshStandardMaterial({map: src.map, roughness: 0.58, metalness: 0, envMap: env, envMapIntensity: 0.22});
      xrayMats.push(m);                 // the neck fades under the x-ray like the head
    }else{
      // ambient-occlusion map as the base colour, multiplied by the palette colour: folds without the original print
      m = new THREE.MeshStandardMaterial({map: src.map, normalMap: src.normalMap, roughness: 0.9, metalness: 0, envMap: env, envMapIntensity: 0.15});
      m.color = (name.endsWith(".pants") ? mats.pants : mats.gown).color;     // shared: follows the patient's gown colour
      if(name.endsWith(".shirt")) crackFadeMats.push(m);
    }
    o.material = m; o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
    if(o.morphTargetDictionary && o.morphTargetDictionary.breath !== undefined) morphs.push(o);
  });
  frame.visible = false;
  scene.add(frame);
  frame.updateMatrixWorld(true);
  const neck = gltf.scene.getObjectByName("neck");
  frame.userData = {morphs, neck, parentInv: neck.parent.matrixWorld.clone().invert(), neckRest: neck.matrixWorld.clone()};
  _P0.makeTranslation(pivot.position.x, pivot.position.y, pivot.position.z).invert();
  return frame;
}
const current = () => wantModel && real.models[wantModel];
/* Per frame from the loop, after the pivot has its rotation. fill: breath 0 (out) .. 1 (in). */
export function updateRealBody(fill){
  const cur = current();
  if(!cur || !cur.body.visible) return;
  const {morphs, neck, parentInv, neckRest} = cur.body.userData;
  pivot.updateMatrix();
  _D.multiplyMatrices(pivot.matrix, _P0);
  _M.multiplyMatrices(parentInv, _D).multiply(neckRest);
  _M.decompose(neck.position, neck.quaternion, neck.scale);
  morphs.forEach(o => { o.morphTargetInfluences[o.morphTargetDictionary.breath] = fill; });
}

/* One side of hands.glb: the armature node with its skinned mesh. The hand frame is measured on the rest skeleton:
   fingers = wrist -> middle knuckle, across = index -> pinky knuckle, normal = out of the palm (the side the thumb
   sits on), palm = palm-side centre, cut = where the forearm mesh ends (scripts/assets/mpfb_export_hands.py CUT_T).
   The palm centre sits at the root's origin, so the poses place the palm, not the wrist. */
const CUT_T = 0.42, PALM_DEPTH = 0.016;     // CUT_T as in the export; palm skin is ~0.029 out, less so the palm presses in
function placeHand(arm, s, mat){
  const root = new THREE.Group();
  arm.traverse(o => {
    if(o.isMesh){ o.material = mat; o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; }
  });
  const sd = s > 0 ? "l" : "r";
  const bones = {}, rest = [];
  arm.traverse(o => { if(o.isBone){ bones[o.name] = o; rest.push([o, o.quaternion.clone(), o.position.clone()]); } });
  const bone = n => bones[`${n}_${sd}`];      // bones only: the skinned mesh node is also called hand_<side>
  arm.updateMatrixWorld(true);
  // measured in the armature's own space (A) and in its parent's (P = the root's space before posing)
  const atA = n => arm.worldToLocal(bone(n).getWorldPosition(new THREE.Vector3()));
  const wrist = atA("hand"), knuckle = atA("middle_01"), elbow = atA("lowerarm");
  const fingersA = knuckle.clone().sub(wrist).normalize();
  const acrossA = atA("pinky_01").sub(atA("index_01"));
  acrossA.addScaledVector(fingersA, -acrossA.dot(fingersA)).normalize();
  const normalA = fingersA.clone().cross(acrossA);
  if(atA("thumb_03").sub(wrist).dot(normalA) < 0) normalA.negate();
  const toP = v => v.clone().applyQuaternion(arm.quaternion);
  const frame = {fingers: toP(fingersA).toArray(), normal: toP(normalA).toArray()};
  const palmA = wrist.clone().lerp(knuckle, 0.5).addScaledVector(normalA, PALM_DEPTH);
  const cut = elbow.clone().lerp(wrist, CUT_T + 0.12);     // ~3 cm inside the sleeve: the open edge never shows
  const curlW = fingersA.clone().cross(normalA).normalize().transformDirection(arm.matrixWorld);
  const spreadW = fingersA.clone().cross(acrossA).normalize().transformDirection(arm.matrixWorld);
  const normalW = normalA.clone().transformDirection(arm.matrixWorld);
  const local = (b, w) => w.clone().applyQuaternion(b.getWorldQuaternion(_q2).invert());
  const joints = {};
  ["thumb", ...FINGERS].forEach(f => {
    joints[f] = [1, 2, 3].map(i => {
      const b = bone(`${f}_0${i}`);
      if(f !== "thumb") return {bone: b, curl: local(b, curlW), spread: local(b, spreadW)};
      // the thumb curls across the palm: about its own direction x the palm normal
      const next = i < 3 ? bone(`thumb_0${i + 1}`) : null;
      const dir = next ? next.getWorldPosition(new THREE.Vector3()).sub(b.getWorldPosition(new THREE.Vector3())).normalize()
                       : fingersA.clone().transformDirection(arm.matrixWorld);
      return {bone: b, curl: local(b, dir.cross(normalW).normalize())};
    });
  });
  const poses = {rest: poseOf(s, "rest", frame), contact: poseOf(s, "contact", frame), cradle: poseOf(s, "cradle", frame)};
  const lower = bone("lowerarm"), hand = bone("hand");
  root.userData = {s, joints, rest, poses, phase: s > 0 ? 0 : 2.1, arm, lower, hand, wrist, cut,
    lowerRest: lower.matrix.clone(), handRest: hand.matrix.clone()};
  poseFingers(root, 0, 1, 0);
  root.quaternion.copy(poses.rest.quat);
  arm.position.sub(palmA.applyMatrix4(arm.matrix));
  root.add(arm);
  root.position.copy(poses.rest.pos);
  root.visible = false;
  head.add(root);
  root.updateMatrixWorld(true);
  root.userData.anchorLocal = head.worldToLocal(arm.localToWorld(cut.clone())).clone();
  return root;
}
/* Bend at the wrist so the forearm runs back toward the elbow (the sleeve's line) instead of sticking out of the
   hand at a fixed angle: turn the lower-arm bone about the wrist, give the hand bone the opposite turn so the hand
   keeps its pose. Returns the forearm cut (sleeve end) in head space. */
const _e = new THREE.Vector3(), _d0 = new THREE.Vector3(), _d1 = new THREE.Vector3(), _r = new THREE.Quaternion();
const _mA = new THREE.Matrix4(), _mB = new THREE.Matrix4(), _mC = new THREE.Matrix4();
const MAX_WRIST = 0.7;   // radians
function aimForearm(h, elbowWorld, out){
  const {arm, lower, hand, wrist, cut, lowerRest, handRest} = h.userData;
  h.updateMatrixWorld(true);
  arm.worldToLocal(_e.copy(elbowWorld));
  _d0.copy(cut).sub(wrist).normalize();
  _d1.copy(_e).sub(wrist).normalize();
  _r.setFromUnitVectors(_d0, _d1);
  const ang = 2*Math.acos(Math.min(1, Math.abs(_r.w)));
  if(ang > MAX_WRIST) _r.slerp(_q2.identity(), 1 - MAX_WRIST/ang);
  // R about the wrist, in armature space (the lower-arm bone's parent space)
  _mA.makeTranslation(wrist.x, wrist.y, wrist.z).multiply(_mB.makeRotationFromQuaternion(_r)).multiply(_mC.makeTranslation(-wrist.x, -wrist.y, -wrist.z));
  _mB.multiplyMatrices(_mA, lowerRest);
  _mB.decompose(lower.position, lower.quaternion, lower.scale);
  // hand local = lower'^-1 * lower * handRest
  _mC.copy(_mB).invert().multiply(lowerRest).multiply(handRest);
  _mC.decompose(hand.position, hand.quaternion, hand.scale);
  out.copy(cut).applyMatrix4(_mA);
  h.updateMatrixWorld(true);
  return head.worldToLocal(arm.localToWorld(out));
}

/* One patient's head + body. Resolves once both are placed (hidden); shows them if that patient is on the table. */
function loadPatientModel(id){
  const model = {head: null, body: null, morphs: [], skin: null, hair: null};
  return Promise.all([load(BASE + `${id}/${id}.glb`), load(BASE + `${id}/body.glb`), getEnv()]).then(([gh, gb, env]) => {
    model.head = placeHead(gh, env, MODELS[id], model);
    model.body = placeBody(gb, env, MODELS[id]);
    real.models[id] = model;
    if(wantModel === id) setRealPatient(id, lastLook);
  });
}
export function loadRealAssets(){
  const [first, ...rest] = Object.keys(MODELS);
  loadPatientModel(first).then(() => {
    document.documentElement.dataset.head = "ready";
  }).catch(err => {
    console.warn("realistic patient not loaded, keeping primitives", first, err);
    document.documentElement.dataset.head = "failed";
  }).then(() => rest.reduce((p, id) => p.then(() => loadPatientModel(id).catch(err => {
    console.warn("realistic patient not loaded, keeping primitives", id, err);
  })), Promise.resolve()));
  Promise.all([load(BASE + "hands/hands.glb"), getEnv()]).then(([g, env]) => {
    // baked skin (diffuse x occlusion) with the same soft sheen as the patient's face
    const src = g.scene.getObjectByProperty("isMesh", true).material;
    const mat = new THREE.MeshPhysicalMaterial({map: src.map, roughness: 0.55, metalness: 0,
      sheen: 0.4, sheenColor: new THREE.Color(0xb04030), sheenRoughness: 0.6, specularIntensity: 0.45,
      envMap: env, envMapIntensity: 0.25});
    crackFadeMats.push(mat);
    real.hands = [placeHand(g.scene.getObjectByName("therapist_hand_r"), -1, mat), placeHand(g.scene.getObjectByName("therapist_hand_l"), 1, mat)];
    setRealHands(wantHands);
    document.documentElement.dataset.hands = "ready";
  }).catch(err => {
    console.warn("realistic hands not loaded, keeping primitives", err);
    document.documentElement.dataset.hands = "failed";
  });
}

/* Called from applyLook: realistic hands only while the first patient is on the table. */
const anchorHome = hands.map(h => h.position.clone());
// real forearms are bare from mid-forearm: a slimmer sleeve rolled up to there, the cuff right at its end
const SLEEVE = {real: {tip: 0, rad: 0.92}, prim: {tip: 0.1, rad: 1}};
export function setRealHands(on){
  wantHands = on;
  const use = on && !!real.hands;
  if(real.hands) real.hands.forEach(h => { h.visible = use; });
  handParts.forEach(m => { m.visible = !use; });
  // hands[] (invisible while realistic) are the forearm anchors: move them to the realistic forearm cut, or back home
  hands.forEach((h, i) => { h.position.copy(use ? real.hands[i].userData.anchorLocal : anchorHome[i]); });
  forearms.forEach(f => Object.assign(f, use ? SLEEVE.real : SLEEVE.prim));
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
    // forearm back toward the elbow, and the sleeve (forearm anchor) on its cut
    hands[i].position.copy(aimForearm(h, forearms[i].elbowNow, _w));
  });
}
/* Primitive head parts = everything under `head` except the therapist hands and the realistic models. */
function primitiveHeadParts(){
  // the primitive glasses go too: their toy frames float over the realistic face
  const models = Object.values(real.models).map(m => m.head);
  return head.children.filter(o => !models.includes(o) && !(real.hands || []).includes(o) && !handParts.includes(o) && !hands.includes(o));
}
let hiddenPrims = [];
/* applyLook calls restorePrimitiveHead() first, sets the primitive look, then setRealHead() last,
   so the next patient's own hair/glasses choices are never overwritten. */
export function restorePrimitiveHead(){
  hiddenPrims.forEach(o => { o.visible = o.userData.wasVisible; });
  hiddenPrims = [];
}
/* Realistic head + body of patient `id` (null: primitives). */
export function setRealPatient(id, look){
  wantModel = id; lastLook = look || lastLook;
  const cur = current();
  restorePrimitiveHead();
  Object.values(real.models).forEach(m => { m.head.visible = m === cur; m.body.visible = m === cur; });
  bodyParts.forEach(m => { m.visible = !cur; });
  if(cur){
    hiddenPrims = primitiveHeadParts();
    hiddenPrims.forEach(o => { o.userData.wasVisible = o.visible; o.visible = false; });
    if(look && cur.hair) cur.hair.color.setHex(look.hairTint || 0xffffff);
  }
}
export const realHeadActive = () => !!current();

/* Per frame from the loop: ease blendshapes toward the face state, and mirror the in-zone glow on the skin. */
export function updateRealFace(face, blinking, k, glow){
  const w = expressionWeights(face, blinking);
  const cur = current();
  if(!cur) return;
  cur.morphs.forEach(o => {
    const dict = o.morphTargetDictionary, inf = o.morphTargetInfluences;
    for(const name in w){
      const i = dict[name];
      if(i !== undefined) inf[i] += (w[name] - inf[i]) * k;
    }
  });
  if(cur.skin) cur.skin.emissiveIntensity = glow;
}

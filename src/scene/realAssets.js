import * as THREE from "three";
import { renderer, scene, camera, camBase, camLook } from "./renderer.js";
import { mats } from "./materials.js";
import { head, pivot, bodyParts, hands, handParts, forearms, xrayMats, crackFadeMats } from "./patientModel.js";
import { expressionWeights } from "../core/faceRig.js";
import { flinchProfile } from "../core/fail.js";
import { clamp } from "../lib/math.js";

/* Realistic glTF models for every patient (AGENTS.md 2, "realistic assets"), one MakeHuman/MPFB2 character (CC0) each,
   built by scripts/assets/*.py from the presets in scripts/assets/patients.py, optimized copies in public/models/<id>.
   The roster's look.model names the id. The first patient loads first, the rest one after another in the background;
   until a patient's model is ready (or if it fails) the primitive version stays.
   Everything is parented under the existing `head` group, so the neck pivot, camera, aiming and judging are untouched.

   Therapist arms: MakeHuman/MPFB2 arms from the shoulder to the fingertips in a T-shirt sleeve (CC0, game_engine rig,
   baked skin), built by scripts/assets/mpfb_export_arms.py into public/models/hands/arms.glb. Real size, one armature
   per side, posed by a two-bone IK every frame (see "therapist arms" below).

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

/* Therapist fingers (game_engine rig: hand -> <finger>_01..03), see poseFingers below. */
const FINGERS = ["index", "middle", "ring", "pinky"];
const CURL = [0.28, 0.36, 0.22];     // _01, _02, _03 (radians) at grip 0
const SPREAD = [-0.08, -0.02, 0.04, 0.11];
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
function turn(bone, axis, angle){ bone.quaternion.multiply(_q.setFromAxisAngle(axis, angle)); }

const real = {arms: null, models: {}};      // models[id] = {head, body, morphs, skin, hair, skinMesh, bodyMeshes}
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
      m.emissive = new THREE.Color(0xff7a59); m.emissiveIntensity = 0; model.skin = m; model.skinMesh = o;
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
    else if(name.includes("teeth")){
      // ivory, not paper white, and dimmer than the lips: inside the mouth they sit in shade
      m.color = new THREE.Color(0xb8ad99); m.roughness = 0.5; m.envMapIntensity = 0.35;
    }
    else if(name.includes("tongue")){ m.roughness = 0.5; m.color = new THREE.Color(0xb0a0a0); }
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
const _D = new THREE.Matrix4(), _P0 = new THREE.Matrix4(), _M = new THREE.Matrix4(), _St = new THREE.Matrix4();
function placeBody(gltf, env, g, model){
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
    if(model) (model.bodyMeshes || (model.bodyMeshes = [])).push(o);
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
// the breath shape: 2.6 cm chest rise, a softer 1.6 cm belly swell, 3 cm shrug
// (2026-10-15: the user asked twice for a bigger body breath; a 2.2x gain on a belly-centred shape then read as a
// grotesque belly balloon, so the shape itself is now chest-led and gentle, with a bigger shrug, at 1x)
const BREATH_GAIN = 1;
/* Per frame from the loop, after the pivot has its rotation. fill: breath 0 (out) .. 1 (in). s: towel mode neck stretch
   (m): the seam slides toward the camera with the head along the pivot's -z, and the 8 cm weight fade stretches the skin. */
export function updateRealBody(fill, s = 0){
  const cur = current();
  if(!cur || !cur.body.visible) return;
  const {morphs, neck, parentInv, neckRest} = cur.body.userData;
  pivot.updateMatrix();
  _D.multiplyMatrices(pivot.matrix, _St.makeTranslation(0, 0, -s)).multiply(_P0);
  _M.multiplyMatrices(parentInv, _D).multiply(neckRest);
  _M.decompose(neck.position, neck.quaternion, neck.scale);
  morphs.forEach(o => { o.morphTargetInfluences[o.morphTargetDictionary.breath] = fill*BREATH_GAIN; });
}

/* One patient's head + body. Resolves once both are placed (hidden); shows them if that patient is on the table. */
function loadPatientModel(id){
  const model = {head: null, body: null, morphs: [], skin: null, hair: null};
  return Promise.all([load(BASE + `${id}/${id}.glb`), load(BASE + `${id}/body.glb`), getEnv()]).then(([gh, gb, env]) => {
    model.head = placeHead(gh, env, MODELS[id], model);
    model.body = placeBody(gb, env, MODELS[id], model);
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
  Promise.all([load(BASE + "hands/arms.glb"), getEnv()]).then(([g, env]) => {
    const made = {};
    const matFor = src => made[src.name] || (made[src.name] = armMaterial(src, env));
    scene.add(g.scene);
    real.arms = [placeArm(g.scene.getObjectByName("therapist_arm_r"), -1, matFor), placeArm(g.scene.getObjectByName("therapist_arm_l"), 1, matFor)];
    Object.values(made).forEach(m => crackFadeMats.push(m));
    syncArms();
    document.documentElement.dataset.hands = "ready";
  }).catch(err => {
    console.warn("realistic arms not loaded, keeping primitives", err);
    document.documentElement.dataset.hands = "failed";
  });
}
/* Arm materials: baked skin (diffuse x occlusion) with the face's soft sheen; the sleeve and its hem keep the shirt's
   occlusion as base colour and are tinted with the palette's coat (white) and cuff (teal) colours. */
function armMaterial(src, env){
  const name = src.name || "";
  if(name.endsWith(".skin")) return new THREE.MeshPhysicalMaterial({map: src.map, roughness: 0.55, metalness: 0,
    sheen: 0.4, sheenColor: new THREE.Color(0xb04030), sheenRoughness: 0.6, specularIntensity: 0.45,
    envMap: env, envMapIntensity: 0.25});
  const m = new THREE.MeshStandardMaterial({map: src.map, normalMap: src.normalMap || null, roughness: 0.85, metalness: 0,
    envMap: env, envMapIntensity: 0.15, side: THREE.DoubleSide});      // the sleeve is an open tube: its inside shows
  m.color = (name.endsWith(".hem") ? mats.cuff : mats.coat).color;     // shared: follows the palette
  return m;
}

/* ---- therapist arms ----
   public/models/hands/arms.glb (scripts/assets/mpfb_export_arms.py): per side an armature therapist_arm_<l|r>
   (upperarm at the shoulder -> lowerarm -> hand -> thumb/index/middle/ring/pinky 01-03), the skinned arm and the
   T-shirt sleeve with its hem band. The arms live in world space, not under `head`: each shoulder is anchored below
   and beside the camera (the therapist's eyes, off screen), the palm goes where the hand pose puts it on the patient,
   and a two-bone IK finds the elbow (solveArm). The poses are measured on each patient's own skin mesh (measureHead),
   from the 98-video reference (2026-10-15):
     rest / cup  both palms cup the jaw angles and cheeks, fingertips behind the neck under the ears
     contact     (the side opposite the face turn, now facing up) index knuckle on the articular pillar behind and
                 below the jaw angle, under the ear lobe; palm over the side of the neck and jaw, thumb along the jaw
                 toward the chin, the other fingers wrapping behind the neck. Crack: a short rotational push toward
                 the opposite eye and a squeeze
     support     (the side the face turns to) palm under the ear and the back of the skull, fingers spread under it,
                 carrying the head's weight
   head-local frame: +y = face (ceiling), -z = crown (camera side), +z = feet. s = +1 on world +x (screen left, the
   therapist's left hand), -1 on world -x (the right hand). */
const ARM_A = 0.2335, ARM_B = 0.2374, ARM_MAX = 0.97*(ARM_A + ARM_B);   // upper arm, forearm (export log LEN)
const PALM_IN = 0.021;          // bone line -> palm skin is 0.0288 (export PALM_DEPTH): less, so the palm presses in a touch
/* Shoulder anchor from the camera's base position (s mirrors x): where a therapist bent over the head end has his
   shoulders, 0.33 m below the eyes, 0.19 m to the sides and a little behind them, so the upper arm never shows; the
   hands then reach the head with the elbows bent about 95-115 deg. (0.27 m below and the elbows free to rise read as
   "squid arms" on the phone, 2026-10-15: upper arms in from the screen sides, elbows bulging up next to the head.) */
const SHOULDER = [0.19, -0.33, -0.03];
/* The elbows stay below the bottom edge of the therapist's resting view (camBase -> camLook): only the forearms rise
   into the frame from the bottom / bottom corners, as in a chest-cam video. NDC y the elbow keeps under, and how hard. */
const ELBOW_VIEW_Y = -1.12, ELBOW_VIEW_K = 25, ELBOW_VIEW_CORNER = 1.0;
/* The trunk follows the camera's small moves (the set-up lean, the thrust dip, the sway) within 5 cm, smoothed so
   the camera shake never jitters; the big ones (the x-ray orbit, the reaction close-up) are the camera's alone. */
const SHOULDER_FOLLOW = 0.8, SHOULDER_FOLLOW_MAX = 0.05;
/* After the crack (x-ray time): the palms cup the cheeks and roll the head back to the middle, then let go and draw
   back toward the therapist (below the frame) so the face's reaction reads; the pat comes from there. */
const CUP_AT = 1.9, AWAY_AT = 3.0;
const AWAY = [0.26, -0.4, 0.08];                    // palm, from the camera's base position (x mirrored): off screen
/* Poses on the head, relative to the ear (the outermost skin point on that side, scaled by the head's width).
   around: radians about the head's long axis from straight out to the side, + toward the back of the neck / table,
   - toward the face. dz: metres from the ear toward the feet. lift: palm skin off the surface.
   fingers: where the fingers point (head-local, x mirrored), laid onto the surface. grip: finger curl 0..1.
   roll: extra turn of the hand about its finger axis (+ = thumb side away from the skin). */
const HAND_POSES = {
  rest:    {around: -0.3, dz: 0.05,  lift: 0.006, fingers: [0, -0.72, 0.7], grip: 0.3, roll: 0},
  cup:     {around: -0.45, dz: 0.035, lift: 0.004, fingers: [0, -0.7, 0.72], grip: 0.45, roll: 0},
  contact: {around: 0.2,  dz: 0.065, lift: 0.002, fingers: [0, -0.85, 0.52], grip: 0.75, roll: 0},
  support: {around: -0.35, dz: 0.0,  lift: 0.006, fingers: [0, -0.9, 0.42], grip: 0.6, roll: 0}
};
const POSE_NAMES = Object.keys(HAND_POSES);
// the elbow's preferred side per role (world, x mirrored): always out and down toward the floor, next to the
// therapist's body; the support elbow lowest (forearm low and flat), the contact elbow a little higher and further
// out (its forearm rises steeper onto the up-side neck)
const POLES = {rest: [1, -0.6, -0.3], contact: [1, -0.45, -0.35], support: [1, -0.7, -0.25], pat: [0.6, -1, -0.4], away: [0.6, -1, -0.2], towel: [1, -0.55, -0.4]};
/* Towel mode (core/towel.js): a fist on each towel end just past the crown (head-local, x mirrored), pulled toward the
   therapist (-z) by the tension, up to TOWEL_PULL. scene/towel.js runs the towel from here around the back of the neck. */
export const TOWEL_GRIP = [0.12, 0.04, -0.09], TOWEL_PULL = 0.06;   // beside the crown, toward the therapist (further is off screen)

/* Finger pose, rebuilt from the rest skeleton every frame. Every joint turns about an axis fixed in the hand frame,
   converted once into that bone's own rest frame: curl about fingers x normal (tips move toward the palm), spread
   about fingers x across (toward the pinky side).
   grip: 0 loose .. 1 firm. t: seconds, small independent drifts so fingers never freeze. probe: 0..1 fingertips
   palpating (prep). phase: per-hand offset so the two hands don't move in step. */
function poseFingers(h, grip, spread, t, probe){
  const {joints, fingerRest, phase} = h;
  fingerRest.forEach(([b, q]) => b.quaternion.copy(q));
  FINGERS.forEach((f, fi) => {
    const drift = 0.05*Math.sin(t*1.1 + phase + fi*1.7) + 0.025*Math.sin(t*2.9 + phase*2 + fi*0.9);
    // palpating: index / middle tips press and release in turn, ring / pinky follow a little
    const pr = probe*(fi < 2 ? 0.32 : 0.14)*(0.5 + 0.5*Math.sin(t*7.5 + phase + fi*1.9));
    joints[f].forEach((j, i) => {
      if(i === 0) turn(j.bone, j.spread, SPREAD[fi]*spread);
      turn(j.bone, j.curl, CURL[i]*(1 + 0.9*grip) + drift*(1 - i*0.3) + pr*(i === 0 ? 0.6 : 1));
    });
  });
  const thumbDrift = 0.04*Math.sin(t*1.4 + phase*1.3);
  const th = joints.thumb;
  turn(th[0].bone, th[0].curl, 0.1 + 0.15*grip + thumbDrift);
  turn(th[1].bone, th[1].curl, 0.1 + 0.2*grip);
  turn(th[2].bone, th[2].curl, 0.08 + 0.15*grip);
}

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _m3 = new THREE.Matrix4(), _m4 = new THREE.Matrix4();
// rotation taking the pair (a1, a2) onto (b1, b2): a1 -> b1 exactly, a2 as close as it goes
// (scratch vectors, no allocation: the elbow search calls it 36 times per arm per frame)
const _pq = [0, 1, 2, 3, 4, 5].map(() => new THREE.Vector3());
function pairQuat(a1, a2, b1, b2, out){
  const [ax, ay, az, bx, by, bz] = _pq;
  ax.copy(a1).normalize(); ay.copy(a2).addScaledVector(ax, -a2.dot(ax)).normalize(); az.crossVectors(ax, ay);
  bx.copy(b1).normalize(); by.copy(b2).addScaledVector(bx, -b2.dot(bx)).normalize(); bz.crossVectors(bx, by);
  _m3.makeBasis(ax, ay, az).transpose();
  _m4.makeBasis(bx, by, bz).multiply(_m3);
  return out.setFromRotationMatrix(_m4);
}

/* One side of arms.glb. Everything is measured on the rest skeleton in GLB space (= world: the GLB scene is added to
   the world scene untransformed): the hand frame (fingers = wrist -> middle knuckle, across = index -> pinky knuckle,
   normal = out of the palm), the palm centre, the elbow hinge axis, and each finger joint's curl / spread axes. */
function placeArm(root, s, matFor){
  root.traverse(o => {
    if(!o.isMesh) return;
    o.material = matFor(o.material);
    o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
  });
  const sd = s > 0 ? "l" : "r";
  const bones = {};
  root.traverse(o => { if(o.isBone) bones[o.name] = o; });
  const bone = n => bones[`${n}_${sd}`];
  root.updateMatrixWorld(true);
  const at = n => bone(n).getWorldPosition(new THREE.Vector3());
  const upper = bone("upperarm"), lower = bone("lowerarm"), hand = bone("hand");
  const S0 = at("upperarm"), E0 = at("lowerarm"), W0 = at("hand"), K0 = at("middle_01");
  const F0 = K0.clone().sub(W0).normalize();
  const A0 = at("pinky_01").sub(at("index_01"));
  A0.addScaledVector(F0, -A0.dot(F0)).normalize();
  const N0 = F0.clone().cross(A0);
  if(at("thumb_03").sub(W0).dot(N0) < 0) N0.negate();             // out of the palm (the thumb tip sits on that side)
  const palm0 = W0.clone().lerp(K0, 0.5).addScaledVector(N0, PALM_IN);
  const Qu0 = upper.getWorldQuaternion(new THREE.Quaternion()), Ql0 = lower.getWorldQuaternion(new THREE.Quaternion());
  const Qh0 = hand.getWorldQuaternion(new THREE.Quaternion());
  const hinge = E0.clone().sub(S0).cross(W0.clone().sub(E0)).normalize();
  const local = (q, w) => w.clone().applyQuaternion(q.clone().invert());
  // the forearm's direction out of the wrist at a neutral wrist, and the back of the hand, in hand-bone space
  const fore = local(Qh0, E0.clone().sub(W0).normalize());
  const back = local(Qh0, N0.clone().negate()); back.addScaledVector(fore, -back.dot(fore)).normalize();
  const side = fore.clone().cross(back);
  const curlW = F0.clone().cross(N0).normalize(), spreadW = F0.clone().cross(A0).normalize();
  const joints = {}, fingerRest = [];
  ["thumb", ...FINGERS].forEach(f => {
    joints[f] = [1, 2, 3].map(i => {
      const b = bone(`${f}_0${i}`), q = b.getWorldQuaternion(new THREE.Quaternion());
      fingerRest.push([b, b.quaternion.clone()]);
      if(f !== "thumb") return {bone: b, curl: local(q, curlW), spread: local(q, spreadW)};
      // the thumb curls across the palm: about its own direction x the palm normal
      const dir = i < 3 ? at(`thumb_0${i + 1}`).sub(at(`thumb_0${i}`)).normalize() : F0.clone();
      return {bone: b, curl: local(q, dir.cross(N0).normalize())};
    });
  });
  return {root, s, upper, lower, hand, joints, fingerRest, phase: s > 0 ? 0 : 2.1,
    F0, N0, Qh0, palmOff: palm0.clone().sub(W0), hingeU: local(Qu0, hinge), hingeL: local(Ql0, hinge),
    handRestL: hand.quaternion.clone(), fore, back, side,
    w: {contact: 0, support: 0, cup: 0, away: 0, pat: 0, towel: 0}, phi: null, shoulder: new THREE.Vector3(), seen: false, palm: new THREE.Vector3()};
}

/* ---- per-patient hand poses, measured on the head's own skin mesh ----
   Rays in head-local space toward the head's long axis (static rest geometry; the expression blendshapes are small).
   The ear on each side is the outermost skin vertex; the head's width scales the offsets. */
const _rc = new THREE.Raycaster();
function measureHead(model){
  if(model.handPoses !== undefined) return model.handPoses;
  model.handPoses = null;
  const src = model.skinMesh;
  if(!src) return null;
  head.updateMatrixWorld(true); src.updateWorldMatrix(true, false);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", src.geometry.attributes.position);
  if(src.geometry.index) g.setIndex(src.geometry.index);
  const probe = new THREE.Mesh(g, new THREE.MeshBasicMaterial({side: THREE.DoubleSide}));
  probe.matrixAutoUpdate = false;
  probe.matrixWorld.copy(head.matrixWorld).invert().multiply(src.matrixWorld);     // skin -> head-local
  const pos = g.attributes.position, p = new THREE.Vector3();
  const ears = {};
  [1, -1].forEach(s => {
    let best = -1;
    for(let i = 0; i < pos.count; i++){
      p.fromBufferAttribute(pos, i).applyMatrix4(probe.matrixWorld);
      if(p.x*s > best){ best = p.x*s; ears[s] = p.clone(); }
    }
  });
  const nm = new THREE.Matrix3().getNormalMatrix(probe.matrixWorld);
  const hit = (o, d) => {
    _rc.set(o, d.normalize()); _rc.far = 0.4;
    const h = _rc.intersectObject(probe, false)[0];
    if(!h) return null;
    const n = h.face.normal.clone().applyMatrix3(nm).normalize();
    if(n.dot(d) > 0) n.negate();
    return {p: h.point.clone(), n};
  };
  const poses = {};
  for(const s of [1, -1]){
    const E = ears[s], k = Math.abs(E.x)/0.088;
    poses[s] = {};
    for(const name of POSE_NAMES){
      const P = HAND_POSES[name];
      const axis = new THREE.Vector3(0, E.y, E.z + P.dz*k);
      const out = new THREE.Vector3(s*Math.cos(P.around), -Math.sin(P.around), 0);
      const h = hit(axis.clone().addScaledVector(out, 0.3), out.clone().negate());
      if(!h) return null;
      const nIn = h.n.clone().negate();
      const f = new THREE.Vector3(P.fingers[0]*s, P.fingers[1], P.fingers[2]);
      f.addScaledVector(nIn, -f.dot(nIn)).normalize();
      poses[s][name] = {p: h.p.addScaledVector(h.n, P.lift), f, n: nIn, grip: P.grip, roll: P.roll};
    }
    poses[s].ear = E; poses[s].k = k;
  }
  g.dispose(); probe.material.dispose();
  return model.handPoses = poses;
}

/* ---- the patient's chest, for the pat after both sides ----
   World point on the upper chest below the right collarbone: the top of the skinned body there (the rest pose, so
   bone transforms give the real surface; the bind geometry alone sits elsewhere). Once per patient. */
const CHEST = [-0.07, 0.37];      // world x, z
function measureChest(model){
  if(model.chest !== undefined) return model.chest;
  model.chest = null;
  model.body.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  let top = null;
  (model.bodyMeshes || []).forEach(o => {
    const pos = o.geometry.attributes.position;
    for(let i = 0; i < pos.count; i++){
      v.fromBufferAttribute(pos, i);
      if(o.isSkinnedMesh) o.boneTransform(i, v);
      v.applyMatrix4(o.matrixWorld);
      if(Math.abs(v.x - CHEST[0]) < 0.02 && Math.abs(v.z - CHEST[1]) < 0.02 && (!top || v.y > top.y)) top = v.clone();
    }
  });
  return model.chest = top;
}

/* ---- two-bone IK ----
   Shoulder S, wrist W (from the palm target and the hand's orientation Qh). The elbow sits on the circle of points
   ARM_A from S and ARM_B from W; the point taken is the one that keeps the wrist nearest a natural, slightly extended
   position (a real wrist bends ~1 rad back, less forward, little sideways) while leaning to the role's side (pole).
   The hinge (upper arm x forearm) keeps the elbow a pure hinge; the forearm then takes 60 % of the hand's twist
   (pronation happens along the forearm), the wrist the rest. Out of reach: the shoulder leans toward the hand. */
const UPV = new THREE.Vector3(0, 1, 0), YAX = new THREE.Vector3(0, 1, 0);
const _S = new THREE.Vector3(), _W = new THREE.Vector3(), _E = new THREE.Vector3(), _C = new THREE.Vector3();
const _u = new THREE.Vector3(), _e1 = new THREE.Vector3(), _e2 = new THREE.Vector3(), _d = new THREE.Vector3();
const _qu = new THREE.Quaternion(), _ql = new THREE.Quaternion(), _qi = new THREE.Quaternion(), _qt = new THREE.Quaternion();
const _hl = new THREE.Vector3(), _du = new THREE.Vector3(), _dl = new THREE.Vector3(), _hg = new THREE.Vector3();
const SAMPLES = 36;
// the therapist's resting view for the elbow test: eye, forward, up, tan(half fov); set each frame by updateRealHands
const view = {eye: new THREE.Vector3(), f: new THREE.Vector3(0, 0, 1), u: new THREE.Vector3(0, 1, 0), r: new THREE.Vector3(1, 0, 0), tan: 0.47, aspect: 2};
const _ve = new THREE.Vector3();
// how far into the frame a point is above ELBOW_VIEW_Y (NDC y; 0 = under it or behind the eye); toward the sides the
// line rises, so an elbow may sit in a bottom corner but never in the middle of the picture
function inView(p){
  _ve.copy(p).sub(view.eye);
  const fw = _ve.dot(view.f);
  if(fw < 0.02) return 0;
  const ny = _ve.dot(view.u)/(fw*view.tan), nx = Math.abs(_ve.dot(view.r))/(fw*view.tan*view.aspect);
  return Math.max(0, ny - ELBOW_VIEW_Y - ELBOW_VIEW_CORNER*Math.max(0, nx - 0.5));
}
function wristCost(arm, Qh, E, W){
  _d.copy(E).sub(W).normalize().applyQuaternion(_qi.copy(Qh).invert());       // forearm direction in hand space
  const a = _d.dot(arm.fore);
  if(a < 0.05) return 50;
  const ext = Math.atan2(_d.dot(arm.back), a), dev = Math.atan2(_d.dot(arm.side), a);
  // neutral = 0.25 rad extended; beyond ~1.0 back / 0.5 forward / 0.35 sideways it gets steep
  const e = ext - 0.25;
  return (e > 0 ? (e/0.6)**2 : (e/0.45)**2) + (dev/0.3)**2 + (ext > 1.1 || ext < -0.6 || Math.abs(dev) > 0.5 ? 6 : 0);
}
/* The forearm's turn (pronation / supination, radians) the hand's orientation asks for with the elbow at E: the hand
   frame against the forearm's hinge frame, about the forearm axis, from the rest pose (T-pose, palm down, elbow crease
   forward = the forearm's neutral, thumb ahead). A real forearm turns ~80 deg either way and is at ease within ~45. */
const _tu = new THREE.Vector3(), _tl = new THREE.Vector3(), _th = new THREE.Vector3(), _tq = new THREE.Quaternion(), _tr = new THREE.Quaternion();
function twistAt(arm, S, E, W, Qh){
  _tu.copy(E).sub(S).normalize(); _tl.copy(W).sub(E).normalize();
  _th.crossVectors(_tu, _tl);
  if(_th.lengthSq() < 1e-8) return 0;
  pairQuat(YAX, arm.hingeL, _tl, _th.normalize(), _tq);
  _tq.invert().multiply(Qh).multiply(_tr.copy(arm.handRestL).invert());
  const tw = 2*Math.atan2(_tq.y, _tq.w);
  return Math.atan2(Math.sin(tw), Math.cos(tw));
}
function twistCost(tw){
  const a = Math.abs(tw);
  return (a/0.8)**2 + (a > 1.4 ? 8*(a - 1.4) : 0);
}
function solveArm(arm, S, W, Qh, pole, dt){
  _S.copy(S);
  let d = _d.copy(W).sub(_S).length();
  if(d > ARM_MAX){ _S.sub(W).setLength(ARM_MAX).add(W); d = ARM_MAX; }
  if(d < 0.16){ _S.sub(W).setLength(0.16).add(W); d = 0.16; }
  _u.copy(W).sub(_S).divideScalar(d);
  const x = (ARM_A*ARM_A - ARM_B*ARM_B + d*d)/(2*d), r = Math.sqrt(Math.max(0, ARM_A*ARM_A - x*x));
  _C.copy(_S).addScaledVector(_u, x);
  _e1.copy(UPV).addScaledVector(_u, -UPV.dot(_u)).normalize();
  _e2.crossVectors(_u, _e1);
  let best = 0, bestC = Infinity;
  const pd = _v3.copy(pole).addScaledVector(_u, -pole.dot(_u)).normalize();
  for(let i = 0; i < SAMPLES; i++){
    const phi = i/SAMPLES*Math.PI*2;
    _E.copy(_C).addScaledVector(_e1, r*Math.cos(phi)).addScaledVector(_e2, r*Math.sin(phi));
    _v.copy(_E).sub(_C).normalize();
    let c = 0.5*wristCost(arm, Qh, _E, W) + 2.2*(1 - _v.dot(pd));
    if(_E.y < 1.02) c += 40*(1.02 - _E.y);                          // never into the table / the patient
    if(_E.x*arm.s < 0.16) c += 80*(0.16 - _E.x*arm.s);               // never across the face (out beside the head)
    c += ELBOW_VIEW_K*inView(_E);                                      // elbow under the frame, not in the middle of it
    c += 2*twistCost(twistAt(arm, _S, _E, W, Qh));                     // forearm near its neutral turn (no candy wrapper)
    if(c < bestC){ bestC = c; best = phi; }
  }
  // ease toward the best elbow (no popping between samples)
  if(arm.phi === null) arm.phi = best;
  else{
    let dp = best - arm.phi;
    dp = Math.atan2(Math.sin(dp), Math.cos(dp));
    arm.phi += dp*(1 - Math.exp(-dt*10));
  }
  _E.copy(_C).addScaledVector(_e1, r*Math.cos(arm.phi)).addScaledVector(_e2, r*Math.sin(arm.phi));
  _du.copy(_E).sub(_S).normalize();
  _dl.copy(W).sub(_E).normalize();
  _hg.crossVectors(_du, _dl);
  if(_hg.lengthSq() < 1e-8) _hg.copy(arm.lastHinge || _e1); else _hg.normalize();
  arm.lastHinge = (arm.lastHinge || new THREE.Vector3()).copy(_hg);
  pairQuat(YAX, arm.hingeU, _du, _hg, _qu);
  pairQuat(YAX, arm.hingeL, _dl, _hg, _ql);
  // forearm twist: 60 % of the hand's twist about the forearm axis, relative to the rest wrist
  _qt.copy(_ql).invert().multiply(Qh).multiply(_qi.copy(arm.handRestL).invert());
  const tw = 2*Math.atan2(_qt.y, _qt.w);
  _ql.multiply(_qt.setFromAxisAngle(YAX, Math.atan2(Math.sin(tw), Math.cos(tw))*0.6));
  arm.upper.position.copy(_S);
  arm.upper.quaternion.copy(_qu);
  arm.lower.quaternion.copy(_qi.copy(_qu).invert().multiply(_ql));
  arm.hand.quaternion.copy(_qi.copy(_ql).invert().multiply(Qh));
}

/* Called from applyLook: realistic arms while a realistic patient is on the table (they need its measured poses). */
export function setRealHands(on){ wantHands = on; syncArms(); }
/* The loop calls this when updateRealHands throws: log once, keep the primitive hands for the rest of the session. */
let armsBroken = false;
/* Towel mode: where the two fists hold the towel (world), and how much they hold it (0 = let go). null without the
   realistic arms (scene/towel.js then rests the ends beside the head). */
export function towelGrips(){
  if(!real.arms || !armsShown || armsBroken) return null;
  const l = real.arms.find(a => a.s > 0), r = real.arms.find(a => a.s < 0);
  return l && r && l.seen && r.seen ? {l: l.palm, r: r.palm, hold: Math.min(l.w.towel, r.w.towel)} : null;
}
export function disableRealArms(err){
  if(armsBroken) return;
  armsBroken = true;
  console.warn("realistic arms failed, keeping primitives", err);
  document.documentElement.dataset.arms = "failed";
  syncArms();
}
let armsShown = false;
function syncArms(){
  const cur = current();
  const use = wantHands && !armsBroken && !!real.arms && !!cur && !!measureHead(cur);
  if(real.arms) real.arms.forEach(a => { a.root.visible = use; if(!use) a.seen = false; });
  if(use === armsShown && real.armsSynced) return use;
  armsShown = use; real.armsSynced = true;
  // the primitive hands and capsule sleeves stay the fallback (no GLB, no realistic head yet)
  handParts.forEach(m => { m.visible = !use; });
  forearms.forEach(f => { f.m.visible = !use; f.cuff.visible = !use; });
  return use;
}
export const realArmsActive = () => armsShown;

/* ---- per frame ----
   st: {t: s, dt: s, now: ms, rot: the aim's turn now (deg, + = face to world -x), aim: sign of the target turn,
        setup: 0..1 how close the aim is, push: 0..1 the crack impulse, after: s since the x-ray opened (-1: none),
        prep: settling a new patient (palpate), results: S.results (a new entry = a patient done)}
   Roles follow the head's actual turn: the up-side hand is the contact hand. The role weights ease, so the hands
   slide between poses (around the head's axis, never through it) and swap roles smoothly on the other side. */
const _qh = new THREE.Quaternion(), _qR = new THREE.Quaternion(), _qB = new THREE.Quaternion(), _qH = new THREE.Quaternion();
const _P = new THREE.Vector3(), _F = new THREE.Vector3(), _N = new THREE.Vector3(), _pole = new THREE.Vector3();
const _camF = new THREE.Vector3(), _sh = new THREE.Vector3();
let lastRoleTurn = 1;
// the pat starts during the second reaction (flow.js: the result is pushed at the crack, the next patient comes 7.25 s later)
const PAT_DELAY = 5400;
let patRes = null, patLen = 0, patAt = -1, patChest = null;
// blend two poses in cylinder coordinates about the head's long axis (x = 0, y = AXIS_Y)
const AXIS_Y = -0.01;
function cylLerp(a, b, w, out){
  const ra = Math.hypot(a.x, a.y - AXIS_Y), rb = Math.hypot(b.x, b.y - AXIS_Y);
  const ta = Math.atan2(a.y - AXIS_Y, a.x);
  let dt = Math.atan2(b.y - AXIS_Y, b.x) - ta; dt = Math.atan2(Math.sin(dt), Math.cos(dt));
  const r = ra + (rb - ra)*w, th = ta + dt*w;
  return out.set(r*Math.cos(th), AXIS_Y + r*Math.sin(th), a.z + (b.z - a.z)*w);
}
const _pa = new THREE.Vector3(), _pb = new THREE.Vector3();
function poseQuat(arm, f, n, roll, out){
  pairQuat(arm.F0, arm.N0, f, n, out);
  if(roll) out.premultiply(_qB.setFromAxisAngle(f, roll));
  return out;
}
export function updateRealHands(st){
  if(!syncArms()) return;
  const poses = measureHead(current());
  const {t, dt, push} = st;
  // a patient done (a new result with stars): one hand pats the chest twice before the next patient
  const res = st.results;
  if(res !== patRes){ patRes = res; patLen = res ? res.length : 0; }
  else if(res && res.length > patLen){ patLen = res.length; if(res[patLen - 1].stars > 0){ patAt = st.now + PAT_DELAY; patChest = null; } }
  const pat = patAt > 0 && st.now >= patAt ? (st.now - patAt)/1000 : -1;
  if(pat > 2) patAt = -1;
  // kept after the pat ends: the hand still eases back from it for a few frames (w.pat > 0) once pat is -1 again
  // (reading a null chest there threw every time a patient was done, 2026-10-15)
  if(pat >= 0 && !patChest) patChest = measureChest(current());
  const chest = patChest;
  // which way the head is really turned (hysteresis near the middle); before any turn, the target's side
  if(Math.abs(st.rot) > 4) lastRoleTurn = Math.sign(st.rot);
  else if(Math.abs(st.rot) < 1.5 && st.aim) lastRoleTurn = st.aim;
  const turned = Math.min(1, Math.max(0, (Math.abs(st.rot) - 4)/26));
  const setup = push > 0 ? 1 : Math.max(st.setup, turned*turned*(3 - 2*turned));
  const awayOn = !st.prep && st.after >= AWAY_AT;
  const cupOn = st.prep || (st.after >= CUP_AT && !awayOn);
  head.updateMatrixWorld(true);
  head.getWorldQuaternion(_qH);
  // shoulders: the therapist's trunk, i.e. the camera's base position, following the camera's lean a little
  _camF.copy(camera.position).sub(camBase);
  if(st.towel) _camF.set(0, 0, 0);   // towel mode: the camera is a third-person one, the trunk stays put
  if(_camF.length() > SHOULDER_FOLLOW_MAX) _camF.setLength(SHOULDER_FOLLOW_MAX);
  _camF.multiplyScalar(SHOULDER_FOLLOW);
  view.eye.copy(camBase).add(_camF);
  view.f.copy(camLook).sub(camBase).normalize();
  view.u.set(0, 1, 0).addScaledVector(view.f, -view.f.y).normalize();
  view.r.crossVectors(view.f, view.u);
  view.tan = Math.tan(camera.fov*Math.PI/360); view.aspect = camera.aspect;
  real.arms.forEach(arm => {
    const s = arm.s, P = poses[s], w = arm.w;
    const role = s === lastRoleTurn ? "contact" : "support";
    const k = 1 - Math.exp(-dt*5);
    const patOn = s < 0 && pat >= 0 && pat < 1.15 && !!chest;
    w.contact += ((!cupOn && role === "contact" ? setup : 0) - w.contact)*k;
    w.support += ((!cupOn && role === "support" ? setup : 0) - w.support)*k;
    w.cup += ((cupOn ? 1 : 0) - w.cup)*k;
    w.away += ((awayOn ? 1 : 0) - w.away)*(1 - Math.exp(-dt*3.5));
    w.pat += ((patOn ? 1 : 0) - w.pat)*(1 - Math.exp(-dt*7));
    if(!arm.seen){ w.contact = w.support = w.pat = 0; w.cup = cupOn ? 1 : 0; w.away = awayOn ? 1 : 0; arm.phi = null; }
    // head poses: rest -> contact / support -> cup, around the head's axis
    _pa.copy(P.rest.p);
    cylLerp(_pa, P.contact.p, w.contact, _pa);
    cylLerp(_pa, P.support.p, w.support, _pa);
    cylLerp(_pa, P.cup.p, w.cup, _pa);
    const lerpV = (key, out) => out.copy(P.rest[key]).lerp(P.contact[key], w.contact).lerp(P.support[key], w.support).lerp(P.cup[key], w.cup).normalize();
    lerpV("f", _F); lerpV("n", _N);
    _F.addScaledVector(_N, -_F.dot(_N)).normalize();
    let grip = P.rest.grip + (P.contact.grip - P.rest.grip)*w.contact + (P.support.grip - P.rest.grip)*w.support + (P.cup.grip - P.rest.grip)*w.cup;
    // small breathing-slow sway; the crack: the contact hand rolls the neck toward the opposite eye (a turn about
    // the head's axis plus a short push), the support hand presses up into the weight; both squeeze
    _pa.x += 0.0012*Math.sin(t*0.9 + arm.phase); _pa.z += 0.001*Math.sin(t*0.7 + arm.phase*1.7);
    const pc = push*w.contact, ps = push*w.support;
    let rollAbout = s*0.16*pc;
    if(rollAbout){
      const r = Math.hypot(_pa.x, _pa.y - AXIS_Y), th = Math.atan2(_pa.y - AXIS_Y, _pa.x) + rollAbout;
      _pa.set(r*Math.cos(th), AXIS_Y + r*Math.sin(th), _pa.z - 0.008*pc);
    }
    _pa.addScaledVector(_N, 0.004*(pc + ps));
    grip = Math.min(1.25, grip + 0.5*push*(w.contact + w.support));
    poseQuat(arm, _F, _N, 0, _qR);
    if(rollAbout) _qR.premultiply(_qB.setFromAxisAngle(_v.set(0, 0, 1), rollAbout));
    // to world
    _P.copy(_pa).applyMatrix4(head.matrixWorld);
    _qR.premultiply(_qH);
    // a wrong crack way off (core/fail.js "finger"): the therapist's own knuckle cracked, so the contact hand jerks
    // back off the neck toward the shoulder, the fingers open and the wrist shakes it out, then it settles back
    const fl = role === "contact" && st.flinch >= 0 ? flinchProfile(st.flinch) : null;
    if(fl && fl.away > 0){
      _v3.copy(arm.shoulder).sub(_P).normalize();
      _P.addScaledVector(_v3, 0.12*fl.away); _P.y += 0.05*fl.away;   // back toward the shoulder and up off the skin
      _qR.premultiply(_qB.setFromAxisAngle(_v3, fl.shake));
      grip *= 1 - fl.away;
    }
    // drawn back toward the therapist, palm turned in, below the frame
    if(w.away > 0.001){
      _v2.set(camBase.x + AWAY[0]*s, camBase.y + AWAY[1], camBase.z + AWAY[2]);
      pairQuat(arm.F0, arm.N0, _v.set(-0.35*s, -0.25, 1).normalize(), _v3.set(-0.5*s, -0.85, 0).normalize(), _qB);
      _P.lerp(_v2, w.away);
      _qR.slerp(_qB, w.away);
    }
    // the pat: palm down on the upper chest, two quick pats, then back
    if(w.pat > 0.001 && chest){
      const u = pat, lift = u < 0.45 ? 0.035 : u < 1.05 ? 0.03*(0.5 - 0.5*Math.cos(2*Math.PI*(u - 0.45)/0.3)) : 0.035;
      _v2.copy(chest).add(_v.set(0, PALM_IN*0.2 + lift, 0));
      pairQuat(arm.F0, arm.N0, _v.set(0.25*-s, -0.15, 1).normalize(), _v3.set(0, -1, 0), _qB);
      _P.lerp(_v2, w.pat);
      _qR.slerp(_qB, w.pat);
    }
    // towel mode: both fists on the towel ends past the crown, knuckles toward the feet, palms in; pulled toward the
    // therapist with the tension. A slip throws both hands up and back for a moment (the towel flew off)
    w.towel += ((st.towel && !cupOn && !awayOn ? 1 : 0) - w.towel)*(1 - Math.exp(-dt*6));
    if(!arm.seen) w.towel = st.towel && !cupOn && !awayOn ? 1 : 0;
    if(w.towel > 0.001){
      const sl = st.slip >= 0 && st.slip < 0.8 ? Math.sin(Math.PI*st.slip/0.8) : 0;
      _v2.set(s*TOWEL_GRIP[0], TOWEL_GRIP[1], TOWEL_GRIP[2] - TOWEL_PULL*clamp(st.pull || 0, 0, 1)).applyMatrix4(head.matrixWorld);
      _v2.y += 0.07*sl; _v2.z -= 0.08*sl; _v2.x += s*0.03*sl;
      pairQuat(arm.F0, arm.N0, _v.set(0, -0.55, 1).normalize(), _v3.set(-s, 0, 0), _qB);
      _P.lerp(_v2, w.towel);
      _qR.slerp(_qB, w.towel);
      grip += (1.05*(1 - sl) - grip)*w.towel;
    }
    arm.palm.copy(_P);
    _qh.copy(_qR).multiply(arm.Qh0);
    _W.copy(arm.palmOff).applyQuaternion(_qR).negate().add(_P);
    // shoulder and pole
    _sh.set(camBase.x + SHOULDER[0]*s, camBase.y + SHOULDER[1], camBase.z + SHOULDER[2]).add(_camF);
    if(arm.seen) arm.shoulder.lerp(_sh, 1 - Math.exp(-dt*8)); else arm.shoulder.copy(_sh);
    const wr = Math.max(0, 1 - w.contact - w.support);
    _pole.set(0, 0, 0);
    [["rest", wr], ["contact", w.contact], ["support", w.support]].forEach(([n, ww]) => {
      const p = POLES[n]; _pole.x += p[0]*s*ww; _pole.y += p[1]*ww; _pole.z += p[2]*ww;
    });
    _pole.lerp(_v.set(POLES.away[0]*s, POLES.away[1], POLES.away[2]), w.away);
    _pole.lerp(_v.set(POLES.pat[0]*s, POLES.pat[1], POLES.pat[2]), w.pat);
    _pole.lerp(_v.set(POLES.towel[0]*s, POLES.towel[1], POLES.towel[2]), w.towel).normalize();
    solveArm(arm, arm.shoulder, _W, _qh, _pole, arm.seen ? dt : 1);
    grip *= 1 - 0.6*w.away;
    poseFingers(arm, grip*(1 - w.pat) + 0.1*w.pat, 1 - 0.5*Math.min(1, grip), t, st.prep ? w.cup : 0);
    arm.seen = true;
  });
}

/* Primitive head parts = everything under `head` except the therapist hands and the realistic models. */
function primitiveHeadParts(){
  // the primitive glasses go too: their toy frames float over the realistic face
  const models = Object.values(real.models).map(m => m.head);
  return head.children.filter(o => !models.includes(o) && !handParts.includes(o) && !hands.includes(o));
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
  syncArms();
}
export const realHeadActive = () => !!current();

/* Per frame from the loop: ease blendshapes toward the face state, and mirror the in-zone glow on the skin.
   t: seconds (the face's own motion), breathIn: 0..1 breath fill (nostrils). */
export function updateRealFace(face, blinking, k, glow, t = 0, breathIn = 0){
  const w = expressionWeights(face, blinking, t, breathIn);
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

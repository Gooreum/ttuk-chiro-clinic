import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mats } from "./materials.js";
import { head, handParts } from "./patientModel.js";

/* Realistic glTF models for the first patient (AGENTS.md 2, "realistic assets").
   Loaded once in the background; until a model is ready (or if it fails) the primitive version stays.
   Everything is parented under the existing `head` group, so the neck pivot, camera, aiming and judging are untouched.

   Therapist hands: WebXR generic-hand (MIT, @webxr-input-profiles/assets 1.0.20, public/models/hands/LICENSE.md).
   Rest pose: fingers along -Y, thumb toward -Z, real size (~18 cm). Right hand palm faces -X, left hand +X. */
const BASE = import.meta.env.BASE_URL + "models/";
const loader = new GLTFLoader();
const load = url => new Promise((res, rej) => loader.load(url, res, undefined, rej));

// head-local frame: +y = face (ceiling), -z = top of head (camera side), +z = toward the feet, x = sides
// s = +1 on world +x (screen left, therapist's left hand), s = -1 on world -x (screen right, right hand)
// The camera looks from behind and above the crown, so the hands cradle the head from above:
// palm on the side of the head tilted slightly downward (back of the hand toward the camera),
// fingers running along the side of the head toward the jaw and neck, wrist toward the sleeve.
const HAND_FINGERS = new THREE.Vector3(0, -0.12, 1);
const HAND_PALM_TILT = 0.45;   // how far the palm normal points down (0 = flat against the side)
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
const HAND_AT = s => new THREE.Vector3(0.122*s, 0.02, 0.035);  // palm on the side of the head; wrist ends inside the sleeve cuff

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

const real = {hands: null};
let wantHands = false;

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
  return root;
}

export function loadRealAssets(){
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
export function setRealHands(on){
  wantHands = on;
  const use = on && !!real.hands;
  if(real.hands) real.hands.forEach(h => { h.visible = use; });
  handParts.forEach(m => { m.visible = !use; });
}

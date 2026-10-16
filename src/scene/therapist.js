import * as THREE from "three";
import { scene, camBase } from "./renderer.js";
import { crackFadeMats } from "./patientModel.js";
import { loadModel, getEnv } from "./realAssets.js";
import { headRest } from "./room.js";
import { S } from "../game/state.js";
import { updateTowelStage } from "./towelStage.js";
import { withVisualIds } from "./visualBuild.js";
import { finishTowelCharacter, finishTowelShoulders } from "./towelCharacterLook.js";

/* The therapist's body (public/models/therapist/therapist.glb, scripts/assets/therapist_build.py): sitting upright
   on a clinic stool at the head end of the table (the head extension is folded away for him, room.js headRest),
   leaning about 8 degrees back, head bowed to the patient; arms cut at the shoulders, which sit exactly on the arm IK's shoulder anchors (realAssets.js
   SHOULDER), so the existing arms.glb carries on from there. Static, already in world space (add as is). Only the
   towel mode's third-person camera (game/loop.js) shows it; the clinic camera is this man's eyes. Loaded the first
   time the towel mode wants it. */
let root = null, loading = false, hip = null, fallPt = null, markL = null, markR = null;
// the camera base the body was fitted to (scripts/assets/therapist_build.py); input/orientation.js picks another one
// on other aspect ratios (an iPhone held sideways: (0, 1.52, -0.2)), and the arms' shoulders follow camBase, so the
// body moves with it (user: "치료사 어깨랑 팔 잘려서 나온다", 2026-10-15)
const REF_BASE = new THREE.Vector3(0, 1.55, -0.24);
function prepare(g, env){
  root = g.scene;
  finishTowelShoulders(root);
  root.traverse(o => {
    if(!o.isMesh) return;
    o.castShadow = o.receiveShadow = true;
    const m = o.material, name = (m && m.name) || "";
    if(m){
      m.envMap = env; m.envMapIntensity = 0.15;
      finishTowelCharacter(m, m);
      // The towel-stage scrub and sleeve assets share a dark green palette.
      // the opaque ones fade under the x-ray with the hands; the alpha hair / brows / lashes keep their own blending
      if(!m.transparent && m.alphaTest === 0 && !crackFadeMats.includes(m)) crackFadeMats.push(m);
    }
  });
  root.visible = false;
  root.matrixAutoUpdate = false;
  scene.add(root);
  // markers (scripts/assets/therapist_build.py): the shoulders the arms hang from, the hip he leans back about, the
  // floor point behind the stool he tips over about
  const at = n => { const o = root.getObjectByName(n); return o ? o.position.clone() : null; };
  hip = at("mark_hip"); fallPt = at("mark_fall");
  markL = root.getObjectByName("mark_shoulder_l"); markR = root.getObjectByName("mark_shoulder_r");
}
const _m = new THREE.Matrix4(), _r = new THREE.Matrix4(), _o = new THREE.Vector3();
/* Seated on a stool at the head end, upright and leaning back a little (user: "치료자가 환자 얼굴이랑 너무 가까움.
   수건을 뒤로 당겨야 되는데 저러면 뒤로 당긴다는 느낌이 잘 안살아남", 2026-10-15). lean (radians): the whole body
   tips further back about the hip as he pulls (game/loop.js), and the arms' shoulders ride along (therapistShoulder). */
const FALL_ANGLE = 80*Math.PI/180;   // flat on his back with the stool (an over-pull, core/towel.js fallProfile)
function place(lean, fall){
  _o.copy(camBase).sub(REF_BASE);
  _m.makeTranslation(_o.x, _o.y, _o.z);
  if(fallPt && fall){
    _m.multiply(_r.makeTranslation(fallPt.x, fallPt.y, fallPt.z)).multiply(_r.makeRotationX(-FALL_ANGLE*fall)).multiply(_r.makeTranslation(-fallPt.x, -fallPt.y, -fallPt.z));
  }
  if(hip && lean){
    _m.multiply(_r.makeTranslation(hip.x, hip.y, hip.z)).multiply(_r.makeRotationX(-lean)).multiply(_r.makeTranslation(-hip.x, -hip.y, -hip.z));
  }
  root.matrix.copy(_m);
  root.updateMatrixWorld(true);
}
/* The towel mode's shoulder anchor for the arm IK (scene/realAssets.js): where the leaning body's shoulder is, or
   null before the body is in (the arms then keep their own anchor). */
export function therapistShoulder(s, out){
  const m = s > 0 ? markL : markR;
  return m && root && root.visible ? m.getWorldPosition(out) : null;
}
export function updateTherapist(on, lean = 0, fall = 0){
  updateTowelStage(S.game === "towel");
  if(on && !root && !loading){
    loading = true;
    Promise.all([loadModel("towel-stage/therapist/therapist.glb"), getEnv()]).then(([g, env]) => withVisualIds(() => prepare(g, env)))
      .catch(err => console.warn("therapist body not loaded", err));
  }
  if(root){ root.visible = on; if(on) place(lean, fall); }
  headRest.forEach(m => { m.visible = !(on && root) && !(S.game === "towel" && document.documentElement.dataset.towelStage === "ready"); });
}

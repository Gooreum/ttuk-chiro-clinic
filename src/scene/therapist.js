import * as THREE from "three";
import { scene, camBase } from "./renderer.js";
import { mats } from "./materials.js";
import { crackFadeMats } from "./patientModel.js";
import { loadModel, getEnv } from "./realAssets.js";

/* The therapist's body (public/models/therapist/therapist.glb, scripts/assets/therapist_build.py): bent over the head
   end of the table, arms cut at the shoulders, which sit exactly on the arm IK's shoulder anchors (realAssets.js
   SHOULDER), so the existing arms.glb carries on from there. Static, already in world space (add as is). Only the
   towel mode's third-person camera (game/loop.js) shows it; the clinic camera is this man's eyes. Loaded the first
   time the towel mode wants it. */
let root = null, loading = false;
// the camera base the body was fitted to (scripts/assets/therapist_build.py); input/orientation.js picks another one
// on other aspect ratios (an iPhone held sideways: (0, 1.52, -0.2)), and the arms' shoulders follow camBase, so the
// body moves with it (user: "치료사 어깨랑 팔 잘려서 나온다", 2026-10-15)
const REF_BASE = new THREE.Vector3(0, 1.55, -0.24);
function prepare(g, env){
  root = g.scene;
  root.traverse(o => {
    if(!o.isMesh) return;
    o.castShadow = o.receiveShadow = true;
    const m = o.material, name = (m && m.name) || "";
    if(m){
      m.envMap = env; m.envMapIntensity = 0.15;
      if(name.endsWith(".shirt")) m.color = mats.coat.color;          // the same white as the arms' sleeves
      // the opaque ones fade under the x-ray with the hands; the alpha hair / brows / lashes keep their own blending
      if(!m.transparent && m.alphaTest === 0 && !crackFadeMats.includes(m)) crackFadeMats.push(m);
    }
  });
  root.visible = false;
  scene.add(root);
}
export function updateTherapist(on){
  if(on && !root && !loading){
    loading = true;
    Promise.all([loadModel("therapist/therapist.glb"), getEnv()]).then(([g, env]) => prepare(g, env))
      .catch(err => console.warn("therapist body not loaded", err));
  }
  if(root){ root.visible = on; root.position.copy(camBase).sub(REF_BASE); }
}

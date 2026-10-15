import * as THREE from "three";
import { scene } from "./renderer.js";
import { mats } from "./materials.js";
import { crackFadeMats } from "./patientModel.js";
import { loadModel, getEnv } from "./realAssets.js";

/* The therapist's body (public/models/therapist/therapist.glb, scripts/assets/therapist_build.py): bent over the head
   end of the table, arms cut at the shoulders, which sit exactly on the arm IK's shoulder anchors (realAssets.js
   SHOULDER), so the existing arms.glb carries on from there. Static, already in world space (add as is). Only the
   towel mode's third-person camera (game/loop.js) shows it; the clinic camera is this man's eyes. Loaded the first
   time the towel mode wants it. */
let root = null, loading = false;
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
  if(root) root.visible = on;
}

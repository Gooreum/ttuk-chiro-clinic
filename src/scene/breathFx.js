import * as THREE from "three";
import { scene } from "./renderer.js";
import { head } from "./patientModel.js";

/* Out-breath mist: soft puffs leave the nose while the patient breathes out (the exhale bonus window) and drift up
   off the face, growing and fading. Mint like the HUD's exhale arc (the release wave colour), so it reads
   over skin and gown alike. A pooled handful of sprites, nothing allocated per frame. */
const N = 12, LIFE = 1.5, EVERY = 0.13;
const NOSE = new THREE.Vector3(0, 0.15, 0.015);      // head-local, just off the nose tip (face = +y)
const tex = (() => {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d"), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.45, "rgba(255,255,255,0.45)"); r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const puffs = Array.from({length: N}, () => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({map: tex, color: 0x8adfbf, transparent: true, opacity: 0, depthWrite: false}));
  s.visible = false; scene.add(s);
  return {s, life: 0, v: new THREE.Vector3()};
});
let acc = 0, next = 0;
const _n = new THREE.Vector3();
// dt: real seconds. br: breath state {exhale, fill}. on: only while aiming (not under the x-ray or on menus).
export function updateBreathFx(dt, br, on){
  acc += dt;
  if(on && br.exhale && br.fill > 0.3 && acc >= EVERY){
    acc = 0;
    const p = puffs[next]; next = (next + 1) % N;
    head.localToWorld(_n.copy(NOSE));
    p.s.position.copy(_n); p.life = 1; p.s.visible = true;
    p.v.set((Math.random() - 0.5)*0.03, 0.025 + 0.015*br.fill, 0.012 + Math.random()*0.012);   // up off the face, a little toward the feet
  }
  puffs.forEach(p => {
    if(p.life <= 0) return;
    p.life -= dt/LIFE;
    if(p.life <= 0){ p.s.visible = false; return; }
    const a = 1 - p.life;
    p.s.position.addScaledVector(p.v, dt);
    p.s.scale.setScalar(0.03 + 0.08*a);
    p.s.material.opacity = 0.7*Math.sin(Math.PI*Math.min(1, a*1.2));
  });
}

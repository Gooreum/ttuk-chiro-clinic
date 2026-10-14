import * as THREE from "three";
import { clamp } from "../lib/math.js";
import { pivot } from "./patientModel.js";
import { scene, camera } from "./renderer.js";
import { loadModel, getEnv } from "./realAssets.js";

/* Cervical x-ray (AGENTS.md 2). The bones and discs are a real anatomical model: BodyParts3D C1-C7 and the discs
   C2/3-C7/T1 (CC BY 4.0, CREDITS.md), built by scripts/assets/spine_*.py into public/models/spine/cervical.glb.
   The spinal cord and nerve roots are tubes added on top of it: the cord runs through the vertebral canal centres
   measured on each vertebra, the roots leave at every disc level. Loaded in the background; until it is ready the
   x-ray shows only the film and the joint flash.

   Model frame (M): +y toward the skull, +z anterior, +x the patient's left, metres, real size. Each vertebra is
   moved about its own centre (the glTF node origin). The whole model hangs under the neck pivot, scaled SC.

   Story of one crack (driven from game/loop.js, crackT = seconds since the x-ray opened):
   - before: the stuck vertebra (upper of the chart pair, seg-1) glows coral and sits out of line in the way its
     symptom says (target.xr, below); the disc under it is squashed thin and glows coral; the cord is squeezed
     narrow at that level; the nerve root on the stuck side glows coral
   - the snap: the vertebra springs home with a small overshoot, a flash and gas bubbles pop from the facet joint,
     the disc space opens and the disc regains its height, the cord opens back to full width and a mint pulse runs along it and out of the
     freed root; the vertebra fades from coral to mint

   Symptoms (target.xr):
   - flat   forward head: the neck's curve is straightened, the vertebrae fall back into the curve one after another
   - disc   compression: the disc under the stuck vertebra is squashed and bulges back into the canal, the cord is
            pinched hardest; the disc springs back
   - rot    the stuck vertebra is turned about the spine's axis and snaps back
   - facet  the stuck vertebra is tilted to one side (facet joint closed), the release pops twice as many bubbles
   - muscle tight muscles: hot haze along both sides of the segment (an overlay, not muscle anatomy) that fades
            to mint, the vertebra only slightly turned */

const SC = 1.5;                       // a little over real size so it reads on a phone
const C1_Z = -0.125;                   // pivot z of the atlas (just under the skull base)
const C1_Y = 0.107;                    // model y of the atlas centre
const root = new THREE.Group();
root.rotation.x = -Math.PI/2;          // M +y (skull) -> pivot -z (head), M +z (anterior) -> pivot +y (face)
root.scale.setScalar(SC);
root.position.set(0, -0.02, C1_Z + C1_Y*SC);
root.visible = false;
pivot.add(root);

const COL = {
  bone: new THREE.Color(0xa69c88), disc: new THREE.Color(0x7fb8cc), nerve: new THREE.Color(0xf1dfb4),
  coral: new THREE.Color(0xff7a59), mint: new THREE.Color(0x8adfbf), black: new THREE.Color(0)
};
const solid = color => new THREE.MeshStandardMaterial({color, roughness: 0.7, metalness: 0, envMapIntensity: 0.45,
  emissive: new THREE.Color(0), transparent: true, opacity: 0});

/* Cord: two passes sharing one set of uniforms. The main pass is depth-tested, so it shows bright in the canal
   between the bones; the ghost pass ignores depth at low gain, so the cord still reads faintly through the bodies. */
const CORD_R = 0.0042;
const cordMat = new THREE.ShaderMaterial({
  uniforms: {
    uColor: {value: COL.nerve.clone()}, uHot: {value: COL.coral.clone()}, uPulseCol: {value: COL.mint.clone()},
    uOpacity: {value: 0}, uLevel: {value: 0}, uPinch: {value: 0}, uOff: {value: 0}, uHotAmt: {value: 0},
    uPulseR: {value: 0}, uPulseAmt: {value: 0}, uTop: {value: 0.13}, uBot: {value: -0.02}, uGain: {value: 1}
  },
  vertexShader: `
    uniform float uLevel, uPinch, uOff;
    varying vec3 vN, vV; varying float vY;
    void main(){
      vec3 p = position;
      float g = exp(-pow((p.y - uLevel) / 0.007, 2.0));
      p -= normal * ${CORD_R} * 0.75 * uPinch * g;        // squeeze toward the centreline (negative = wider)
      p.x += uOff * g;
      vY = p.y;
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: `
    uniform vec3 uColor, uHot, uPulseCol;
    uniform float uOpacity, uLevel, uHotAmt, uPulseR, uPulseAmt, uTop, uBot, uGain;
    varying vec3 vN, vV; varying float vY;
    void main(){
      float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.6);
      vec3 c = mix(uColor, uHot, exp(-pow((vY - uLevel) / 0.008, 2.0)) * uHotAmt);
      float band = exp(-pow((abs(vY - uLevel) - uPulseR) / 0.005, 2.0)) * uPulseAmt;
      c += uPulseCol * band * 2.0;
      float ends = smoothstep(uTop, uTop - 0.015, vY) * smoothstep(uBot, uBot + 0.015, vY);
      gl_FragColor = vec4(c * (0.25 + 0.6*f + band) * uGain * uOpacity * ends, 1.0);
    }`,
  transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending
});
// same uniforms object (not a clone), so every update drives both passes
const ghostMat = new THREE.ShaderMaterial({uniforms: cordMat.uniforms, vertexShader: cordMat.vertexShader,
  fragmentShader: cordMat.fragmentShader.replace("* uGain *", "* 0.32 *"),
  transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending});

// joint flash, gas bubbles, muscle haze: additive sprites
const glowTex = (() => {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const x = c.getContext("2d"), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.35, "rgba(255,255,255,.45)"); g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const spriteMat = color => new THREE.SpriteMaterial({map: glowTex, color, transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending});
const flash = new THREE.Sprite(spriteMat(0xffffff));
root.add(flash);
const bubbles = Array.from({length: 24}, () => {
  const s = new THREE.Sprite(spriteMat(0x8adfbf));
  root.add(s);
  return {s, v: new THREE.Vector3(), p: new THREE.Vector3()};
});
const haze = Array.from({length: 6}, () => { const s = new THREE.Sprite(spriteMat(0xff7a59)); root.add(s); return s; });

// dark x-ray film: a camera-attached quad drawn after the (faded) scene. It clears the depth buffer, so the spine
// drawn right after it is depth-tested only against itself (never hidden inside the neck or behind the hands).
const film = new THREE.Mesh(new THREE.PlaneGeometry(4, 4),
  new THREE.MeshBasicMaterial({color: 0x0f231f, transparent: true, opacity: 0, depthTest: false, depthWrite: false}));
film.position.z = -0.05; film.renderOrder = 998; film.frustumCulled = false;
film.onBeforeRender = r => r.clearDepth();
camera.add(film);
scene.add(camera);
// a soft key light that only matters while the room is dimmed
const key = new THREE.PointLight(0xfff4e6, 0, 0.8, 1.5);
root.add(key);

/* ---- model ---- */
const V = [];          // vertebrae 0..6 (C1..C7): {g, mat, home}
const D = [];          // D[i]: disc under vertebra i (1..6): {m, mat, home}
const R = [];          // R[i]: nerve roots under vertebra i: {L, R}
const levelY = [];     // model y of the gap under vertebra i
let cordMesh = null, ready = false, cordZ = 0.0126;
// float copy of a (quantized) glTF mesh, in the model frame
function bake(mesh){
  const g = mesh.geometry.clone();
  ["position", "normal"].forEach(k => {
    const a = g.attributes[k]; if(!a) return;
    const f = new Float32Array(a.count*3);
    for(let i = 0; i < a.count; i++){ f[i*3] = a.getX(i); f[i*3+1] = a.getY(i); f[i*3+2] = a.getZ(i); }
    g.setAttribute(k, new THREE.BufferAttribute(f, 3));
  });
  mesh.updateWorldMatrix(true, false);
  g.applyMatrix4(mesh.matrixWorld);
  return g;
}
const meshIn = (gltf, name) => { let m = null; const o = gltf.scene.getObjectByName(name); if(o) o.traverse(x => { if(!m && x.isMesh) m = x; }); return m; };
// a part that moves about its own centre (the node origin)
function part(gltf, name, mat){
  const mesh = meshIn(gltf, name); if(!mesh) return null;
  const c = new THREE.Vector3(); gltf.scene.getObjectByName(name).getWorldPosition(c);
  const geo = bake(mesh); geo.translate(-c.x, -c.y, -c.z);
  const g = new THREE.Group(); g.position.copy(c); root.add(g);
  const m = new THREE.Mesh(geo, mat); m.renderOrder = 999; g.add(m);
  return {g, m, mat, home: c.clone(), base: mat.color.clone()};
}
export function loadSpine(){
  Promise.all([loadModel("spine/cervical.glb"), getEnv()]).then(([gltf, env]) => {
    gltf.scene.updateMatrixWorld(true);
    for(let i = 0; i < 7; i++){ const p = part(gltf, `C${i+1}`, solid(COL.bone)); p.mat.envMap = env; V.push(p); }
    for(let i = 1; i < 7; i++){
      const p = part(gltf, `Disc_C${i+1}_${i < 6 ? "C" + (i+2) : "T1"}`, solid(COL.disc));
      if(p){ p.mat.envMap = env; p.mat.roughness = 0.4; D[i] = p; }
    }
    for(let i = 0; i < 7; i++){
      R[i] = {};
      ["L", "R"].forEach(t => { const p = part(gltf, `Root_${i}_${t}`, solid(COL.nerve)); if(p){ p.mat.envMap = env; R[i][t] = p; } });
      levelY[i] = i < 6 ? (V[i].home.y + V[i+1].home.y)/2 : V[6].home.y - 0.007;
    }
    const cm = meshIn(gltf, "Cord");
    if(cm){
      const geo = bake(cm); geo.computeBoundingBox();
      const bb = geo.boundingBox;
      cordMat.uniforms.uTop.value = bb.max.y; cordMat.uniforms.uBot.value = bb.min.y;
      cordZ = (bb.min.z + bb.max.z)/2;
      cordMesh = new THREE.Mesh(geo, cordMat); cordMesh.renderOrder = 1000; cordMesh.frustumCulled = false;
      const ghost = new THREE.Mesh(geo, ghostMat); ghost.renderOrder = 1000; ghost.frustumCulled = false;
      root.add(cordMesh, ghost);
    }
    flash.renderOrder = 1001; bubbles.forEach(b => { b.s.renderOrder = 1001; }); haze.forEach(h => { h.renderOrder = 1001; });
    ready = true;
    document.documentElement.dataset.spine = "ready";
  }).catch(err => {
    console.warn("spine model not loaded, x-ray shows the film only", err);
    document.documentElement.dataset.spine = "failed";
  });
}

const easeOutBack = t => { const c = 2.2; t -= 1; return 1 + (c + 1)*t*t*t + c*t*t; };
const SNAP = 0.14;
const snapAt = (crackT, delay) => crackT < 0 ? 0 : easeOutBack(clamp((crackT - delay)/SNAP, 0, 1));
// how hard each symptom squeezes the cord
const PINCH = {disc: 0.9, rot: 0.65, facet: 0.55, flat: 0.6, muscle: 0.45};
const _c = new THREE.Color();
let popped = false;

/* Per frame. amount: 0..1 visibility. crackT: seconds since the x-ray opened on a crack (< 0 = not cracked).
   hurt: 0..1 recent wrong crack (coral throb). */
export function updateXray(now, amount, crackT, hurt, target){
  film.material.opacity = Math.min(amount, 1)*0.86;
  film.visible = amount >= 0.002;
  if(amount < 0.002 || !target || !ready){
    root.visible = false; popped = false;
    flash.material.opacity = 0;
    return;
  }
  root.visible = true;
  key.intensity = 0.45*amount;
  key.position.set(0, levelY[3], 0.09);
  const kind = target.xr || "rot", side = target.side, stuck = clamp(target.seg - 1, 0, 5);
  const align = snapAt(crackT, 0), off = 1 - align;            // 1 = stuck, 0 = in line, < 0 = overshoot
  const freed = crackT >= 0 ? clamp(crackT/SNAP, 0, 1) : 0;
  const throb = 0.5 + 0.5*Math.sin(now*0.012);
  const level = levelY[stuck];

  // reset to the healthy pose, then bend it by symptom
  const all = [...V, ...D.filter(Boolean), ...R.flatMap(r => [r.L, r.R]).filter(Boolean)];
  all.forEach(p => {
    p.g.position.copy(p.home); p.g.rotation.set(0, 0, 0); p.g.scale.set(1, 1, 1);
    p.mat.opacity = amount; p.mat.emissive.setRGB(0, 0, 0); p.mat.color.copy(p.base);
  });
  // only the roots at the stuck level are drawn: fourteen of them read as bristles
  R.forEach((r, i) => [r.L, r.R].forEach(p => { if(p) p.g.visible = i === stuck; }));
  const sv = V[stuck];
  if(kind === "rot"){ sv.g.rotation.y = 0.34*off*side; sv.g.position.x += 0.0018*off*side; }
  if(kind === "facet"){ sv.g.rotation.z = -0.24*off*side; sv.g.position.x += 0.0015*off*side; }
  if(kind === "muscle"){ sv.g.rotation.y = 0.12*off*side; }
  // every symptom: the disc under the stuck vertebra is squashed thin and the space closes; on the crack the space
  // opens and the disc regains its height (overshooting a little). Strongest for the compression symptom, where the
  // disc also bulges back toward the cord.
  if(D[stuck]){
    const d = D[stuck], q = Math.max(-0.35, off), sq = kind === "disc" ? 0.6 : 0.4;
    d.g.scale.set(1 + 0.25*sq*q, 1 - sq*q, 1 + 0.08*sq*q);
    if(kind === "disc") d.g.position.z -= 0.0035*q;
    for(let j = 0; j <= stuck; j++) V[j].g.position.y -= 0.0045*sq*q;   // the column above settles onto it
  }
  if(kind === "flat"){
    // straight neck: every vertebra pushed onto the line C1-C7 and a little past it; they fall back into the curve
    // one after another, outward from the stuck level
    const a = V[0].home, b = V[6].home;
    V.forEach((v, i) => {
      const lin = a.z + (b.z - a.z)*i/6, o = 1 - snapAt(crackT, 0.045*Math.abs(i - stuck));
      v.g.position.z += (lin - v.home.z - 0.005*Math.sin(Math.PI*i/6))*o;
    });
  }

  // stuck vertebra: coral, throbbing before; mint after
  const before = crackT < 0;
  _c.copy(COL.coral).lerp(COL.mint, freed);
  sv.mat.emissive.copy(_c).multiplyScalar(before ? 0.7 + 0.4*throb + 0.4*hurt : 0.7*Math.max(0, 1 - crackT*0.9) + 0.15);
  // tint the stuck pair itself (emissive alone washes out on the pale bone)
  const tint = before ? 0.55 : 0.55*Math.max(0, 1 - crackT*0.8);
  sv.mat.color.lerp(_c, tint*0.6);
  if(D[stuck]) D[stuck].mat.color.lerp(_c, tint + 0.2);
  if(D[stuck]) D[stuck].mat.emissive.copy(_c).multiplyScalar(before ? 1.1 + 0.5*throb + 0.3*hurt : 1.1*Math.max(0, 1 - crackT*0.8) + 0.3);

  // nerve root on the stuck side (target.side > 0 = patient's left)
  const rt = R[stuck] && R[stuck][side > 0 ? "L" : "R"];
  if(rt) rt.mat.emissive.copy(_c).multiplyScalar(before ? 0.5 + 0.5*throb + hurt : 0.9*Math.max(0, 1 - crackT*1.2) + 0.1);

  // cord: squeezed narrow and hot at the stuck level; opens (a touch wider, then settles) with a pulse both ways
  const cu = cordMat.uniforms, P = PINCH[kind] || 0.6;
  cu.uOpacity.value = amount;
  cu.uLevel.value = level;
  cu.uPinch.value = P*Math.max(-0.45, off);
  cu.uOff.value = 0.0015*Math.max(0, off)*side;
  cu.uHotAmt.value = Math.max(0, off)*(0.6 + 0.4*throb) + hurt*0.5;
  cu.uPulseR.value = before ? 0 : crackT*0.11;
  cu.uPulseAmt.value = before ? 0 : Math.max(0, 1 - crackT*1.1);
  cu.uColor.value.copy(COL.nerve).lerp(COL.mint, before ? 0 : clamp(crackT*2.5, 0, 0.5));

  // tight muscles: hot haze on both sides of the segment, cooling to mint and shrinking after the release
  haze.forEach((h, i) => {
    if(kind !== "muscle"){ h.material.opacity = 0; return; }
    const s = i % 2 ? 1 : -1, j = (i >> 1) - 1;
    h.position.set(s*0.024, level + j*0.012, cordZ - 0.01);
    h.material.color.copy(COL.coral).lerp(COL.mint, freed);
    const k = before ? 0.55 + 0.3*throb + 0.3*hurt : 0.6*Math.max(0, 1 - crackT*1.3);
    h.material.opacity = k*amount;
    h.scale.setScalar(0.03*(before ? 1 : 1 - 0.5*freed));
  });

  // flash + bubbles at the facet joint on the stuck side
  const jx = side*0.014, jz = cordZ - 0.006, n = kind === "facet" ? 24 : 12;
  if(!before && !popped){
    popped = true;
    bubbles.forEach(b => {
      b.p.set(jx, level, jz);
      b.v.set(side*(0.4 + Math.random()), (Math.random() - 0.5)*1.2, (Math.random() - 0.5)*1.2).normalize().multiplyScalar(0.03 + Math.random()*0.04);
    });
  }
  if(!before){
    const ft = crackT - SNAP*0.6, fl = ft < 0 ? 0 : Math.max(0, 1 - ft/0.45);
    flash.position.set(jx*0.6, level, jz);
    flash.material.opacity = fl*amount;
    flash.scale.setScalar((kind === "facet" ? 0.016 : 0.01) + 0.035*(1 - fl));
    bubbles.forEach((b, i) => {
      const t = Math.max(0, ft);
      b.s.position.copy(b.p).addScaledVector(b.v, Math.min(t, 0.8));
      b.s.material.opacity = i >= n || ft < 0 ? 0 : Math.max(0, 1 - t/0.7)*amount;
      b.s.scale.setScalar((kind === "facet" ? 0.006 : 0.004) + 0.007*Math.min(1, t*3));
    });
  }else{
    flash.material.opacity = 0;
    bubbles.forEach(b => { b.s.material.opacity = 0; });
  }
}
/* Pivot z of the gap under vertebra i (where the release wave rings). Rough spacing until the model is in. */
export const XRAY_LEVEL = i => ready ? root.position.z - levelY[clamp(i, 0, 6)]*SC : -0.118 + i*0.0335 + 0.0167;

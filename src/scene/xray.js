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

   Story of one crack (driven from game/loop.js, crackT = seconds since the x-ray opened; the release comes
   XRAY_PRE later):
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
            to mint, the vertebra only slightly turned

   A hard wrong crack (game/flow.js hurt, core/fail.js forceTier) opens the x-ray still pressed (crackT < 0) with
   frac = {lvl, t}: FRAC_HIT s in, a jagged crack zips across the stuck vertebra with a white flash and the column
   jolts (lvl 1); on lvl 2 the vertebra then splits along a slanted plane into two clipped halves that drift apart
   and twist, a red glow between them, bone chips flying, the cord hot and pinched harder. A cartoon warning. */

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
  coral: new THREE.Color(0xff7a59), mint: new THREE.Color(0x8adfbf), black: new THREE.Color(0),
  // the pinched disc only (user request, outside the palette): red while pinched, turning blue as it frees up
  pinched: new THREE.Color(0xe8383d), freed: new THREE.Color(0x3d8bff)
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
// heat on the pressed disc that bursts mint on the release (core + halo)
const discGlow = [spriteMat(0xff7a59), spriteMat(0xff7a59)].map(m => { const s = new THREE.Sprite(m); root.add(s); return s; });
const haze = Array.from({length: 6}, () => { const s = new THREE.Sprite(spriteMat(0xff7a59)); root.add(s); return s; });

// hard wrong crack: the crack line (a dark core in a coral glow, reads on the pale bone), bone chips, the red glow in the break
const crackTex = (() => {
  const c = document.createElement("canvas"); c.width = 256; c.height = 96;
  const x = c.getContext("2d"), pts = [];
  for(let i = 0; i <= 12; i++) pts.push([10 + i*19.6, 48 + (i % 2 ? 1 : -1)*(8 + (i*37 % 11)) * (i === 0 || i === 12 ? 0.2 : 1)]);
  const line = () => { x.beginPath(); pts.forEach(([px, py], i) => i ? x.lineTo(px, py) : x.moveTo(px, py)); x.stroke(); };
  x.lineJoin = "miter"; x.lineCap = "round";
  x.strokeStyle = "rgba(255,122,89,.55)"; x.lineWidth = 16; x.shadowColor = "#ff7a59"; x.shadowBlur = 14; line();
  x.shadowBlur = 0; x.strokeStyle = "#3a1a12"; x.lineWidth = 6; line();
  // two short side cracks
  x.lineWidth = 3; x.beginPath(); x.moveTo(pts[4][0], pts[4][1]); x.lineTo(pts[4][0] + 10, pts[4][1] + 22); x.moveTo(pts[8][0], pts[8][1]); x.lineTo(pts[8][0] - 6, pts[8][1] - 24); x.stroke();
  return new THREE.CanvasTexture(c);
})();
const crackSpr = new THREE.Sprite(new THREE.SpriteMaterial({map: crackTex, transparent: true, opacity: 0, depthWrite: false, depthTest: false}));
crackSpr.renderOrder = 1002; crackSpr.visible = false; root.add(crackSpr);
const shardTex = (() => {
  const c = document.createElement("canvas"); c.width = c.height = 32;
  const x = c.getContext("2d"); x.fillStyle = "#fff"; x.beginPath(); x.moveTo(4, 26); x.lineTo(16, 3); x.lineTo(29, 21); x.lineTo(15, 29); x.closePath(); x.fill();
  return new THREE.CanvasTexture(c);
})();
const chips = Array.from({length: 8}, (_, i) => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({map: shardTex, color: 0xe6dcc4, transparent: true, opacity: 0, depthWrite: false, depthTest: false, rotation: i*0.8}));
  s.renderOrder = 1002; s.visible = false; root.add(s);
  const a = i/8*Math.PI*2;
  return {s, v: new THREE.Vector3(Math.cos(a)*0.9, (Math.random() - 0.5)*0.8, Math.sin(a)*0.6 + 0.4).multiplyScalar(0.016 + (i % 3)*0.006)};
});
// normal blending: an additive red on the pale bone burns out to white
const gapGlow = new THREE.Sprite(new THREE.SpriteMaterial({map: glowTex, color: 0xe8383d, transparent: true, opacity: 0, depthWrite: false, depthTest: false}));
gapGlow.renderOrder = 1001; root.add(gapGlow);
// the two halves of the broken vertebra: the same geometry, clipped on opposite sides of the break plane
const halves = [0, 1].map(() => {
  const mat = solid(COL.bone); mat.clippingPlanes = [new THREE.Plane()];
  const m = new THREE.Mesh(new THREE.BufferGeometry(), mat); m.renderOrder = 999; m.visible = false; root.add(m);
  return m;
});
/* Seconds into the fracture x-ray when the crack happens (game/loop.js plays the crunch and the label then). */
export const FRAC_HIT = 0.35;
const _n = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _o = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
function hideFrac(){
  crackSpr.visible = false; gapGlow.material.opacity = 0;
  chips.forEach(c => { c.s.visible = false; }); halves.forEach(h => { h.visible = false; });
}

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
      if(p){
        p.mat.envMap = env; p.mat.roughness = 0.4; D[i] = p;
        // see-through flat colour of the same disc, drawn over the bones (only the pinched one shows it). Normal
        // blending and no tone mapping: an additive glow on the pale bone burns out to white and loses the red/blue.
        p.over = new THREE.Mesh(p.m.geometry, new THREE.MeshBasicMaterial({color: 0, transparent: true, opacity: 0,
          depthTest: false, depthWrite: false, toneMapped: false}));
        p.over.renderOrder = 1000; p.g.add(p.over);
      }
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
    flash.renderOrder = 1001; bubbles.forEach(b => { b.s.renderOrder = 1001; }); haze.forEach(h => { h.renderOrder = 1001; }); discGlow.forEach(g => { g.renderOrder = 1001; });
    ready = true;
    document.documentElement.dataset.spine = "ready";
  }).catch(err => {
    console.warn("spine model not loaded, x-ray shows the film only", err);
    document.documentElement.dataset.spine = "failed";
  });
}

const easeOutBack = t => { const c = 2.2; t -= 1; return 1 + (c + 1)*t*t*t + c*t*t; };
const SNAP = 0.14;
const snapAt = (t, delay) => t < 0 ? 0 : easeOutBack(clamp((t - delay)/SNAP, 0, 1));
// disc release: shoots past its height, then settles in a few damped bounces (0 -> ~1.35 -> 1)
const spring = t => t <= 0 ? 0 : 1 - Math.exp(-4.2*t)*Math.cos(10*t);
// a single swell that rolls over the neighbouring discs
const swell = u => u <= 0 || u > 1.4 ? 0 : Math.sin(Math.PI*u/1.4)*Math.exp(-1.6*u);
// how hard each symptom squeezes the cord, and the disc
const PINCH = {disc: 0.9, rot: 0.65, facet: 0.55, flat: 0.6, muscle: 0.45};
const SQUASH = {disc: 0.82, rot: 0.66, facet: 0.66, flat: 0.62, muscle: 0.58};
/* Seconds of "pressure" after the x-ray opens, before the release. Exported for the camera push in game/loop.js. */
export const XRAY_PRE = 0.55;
const _c = new THREE.Color();
let popped = false;

/* Per frame. amount: 0..1 visibility. crackT: seconds since the x-ray opened on a crack (< 0 = not cracked).
   hurt: 0..1 recent wrong crack (coral throb). frac: {lvl 1|2, t seconds} on a hard wrong crack (see the header), else
   null. Returns true on the frame of the release (sound, rumble, wave). */
export function updateXray(now, amount, crackT, hurt, target, frac = null){
  film.material.opacity = Math.min(amount, 1)*0.86;
  film.visible = amount >= 0.002;
  if(amount < 0.002 || !target || !ready){
    root.visible = false; popped = false; hideFrac();
    flash.material.opacity = 0; discGlow.forEach(g => { g.material.opacity = 0; });
    return false;
  }
  root.visible = true;
  key.intensity = 0.45*amount;
  key.position.set(0, levelY[3], 0.09);
  const kind = target.xr || "rot", side = target.side, stuck = clamp(target.seg - 1, 0, 5);
  // ct: seconds since the release (< 0: still pressed). pressure: 0..1 build-up over XRAY_PRE.
  const ct = crackT < 0 ? -1 : crackT - XRAY_PRE, before = ct < 0;
  const pressure = crackT < 0 ? 1 : clamp(crackT/XRAY_PRE, 0, 1);
  const align = snapAt(ct, 0), off = 1 - align;                 // 1 = stuck, 0 = in line, < 0 = overshoot
  const freed = before ? 0 : clamp(ct/SNAP, 0, 1);
  // the throb quickens while the pressure builds
  const throb = 0.5 + 0.5*Math.sin(now*(0.012 + 0.02*(crackT >= 0 && before ? pressure : 0)));
  const level = levelY[stuck];

  // reset to the healthy pose, then bend it by symptom
  const all = [...V, ...D.filter(Boolean), ...R.flatMap(r => [r.L, r.R]).filter(Boolean)];
  all.forEach(p => {
    p.g.position.copy(p.home); p.g.rotation.set(0, 0, 0); p.g.scale.set(1, 1, 1);
    p.mat.opacity = amount; p.mat.emissive.setRGB(0, 0, 0); p.mat.color.copy(p.base); p.m.visible = true;
    if(p.over) p.over.material.opacity = 0;
  });
  // only the roots at the stuck level are drawn: fourteen of them read as bristles
  R.forEach((r, i) => [r.L, r.R].forEach(p => { if(p) p.g.visible = i === stuck; }));
  const sv = V[stuck];
  if(kind === "rot"){ sv.g.rotation.y = 0.34*off*side; sv.g.position.x += 0.0018*off*side; }
  if(kind === "facet"){ sv.g.rotation.z = -0.24*off*side; sv.g.position.x += 0.0015*off*side; }
  if(kind === "muscle"){ sv.g.rotation.y = 0.12*off*side; }

  // The disc under the stuck vertebra is the main event. Pressed: nearly flat, bulging out sideways, the column above
  // sitting down on it and trembling. Released: it springs past its full height and settles in damped bounces,
  // lifting everything above it; a swell rolls over the neighbouring discs; then it keeps breathing gently.
  const dz = D[stuck];
  if(dz){
    const sq = (SQUASH[kind] || 0.65)*(0.88 + 0.12*pressure);
    const open = before ? 0 : spring(ct);                       // 0 pressed .. ~1.35 .. 1
    const breathe = before ? 0 : 0.05*Math.sin(ct*4.5)*Math.exp(-0.6*ct)*clamp(ct - 0.5, 0, 1);
    const h = 1 - sq*(1 - open) + breathe;                         // disc height factor
    const bulge = Math.max(0, 1 - open);
    dz.g.scale.set(1 + 0.45*sq*bulge, Math.max(0.12, h), 1 + 0.3*sq*bulge);
    if(kind === "disc") dz.g.position.z -= 0.004*bulge;            // pushed back toward the cord
    const lift = 0.0075*(h - 1);                                   // < 0 pressed, > 0 decompressed
    const tremble = before && crackT >= 0 ? 0.00035*Math.sin(now*0.09)*pressure : 0;
    for(let j = 0; j < stuck; j++){ V[j].g.position.y += lift; V[j].g.position.x += tremble; }
    sv.g.position.y += lift; sv.g.position.x += tremble;
    D.forEach((d, j) => {
      if(!d || j === stuck) return;
      const w = swell((ct - 0.07*Math.abs(j - stuck))*1.4);
      d.g.scale.y = 1 + 0.22*w;
      if(j < stuck) for(let k = 0; k <= j; k++) V[k].g.position.y += 0.0052*0.22*w;
    });
  }
  if(kind === "flat"){
    // straight neck: every vertebra pushed onto the line C1-C7 and a little past it; they fall back into the curve
    // one after another, outward from the stuck level
    const a = V[0].home, b = V[6].home;
    V.forEach((v, i) => {
      const lin = a.z + (b.z - a.z)*i/6, o = 1 - snapAt(ct, 0.06*Math.abs(i - stuck));
      v.g.position.z += (lin - v.home.z - 0.005*Math.sin(Math.PI*i/6))*o;
    });
  }

  // stuck vertebra and its disc: coral, throbbing before; a mint burst on the release that settles to a soft glow
  _c.copy(COL.coral).lerp(COL.mint, freed);
  const burst = before ? 0 : Math.exp(-2.2*ct);
  // the vertebra only warms faintly: the red belongs to the disc
  sv.mat.emissive.copy(_c).multiplyScalar(before ? 0.12 + 0.08*throb + 0.3*hurt : 0.25*burst);
  // the pinched disc: red and throbbing; from the release it turns blue over ~1.4 s and settles to the healthy disc
  if(dz){
    const blue = before ? 0 : clamp(ct/1.4, 0, 1), b2 = blue*blue*(3 - 2*blue);
    const dc = _c.clone().copy(COL.pinched).lerp(COL.freed, b2);
    const settle = before ? 0 : clamp((ct - 1.4)/0.8, 0, 1);
    dz.mat.color.copy(dc).lerp(dz.base, settle*0.6);
    dz.mat.emissive.copy(dc).multiplyScalar(before ? 0.3 + 0.2*throb + 0.2*hurt : 0.2 + 0.3*burst);
    dz.over.material.color.copy(dc);
    dz.over.material.opacity = (before ? 0.55 + 0.25*throb : 0.7)*(1 - settle*0.55)*amount;
    discGlow.forEach((g, i) => {
      g.position.copy(dz.g.position); g.position.z += 0.006;     // on the front of the disc, where it bulges
      g.material.color.copy(dc);
      g.material.opacity = (before ? (0.1 + 0.1*throb) : 0.25*burst)*(i ? 1 : 0)*amount;
      g.scale.setScalar(i ? 0.03 + (before ? 0 : 0.05*(1 - burst)) : 0.014);
    });
  }
  D.forEach((d, j) => { if(d && j !== stuck && !before) d.mat.emissive.copy(COL.mint).multiplyScalar(0.7*swell((ct - 0.07*Math.abs(j - stuck))*1.4)); });

  // nerve root on the stuck side (target.side > 0 = patient's left)
  const rt = R[stuck] && R[stuck][side > 0 ? "L" : "R"];
  if(rt) rt.mat.emissive.copy(_c).multiplyScalar(before ? 0.5 + 0.5*throb + hurt : 0.1 + 0.9*burst);

  // cord: squeezed narrow and hot at the stuck level; springs open (wider, then settles) with a pulse both ways
  const cu = cordMat.uniforms, P = PINCH[kind] || 0.6;
  const cOpen = before ? 0 : spring(ct);
  cu.uOpacity.value = amount;
  cu.uLevel.value = level;
  cu.uPinch.value = P*(1 - cOpen)*(before ? 0.88 + 0.12*pressure : 1);
  cu.uOff.value = 0.0015*Math.max(0, off)*side;
  cu.uHotAmt.value = before ? 0.6 + 0.4*throb + hurt*0.5 : Math.max(0, off) + hurt*0.5;
  cu.uPulseR.value = before ? 0 : ct*0.09;
  cu.uPulseAmt.value = before ? 0 : Math.max(0, 1 - ct*0.8);
  cu.uColor.value.copy(COL.nerve).lerp(COL.mint, before ? 0 : 0.2 + 0.4*burst);

  // tight muscles: hot haze on both sides of the segment, cooling to mint and shrinking after the release
  haze.forEach((h, i) => {
    if(kind !== "muscle"){ h.material.opacity = 0; return; }
    const s = i % 2 ? 1 : -1, j = (i >> 1) - 1;
    h.position.set(s*0.024, level + j*0.012, cordZ - 0.01);
    h.material.color.copy(COL.coral).lerp(COL.mint, freed);
    const k = before ? 0.55 + 0.3*throb + 0.3*hurt : 0.6*Math.max(0, 1 - ct*1.1);
    h.material.opacity = k*amount;
    h.scale.setScalar(0.03*(before ? 1 : 1 - 0.5*freed));
  });

  // flash + bubbles at the facet joint on the stuck side
  const jx = side*0.014, jz = cordZ - 0.006, n = kind === "facet" ? 24 : 16;
  let released = false;
  if(!before && !popped){
    popped = true; released = true;
    bubbles.forEach(b => {
      b.p.set(jx, level, jz);
      b.v.set(side*(0.4 + Math.random()), (Math.random() - 0.5)*1.2, (Math.random() - 0.5)*1.2).normalize().multiplyScalar(0.03 + Math.random()*0.05);
    });
  }
  if(!before){
    const ft = ct - SNAP*0.4, fl = ft < 0 ? 0 : Math.max(0, 1 - ft/0.5);
    flash.position.set(jx*0.5, level, jz);
    flash.material.opacity = fl*amount;
    flash.scale.setScalar((kind === "facet" ? 0.012 : 0.008) + 0.025*(1 - fl));
    bubbles.forEach((b, i) => {
      const t = Math.max(0, ft);
      b.s.position.copy(b.p).addScaledVector(b.v, Math.min(t, 1));
      b.s.material.opacity = i >= n || ft < 0 ? 0 : Math.max(0, 1 - t/0.9)*amount;
      b.s.scale.setScalar((kind === "facet" ? 0.006 : 0.0045) + 0.008*Math.min(1, t*3));
    });
  }else{
    flash.material.opacity = 0;
    bubbles.forEach(b => { b.s.material.opacity = 0; });
  }
  if(frac) fracture(frac, sv, stuck, side, amount, throb);
  else hideFrac();
  return released;
}
/* The hard wrong crack on the stuck vertebra (sv). Runs after the pressed pose is set up, so it only adds. */
function fracture(frac, sv, stuck, side, amount, throb){
  const ft = frac.t - FRAC_HIT;
  if(ft < 0){ hideFrac(); sv.g.position.x += 0.0003*Math.sin(frac.t*90)*frac.t/FRAC_HIT; return; }   // trembling
  const zip = clamp(ft/0.15, 0, 1), broke = frac.lvl > 1 ? clamp((ft - 0.1)/0.25, 0, 1) : 0;
  const split = 1 - Math.pow(1 - broke, 3);
  // the column above jolts once
  const jolt = 0.0022*Math.exp(-7*ft)*Math.sin(38*ft);
  for(let j = 0; j <= stuck; j++) V[j].g.position.y += jolt;
  // the vertebra goes hot
  sv.mat.emissive.copy(COL.coral).multiplyScalar(0.35 + 0.25*throb + (frac.lvl > 1 ? 0.25 : 0));
  const body = _o.copy(sv.g.position); body.z += 0.007; body.y += 0.004;   // the front of the body, off the disc below
  crackSpr.visible = true;
  crackSpr.position.copy(body);
  crackSpr.scale.set(0.052*zip, 0.02, 1);
  // the break plane: slanted across the vertebra, mostly sideways so the halves part without running into the
  // neighbours; the crack line lies along it as it shows on screen (the sprite faces the camera, its line is its x)
  _n.set(side, 0.7, 0.25).normalize();
  root.updateWorldMatrix(true, false);
  _a.copy(body).applyMatrix4(root.matrixWorld).project(camera);
  _b.copy(body).addScaledVector(_n, 0.01).applyMatrix4(root.matrixWorld).project(camera);
  crackSpr.material.rotation = Math.atan2(_b.y - _a.y, (_b.x - _a.x)*camera.aspect) + Math.PI/2;
  crackSpr.material.opacity = amount*(1 - 0.6*split);
  flash.position.copy(body);
  flash.material.opacity = Math.max(0, 1 - ft/0.4)*amount;
  flash.scale.setScalar(0.012 + 0.03*Math.min(1, ft*3));
  // cord: hot and squeezed at that level
  const cu = cordMat.uniforms;
  cu.uHotAmt.value = Math.max(cu.uHotAmt.value, 0.9 + 0.3*frac.lvl);
  if(frac.lvl > 1) cu.uPinch.value = Math.min(1.2, cu.uPinch.value + 0.4*split);
  if(frac.lvl < 2 || broke <= 0){ halves.forEach(h => { h.visible = false; }); chips.forEach(c => { c.s.visible = false; }); gapGlow.material.opacity = 0; return; }
  // lvl 2: two halves along a slanted plane, drifting apart and twisting
  sv.m.visible = false;
  halves.forEach((h, i) => {
    const s = i ? -1 : 1;
    h.visible = true;
    h.geometry = sv.m.geometry;
    h.material.opacity = amount; h.material.envMap = sv.mat.envMap;
    h.material.emissive.copy(sv.mat.emissive);
    h.position.copy(sv.g.position).addScaledVector(_n, s*0.011*split);
    _e.set(0, s*0.15*split, s*0.3*split*side);
    h.quaternion.copy(sv.g.quaternion).multiply(_q.setFromEuler(_e));
    h.updateWorldMatrix(true, false);
    h.material.clippingPlanes[0].setFromNormalAndCoplanarPoint(_o.copy(_n).multiplyScalar(s), new THREE.Vector3()).applyMatrix4(h.matrixWorld);
  });
  gapGlow.position.copy(sv.g.position);
  gapGlow.material.opacity = amount*split*(0.8 + 0.2*throb);
  gapGlow.scale.setScalar(0.026 + 0.016*split);
  chips.forEach(c => {
    const t = Math.max(0, ft - 0.1);
    c.s.visible = true;
    c.s.position.copy(sv.g.position).addScaledVector(c.v, Math.min(t, 0.9));
    c.s.material.opacity = amount*Math.max(0, 1 - t/1.3);
    c.s.scale.setScalar(0.0055 + 0.002*(c.v.length() > 0.02 ? 1 : 0));
  });
}
/* Pivot z of the gap under vertebra i (where the release wave rings). Rough spacing until the model is in. */
export const XRAY_LEVEL = i => ready ? root.position.z - levelY[clamp(i, 0, 6)]*SC : -0.118 + i*0.0335 + 0.0167;

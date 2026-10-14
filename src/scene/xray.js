import * as THREE from "three";
import { mergeBufferGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { clamp } from "../lib/math.js";
import { pivot } from "./patientModel.js";
import { scene, camera } from "./renderer.js";

/* Cervical x-ray (AGENTS.md 2): vertebrae C1-C7, discs, spinal cord and nerve roots under the neck pivot.
   Everything is drawn with an additive fresnel shader (bright rims, see-through centres) so it reads as an x-ray
   while the rest of the scene is dimmed. Shapes are stylised vertebra outlines extruded along the spine, not an
   anatomical model.

   Story of one crack (driven from game/loop.js):
   - near the target the skin turns slightly see-through and the stuck pair shows: the upper vertebra sits off to
     one side, the disc under it is squashed and bulges, the nerve root on that side glows coral and the cord kinks
   - on the crack the vertebra snaps back with a small overshoot, a flash and bubbles burst from the joint, the disc
     springs back, and a mint pulse runs along the cord and out of the freed nerve root

   Spine-local frame = pivot frame: +y anterior (face/ceiling), -y posterior (table), z along the neck
   (C1 near the head at -0.118, C7 at +0.083), x sideways. */

const VS = `
uniform float uLevel, uOff, uPinch;
varying vec3 vN, vV; varying float vZ;
void main(){
  vec3 p = position;
  #ifdef CORD
    float g = exp(-pow((p.z - uLevel) / 0.022, 2.0));
    p.xy *= 1.0 - uPinch * 0.45 * g;
    p.x += uOff * g;
  #endif
  vZ = p.z;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const FS = `
uniform vec3 uColor, uHot, uPulseCol; uniform float uOpacity, uRim, uBase, uLevel, uHotAmt, uPulseR, uPulseAmt;
varying vec3 vN, vV; varying float vZ;
void main(){
  float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
  vec3 c = uColor;
  #ifdef CORD
    float near = exp(-pow((vZ - uLevel) / 0.02, 2.0));
    c = mix(c, uHot, near * uHotAmt);
    float band = exp(-pow((abs(vZ - uLevel) - uPulseR) / 0.014, 2.0)) * uPulseAmt;
    c += uPulseCol * band * 2.2;
    f += band;
    float ends = smoothstep(0.2, 0.12, abs(vZ));            // fade the cord out inside the skull and the chest
  #else
    float ends = 1.0;
  #endif
  gl_FragColor = vec4(c * (uBase + f * uRim) * uOpacity * ends, 1.0);
}`;
const COL = {bone: new THREE.Color(0xf1eadc), coral: new THREE.Color(0xff7a59), mint: new THREE.Color(0x8adfbf)};
function xMat(color, {rim = 1.3, base = 0.12, cord = false} = {}){
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: {value: new THREE.Color(color)}, uHot: {value: COL.coral.clone()}, uPulseCol: {value: COL.mint.clone()},
      uOpacity: {value: 0}, uRim: {value: rim}, uBase: {value: base},
      uLevel: {value: 0}, uOff: {value: 0}, uPinch: {value: 0}, uHotAmt: {value: 0}, uPulseR: {value: 0}, uPulseAmt: {value: 0}
    },
    defines: cord ? {CORD: 1} : {},
    vertexShader: VS, fragmentShader: FS,
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending
  });
}

/* ---- vertebra outline (transverse section, mm, canal centre at the origin, +y anterior) ---- */
const MM = 0.0017;                       // stylised ~1.7x real size so it reads on a phone
function mirrorPath(half){               // half: right-side points from the top centre down to the bottom centre
  const pts = half.concat(half.slice(1, -1).reverse().map(([x, y]) => [-x, y]));
  return pts.map(([x, y]) => new THREE.Vector2(x*MM, y*MM));
}
// three pieces so the side view reads too: a thick body, a thinner arch ring with the transverse processes,
// and a spinous process angled down toward the feet
function bodyShape(atlas){
  const top = atlas ? 13 : 21.5, bw = atlas ? 4 : 9, r = 2;
  return new THREE.Shape(mirrorPath([[0, top], [bw - r, top], [bw, top - r], [bw, 10 + r], [bw - r, 9.5], [0, 9.5]]));
}
function archShape(){
  const shape = new THREE.Shape(mirrorPath([
    [0, 10.5], [11, 10], [14, 10.5], [22, 11.5], [26, 8.5], [25, 4.5],     // pedicle, transverse process (two tubercles)
    [18, 3], [14, 1], [14.5, -4],                                          // lateral mass + facet
    [10, -8.5], [5, -12], [0, -12.5]                                       // lamina
  ]));
  shape.holes.push(new THREE.Path(mirrorPath([[0, 8], [8, 6.5], [10, 2], [7.5, -4], [3, -7.5], [0, -8.5]]).reverse()));
  [-1, 1].forEach(s => shape.holes.push(new THREE.Path().absarc(s*18*MM, 7.5*MM, 2.6*MM, 0, Math.PI*2, true)));
  return shape;
}
function spinousShape(len){
  return new THREE.Shape(mirrorPath([[0, -10], [3.5, -10], [3.5, -len + 4], [6, -len], [2, -len + 1], [0, -len + 2.5]]));
}
const LEVEL0 = -0.118, STEP = 0.0335, THICK = 0.019;
const zOf = i => LEVEL0 + i*STEP;                           // centre of vertebra i (0 = C1)
const spine = new THREE.Group();
spine.position.set(0, -0.014, 0);
spine.visible = false;
pivot.add(spine);

const boneMat = xMat(COL.bone, {rim: 0.75, base: 0.05});
const hitMat = xMat(COL.coral, {rim: 1.0, base: 0.2});
const discMat = xMat(COL.mint, {rim: 0.5, base: 0.06});
const discHitMat = xMat(COL.coral, {rim: 1.3, base: 0.25});
const cordMat = xMat(COL.bone, {rim: 0.8, base: 0.18, cord: true});
const rootMat = xMat(COL.bone, {rim: 0.6, base: 0.1});
const rootHitMat = xMat(COL.coral, {rim: 1.6, base: 0.5});
const ALL = [boneMat, hitMat, discMat, discHitMat, cordMat, rootMat, rootHitMat];

const extrude = (shape, depth) => {
  const g = new THREE.ExtrudeGeometry(shape, {depth, bevelEnabled: true, bevelThickness: 0.0012, bevelSize: 0.001, bevelSegments: 2, curveSegments: 5});
  g.translate(0, 0, -depth/2);
  return g;
};
const geoCache = {};
function vertGeo(i){
  const key = i === 0 ? "atlas" : i === 1 ? "axis" : i === 6 ? "c7" : "mid";
  if(!geoCache[key]){
    const sp = extrude(spinousShape(i === 0 ? 15 : i === 1 ? 30 : i === 6 ? 34 : 26), THICK*0.38);
    sp.translate(0, 11*MM, 0); sp.rotateX(-0.5); sp.translate(0, -11*MM, 0);
    const arch = extrude(archShape(), THICK*0.55);
    arch.translate(0, 0, THICK*0.12);
    geoCache[key] = mergeBufferGeometries([extrude(bodyShape(i === 0), THICK - 0.0024), arch, sp].map(g => g.toNonIndexed()));
  }
  return geoCache[key];
}
const vert = [];
for(let i = 0; i < 7; i++){
  const g = new THREE.Group();
  g.position.z = zOf(i);
  spine.add(g);
  const m = new THREE.Mesh(vertGeo(i), boneMat);
  g.add(m);
  vert.push({g, m});
}
// discs sit between vertebral bodies (between i and i+1, from C2 down), centred on the body
const discGeo = new THREE.CylinderGeometry(1, 1, 1, 24, 1);
discGeo.rotateX(Math.PI/2);
const discs = [];
for(let i = 1; i < 6; i++){
  const m = new THREE.Mesh(discGeo, discMat);
  m.position.set(0, 14*MM, zOf(i) + STEP/2);
  m.userData.base = new THREE.Vector3(8.5*MM, 7*MM, STEP - THICK - 0.002);
  m.scale.copy(m.userData.base);
  spine.add(m);
  discs[i] = m;
}
// spinal cord: brainstem down into the chest, through every canal
const cordGeo = new THREE.CylinderGeometry(4.6*MM, 4.6*MM, 0.4, 16, 80, true);
cordGeo.rotateX(Math.PI/2);
const cord = new THREE.Mesh(cordGeo, cordMat);
cord.position.set(0, 0.5*MM, -0.02);
spine.add(cord);
// nerve roots leave between two vertebrae through the side gap and run down toward the shoulders
const roots = [];
for(let i = 0; i < 7; i++){
  const z = zOf(i) + STEP/2;
  roots[i] = [-1, 1].map(s => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(s*4*MM, 1*MM, z), new THREE.Vector3(s*13*MM, 4*MM, z + 0.002),
      new THREE.Vector3(s*24*MM, 6*MM, z + 0.008), new THREE.Vector3(s*34*MM, 4*MM, z + 0.022)
    ]);
    const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 1.5*MM, 6), rootMat);
    spine.add(m);
    return m;
  });
}
// joint flash + released gas bubbles (the "pop")
const glowTex = (() => {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const x = c.getContext("2d"), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.35, "rgba(255,255,255,.45)"); g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const spriteMat = color => new THREE.SpriteMaterial({map: glowTex, color, transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending});
const flash = new THREE.Sprite(spriteMat(0xffffff));
spine.add(flash);
const bubbles = Array.from({length: 12}, () => {
  const s = new THREE.Sprite(spriteMat(0x8adfbf));
  spine.add(s);
  return {s, v: new THREE.Vector3(), p: new THREE.Vector3()};
});
// dark x-ray film: a camera-attached quad drawn after the (faded) scene and before the spine
const film = new THREE.Mesh(new THREE.PlaneGeometry(4, 4),
  new THREE.MeshBasicMaterial({color: 0x0f231f, transparent: true, opacity: 0, depthTest: false, depthWrite: false}));
film.position.z = -0.05; film.renderOrder = 998; film.frustumCulled = false;
camera.add(film);
scene.add(camera);
spine.traverse(o => { o.renderOrder = 999; });
const easeOutBack = t => { const c = 2.2; t -= 1; return 1 + (c + 1)*t*t*t + c*t*t; };

let popped = false;
/* Per frame. amount: 0..1 visibility. crackT: seconds since the crack (< 0 = not cracked yet).
   hurt: 0..1 recent wrong crack (coral throb). */
export function updateXray(now, amount, crackT, hurt, target){
  film.material.opacity = Math.min(amount, 1)*0.62;
  film.visible = amount >= 0.002;
  if(amount < 0.002 || !target){
    spine.visible = false; popped = false;
    return;
  }
  spine.visible = true;
  const n = target.seg, side = target.side, stuck = n - 1;        // vertebra index that sits off line (upper of the pair)
  const SNAP = 0.14;
  const align = crackT < 0 ? 0 : easeOutBack(clamp(crackT/SNAP, 0, 1));
  const off = 1 - align;                                        // 1 = stuck, 0 = in line, < 0 = overshoot
  const freed = crackT >= 0 ? clamp(crackT/SNAP, 0, 1) : 0;
  const throb = 0.5 + 0.5*Math.sin(now*0.012);

  ALL.forEach(m => { m.uniforms.uOpacity.value = amount; });
  vert.forEach((v, i) => {
    const hit = i === stuck || i === stuck + 1;
    v.m.material = hit ? hitMat : boneMat;
    const o = i === stuck ? off : 0;
    v.g.position.x = 0.011*o*side;
    v.g.rotation.z = 0.34*o*side;
    v.g.rotation.y = 0.12*o*side;
  });
  hitMat.uniforms.uColor.value.copy(COL.coral).lerp(COL.mint, freed);
  hitMat.uniforms.uBase.value = 0.2 + (crackT < 0 ? 0.25*throb + 0.4*hurt : 0);

  // squashed, bulging disc under the stuck vertebra; springs back on the crack
  discs.forEach((d, i) => {
    if(!d) return;
    const hit = i === n - 1;                                      // between C_n and C_n+1 = discs[n-1]
    d.material = hit ? discHitMat : discMat;
    const b = d.userData.base, q = hit ? Math.max(-0.3, off) : 0;
    d.scale.set(b.x*(1 + 0.32*q), b.y*(1 + 0.1*q), b.z*(1 - 0.55*q));
    d.position.x = hit ? 0.005*q*side : 0;
  });
  discHitMat.uniforms.uColor.value.copy(COL.coral).lerp(COL.mint, freed);

  // pinched nerve root on the stuck side
  roots.forEach((pair, i) => pair.forEach(r => { r.material = rootMat; }));
  const pinched = roots[n - 1] && roots[n - 1][side > 0 ? 1 : 0];
  if(pinched){
    pinched.material = rootHitMat;
    rootHitMat.uniforms.uColor.value.copy(COL.coral).lerp(COL.mint, freed);
    rootHitMat.uniforms.uBase.value = crackT < 0 ? 0.45 + 0.6*throb + hurt : 0.4 + 0.8*Math.max(0, 1 - crackT*1.4);
  }

  // cord: kinked and hot at the level before, a mint pulse running both ways after
  const level = zOf(stuck) + STEP/2;
  const cu = cordMat.uniforms;
  cu.uLevel.value = level - cord.position.z;              // cord geometry is centred on its own origin
  cu.uOff.value = 0.006*off*side;
  cu.uPinch.value = Math.max(0, off);
  cu.uHotAmt.value = Math.max(0, off)*(0.55 + 0.45*throb) + hurt*0.5;
  cu.uPulseR.value = crackT < 0 ? 0 : crackT*0.42;
  cu.uPulseAmt.value = crackT < 0 ? 0 : Math.max(0, 1 - crackT*1.1);
  cu.uColor.value.copy(COL.bone).lerp(COL.mint, crackT < 0 ? 0 : clamp(crackT*2.5, 0, 0.6));

  // flash + bubbles at the facet joint
  const jx = side*13*MM, jz = level;
  if(crackT >= 0 && !popped){
    popped = true;
    bubbles.forEach(b => {
      b.p.set(jx, -2*MM, jz);
      b.v.set(side*(0.4 + Math.random()), (Math.random() - 0.5)*1.2, (Math.random() - 0.5)*1.2).normalize().multiplyScalar(0.05 + Math.random()*0.06);
    });
  }
  if(crackT >= 0){
    const ft = crackT - SNAP*0.6;
    const fl = ft < 0 ? 0 : Math.max(0, 1 - ft/0.45);
    flash.position.set(jx*0.6, 4*MM, jz);
    flash.material.opacity = fl*amount;
    flash.scale.setScalar(0.03 + 0.1*(1 - fl));
    bubbles.forEach(b => {
      const t = Math.max(0, ft);
      b.s.position.copy(b.p).addScaledVector(b.v, Math.min(t, 0.8));
      b.s.material.opacity = ft < 0 ? 0 : Math.max(0, 1 - t/0.7)*amount;
      b.s.scale.setScalar(0.006 + 0.01*Math.min(1, t*3));
    });
  }else{
    flash.material.opacity = 0;
    bubbles.forEach(b => { b.s.material.opacity = 0; });
  }
}
export const XRAY_LEVEL = zOf;

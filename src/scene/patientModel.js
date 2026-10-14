import * as THREE from "three";
import { scene } from "./renderer.js";
import { mats, M, mesh, cap, box, cyl, sph } from "./materials.js";

/* Patient body, neck pivot + head (face, hair variants, glasses, therapist hands), x-ray spine, glow ring, wave, sparks. */
/* ---- patient body ---- */
const torso = mesh(cap(0.2,0.75), mats.gown, null, [0,1.02,0.95], [Math.PI/2,0,0], [1.5,1,0.7]);
const collar = mesh(new THREE.TorusGeometry(0.075,0.016,8,24,Math.PI), mats.gown, null, [0,1.05,0.37], [Math.PI*0.6,0,0]);
[-1,1].forEach(s=>{
  mesh(sph(0.1), mats.gown, null, [0.25*s,1.0,0.42]);
  mesh(cap(0.058,0.22), mats.gown, null, [0.35*s,0.97,0.62], [Math.PI/2,0,0]);
  mesh(cap(0.048,0.3), mats.skin, null, [0.37*s,0.94,0.95], [Math.PI/2,0,0]);
  mesh(sph(0.045), mats.skin, null, [0.37*s,0.93,1.17], null, [1,0.6,1.3]);
  mesh(cap(0.078,0.78), mats.pants, null, [0.11*s,0.96,1.82], [Math.PI/2,0,0]);
  mesh(cap(0.05,0.08), mats.sock, null, [0.12*s,1.04,2.27], [0.3,0,0]);
});

/* ---- neck pivot + head ---- */
const pivot = new THREE.Group();
pivot.position.set(0, 1.0, 0.3);
pivot.rotation.order = "YZX";
scene.add(pivot);
const neckMesh = mesh(cyl(0.056,0.066,0.24,20), mats.neck, pivot, [0,0,-0.08], [Math.PI/2,0,0]);

const head = new THREE.Group();
head.position.set(0, 0.04, -0.2);
pivot.add(head);
mesh(sph(0.12,32,24), mats.headSkin, head, [0,0,0], null, [0.95,0.92,1.12]);
mesh(sph(0.075,24,16), mats.headSkin, head, [0,0.03,0.07], null, [1.15,0.9,0.9]);          // jaw
mesh(sph(0.03,14,10), mats.headSkin, head, [0,0.075,0.115], null, [1.2,0.8,0.9]);          // chin
// hair variants
const hairShort = mesh(new THREE.SphereGeometry(0.126,32,20,0,Math.PI*2,Math.PI*0.36,Math.PI*0.64), mats.hair, head, [0,-0.004,-0.006], [0.5,0,0], [0.97,0.95,1.14]);
const hairBald = mesh(new THREE.SphereGeometry(0.124,32,12,0,Math.PI*2,Math.PI*0.56,Math.PI*0.44), mats.hair, head, [0,-0.004,0.0], [-0.45,0,0], [0.98,0.95,1.12]);
const hairLong = mesh(sph(0.13,24,12), mats.hair, head, [0,-0.09,-0.07], null, [1.65,0.16,1.5]);
const hairSpikes = new THREE.Group(); head.add(hairSpikes);
[[0,0.04,-1],[0.45,0.1,-0.9],[-0.45,0.1,-0.9],[0.25,0.45,-0.85],[-0.25,0.45,-0.85],[0,0.6,-0.8]].forEach(([x,y,z]) => {
  const d = new THREE.Vector3(x,y,z).normalize();
  const m = mesh(new THREE.ConeGeometry(0.018,0.045,8), mats.hair, hairSpikes, [d.x*0.125, d.y*0.12, d.z*0.14]);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), d);
});
// face
const lids = [], eyesOpen = [], brows = [];
[-1,1].forEach(s=>{
  mesh(sph(0.03,14,10), mats.headSkin, head, [0.113*s,0,0.005], null, [0.45,1,1.3]);  // ear
  lids.push(mesh(cap(0.0065,0.026), mats.feature, head, [0.04*s,0.106,-0.025], [0,0,Math.PI/2]));
  const eg = new THREE.Group(); eg.position.set(0.04*s,0.103,-0.025); head.add(eg);
  mesh(sph(0.012,12,8), mats.white, eg, [0,0,0], null, [1.2,0.6,0.85], true);
  mesh(sph(0.006,10,8), mats.feature, eg, [0,0.007,0], null, null, true);
  eyesOpen.push(eg);
  brows.push(mesh(cap(0.004,0.026), mats.brow, head, [0.042*s,0.098,-0.052], [0,0,Math.PI/2], null, true));
});
mesh(new THREE.ConeGeometry(0.018,0.045,12), mats.headSkin, head, [0,0.125,0.015]);
const mouthFlat = mesh(cap(0.006,0.03), mats.lip, head, [0,0.097,0.066], [0,0,Math.PI/2], null, true);
const mouthSmile = mesh(new THREE.TorusGeometry(0.019,0.0045,6,16,Math.PI), mats.lip, head, [0,0.098,0.058], [Math.PI/2,0,0], null, true);
const mouthO = mesh(new THREE.TorusGeometry(0.011,0.0045,6,14), mats.lip, head, [0,0.098,0.068], [Math.PI/2,0,0], null, true);
// glasses
const glasses = new THREE.Group(); head.add(glasses);
[-1,1].forEach(s=>{
  mesh(new THREE.TorusGeometry(0.021,0.0028,6,20), mats.frames, glasses, [0.042*s,0.121,-0.022], [Math.PI/2,0,0], null, true);
  mesh(box(0.003,0.1,0.003), mats.frames, glasses, [0.09*s,0.075,-0.012], [0,0,0.55*s], null, true);
});
mesh(box(0.02,0.003,0.003), mats.frames, glasses, [0,0.124,-0.02], null, null, true);

// therapist hands (palm + thumb along the jaw) and coat sleeves
const hands = [-1,1].map(s => {
  const h = mesh(cap(0.042,0.12), mats.doc, head, [0.135*s,-0.015,-0.025], [Math.PI/2,0,0.25*s], [1,1,0.75]);
  mesh(cap(0.014,0.05), mats.doc, head, [0.112*s,0.03,0.03], [Math.PI/2,0,-0.5*s]);
  [-0.03,0,0.03].forEach(dz => mesh(cap(0.012,0.04), mats.doc, head, [0.1*s,-0.07,0.0+dz], [0,0,0.9*s]));
  return h;
});
const forearms = [-1,1].map(s => {
  const m = mesh(cap(0.05,0.42), mats.coat, null);
  const cuff = mesh(cyl(0.052,0.052,0.03,16), mats.cuff, null, null, null, null, true);
  return {m, cuff, elbow: new THREE.Vector3(0.44*s, 1.2, -0.58)};
});
const UP = new THREE.Vector3(0,1,0), tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpC = new THREE.Vector3();

/* ---- cervical spine (x-ray) ---- */
const boneMat = M(0xf3ead6, 0.5, {transparent:true, opacity:0, emissive:new THREE.Color(0x9ad8ff), emissiveIntensity:0.25, depthWrite:false});
const hitMat  = M(0xff7a59, 0.4, {transparent:true, opacity:0, emissive:new THREE.Color(0xff7a59), emissiveIntensity:0.6, depthWrite:false});
const discMat = M(0x8fd0ff, 0.5, {transparent:true, opacity:0, depthWrite:false});
const vert = [];
for(let i=0;i<7;i++){
  const g = new THREE.Group();
  g.position.set(0, -0.014, -0.118 + i*0.0335);
  pivot.add(g);
  const parts = [
    mesh(cyl(0.021,0.022,0.018,14), boneMat, g, [0,0,0], [Math.PI/2,0,0], null, true),
    mesh(box(0.008,0.026,0.012), boneMat, g, [0,-0.028,0.004], null, null, true),
    mesh(box(0.062,0.008,0.01), boneMat, g, [0,-0.006,0], null, null, true)
  ];
  if(i<6) mesh(cyl(0.019,0.019,0.012,14), discMat, g, [0,0,0.0168], [Math.PI/2,0,0], null, true);
  g.visible = false;
  vert.push({g, parts});
}
const xrayMats = [mats.neck, mats.headSkin, mats.hair, mats.lip, mats.feature, mats.brow, mats.white, mats.frames];

// glow ring + release wave + sparks
const ringMat = new THREE.MeshBasicMaterial({color:0xff7a59, transparent:true, opacity:0, depthWrite:false});
const ring = new THREE.Mesh(new THREE.TorusGeometry(0.082,0.008,8,40), ringMat);
ring.position.set(0,0,-0.04); pivot.add(ring);
const waveMat = new THREE.MeshBasicMaterial({color:0x8adfbf, transparent:true, opacity:0, depthWrite:false});
const waveRing = new THREE.Mesh(new THREE.TorusGeometry(0.07,0.006,8,48), waveMat);
pivot.add(waveRing);
const sparks = Array.from({length:14}, () => {
  const m = new THREE.Mesh(sph(0.006,6,4), new THREE.MeshBasicMaterial({color:0xfff1d6, transparent:true, opacity:0, depthWrite:false}));
  scene.add(m); return {m, v:new THREE.Vector3(), life:0};
});

export {
  torso, collar, pivot, head, hairShort, hairBald, hairLong, hairSpikes,
  lids, eyesOpen, brows, mouthFlat, mouthSmile, mouthO, glasses, hands, forearms,
  UP, tmpA, tmpB, tmpC, boneMat, hitMat, discMat, vert, xrayMats, ringMat, waveMat, waveRing, sparks
};

/* Neck-rig lab (case build only, `?necklab=base|chain`, user 2026-10-26: patient08's two-bone neck vs a multi-joint one,
   same game screen, camera and poses). Puts patient08 (마동철's MPFB build, the one 근육왕/메가회장 borrow) on the table in a
   real 목꺾기 run, then window.__neckLab holds poses, plays the game's own motions and measures the skin on the CPU
   (the same skinning sum three runs, plus the neck shaders' pinch / lag). scripts/necklab/shoot.py drives it.
   Judging, input, camera and hands are not touched: a held pose only sets the pivot the way loop.js does. */
import * as THREE from "three";
import { S } from "../game/state.js";
import { ROSTER } from "../patient/roster.js";
import { applyLook } from "../scene/look.js";
import { labCurrent, chainOpts } from "../scene/realAssets.js";
import { pivot, head } from "../scene/patientModel.js";
import { scene, renderer, camera } from "../scene/renderer.js";
import { NECK_LEN, stretchProfile, stretchLen } from "../core/towel.js";
import { crackProfile, CRACK_LEN } from "../core/crack.js";

const Q = new URLSearchParams(location.search);
const RIG = Q.get("necklab");
if(Q.get("weights") === "hat") chainOpts.weights = "hat";
if(Q.get("follow") === "0") Object.keys(chainOpts.follow).forEach(k => chainOpts.follow[k] = 0);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const frames = n => new Promise(r => { const go = k => k ? requestAnimationFrame(() => go(k - 1)) : r(); go(n); });
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a)/(b - a))); return t*t*(3 - 2*t); };

/* ---- the table: 마동철's look without his image-based clinic model -> patient08 ---- */
const base = ROSTER.find(p => p.name === "마동철");
const look08 = {...base, look: {...base.look, clinicModel: undefined}};
async function ready(){
  const t0 = performance.now();
  while(!(S.phase === "play" && !S.busy && S.target)){
    if(performance.now() - t0 > 90000) throw new Error("run did not start");
    if(S.phase !== "play" && document.documentElement.dataset.head) document.getElementById(Q.get("mode") === "towel" ? "startTowel" : "start").click();
    await sleep(200);
  }
  S.saidIdle = S.saidNear = true;                           // no idle / near lines over the shots
  document.getElementById("caseCover")?.remove();           // the case runner's "no case" card (no ?case here)
  applyLook(look08);
  const t1 = performance.now();
  // necklab=stage: the model the game itself shows (towel-stage copy; in 목뽑기 with its finer neck, towelNeck.js)
  while(!(labCurrent() && labCurrent().id === "patient08" && labCurrent().body.visible && (RIG !== "stage" || labCurrent().towelStage))){
    if(performance.now() - t1 > 60000) throw new Error("patient08 did not load");
    await sleep(100);
  }
  // the rest pose every number is measured against: head straight, no pull, no breath
  S.neckLab = {hold: true, rot: 0, bend: 0, stretch: 0, cam: null};
  await frames(10);
  scene.updateMatrixWorld(true);
  headZ0 = head.position.z;
  regions();
  if(Q.has("skin")) await restoredMask();

}
let headZ0 = 0;

/* ---- CPU skinning (three r149: sum w_i boneMatrix_i * bindMatrix * v, then the neck shaders' pinch and lag) ---- */
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _m = new THREE.Matrix4();
function ringCenter(geo){
  const P = geo.attributes.position; let top = -Infinity, cx = 0, cz = 0, k = 0;
  for(let i = 0; i < P.count; i++) top = Math.max(top, P.getY(i));
  for(let i = 0; i < P.count; i++) if(P.getY(i) > top - 0.004){ cx += P.getX(i); cz += P.getZ(i); k++; }
  cx /= k; cz /= k; let R0 = 0;
  for(let i = 0; i < P.count; i++) if(P.getY(i) > top - 0.004) R0 += Math.hypot(P.getX(i) - cx, P.getZ(i) - cz)/k;
  return {top, cx, cz, R0};
}
function skinBody(o, pinchOn, out){
  const g = o.geometry, P = g.attributes.position, SI = g.attributes.skinIndex.array, SW = g.attributes.skinWeight;
  const full = SW.normalized ? (SW.array instanceof Uint16Array ? 65535 : 255) : 1, aP = g.attributes.aPinch;
  const C = o.userData.labRing || (o.userData.labRing = ringCenter(g)), pinch = pinchOn ? (labCurrent().neckPinch?.value || 0) : 0;
  const bm = o.skeleton.bones.map((b, i) => new THREE.Matrix4().multiplyMatrices(b.matrixWorld, o.skeleton.boneInverses[i]).multiply(o.bindMatrix));
  for(let i = 0; i < P.count; i++){
    _v.fromBufferAttribute(P, i);
    if(pinch && aP){ const s = 1 - pinch*smoothstep(0, 0.4, aP.getX(i)); _v.x = C.cx + (_v.x - C.cx)*s; _v.z = C.cz + (_v.z - C.cz)*s; }
    let x = 0, y = 0, z = 0;
    for(let k = 0; k < 4; k++){
      const w = SW.array[i*4 + k]/full; if(!w) continue;
      _w.copy(_v).applyMatrix4(bm[SI[i*4 + k]]); x += w*_w.x; y += w*_w.y; z += w*_w.z;
    }
    out[i*3] = x; out[i*3 + 1] = y; out[i*3 + 2] = z;
  }
  return out;
}
function skinHead(cur, pinchOn, out){
  const o = cur.skinMesh, g = o.geometry, P = g.attributes.position, aN = g.attributes.aNeck, c = cur.towelNeckFrame?.center;
  const pinch = pinchOn ? (cur.neckPinch?.value || 0) : 0, lag = pinchOn ? (cur.neckLag?.value || 0) : 0;
  o.updateWorldMatrix(true, false);
  for(let i = 0; i < P.count; i++){
    _v.fromBufferAttribute(P, i);
    if(aN && c){ const a = aN.getX(i), s = 1 - pinch*smoothstep(0, 0.4, a); _v.x = c.x + (_v.x - c.x)*s; _v.z = c.z + (_v.z - c.z)*s; _v.y -= lag*a; }
    _v.applyMatrix4(o.matrixWorld); _v.toArray(out, i*3);
  }
  return out;
}
const at = (a, i) => _v.set(a[i*3], a[i*3 + 1], a[i*3 + 2]);
const dist = (a, i, b, j) => Math.hypot(a[i*3] - b[j*3], a[i*3 + 1] - b[j*3 + 1], a[i*3 + 2] - b[j*3 + 2]);
const stats = xs => { const s = [...xs].sort((a, b) => a - b), n = s.length; return n ? {mean: s.reduce((a, x) => a + x, 0)/n, p95: s[Math.min(n - 1, Math.floor(0.95*n))], max: s[n - 1]} : {mean: 0, p95: 0, max: 0}; };
function hull2(pts){            // area of the 2D convex hull (monotone chain)
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0])*(b[1] - o[1]) - (a[1] - o[1])*(b[0] - o[0]), lo = [], up = [];
  for(const p of pts){ while(lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for(let i = pts.length - 1; i >= 0; i--){ const p = pts[i]; while(up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  const h = lo.slice(0, -1).concat(up.slice(0, -1)); let A = 0;
  for(let i = 0; i < h.length; i++){ const a = h[i], b = h[(i + 1)%h.length]; A += a[0]*b[1] - b[0]*a[1]; }
  return Math.abs(A)/2;
}

/* ---- regions, picked once at rest ---- */
const BANDS = 6;
let R = null;
function regions(){
  const cur = labCurrent(), o = cur.neckSkin, g = o.geometry, P = g.attributes.position, ws = o.userData.neckW;
  const C = ringCenter(g), len = NECK_LEN*C.R0, n = P.count;
  const restB = skinBody(o, false, new Float32Array(n*3)), restH = skinHead(cur, false, new Float32Array(cur.skinMesh.geometry.attributes.position.count*3));
  // seam: the body's top ring and, for each, the nearest head vertex at rest
  const ring = [], pair = [];
  for(let i = 0; i < n; i++) if(P.getY(i) > C.top - 0.004) ring.push(i);
  const hn = restH.length/3;
  for(const i of ring){ let best = -1, bd = Infinity; for(let j = 0; j < hn; j++){ const d = dist(restB, i, restH, j); if(d < bd){ bd = d; best = j; } } pair.push([i, best, bd]); }
  // column bands by height under the seam (geometry +y = toward the head), inside 1.2 R0 of the axis
  const bands = Array.from({length: BANDS}, () => []);
  for(let i = 0; i < n; i++){
    const r = Math.hypot(P.getX(i) - C.cx, P.getZ(i) - C.cz), t = (C.top - P.getY(i))/len;
    if(r < 1.5*C.R0 && t >= 0 && t < 1) bands[Math.min(BANDS - 1, Math.floor(t*BANDS))].push(i);
  }
  // a marker per band (largest x at rest) for the twist profile
  const marks = bands.map(b => b.reduce((m, i) => P.getX(i) > P.getX(m) ? i : m, b[0]));
  // shoulders: the outermost skin vertex each side between 12 and 25 cm under the seam
  const sh = [1, -1].map(s => { let m = -1; for(let i = 0; i < n; i++){ const t = C.top - P.getY(i); if(t > 0.12 && t < 0.25 && (m < 0 || s*P.getX(i) > s*P.getX(m))) m = i; } return m; });
  // triangles of the neck, shoulders and upper arms: any vertex in the column or within 30 cm of the seam centre
  const idx = g.index.array, tris = [], base = new THREE.Vector3(C.cx, C.top, C.cz);
  for(let f = 0; f < idx.length; f += 3){
    const a = idx[f], b = idx[f + 1], c = idx[f + 2];
    if(ws[a] > 0.001 || ws[b] > 0.001 || ws[c] > 0.001 || [a, b, c].some(i => _w.fromBufferAttribute(P, i).distanceTo(base) < 0.3)) tris.push(f);
  }
  // hands on the belly: skin fully on the body bone 38 cm or more from the seam centre, each paired with the nearest
  // skin under it that is not (the belly); the gap between them must not close
  const SI = g.attributes.skinIndex.array, SWa = g.attributes.skinWeight, fullW = SWa.normalized ? (SWa.array instanceof Uint16Array ? 65535 : 255) : 1;
  const bodyBone = o.skeleton.bones.findIndex(b => b.name === "body");
  const onBody = i => { let w = 0; for(let k = 0; k < 4; k++) if(SI[i*4 + k] === bodyBone) w += SWa.array[i*4 + k]/fullW; return w > 0.99; };
  const handV = []; for(let i = 0; i < n; i++) if(onBody(i) && _w.fromBufferAttribute(P, i).distanceTo(base) > 0.38) handV.push(i);
  const handSet = new Set(handV), far = [];
  for(const i of handV){
    let best = -1, bd = 0.03;
    for(let j = 0; j < n; j++){ if(handSet.has(j)) continue; const d = dist(restB, i, restB, j); if(d < bd){ bd = d; best = j; } }
    if(best >= 0) far.push([i, best, bd]);
  }
  // shirt collar: shirt vertices within 12 cm under the seam, the 40 nearest the axis; skin beside them
  const shirt = cur.bodyMeshes.find(m => m !== o && /shirt/.test(m.name));
  const SP = shirt.geometry.attributes.position, coll = [];
  for(let i = 0; i < SP.count; i++){ const t = C.top - SP.getY(i); if(t > 0 && t < 0.12) coll.push([Math.hypot(SP.getX(i) - C.cx, SP.getZ(i) - C.cz), i]); }
  coll.sort((a, b) => a[0] - b[0]); const collar = coll.slice(0, 40).map(x => x[1]);
  const restS = skinBody(shirt, false, new Float32Array(SP.count*3));
  const skinNear = collar.map(j => { let best = 0, bd = Infinity; for(let i = 0; i < n; i++){ const d = dist(restS, j, restB, i); if(d < bd){ bd = d; best = i; } } return best; });
  // shirt-skin contact pairs in the collar / shoulder area (skin within 1.5 cm of a shirt vertex at rest)
  const contact = [];
  for(let j = 0; j < SP.count; j++){
    if(C.top - SP.getY(j) > 0.3) continue;
    let best = -1, bd = 0.015; for(let i = 0; i < n; i++){ const d = dist(restS, j, restB, i); if(d < bd){ bd = d; best = i; } }
    if(best >= 0) contact.push([j, best]);
  }
  R = {C, len, ring, pair, bands, marks, sh, tris, far, shirt, collar, skinNear, contact, restB, restH, restS};
  return R;
}
function bandShape(pos, bands, marks, restDirs){
  const cs = bands.map(b => { const c = new THREE.Vector3(); b.forEach(i => c.add(at(pos, i))); return c.multiplyScalar(1/b.length); });
  return bands.map((b, k) => {
    const ax = new THREE.Vector3().subVectors(cs[Math.min(k + 1, BANDS - 1)], cs[Math.max(k - 1, 0)]).normalize();
    const u = new THREE.Vector3(1, 0, 0).projectOnPlane(ax).normalize(), v = new THREE.Vector3().crossVectors(ax, u);
    const pts = b.map(i => { const d = at(pos, i).clone().sub(cs[k]); return [d.dot(u), d.dot(v)]; });
    const rad = pts.reduce((a, p) => a + Math.hypot(p[0], p[1]), 0)/pts.length;
    const md = at(pos, marks[k]).clone().sub(cs[k]).projectOnPlane(ax).normalize();
    return {c: cs[k], ax, rad, area: hull2(pts), mark: md};
  });
}
function measure(extra = false){
  const cur = labCurrent(), o = cur.neckSkin, r = R || regions();
  scene.updateMatrixWorld(true);
  const n = o.geometry.attributes.position.count;
  const B = skinBody(o, true, new Float32Array(n*3)), Bn = skinBody(o, false, new Float32Array(n*3));
  const H = skinHead(cur, true, new Float32Array(r.restH.length));
  // seam gaps (mm), with the shaders' pinch and lag as drawn
  const seam = stats(r.pair.map(([i, j, d0]) => Math.max(0, 1000*(dist(B, i, H, j) - d0))));
  // column shape, rig only (no pinch) and as drawn
  const rest = bandShape(r.restB, r.bands, r.marks), def = bandShape(Bn, r.bands, r.marks), drawn = bandShape(B, r.bands, r.marks);
  const bands = rest.map((s, k) => {
    const d = def[k], lenR = k < BANDS - 1 ? d.c.distanceTo(def[k + 1].c)/s.c.distanceTo(rest[k + 1].c) : null;
    // twist: median turn of the band's vertices about the band axis, against rest (signed by the axis)
    const al = new THREE.Quaternion().setFromUnitVectors(s.ax, d.ax), angs = [];
    for(const i of r.bands[k]){
      const a0 = at(r.restB, i).clone().sub(s.c).projectOnPlane(s.ax).applyQuaternion(al), a1 = at(Bn, i).clone().sub(d.c).projectOnPlane(d.ax);
      if(a0.lengthSq() < 1e-8 || a1.lengthSq() < 1e-8) continue;
      angs.push(Math.atan2(new THREE.Vector3().crossVectors(a0, a1).dot(d.ax), a0.dot(a1))*180/Math.PI);
    }
    angs.sort((x, y) => x - y);
    const ang = angs.length ? angs[angs.length >> 1] : 0;
    return {radius: d.rad/s.rad, area: d.area/s.area, areaDrawn: drawn[k].area/s.area, length: lenR, twist: ang};
  });
  const tw = bands.map(b => b.twist), d2 = tw.slice(1, -1).map((t, k) => Math.abs(tw[k] - 2*t + tw[k + 2]));
  // triangles: edge ratio and normals turned over (> 90 degrees from rest)
  const idx = o.geometry.index.array; let emin = Infinity, emax = 0, flip = 0;
  const fn = (p, a, b, c) => new THREE.Vector3().subVectors(at(p, b).clone(), at(p, a).clone()).cross(new THREE.Vector3().subVectors(at(p, c).clone(), at(p, a).clone()));
  for(const f of r.tris){
    const a = idx[f], b = idx[f + 1], c = idx[f + 2];
    for(const [x, y] of [[a, b], [b, c], [c, a]]){ const l0 = dist(r.restB, x, r.restB, y); if(l0 < 1e-5) continue; const q = dist(B, x, B, y)/l0; emin = Math.min(emin, q); emax = Math.max(emax, q); }
    if(fn(B, a, b, c).dot(fn(r.restB, a, b, c)) < 0) flip++;
  }
  // shoulders (cm, the body frame's own slide taken out), hands vs belly (mm), collar vs skin
  const slide = cur.body.position.z - cur.body.userData.z0;
  const shoulder = r.sh.map(i => 100*Math.hypot(B[i*3] - r.restB[i*3], B[i*3 + 1] - r.restB[i*3 + 1], B[i*3 + 2] - r.restB[i*3 + 2] - slide));
  let far = 0; for(const [i, j, d0] of r.far) far = Math.max(far, 1000*Math.abs(dist(B, i, B, j) - d0));
  const S2 = skinBody(r.shirt, false, new Float32Array(r.restS.length));
  const collar = r.collar.map((j, k) => {
    const i = r.skinNear[k], ds = new THREE.Vector3(S2[j*3] - r.restS[j*3], S2[j*3 + 1] - r.restS[j*3 + 1], S2[j*3 + 2] - r.restS[j*3 + 2]);
    const dk = new THREE.Vector3(Bn[i*3] - r.restB[i*3], Bn[i*3 + 1] - r.restB[i*3 + 1], Bn[i*3 + 2] - r.restB[i*3 + 2]);
    return {shirt: 100*ds.length(), skin: 100*dk.length(), apart: 100*ds.distanceTo(dk)};
  });
  // poke-through: the skin crosses its shirt vertex's rest offset by more than 2 mm (the offset moved like the skin)
  let poke = 0; const pokeAt = [];
  for(const [j, i] of r.contact){
    const r0 = new THREE.Vector3(r.restS[j*3] - r.restB[i*3], r.restS[j*3 + 1] - r.restB[i*3 + 1], r.restS[j*3 + 2] - r.restB[i*3 + 2]);
    const r1 = new THREE.Vector3(S2[j*3] - Bn[i*3], S2[j*3 + 1] - Bn[i*3 + 1], S2[j*3 + 2] - Bn[i*3 + 2]);
    const l = r0.length(); if(l < 1e-4) continue;
    if(r1.dot(r0)/l < -0.002){ poke++; pokeAt.push(i); }
  }
  const cs = stats(collar.map(c => c.apart));
  // where the poke-through happens: column weight u, radius from the column axis (x R0), depth under the seam (cm)
  const P0 = o.geometry.attributes.position, ws = o.userData.neckW, C = r.C;
  const pokeWhere = [...new Set(pokeAt)].map(i => ({u: +(ws[i] ?? 0).toFixed(2), r: +(Math.hypot(P0.getX(i) - C.cx, P0.getZ(i) - C.cz)/C.R0).toFixed(2), depth: +(100*(C.top - P0.getY(i))).toFixed(1)}));
  return {
    rig: RIG, pose: S.neckLab ? {rot: S.neckLab.rot, bend: S.neckLab.bend, stretch: S.neckLab.stretch, twist: chainOpts.twist} : null,
    pivot: {rot: pivot.rotation.z*180/Math.PI, bend: pivot.rotation.y*180/Math.PI}, pinch: cur.neckPinch?.value || 0,
    seam, bands, twistD2: Math.max(0, ...d2), minRadius: Math.min(...bands.map(b => b.radius)), minArea: Math.min(...bands.map(b => b.area)),
    minAreaDrawn: Math.min(...bands.map(b => b.areaDrawn)), edge: {min: emin, max: emax}, flipped: flip, tris: r.tris.length,
    shoulder: {left: shoulder[0], right: shoulder[1]}, handBellyMm: far, handPairs: r.far.length, collarApartCm: cs, poke, pokeWhere, contacts: r.contact.length,
    bindErr: cur.chain ? cur.chain.bindErr : null,
    // the skin / collar round: holes on screen (with masks) and shirt vs skin
    ...(extra ? {holes: holes(B), pen: penetration(B, S2), collarBone: cur.collar ? {rim: cur.collar.rim, weighted: cur.collar.weighted} : null} : {})
  };
}

/* ---- the skin the shirt hid (&skin=1 / full, 2026-10-27): what of it shows, holes on screen, shirt vs skin ----
   Restored = a skin vertex the shipped body.glb does not have (matched by rest position, 0.2 mm). */
let ORIG = null;
async function loadGlb(url){
  const [{GLTFLoader}, {MeshoptDecoder}] = await Promise.all([import("three/examples/jsm/loaders/GLTFLoader.js"), import("three/examples/jsm/libs/meshopt_decoder.module.js")]);
  return new Promise((res, rej) => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(url, res, undefined, rej));
}
const sceneSpace = (P, M) => { const out = new Float32Array(P.count*3), v = new THREE.Vector3(); for(let i = 0; i < P.count; i++) v.fromBufferAttribute(P, i).applyMatrix4(M).toArray(out, 3*i); return out; };
// a skinned mesh's rest position in its glTF scene (the quantization lives in the inverse binds, not the node)
const restOf = o => new THREE.Matrix4().multiplyMatrices(o.skeleton.bones[0].matrixWorld, o.skeleton.boneInverses[0]).multiply(o.bindMatrix);
const isSkin = o => o.isMesh && /\.skin$/.test(o.material.name || "") || /body_skin/.test(o.name);
async function restoredMask(){
  const o = labCurrent().neckSkin;
  if(o.userData.labRestored) return o.userData.labRestored;
  // in the export's own space (glTF scene): each file is quantized to its own box, so raw geometry does not compare
  if(!ORIG){
    const g = await loadGlb(import.meta.env.BASE_URL + "models/patient08/body.glb");
    g.scene.updateMatrixWorld(true);
    g.scene.traverse(m => { if(!ORIG && m.isMesh && isSkin(m)) ORIG = sceneSpace(m.geometry.attributes.position, restOf(m)); });
  }
  // called at rest (ready): the skin's rest pose back in its glTF scene's space
  const cur = labCurrent(), gs = cur.body.children[0].children[0];
  scene.updateMatrixWorld(true);
  const rel = new THREE.Matrix4().copy(gs.matrixWorld).invert().multiply(restOf(o));
  const Q = sceneSpace(o.geometry.attributes.position, rel), n = Q.length/3, mask = new Uint8Array(n);
  const cell = 0.0005, key = (x, y, z) => Math.round(x/cell) + "," + Math.round(y/cell) + "," + Math.round(z/cell), H = new Map();
  for(let i = 0; i < ORIG.length/3; i++) H.set(key(ORIG[3*i], ORIG[3*i + 1], ORIG[3*i + 2]), i);
  for(let i = 0; i < n; i++){
    const x = Q[3*i], y = Q[3*i + 1], z = Q[3*i + 2]; let hit = false;
    for(let a = -1; a <= 1 && !hit; a++) for(let b = -1; b <= 1 && !hit; b++) for(let c = -1; c <= 1 && !hit; c++){
      const j = H.get(key(x + a*cell, y + b*cell, z + c*cell));
      if(j !== undefined && Math.hypot(ORIG[3*j] - x, ORIG[3*j + 1] - y, ORIG[3*j + 2] - z) < 0.0002) hit = true;
    }
    mask[i] = hit ? 0 : 1;
  }
  return o.userData.labRestored = mask;
}
// welded neighbours of the skin (UV seams split vertices)
function welded(g){
  const P = g.attributes.position, n = P.count, key = new Map(), weld = new Int32Array(n);
  for(let i = 0; i < n; i++){ const k = Math.round(P.getX(i)*1e4) + "," + Math.round(P.getY(i)*1e4) + "," + Math.round(P.getZ(i)*1e4); if(!key.has(k)) key.set(k, i); weld[i] = key.get(k); }
  return weld;
}
/* A copy of the skin drawn for a pass: same skeleton, bind and neck shaders (pinch), one value per triangle corner aF
   (non-indexed, so a face has one value); the fragment writes `frag` (vF in scope) with alpha 0, no blending: in a
   render target the rest of the scene writes alpha 1, so alpha 0 marks this pass's pixels. */
function passMesh(o, aF, frag, side = THREE.FrontSide){
  const g = o.geometry.toNonIndexed();
  g.setAttribute("aF", new THREE.BufferAttribute(aF, 1));
  const m = new THREE.MeshBasicMaterial({side, toneMapped: false}), src = o.material.onBeforeCompile;
  m.blending = THREE.NoBlending;
  m.onBeforeCompile = (sh, r) => {
    if(src) src(sh, r);
    sh.vertexShader = "attribute float aF;\nvarying float vF;\n" + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n  vF = aF;");
    sh.fragmentShader = "varying float vF;\n" + sh.fragmentShader.replace("#include <dithering_fragment>", "#include <dithering_fragment>\n  " + frag);
  };
  m.customProgramCacheKey = () => "lab:" + frag;
  const s = new THREE.SkinnedMesh(g, m);
  s.bind(o.skeleton, o.bindMatrix);
  s.position.copy(o.position); s.quaternion.copy(o.quaternion); s.scale.copy(o.scale);
  s.morphTargetInfluences = o.morphTargetInfluences; s.morphTargetDictionary = o.morphTargetDictionary;
  s.frustumCulled = false; s.visible = false;
  o.parent.add(s);
  return s;
}
let RT = null;
function readPass(show, hide){
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  if(!RT || RT.width !== size.x || RT.height !== size.y){ RT?.dispose(); RT = new THREE.WebGLRenderTarget(size.x, size.y); }
  show.forEach(x => x.visible = true); hide.forEach(x => x.visible = false);
  scene.updateMatrixWorld(true);
  renderer.setRenderTarget(RT); renderer.setClearColor(0x000000, 1); renderer.clear(); renderer.render(scene, camera);
  const px = new Uint8Array(size.x*size.y*4);
  renderer.readRenderTargetPixels(RT, 0, 0, size.x, size.y, px);
  renderer.setRenderTarget(null);
  show.forEach(x => x.visible = false); hide.forEach(x => x.visible = true);
  return {px, w: size.x, h: size.y};
}
// the restored faces as ids (face + 1); original faces draw id 0 (they still hide what is behind them)
let ID = null;
async function idPass(){
  const o = labCurrent().neckSkin, mask = await restoredMask();
  if(!ID){
    const idx = o.geometry.index.array, aF = new Float32Array(idx.length);
    for(let f = 0; f < idx.length; f += 3){ const r = mask[idx[f]] || mask[idx[f + 1]] || mask[idx[f + 2]]; aF[f] = aF[f + 1] = aF[f + 2] = r ? f/3 + 1 : 0; }
    ID = passMesh(o, aF, "float f = floor(vF + 0.5); gl_FragColor = vec4(mod(f, 256.0)/255.0, mod(floor(f/256.0), 256.0)/255.0, floor(f/65536.0)/255.0, 0.0);");
  }
  const {px} = readPass([ID], [o]), seen = new Map();
  for(let i = 0; i < px.length; i += 4){
    if(px[i + 3] !== 0) continue;
    const f = px[i] + 256*px[i + 1] + 65536*px[i + 2];
    if(f) seen.set(f - 1, (seen.get(f - 1) || 0) + 1);
  }
  return seen;            // face -> pixels
}
/* Every restored face any pose and camera shows; per face its ring from the kept skin's edge and its depth under the
   seam ring (m), the numbers the export's skin=<rings>,<H> rule is chosen from */
async function exposure(poses, cams){
  const o = labCurrent().neckSkin, g = o.geometry, P = g.attributes.position, mask = await restoredMask(), idx = g.index.array;
  const weld = welded(g), n = P.count, nb = new Map();
  for(let f = 0; f < idx.length; f += 3) for(let e = 0; e < 3; e++){
    const a = weld[idx[f + e]], b = weld[idx[f + (e + 1)%3]];
    (nb.get(a) || nb.set(a, new Set()).get(a)).add(b); (nb.get(b) || nb.set(b, new Set()).get(b)).add(a);
  }
  const ring = new Map(); let front = [];
  for(let i = 0; i < n; i++) if(weld[i] === i && !mask[i]){ ring.set(i, 0); }
  ring.forEach((_, i) => { for(const j of nb.get(i) || []) if(mask[j] && !ring.has(j)){ ring.set(j, 1); front.push(j); } });
  for(let r = 2; front.length; r++){ const nx = []; for(const i of front) for(const j of nb.get(i) || []) if(!ring.has(j)){ ring.set(j, r); nx.push(j); } front = nx; }
  const C = ringCenter(g), all = new Map(), views = [];
  for(const p of poses) for(const [cn, c] of Object.entries(cams)){
    await pose({...p, cam: c, hideArms: c !== null, noMeasure: true});
    const seen = await idPass();
    seen.forEach((k, f) => all.set(f, (all.get(f) || 0) + k));
    views.push({pose: p, cam: cn, faces: seen.size, px: [...seen.values()].reduce((a, x) => a + x, 0)});
  }
  let restoredFaces = 0;
  for(let f = 0; f < idx.length; f += 3) if(mask[idx[f]] || mask[idx[f + 1]] || mask[idx[f + 2]]) restoredFaces++;
  const verts = new Set(); all.forEach((_, f) => { for(let e = 0; e < 3; e++){ const i = idx[3*f + e]; if(mask[i]) verts.add(weld[i]); } });
  // depth under the seam ring along the body (world +z runs toward the feet), from the rest pose
  const zs = R.ring.reduce((a, i) => a + R.restB[3*i + 2], 0)/R.ring.length;
  const rings = [...verts].map(i => ring.get(i) ?? 99), depth = [...verts].map(i => R.restB[3*i + 2] - zs);
  const restoredVerts = new Set(); for(let i = 0; i < n; i++) if(mask[i]) restoredVerts.add(weld[i]);
  const hist = (xs, step) => xs.reduce((h, x) => { const k = (Math.floor(x/step)*step).toFixed(3); h[k] = (h[k] || 0) + 1; return h; }, {});
  return {restoredVerts: restoredVerts.size, restoredFaces, exposedFaces: all.size, exposedVerts: verts.size,
    maxRing: Math.max(0, ...rings), maxDepth: Math.max(0, ...depth), ringHist: hist(rings, 1), depthHist: hist(depth, 0.02), views,
    faces: [...all.keys()]};
}
// the exposure map: exposed restored faces red, the other restored faces blue, the shipped skin as it is, clothes off
async function exposureMap(faces, cam){
  const o = labCurrent().neckSkin, mask = await restoredMask(), idx = o.geometry.index.array, set = new Set(faces), aF = new Float32Array(idx.length);
  for(let f = 0; f < idx.length; f += 3){ const r = mask[idx[f]] || mask[idx[f + 1]] || mask[idx[f + 2]]; aF[f] = aF[f + 1] = aF[f + 2] = !r ? 0 : set.has(f/3) ? 2 : 1; }
  const M = passMesh(o, aF, "if(vF < 0.5) discard; gl_FragColor = vF > 1.5 ? vec4(0.95, 0.1, 0.1, 1.0) : vec4(0.2, 0.4, 0.95, 1.0);");
  M.material.polygonOffset = true; M.material.polygonOffsetFactor = -1; M.material.polygonOffsetUnits = -1;
  clothes(false);
  await pose({cam, hideArms: true, noMeasure: true});
  M.visible = true; await frames(3);
  const url = renderer.domElement.toDataURL("image/png");
  M.visible = false; M.removeFromParent(); clothes(true);
  return url;
}
/* Holes on screen, in the neck's crop (the seam centre +- 22 cm, projected): (1) the skin's open edges that can be seen
   (drawn as lines over the posed skin, the seam ring left out: the head covers it, the seam numbers watch it), (2) the
   skin's inside (back faces) that can be seen: a see-through hole or a cut edge turned to the camera. Masks returned. */
let BACK = null;
function holes(B){
  const cur = labCurrent(), o = cur.neckSkin, g = o.geometry, P = g.attributes.position, idx = g.index.array, n = P.count;
  const weld = welded(g), C = R.C, edges = new Map();
  for(let f = 0; f < idx.length; f += 3) for(let e = 0; e < 3; e++){
    const a = weld[idx[f + e]], b = weld[idx[f + (e + 1)%3]], k = a < b ? a*n + b : b*n + a;
    edges.set(k, (edges.get(k) || 0) + 1);
  }
  const seg = [];
  edges.forEach((m, k) => {
    if(m !== 1) return;
    const a = Math.floor(k/n), b = k%n;
    if(P.getY(a) > C.top - 0.004 && P.getY(b) > C.top - 0.004) return;
    seg.push(B[3*a], B[3*a + 1], B[3*a + 2], B[3*b], B[3*b + 1], B[3*b + 2]);
  });
  const lg = new THREE.BufferGeometry(); lg.setAttribute("position", new THREE.Float32BufferAttribute(seg, 3));
  const lines = new THREE.LineSegments(lg, new THREE.ShaderMaterial({vertexShader: "void main(){ gl_Position = projectionMatrix*viewMatrix*vec4(position, 1.0); }",
    fragmentShader: "void main(){ gl_FragColor = vec4(1.0, 0.0, 0.0, 0.0); }", blending: THREE.NoBlending}));
  lines.frustumCulled = false; lines.visible = false; scene.add(lines);
  if(!BACK) BACK = passMesh(o, new Float32Array(idx.length), "gl_FragColor = vec4(0.0, 1.0, 0.0, 0.0);", THREE.BackSide);
  const {px, w, h} = readPass([lines, BACK], []);
  lines.removeFromParent(); lg.dispose(); lines.material.dispose();
  // the crop
  const c = new THREE.Vector3(), cnt = R.ring.length;
  for(const i of R.ring) c.add(at(B, i)); c.multiplyScalar(1/cnt);
  const e = c.clone().add(new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(0.22));
  const sc = c.clone().project(camera), se = e.clone().project(camera);
  const cx = (sc.x + 1)/2*w, cy = (sc.y + 1)/2*h, rad = Math.hypot((se.x - sc.x)/2*w, (se.y - sc.y)/2*h);
  let edgePx = 0, backPx = 0;
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
  const ctx = cv.getContext("2d"), img = ctx.createImageData(w, h);
  for(let y = 0; y < h; y++) for(let x = 0; x < w; x++){
    const i = 4*(y*w + x);
    if(px[i + 3] !== 0) continue;
    const inCrop = sc.z < 1 && Math.hypot(x - cx, y - cy) < rad, red = px[i] > 128, o2 = 4*((h - 1 - y)*w + x);
    if(inCrop){ if(red) edgePx++; else backPx++; }
    img.data[o2] = red ? 255 : 0; img.data[o2 + 1] = red ? 0 : 255; img.data[o2 + 2] = red ? 0 : 255; img.data[o2 + 3] = inCrop ? 255 : 90;
  }
  ctx.putImageData(img, 0, 0);
  ctx.strokeStyle = "rgba(255,255,0,0.8)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, h - cy, rad, 0, 2*Math.PI); ctx.stroke();
  return {edgePx, backPx, mask: cv.toDataURL("image/png")};
}
/* Shirt vs skin around the collar (posed, CPU): every skin vertex within 25 cm of the seam centre that lies under a shirt
   triangle (its nearest point inside the triangle, within 2 cm) by its signed distance along the shirt's normal:
   outside the cloth = poke-through, 0..1.5 mm under it = z-fighting risk; and the collar's rim vertices sunk into the
   skin (the same test the other way). */
function penetration(B, S2){
  const r = R, o = labCurrent().neckSkin, sh = r.shirt, si = sh.geometry.index.array, ki = o.geometry.index.array;
  const base = new THREE.Vector3(r.C.cx, r.C.top, r.C.cz), near = i => _w.fromBufferAttribute(o.geometry.attributes.position, i).distanceTo(base) < 0.25;
  const seam0 = new THREE.Vector3(r.restB[3*r.ring[0]], r.restB[3*r.ring[0] + 1], r.restB[3*r.ring[0] + 2]);
  const cp = new THREE.Vector3(), nrm = new THREE.Vector3(), bc = new THREE.Vector3();
  // posed triangles (and centroids, for a quick 5 cm cut) of a mesh's part
  const tris = (pos, index, keep) => {
    const out = [], v = k => new THREE.Vector3(pos[3*k], pos[3*k + 1], pos[3*k + 2]);
    for(let f = 0; f < index.length; f += 3) if(keep(index[f])){
      const t = new THREE.Triangle(v(index[f]), v(index[f + 1]), v(index[f + 2]));
      out.push({t, c: t.getMidpoint(new THREE.Vector3())});
    }
    return out;
  };
  const sTris = tris(S2, si, j => _w.set(r.restS[3*j], r.restS[3*j + 1], r.restS[3*j + 2]).distanceTo(seam0) < 0.35);
  const signed = (list, p) => {
    let best = null, bd = 0.02;
    for(const {t, c} of list){
      if(c.distanceToSquared(p) > 0.0025) continue;
      t.closestPointToPoint(p, cp);
      const d = cp.distanceTo(p);
      if(d < bd){ t.getNormal(nrm); t.getBarycoord(cp, bc); best = {d: _v.copy(p).sub(cp).dot(nrm), inside: Math.min(bc.x, bc.y, bc.z) > 1e-3}; bd = d; }
    }
    return best;
  };
  let poke = 0, zrisk = 0, under = 0;
  const p = new THREE.Vector3(), n = o.geometry.attributes.position.count;
  for(let i = 0; i < n; i++){
    if(!near(i)) continue;
    const s = signed(sTris, p.set(B[3*i], B[3*i + 1], B[3*i + 2]));
    if(!s || !s.inside) continue;
    under++;
    if(s.d > 0.0005) poke++; else if(s.d > -0.0015) zrisk++;
  }
  // the collar's rim (shirt open edges in the crop) against the skin
  const kTris = tris(B, ki, i => near(i)), weld = welded(sh.geometry), SP = sh.geometry.attributes.position, m = SP.count, edges = new Map();
  for(let f = 0; f < si.length; f += 3) for(let e = 0; e < 3; e++){ const a = weld[si[f + e]], b = weld[si[f + (e + 1)%3]], k = a < b ? a*m + b : b*m + a; edges.set(k, (edges.get(k) || 0) + 1); }
  const rim = new Set(); edges.forEach((c, k) => { if(c === 1){ rim.add(Math.floor(k/m)); rim.add(k%m); } });
  let sunk = 0, rimN = 0;
  rim.forEach(j => {
    if(_w.set(r.restS[3*j], r.restS[3*j + 1], r.restS[3*j + 2]).distanceTo(seam0) > 0.3) return;
    rimN++;
    const s = signed(kTris, p.set(S2[3*j], S2[3*j + 1], S2[3*j + 2]));
    if(s && s.inside && s.d < -0.0005) sunk++;
  });
  return {under, poke, zrisk, rim: rimN, rimSunk: sunk};
}

/* ---- poses and the game's own motions ---- */
async function pose(p){
  chainOpts.twist = p.twist || 0;
  const cam = p.cam ? {pos: new THREE.Vector3(...p.cam.pos), look: new THREE.Vector3(...p.cam.look)} : null;
  S.neckLab = {hold: true, rot: p.rot || 0, bend: p.bend || 0, stretch: p.stretch || 0, cam,
    followRot: p.followRot, followBend: p.followBend};
  S.saidIdle = S.saidNear = true;
  // diagnostic cameras: the first-person therapist arms hang in the air there, so they step aside
  scene.traverse(x => { if(/^therapist_arm/.test(x.name)){ if(x.userData.labVis === undefined) x.userData.labVis = x.visible; x.visible = p.hideArms ? false : x.userData.labVis; } });
  await frames(6);
  return p.noMeasure ? null : measure(!!p.extra);
}
/* A: turn to 75 and let go; B: a 0.16 m tug (stretchProfile); C: a crack from 60 (crackProfile). The loop's own easing and
   profiles run (nothing held); every frame records the pose and the key numbers. */
async function animate(kind){
  chainOpts.twist = 0;
  S.neckLab = {hold: false, cam: null};
  const set = (rot, bend = 0) => { S.input.rot = rot; S.input.bend = bend; };
  // counted in frames: under a software renderer frames are slow and the loop clamps each step to 0.05 s, so the
  // game's own clock (not the wall clock) decides how far an ease or a spring has got
  const plan = {turn: [[0, 20], [75, 60], [0, 90]], crack: [[60, 40], ["snap", 45]], stretch: [[0, 20], ["tug", 0]]}[kind];
  const rec = [], t0 = performance.now(), cur = labCurrent();
  const log = () => rec.push({t: (performance.now() - t0)/1000, f: rec.length, rot: pivot.rotation.z*180/Math.PI, bend: pivot.rotation.y*180/Math.PI,
    pull: headZ0 - head.position.z, follow: cur.chain ? {...cur.chain.follow} : null});
  S.cur.rot = S.input.rot = 0;
  for(const [what, n] of plan){
    if(what === "snap"){ S.crackAmp = 1; S.thrust = 1; }
    else if(what === "tug"){ S.stretchPeak = 0.16; S.stretchHold = 1.3; S.stretchAt = performance.now(); }
    else set(what);
    if(what === "tug"){ while(S.stretchAt){ await frames(1); log(); } for(let i = 0; i < 15; i++){ await frames(1); log(); } }
    else for(let i = 0; i < n; i++){ await frames(1); log(); }
  }
  set(0);
  return rec;
}
/* The same motions on the game's own clock, stepped at 60 fps from its own functions (loop.js: the aim eases with
   k = 1 - exp(-9 dt); the crack is crackProfile over CRACK_LEN, its bend 35% the other way; the tug is stretchProfile;
   the trunk follows with chainOpts.lag). Software rendering is too slow to catch the 0.15 s peaks in real time, so the
   shooter re-holds these exact poses (followRot/Bend carry the trunk's lag). */
function curve(kind){
  const dt = 1/60, out = [], lag = chainOpts.lag;
  let t = 0, rot = kind === "crack" ? 60 : 0, fr = rot, fb = 0;
  const push = (r, b, pull) => {
    const k = lag > 0 ? 1 - Math.exp(-dt*lag) : 1; fr += (r - fr)*k; fb += (b - fb)*k;
    out.push({t: +t.toFixed(4), rot: r, bend: b, pull, followRot: fr, followBend: fb}); t += dt;
  };
  if(kind === "turn"){
    for(let i = 0; i < 150; i++){ rot += (75 - rot)*(1 - Math.exp(-dt*9)); push(rot, 0, 0); }
    for(let i = 0; i < 150; i++){ rot += (0 - rot)*(1 - Math.exp(-dt*9)); push(rot, 0, 0); }
  }
  if(kind === "crack"){
    const n = Math.ceil((CRACK_LEN + 0.6)/dt);
    for(let i = 0; i < n; i++){ const cp = crackProfile(Math.min(t, CRACK_LEN)); push(60 + cp.rot, -cp.bend, 0); }
  }
  if(kind === "stretch"){
    const n = Math.ceil((stretchLen() + 0.4)/dt);
    for(let i = 0; i < n; i++) push(0, 0, stretchProfile(t, 0.16));
  }
  return out;
}
// rest meshes of the two GLBs side by side: the chain export must be the shipped body, vertex for vertex
async function sameMesh(){
  const [{GLTFLoader}, {MeshoptDecoder}] = await Promise.all([import("three/examples/jsm/loaders/GLTFLoader.js"), import("three/examples/jsm/libs/meshopt_decoder.module.js")]);
  const L = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder), get = u => new Promise((res, rej) => L.load(u, res, undefined, rej));
  const B = import.meta.env.BASE_URL, [a, b] = await Promise.all([get(B + "models/patient08/body.glb"), get(B + "lab/patient08/body_chain.glb")]);
  const meshes = g => { const m = {}; g.scene.traverse(o => { if(o.isMesh) m[o.name] = o.geometry.attributes.position; }); return m; };
  const ma = meshes(a), mb = meshes(b), out = {};
  for(const k of Object.keys(ma)){
    const p = ma[k], q = mb[k]; if(!q){ out[k] = "missing"; continue; }
    let d = 0; for(let i = 0; i < Math.min(p.count, q.count); i++) d = Math.max(d, Math.abs(p.getX(i) - q.getX(i)), Math.abs(p.getY(i) - q.getY(i)), Math.abs(p.getZ(i) - q.getZ(i)));
    out[k] = {count: [p.count, q.count], maxDiffMm: 1000*d};
  }
  return out;
}
/* A restored-skin export against the shipped body: every shipped vertex must be in it, where it was (0.2 mm); the
   restored ones are extra. Per mesh: counts, shipped vertices not found, largest move of the found ones. */
async function subsetMesh(url){
  const B = import.meta.env.BASE_URL, [a, b] = await Promise.all([loadGlb(B + "models/patient08/body.glb"), loadGlb(B + url)]);
  const meshes = g => { const m = {}; g.scene.updateMatrixWorld(true); g.scene.traverse(o => { if(o.isMesh) m[o.name] = sceneSpace(o.geometry.attributes.position, o.isSkinnedMesh ? restOf(o) : o.matrixWorld); }); return m; };
  const ma = meshes(a), mb = meshes(b), out = {}, cell = 0.0005, key = (x, y, z) => Math.round(x/cell) + "," + Math.round(y/cell) + "," + Math.round(z/cell);
  for(const k of Object.keys(ma)){
    const p = ma[k], q = mb[k]; if(!q){ out[k] = "missing"; continue; }
    const H = new Map(); for(let j = 0; j < q.length/3; j++){ const kk = key(q[3*j], q[3*j + 1], q[3*j + 2]); (H.get(kk) || H.set(kk, []).get(kk)).push(j); }
    let miss = 0, d = 0;
    for(let i = 0; i < p.length/3; i++){
      const x = p[3*i], y = p[3*i + 1], z = p[3*i + 2]; let best = Infinity;
      for(let u = -1; u <= 1; u++) for(let v = -1; v <= 1; v++) for(let w = -1; w <= 1; w++)
        for(const j of H.get(key(x + u*cell, y + v*cell, z + w*cell)) || []) best = Math.min(best, Math.hypot(q[3*j] - x, q[3*j + 1] - y, q[3*j + 2] - z));
      if(best > 0.0002) miss++; else d = Math.max(d, best);
    }
    out[k] = {count: [p.length/3, q.length/3], missing: miss, maxDiffMm: 1000*d};
  }
  return out;
}

// clothes off, to see the skin alone (where the export cut the skin the shirt hid)
const clothes = on => labCurrent().bodyMeshes.forEach(m => { if(m !== labCurrent().neckSkin) m.visible = on; });
window.__neckLab = {ready: false, rig: RIG, pose, animate, curve, measure, sameMesh, subsetMesh, clothes, exposure, exposureMap, opts: chainOpts};
ready().then(() => { window.__neckLab.ready = true; }, e => { window.__neckLab.error = String(e); });

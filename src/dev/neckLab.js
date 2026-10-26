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
import { scene } from "../scene/renderer.js";
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
function measure(){
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
    bindErr: cur.chain ? cur.chain.bindErr : null
  };
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
  return measure();
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

// clothes off, to see the skin alone (where the export cut the skin the shirt hid)
const clothes = on => labCurrent().bodyMeshes.forEach(m => { if(m !== labCurrent().neckSkin) m.visible = on; });
window.__neckLab = {ready: false, rig: RIG, pose, animate, curve, measure, sameMesh, clothes, opts: chainOpts};
ready().then(() => { window.__neckLab.ready = true; }, e => { window.__neckLab.error = String(e); });

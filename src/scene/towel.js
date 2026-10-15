import * as THREE from "three";
import { scene } from "./renderer.js";
import { head, crackFadeMats } from "./patientModel.js";
import { loadModel, getEnv } from "./realAssets.js";

/* Towel mode (core/towel.js): a folded white bath towel (public/models/towel/towel.glb, scripts/assets/towel_build.py)
   slung under the patient's chin, up along the jaw to the therapist's fists beside it, the loose ends hanging out of
   the fists toward the therapist (the user's reference video, 2026-10-15). It never goes round the front of the throat.
   The GLB is modelled straight along +x (-0.475..0.475 m) with 25 bones towel_00..24 straight under towel_root (flat,
   rest rotation identity): each frame every bone is put on the path at arc length |x| from the middle under the chin,
   its x along the path and its y the towel's outer face (away from the head). The cloth's folds ride along with the
   skin. Until the GLB is in, a flat ribbon follows the same frames. */
const N = 25, HALF = 0.475;
const BX = Array.from({length: N}, (_, i) => -HALF + i*(2*HALF/(N - 1)));

// the path, head-local (x mirrored, s = +1 the therapist's left hand), from the middle under the chin outward
const CHIN = [0, 0.062, 0.163];           // cupping the chin tip (not round the throat: that read as a neck brace)
const UNDER = [0.052, 0.032, 0.152];      // under the jaw
const JAW = [0.088, 0.012, 0.11];         // up along the jaw toward the ear
const TAIL = [0.02, -0.07, -0.11];        // from the fist: the loose end hangs toward the therapist and down
const _v = new THREE.Vector3(), _t = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
const _m = new THREE.Matrix4(), _fly = new THREE.Vector3(), _p = new THREE.Vector3();
const sides = [1, -1].map(s => ({s, pts: Array.from({length: 6}, () => new THREE.Vector3()), out: Array.from({length: 6}, () => new THREE.Vector3()),
  curve: null}));
sides.forEach(sd => { sd.curve = new THREE.CatmullRomCurve3(sd.pts, false, "centripetal"); });
const frames = Array.from({length: N}, () => ({p: new THREE.Vector3(), q: new THREE.Quaternion(), x: new THREE.Vector3(), y: new THREE.Vector3(), z: new THREE.Vector3(), sy: 1, sz: 1}));
// a fixed unevenness per bone (width, twist, ripple), the same every frame so the cloth doesn't boil
const RAND = Array.from({length: N}, (_, i) => [0, 1, 2].map(k => { const v = Math.sin((i + 1)*12.9898 + k*78.233)*43758.5453; return v - Math.floor(v); }));

let model = null, bones = null, loading = false;
/* The cloth-simulated towel (public/models/towel/towel_sim.glb, scripts/assets/towel_sim.py; user: "여전히 깁스잖아",
   "목을 x자로 감고 있는게 자연스럽고 사실적으로", 2026-10-15): per patient a towel draped by Blender's cloth sim on that
   patient's own head and neck, the middle under the back of the neck, the ends crossing in an X under the chin and up to
   the opposite fists, the rest hanging out of them. Head-local, so it is a child of `head` and follows the head (the
   stretch too). Morph "taut" = the fists pulled TOWEL_PULL toward the therapist; its weight is the tension. When it is
   in, the bone towel below stays hidden. */
let sim = null, simLoading = false;
const simMeshes = {};
function loadSim(){
  simLoading = true;
  Promise.all([loadModel("towel/towel_sim.glb"), getEnv()]).then(([g, env]) => {
    g.scene.traverse(o => {
      if(!o.isMesh) return;
      const id = (o.name.match(/patient0\d/) || [])[0];
      if(!id) return;
      o.frustumCulled = false; o.castShadow = o.receiveShadow = true;
      o.material.envMap = env; o.material.envMapIntensity = 0.2;
      if(!crackFadeMats.includes(o.material)) crackFadeMats.push(o.material);
      simMeshes[id] = o;
    });
    sim = new THREE.Group();
    Object.values(simMeshes).forEach(m => { m.removeFromParent(); m.visible = false; sim.add(m); });
    head.add(sim);
  }).catch(err => console.warn("simulated towel not loaded, keeping the bone towel", err));
}
function load(){
  loading = true;
  Promise.all([loadModel("towel/towel.glb"), getEnv()]).then(([g, env]) => {
    model = g.scene;
    bones = BX.map((_, i) => model.getObjectByName(`towel_${String(i).padStart(2, "0")}`));
    if(bones.some(b => !b)){ console.warn("towel bones missing"); model = null; return; }
    model.traverse(o => {
      if(!o.isMesh) return;
      o.frustumCulled = false; o.castShadow = o.receiveShadow = true;
      o.material.envMap = env; o.material.envMapIntensity = 0.2;
      if(o.material.normalScale) o.material.normalScale.set(1.8, 1.8);   // the terry pile reads on a phone
      if(!crackFadeMats.includes(o.material)) crackFadeMats.push(o.material);
    });
    model.visible = false;
    scene.add(model);
  }).catch(err => console.warn("towel model not loaded, keeping the ribbon", err));
}

// the fallback ribbon: a flat band through the same frames
const W = 0.1;
const rPos = new Float32Array(N*2*3), rIdx = [];
for(let i = 0; i < N - 1; i++){ const a = i*2; rIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
const rGeo = new THREE.BufferGeometry();
rGeo.setAttribute("position", new THREE.BufferAttribute(rPos, 3)); rGeo.setIndex(rIdx);
const rMat = new THREE.MeshStandardMaterial({color: 0xf6f3ec, roughness: 1, side: THREE.DoubleSide});
crackFadeMats.push(rMat);
const ribbon = new THREE.Mesh(rGeo, rMat);
ribbon.frustumCulled = false; ribbon.visible = false;
scene.add(ribbon);

const local = (x, y, z, out) => out.set(x, y, z).applyMatrix4(head.matrixWorld);
// outward from the head's long axis (head-local z), for the towel's outer face
const outward = (x, y, out) => out.set(x, y, 0).normalize().transformDirection(head.matrixWorld);

/* on: towel mode and playing. grips: realAssets towelGrips() or null. tension 0..1, near: 0..1 how close to the limit
   (a fine tremble), slip: seconds since the towel slipped off (< 0 none): it flies up toward the therapist and is
   gone, then is back in the hands by SLIP_BACK. t: seconds (the hanging ends sway). */
const SLIP_GONE = 0.7, SLIP_BACK = 1.3;
export function updateTowel(on, grips, slip, tension = 1, near = 0, t = 0, patient = ""){
  if(on && !sim && !simLoading) loadSim();
  const simMesh = sim && simMeshes[patient];
  if(simMesh){
    // the simulated towel: shown for this patient only, tension blends slack -> taut, a slip throws it off
    const showSim = on && !(slip >= SLIP_GONE && slip < SLIP_BACK);
    Object.values(simMeshes).forEach(m => { m.visible = showSim && m === simMesh; });
    if(model) model.visible = false;
    ribbon.visible = false;
    if(!showSim) return;
    const k = simMesh.morphTargetDictionary && simMesh.morphTargetDictionary.taut;
    if(k != null) simMesh.morphTargetInfluences[k] = Math.min(1, Math.max(0, tension)) + 0.01*near*Math.sin(t*70);
    const u = slip >= 0 && slip < SLIP_GONE ? slip/SLIP_GONE : 0;
    sim.position.set(0, 0.35*u*u + 0.05*u, -0.55*u*u);
    sim.rotation.set(-2.5*u*u, 0, 0.8*u);
    return;
  }
  if(on && !model && !loading) load();
  const show = on && !(slip >= SLIP_GONE && slip < SLIP_BACK);
  if(model) model.visible = show;
  ribbon.visible = show && !model;
  if(!show) return;
  head.updateMatrixWorld(true);
  const hold = grips ? grips.hold : 0, slack = 1 - Math.min(1, Math.max(0, tension));
  const tremble = 0.0015*near*Math.sin(t*70);
  sides.forEach(sd => {
    const s = sd.s, P = sd.pts;
    // slack: the sling drops away from under the chin (toward the feet and down); taut: snug on the jaw
    local(0, CHIN[1] - 0.015*slack, CHIN[2] + 0.02*slack + tremble, P[0]);
    local(s*UNDER[0], UNDER[1] - 0.012*slack, UNDER[2] + 0.015*slack, P[1]);
    local(s*JAW[0], JAW[1], JAW[2] + 0.01*slack, P[2]);
    // the fist: the hand's palm, or a rest point beside the jaw without the realistic arms
    local(s*0.12, 0.02, 0.04, P[3]);
    const palm = grips && (s > 0 ? grips.l : grips.r);
    if(palm) P[3].lerp(palm, hold);
    // the loose end out of the fist, swaying a little
    const sw = 0.012*Math.sin(t*1.7 + s);
    _v.set(s*TAIL[0] + sw, TAIL[1], TAIL[2]).transformDirection(head.matrixWorld).multiplyScalar(Math.hypot(...TAIL));
    P[4].copy(P[3]).addScaledVector(_v, 0.6);
    P[5].copy(P[3]).addScaledVector(_v, 1.6); P[5].y -= 0.05;
    outward(0, 1, sd.out[0]); outward(s*0.6, 0.8, sd.out[1]); outward(s, 0.3, sd.out[2]);
    outward(s, 0.1, sd.out[3]); outward(s, 0, sd.out[4]); outward(s, 0, sd.out[5]);
    sd.curve.updateArcLengths();
    sd.len = sd.curve.getLength();
    const L = sd.curve.getLengths(100);
    sd.fist = L[60];   // arc length to the fist (control point 3 of 6)
  });
  // the slip: the whole towel flies up and back toward the therapist, spinning out of the frame
  const u = slip >= 0 && slip < SLIP_GONE ? slip/SLIP_GONE : 0;
  BX.forEach((x, i) => {
    const sd = sides[x < 0 ? 0 : 1], d = Math.abs(x), f = frames[i];
    const a = Math.min(1, d/sd.len);
    sd.curve.getPointAt(a, f.p);
    sd.curve.getTangentAt(a, _t);
    if(d > sd.len) f.p.addScaledVector(_t, d - sd.len);
    // bone +x runs from towel_00 to towel_24: toward the middle on the x < 0 side
    f.x.copy(_t).multiplyScalar(x < 0 ? -1 : 1);
    // outer face: the side's outward directions blended along the path
    const k = a*5, k0 = Math.min(4, Math.floor(k));
    _y.copy(sd.out[k0]).lerp(sd.out[k0 + 1], k - k0);
    f.y.copy(_y).addScaledVector(f.x, -_y.dot(f.x)).normalize();
    f.z.crossVectors(f.x, f.y);
    // cloth, not a cast (user: "수건 여전히 깁스처럼", 2026-10-15): gathered in the fist (narrow, bunched thick), and
    // everywhere else a fixed per-bone unevenness of width, twist and ripple, bigger while the towel is slack
    const g = Math.exp(-Math.pow((d - sd.fist)/0.05, 2)), loose = 0.35 + 0.65*slack, r = RAND[i];
    // under the chin the band rides narrower and crumpled (a cradle, not a collar)
    const chin = Math.max(0, 1 - d/0.12);
    f.sz = (1 - 0.65*g)*(1 - (1 - g)*0.18*r[0])*(1 - 0.25*chin);
    f.sy = 1 + 0.5*g;
    const roll = (r[1] - 0.5)*(0.55*loose + 0.5*chin)*(1 - g);
    if(roll){ _t.copy(f.y).multiplyScalar(Math.cos(roll)).addScaledVector(f.z, Math.sin(roll)); f.z.multiplyScalar(Math.cos(roll)).addScaledVector(f.y, -Math.sin(roll)); f.y.copy(_t); }
    f.p.addScaledVector(f.y, (r[2] - 0.5)*0.012*loose*(1 - g));
    if(u > 0){ _fly.set(Math.sin(i*1.7)*0.05*u, 0.35*u*u + 0.05*u, -0.55*u*u); f.p.add(_fly); }
    _m.makeBasis(f.x, f.y, f.z); f.q.setFromRotationMatrix(_m);
  });
  if(model){
    bones.forEach((b, i) => { b.position.copy(frames[i].p); b.quaternion.copy(frames[i].q); b.scale.set(1, frames[i].sy, frames[i].sz); });
  }else{
    frames.forEach((f, i) => {
      _p.copy(f.p).addScaledVector(f.z, -W/2); rPos.set([_p.x, _p.y, _p.z], i*6);
      _p.copy(f.p).addScaledVector(f.z, W/2); rPos.set([_p.x, _p.y, _p.z], i*6 + 3);
    });
    rGeo.attributes.position.needsUpdate = true; rGeo.computeVertexNormals();
  }
}

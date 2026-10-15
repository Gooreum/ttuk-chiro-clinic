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
const CHIN = [0, 0.05, 0.168];            // under the chin tip, toward the feet
const UNDER = [0.05, 0.025, 0.155];       // under the jaw
const JAW = [0.088, 0.012, 0.11];         // up along the jaw toward the ear
const TAIL = [0.02, -0.07, -0.11];        // from the fist: the loose end hangs toward the therapist and down
const _v = new THREE.Vector3(), _t = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
const _m = new THREE.Matrix4(), _fly = new THREE.Vector3(), _p = new THREE.Vector3();
const sides = [1, -1].map(s => ({s, pts: Array.from({length: 6}, () => new THREE.Vector3()), out: Array.from({length: 6}, () => new THREE.Vector3()),
  curve: null}));
sides.forEach(sd => { sd.curve = new THREE.CatmullRomCurve3(sd.pts, false, "centripetal"); });
const frames = Array.from({length: N}, () => ({p: new THREE.Vector3(), q: new THREE.Quaternion(), x: new THREE.Vector3(), y: new THREE.Vector3(), z: new THREE.Vector3()}));

let model = null, bones = null, loading = false;
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
export function updateTowel(on, grips, slip, tension = 1, near = 0, t = 0){
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
    local(0, CHIN[1] - 0.025*slack, CHIN[2] + 0.03*slack + tremble, P[0]);
    local(s*UNDER[0], UNDER[1] - 0.02*slack, UNDER[2] + 0.025*slack, P[1]);
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
    if(u > 0){ _fly.set(Math.sin(i*1.7)*0.05*u, 0.35*u*u + 0.05*u, -0.55*u*u); f.p.add(_fly); }
    _m.makeBasis(f.x, f.y, f.z); f.q.setFromRotationMatrix(_m);
  });
  if(model){
    bones.forEach((b, i) => { b.position.copy(frames[i].p); b.quaternion.copy(frames[i].q); });
  }else{
    frames.forEach((f, i) => {
      _p.copy(f.p).addScaledVector(f.z, -W/2); rPos.set([_p.x, _p.y, _p.z], i*6);
      _p.copy(f.p).addScaledVector(f.z, W/2); rPos.set([_p.x, _p.y, _p.z], i*6 + 3);
    });
    rGeo.attributes.position.needsUpdate = true; rGeo.computeVertexNormals();
  }
}

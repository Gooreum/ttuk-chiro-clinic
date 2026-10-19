import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { createClinicXray } from "virtual:clinic-xray";
import { therapistStyle } from "../back/therapistMotion.js";

/* Lumbar x-ray for the side-posture mode, the neck mode's own x-ray engine (src/scene/xray.js via virtual:clinic-xray,
   unchanged) drawn inside the patient in the clinic scene, the way the neck and back modes draw theirs.
   User 2026-10-19: "기존 우리 골절 나거나 금가는 효과랑 스타일이 비슷했으면 좋겠음. 여기선 뼈가 확 돌아가면서 금이 가거나
   골절 ... 디스크 표현도 ... 뼈 맞춰질때도", then "척추 보여주는게 목꺾기 퀄리티 보다 훨씬 못하다. 그 수준까지 올려".
   No organs here ("장기파열은 하지마 여기선").
   public/models/side/lumbar.glb (scripts/assets/lumbar_build.py + lumbar_cord.py + spine_bake.py, BodyParts3D CC BY
   4.0) is built like spine/cervical.glb: same frame (+y up, +z anterior, +x patient left), part empties with baked AO,
   cord (cord, conus, cauda equina) and nerve roots. It fills the engine's slots C1..C7 = T11, T12, L1..L5, T1 = sacrum
   (the fixed body end), discs C2/3..C7/T1 = T12/L1..L5/S1; the T11/12 disc rides on the T11 group.
   Beats by kind (core.js xrayTarget: the stuck vertebra is the aimed level, xr "rot", the worked facet the up side):
     ok    the engine's release: the disc pinched red and flat, the cord squeezed hot, then the disc springs tall and
           blue, the cord opens, the turned vertebra snaps home past neutral with a flash and gas bubbles
     weak  stays pressed; the column starts to unwind and sticks
     over  the column above ratchets two notches too far and the pinched disc squirts out sideways, coral ("디스크 탈주")
     tier  the column above whips round about the spine (45° / 80°) until the engine's crack zips across the vertebra;
           tier 1 crumbles down the film, tier 2 blows apart, the column sinks into the hole */
const DEG = Math.PI/180;
const clamp01 = v => Math.min(1, Math.max(0, v));
const smooth = (a, b, x) => { const t = clamp01((x - a)/(b - a)); return t*t*(3 - 2*t); };
const easeOutBack = t => { t = clamp01(t); const c = 2.4; t -= 1; return 1 + (c + 1)*t*t*t + c*t*t; };
const SLOTS = [["C1", "T11"], ["C2", "T12"], ["C3", "L1"], ["C4", "L2"], ["C5", "L3"], ["C6", "L4"], ["C7", "L5"], ["T1", "Sacrum"]];
const DISCS = [["Disc_C2_C3", "Disc_T12_L1"], ["Disc_C3_C4", "Disc_L1_L2"], ["Disc_C4_C5", "Disc_L2_L3"],
  ["Disc_C5_C6", "Disc_L3_L4"], ["Disc_C6_C7", "Disc_L4_L5"], ["Disc_C7_T1", "Disc_L5_S1"]];
const TWIST = {1: 45*DEG, 2: 80*DEG};
const CORAL = new THREE.Color(0xff7a59);

export async function createSideXray({scene, camera, env = null, renderer}){
  if(renderer) renderer.localClippingEnabled = true;
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(import.meta.env.BASE_URL + "models/side/lumbar.glb");
  gltf.scene.updateMatrixWorld(true);
  const sources = new Set(), adapted = new THREE.Group(), rest = {};
  const origin = name => { const o = gltf.scene.getObjectByName(name); if(!o) throw new Error("lumbar x-ray: missing " + name); return o.getWorldPosition(new THREE.Vector3()); };
  // float copy of a (quantized) part in the model frame, about the part's own origin
  function floatMesh(name, at){
    const meshes = []; gltf.scene.getObjectByName(name).traverse(o => { if(o.isMesh) meshes.push(o); });
    return meshes.map(mesh => {
      const g = mesh.geometry.clone();
      for(const k of ["position", "normal"]){
        const a = g.attributes[k]; if(!a) continue;
        const f = new Float32Array(a.count*3);
        for(let i = 0; i < a.count; i++){ f[i*3] = a.getX(i); f[i*3 + 1] = a.getY(i); f[i*3 + 2] = a.getZ(i); }
        g.setAttribute(k, new THREE.BufferAttribute(f, 3));
      }
      g.applyMatrix4(mesh.matrixWorld); g.translate(-at.x, -at.y, -at.z); sources.add(g);
      return new THREE.Mesh(g, mesh.material);
    });
  }
  function part(src, engineName = src){
    const at = origin(src), node = new THREE.Group(); node.name = engineName; node.position.copy(at);
    for(const m of floatMesh(src, at)) node.add(m);
    adapted.add(node); rest[engineName] = at.clone();
  }
  for(const [e, src] of [...SLOTS, ...DISCS]) part(src, e);
  for(const o of gltf.scene.children) if(/^(Cord|Root_\d_[LR])$/.test(o.name)) part(o.name);
  adapted.updateMatrixWorld(true);

  const pivot = new THREE.Group(); pivot.name = "SideLumbarXray"; scene.add(pivot);
  const engine = createClinicXray({pivot, scene, camera, loadModel: async () => ({scene: adapted}), getEnv: async () => env});
  await engine.loadSpine();
  // the engine's part groups, picked out while still at rest: C1..C7 (V[0..6]) and the discs under them (D[1..6])
  const groupAt = p => engine.root.children.find(o => o.isGroup && o.children[0]?.isMesh && o.position.distanceToSquared(p) < 1e-10);
  const V = ["C1", "C2", "C3", "C4", "C5", "C6", "C7"].map(n => groupAt(rest[n]));
  const D = [null, ...DISCS.map(([e]) => groupAt(rest[e]))];
  if(V.some(v => !v) || D.slice(1).some(d => !d)) throw new Error("lumbar x-ray: engine parts not found");
  // the T11/12 disc has no engine slot (the neck has no C1/C2 disc): hang it on T11 with the T12/L1 disc's material
  {
    const at = origin("Disc_T11_T12");
    for(const m of floatMesh("Disc_T11_T12", at)){
      m.material = D[1].children[0].material; m.renderOrder = 999; m.position.copy(at).sub(rest.C1); V[0].add(m);
    }
  }
  const target = {name: "side", seg: 6, side: -1, xr: "rot"};
  const _q = new THREE.Quaternion(), _c = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
  // turn the column above the stuck vertebra about the spine (more toward the top, a wrung towel)
  function twistAbove(stuck, angle, self = 0){
    _c.copy(V[stuck].position);
    const turn = (g, w) => { _q.setFromAxisAngle(Y, angle*w); g.position.sub(_c).applyQuaternion(_q).add(_c); g.quaternion.premultiply(_q); };
    for(let j = 0; j < stuck; j++){ const w = .55 + .45*(stuck - 1 - j)/Math.max(1, stuck - 1); turn(V[j], w); if(D[j]) turn(D[j], w*.9); }
    if(self) turn(V[stuck], self);
  }
  // lay the engine's supine spine on its side inside the patient, the stuck vertebra on the anchor: the engine root
  // points anterior along pivot +y, so turning the pivot -f·90° about z puts the front toward the face (+x·f) and the
  // patient's left down for side L
  const _local = new THREE.Vector3(), focus = new THREE.Vector3();
  function place(anchor, side, stuck){
    const f = side === "R" ? -1 : 1;
    pivot.quaternion.setFromAxisAngle(Z, -f*Math.PI/2);
    engine.root.updateMatrix();
    _local.copy(rest[`C${stuck + 1}`]).applyMatrix4(engine.root.matrix).applyQuaternion(pivot.quaternion);
    pivot.position.copy(anchor).sub(_local);
    pivot.updateMatrixWorld(true);
  }

  let released = false;
  function update({film: f = 0, side = "L", kind = "ok", tier = 0, time = -1, force = 1, target: tg = null, anchor = null} = {}){
    released = false;
    if(f <= .01 || !anchor){ engine.updateXray(0, 0, -1, 0, target, null, null); return false; }
    Object.assign(target, tg || {});
    const s = target.side, stuck = target.seg - 1;
    place(anchor, side, stuck);
    const T = time - therapistStyle(force, tier).xrayDelay;
    const ok = kind === "ok" && !tier;
    const crackT = ok ? T - .7 : -1;
    const frac = tier ? {lvl: tier, t: T - .45} : null;
    const hurt = ok ? 0 : Math.max(0, 1 - Math.max(0, T - .7)*1.4);
    released = engine.updateXray(Math.max(0, T)*1000, f, crackT, hurt, target, frac, null);
    const t = T - .7;      // seconds since the film came up
    if(kind === "weak" && !tier) twistAbove(stuck, -10*DEG*s*Math.sin(Math.PI*clamp01((t - .3)/.6)));
    if(kind === "over" && !tier){
      // two ratchet clicks past the release, then the pinched disc squirts out the open side
      const turn = 25*DEG*easeOutBack((t - .35)/.18) + 15*DEG*easeOutBack((t - .62)/.16);
      twistAbove(stuck, -turn*s, .35);
      const esc = smooth(.62, .95, t), d = D[stuck];
      if(d && esc > 0){
        d.position.x += -s*.03*esc; d.position.z += .008*esc; d.scale.x *= 1 + .6*esc; d.scale.y *= 1 - .45*esc;
        const m = d.children[0].material, over = d.children[1]?.material;
        m.color.lerp(CORAL, esc); m.emissive.copy(CORAL).multiplyScalar(.5*esc);
        if(over){ over.color.copy(CORAL); over.opacity = Math.max(over.opacity, .8*f*esc); }
      }
    }
    if(tier){
      // the whip before the crack: the column above wrenches round, the stuck one partly, then the engine breaks it
      const ft = T - .45, whip = TWIST[tier]*easeOutBack(ft/.32), shake = .04*Math.sin(ft*70)*smooth(0, .3, ft)*(1 - smooth(.35, .6, ft));
      twistAbove(stuck, -(whip + shake)*s, ft < .45 ? .35 : 0);
    }
    engine.root.updateMatrixWorld(true);
    V[stuck].getWorldPosition(focus);
    return released;
  }
  function dispose(){
    const mats = new Set();
    pivot.traverse(o => { if(o.geometry) o.geometry.dispose(); for(const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) mats.add(m); });
    engine.film.removeFromParent(); engine.film.geometry.dispose(); mats.add(engine.film.material);
    for(const g of sources) g.dispose(); for(const m of mats) m.dispose();
    pivot.removeFromParent();
  }
  return {update, dispose, focus: () => focus, state: () => ({released})};
}

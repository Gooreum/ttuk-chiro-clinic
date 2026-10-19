import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { createClinicXray } from "virtual:clinic-xray";
import { therapistStyle } from "../back/therapistMotion.js";

/* Lumbar x-ray film for the side-posture mode, on the clinic x-ray engine the neck and back modes use (src/scene/xray.js
   through virtual:clinic-xray, the engine itself unchanged). User 2026-10-19: "기존 우리 골절 나거나 금가는 효과랑
   스타일이 비슷했으면 좋겠음. 여기선 뼈가 확 돌아가면서 금이 가거나 골절 ... 디스크 표현도 ... 뼈 맞춰질때도". No organs
   here ("장기파열은 하지마 여기선").
   public/models/side/lumbar.glb (scripts/assets/lumbar_build.py, BodyParts3D CC BY 4.0) fills the engine's slots:
     C1 an empty marker 3.3 cm over L1 (the engine shears the column back under its C1), C2..C6 = L1..L5, C7 = sacrum;
     Disc_C2_C3..Disc_C6_C7 = L1/2..L5/S1. No cord or nerve roots (the engine runs without them).
   lumbar.glb is +z posterior, the engine +z anterior: the geometry is mirrored in z (winding flipped) and moved so the
   canal sits where the engine draws the facet bubbles.
   Beats by kind (core.js xrayTarget: the stuck vertebra is the aimed level, xr "rot", the worked facet the up side):
     ok    the engine's release: the disc pinched red and flat, then it springs tall and turns blue, the turned vertebra
           snaps home past neutral with a flash and gas bubbles
     weak  stays pressed; the column starts to unwind and sticks
     over  the column above ratchets two notches too far and the pinched disc squirts out sideways, coral ("디스크 탈주")
     tier  the column above whips round about the spine (45° / 80°) until the engine's crack zips across the vertebra;
           tier 1 crumbles down the film, tier 2 blows apart, the column sinks into the hole */
const DEG = Math.PI/180;
const clamp01 = v => Math.min(1, Math.max(0, v));
const smooth = (a, b, x) => { const t = clamp01((x - a)/(b - a)); return t*t*(3 - 2*t); };
const easeOutBack = t => { t = clamp01(t); const c = 2.4; t -= 1; return 1 + (c + 1)*t*t*t + c*t*t; };
const CANAL_Z = .033;            // after the mirror: the lumbar canal onto the engine's cord line (z .0126)
const SLOTS = [["C2", "L1"], ["C3", "L2"], ["C4", "L3"], ["C5", "L4"], ["C6", "L5"], ["C7", "sacrum"]];
const DISCS = [["Disc_C2_C3", "disc_L1"], ["Disc_C3_C4", "disc_L2"], ["Disc_C4_C5", "disc_L3"], ["Disc_C5_C6", "disc_L4"], ["Disc_C6_C7", "disc_L5"]];
const TWIST = {1: 45*DEG, 2: 80*DEG};
const CORAL = new THREE.Color(0xff7a59);

export async function createSideXray({renderer, env = null}){
  renderer.localClippingEnabled = true;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, .01, 6);
  // the film itself: a dark backing over the whole clinic, a little lighter in the middle
  const backing = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({transparent: true, depthTest: false, depthWrite: false,
    uniforms: {uAlpha: {value: 0}},
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
    fragmentShader: "uniform float uAlpha; varying vec2 vUv; void main(){ float v = smoothstep(0.85, 0.2, length(vUv - 0.5)); gl_FragColor = vec4(mix(vec3(0.035, 0.09, 0.08), vec3(0.07, 0.16, 0.14), v), uAlpha); }"}));
  backing.frustumCulled = false; backing.renderOrder = -10; scene.add(backing);
  // the bones are lit (the engine's materials are standard ones): a soft sky and a key from the camera side
  const hemi = new THREE.HemisphereLight(0xf4efe4, 0x17312c, 1.1); scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff4e6, .9); scene.add(key, key.target);

  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(import.meta.env.BASE_URL + "models/side/lumbar.glb");
  gltf.scene.updateMatrixWorld(true);
  const sources = new Set();
  // float copy in the lumbar frame, mirrored to the engine's +z anterior, about the node's own (mirrored) origin
  const mirror = new THREE.Matrix4().makeScale(1, 1, -1);
  function adaptedMesh(node, origin){
    let mesh = null; node.traverse(o => { if(!mesh && o.isMesh) mesh = o; });
    const g = mesh.geometry.clone();
    for(const k of ["position", "normal"]){
      const a = g.attributes[k]; if(!a) continue;
      const f = new Float32Array(a.count*3);
      for(let i = 0; i < a.count; i++){ f[i*3] = a.getX(i); f[i*3 + 1] = a.getY(i); f[i*3 + 2] = a.getZ(i); }
      g.setAttribute(k, new THREE.BufferAttribute(f, 3));
    }
    g.applyMatrix4(mesh.matrixWorld); g.applyMatrix4(mirror); g.translate(-origin.x, -origin.y, -origin.z);
    if(g.index){ const ix = g.index.array; for(let i = 0; i < ix.length; i += 3){ const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } }
    if(!g.attributes.normal) g.computeVertexNormals();
    sources.add(g);
    return new THREE.Mesh(g, mesh.material);
  }
  const at = name => { const p = gltf.scene.getObjectByName(name).getWorldPosition(new THREE.Vector3()); p.z = -p.z + CANAL_Z; return p; };
  const adapted = new THREE.Group(), rest = {};
  function slot(engineName, origin, mesh){
    const node = new THREE.Group(); node.name = engineName; node.position.copy(origin); node.add(mesh); adapted.add(node);
    rest[engineName] = origin.clone();
  }
  for(const [e, src] of [...SLOTS, ...DISCS]){ const o = at(src); slot(e, o, adaptedMesh(gltf.scene.getObjectByName(src), o)); }
  {
    const o = at("L1").add(new THREE.Vector3(0, .033, 0)), g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, .0005, 0, 0, 0, .0005, 0], 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3)); sources.add(g);
    slot("C1", o, new THREE.Mesh(g, new THREE.MeshBasicMaterial()));
  }
  adapted.updateMatrixWorld(true);

  // the engine's root turns its model -90° about x and scales it 1.5; this pivot turns it back upright
  const pivot = new THREE.Group(); pivot.rotation.x = Math.PI/2; scene.add(pivot);
  const engine = createClinicXray({pivot, scene, camera, loadModel: async () => ({scene: adapted}), getEnv: async () => env});
  await engine.loadSpine();
  // the engine's part groups, picked out while still at rest: C1..C7 (V[0..6]) and the discs under them (D[1..5])
  const groupAt = p => engine.root.children.find(o => o.isGroup && o.children[0]?.isMesh && o.position.distanceToSquared(p) < 1e-10);
  const V = ["C1", "C2", "C3", "C4", "C5", "C6", "C7"].map(n => groupAt(rest[n]));
  const D = [null, ...DISCS.map(([e]) => groupAt(rest[e]))];
  if(V.some(v => !v) || D.slice(1).some(d => !d)) throw new Error("lumbar x-ray: engine parts not found");
  const target = {name: "side", seg: 5, side: -1, xr: "rot"};
  const _q = new THREE.Quaternion(), _c = new THREE.Vector3(), _w = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  // turn the column above the stuck vertebra about the spine (more toward the top, a wrung towel)
  function twistAbove(stuck, angle, self = 0){
    _c.copy(V[stuck].position);
    const turn = (g, w) => { _q.setFromAxisAngle(Y, angle*w); g.position.sub(_c).applyQuaternion(_q).add(_c); g.quaternion.premultiply(_q); };
    for(let j = 1; j < stuck; j++){ const w = .55 + .45*(stuck - 1 - j)/Math.max(1, stuck - 2); turn(V[j], w); if(D[j]) turn(D[j], w*.9); }
    if(self) turn(V[stuck], self);
  }

  let film = 0, cssAspect = 1, released = false;
  function update({film: f = 0, side = "L", kind = "ok", tier = 0, time = -1, height = .78, force = 1, target: tg = null} = {}){
    film = f; released = false;
    if(f <= .01){ backing.material.uniforms.uAlpha.value = 0; engine.updateXray(0, 0, -1, 0, target, null, null); return false; }
    backing.material.uniforms.uAlpha.value = .97*f;
    Object.assign(target, tg || {});
    const s = target.side, stuck = target.seg - 1;
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
        d.position.x += -s*.045*esc; d.position.z += .012*esc; d.scale.x *= 1 + .6*esc; d.scale.y *= 1 - .45*esc;
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
    frame(stuck, s);
    return released;
  }
  // posterior oblique toward the worked facet, the spine upright on screen, centred on the stuck vertebra
  function frame(stuck, s){
    engine.root.updateWorldMatrix(true, false);
    const look = V[stuck].getWorldPosition(_w).add(new THREE.Vector3(0, .02, 0));
    const dir = new THREE.Vector3(s*Math.sin(35*DEG), .12, -Math.cos(35*DEG)).normalize();
    const fov = camera.fov*DEG, h = .4, d = Math.max(h/2/Math.tan(fov/2), .26/2/Math.tan(fov/2)/Math.min(1, cssAspect))*1.05;
    camera.position.copy(look).addScaledVector(dir, d); camera.up.set(0, 1, 0); camera.lookAt(look);
    key.position.copy(camera.position).add(new THREE.Vector3(0, .4, 0)); key.target.position.copy(look);
  }
  function render(r){
    if(film <= .01) return;
    const auto = r.autoClear; r.autoClear = false; r.clearDepth(); r.render(scene, camera); r.autoClear = auto;
  }
  function resize(w, h){ cssAspect = w/Math.max(1, h); camera.aspect = cssAspect; camera.updateProjectionMatrix(); }
  function dispose(){
    const mats = new Set();
    scene.traverse(o => { if(o.geometry) o.geometry.dispose(); for(const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) mats.add(m); });
    for(const g of sources) g.dispose(); for(const m of mats) m.dispose();
  }
  return {update, render, resize, dispose, scene, camera, state: () => ({released})};
}

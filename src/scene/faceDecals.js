import * as THREE from "three";
import { decalWeights } from "../core/faceRig.js";

/* The image-to-3D heads' crown / chin (GLB y, the head fit of realAssets.js MODELS) and painted-face square, shared with
   the back mode's face close-up (src/back/reaction.js), which must not load the neck game's scene. */
export const PAINTED = {
  patient11: {crown: 1.6484, chin: 1.3876, face: {x: 0, y: 1.51, size: 0.22, split: 0.375}},
  patient12: {crown: 1.6466, chin: 1.4150, face: {x: 0, y: 1.54, size: 0.24, split: 0.31, fix: true}},
  patient13: {crown: 1.4910, chin: 1.1600, face: {x: 0, y: 1.31, size: 0.22, split: 0.28, fix: true}},
  patient14: {crown: 1.6801, chin: 1.3931, face: {x: 0, y: 1.515, size: 0.22, split: 0.34, fix: true}}
};

/* A head without blendshapes (patient11: image-to-3D, its eyes painted open, user: "표정이 시체 같음", 2026-10-24): each face
   is a painting over its front view (scripts/assets/image3d_expr.py), laid on the skin's own front-facing triangles inside
   the painted square, projected straight on. The brows / eyes patch and the mouth patch fade apart (core/faceRig.js
   decalWeights); the paintings stack in DECALS order. Only the changed parts are opaque in each.
   model: {id, skinMesh, skin (its material)}; base: the models folder URL. Sets model.decals. */
const DECALS = ["closed", "smile", "squeeze", "open"], FRONT_DEPTH = 0.025;
const _dv = new THREE.Vector3();
export function faceDecals(model, F, scene, base){
  const o = model.skinMesh, geo = o.geometry, P = geo.attributes.position, Nm = geo.attributes.normal, I = geo.index;
  if(!I || !Nm) return;
  scene.updateMatrixWorld(true);
  const M = new THREE.Matrix4().copy(scene.matrixWorld).invert().multiply(o.matrixWorld), N = new THREE.Matrix3().getNormalMatrix(M);
  const x0 = F.x - F.size/2, y0 = F.y - F.size/2, uv = new Float32Array(P.count*2), front = new Uint8Array(P.count);
  // the front surface by depth, not by normal: eyelid folds and socket walls face up or down (복순할매's face bows forward),
  // and leaving them out let the open eyes of the texture show through the shut ones (user: "눈이 여전히 징그럽잖아",
  // 2026-10-24). A vertex counts within FRONT_DEPTH of the frontmost point of its cell, so the back of the head stays out.
  const G = 48, top = new Float32Array(G*G).fill(-Infinity), z = new Float32Array(P.count), cell = new Int32Array(P.count);
  for(let i = 0; i < P.count; i++){
    _dv.fromBufferAttribute(P, i).applyMatrix4(M);
    const u = (_dv.x - x0)/F.size, v = (_dv.y - y0)/F.size;
    uv[2*i] = u; uv[2*i + 1] = v; z[i] = _dv.z;
    cell[i] = u > 0 && u < 1 && v > 0 && v < 1 ? Math.floor(v*G)*G + Math.floor(u*G) : -1;
    if(cell[i] >= 0) top[cell[i]] = Math.max(top[cell[i]], _dv.z);
  }
  for(let i = 0; i < P.count; i++)
    front[i] = cell[i] >= 0 && z[i] > top[cell[i]] - FRONT_DEPTH && _dv.fromBufferAttribute(Nm, i).applyMatrix3(N).normalize().z > -0.3 ? 1 : 0;
  const parts = [[], []];      // brows / eyes, mouth
  for(let f = 0; f < I.count; f += 3){
    const a = I.getX(f), b = I.getX(f + 1), c = I.getX(f + 2);
    if(front[a] && front[b] && front[c]) parts[(uv[2*a + 1] + uv[2*b + 1] + uv[2*c + 1])/3 < F.split ? 1 : 0].push(a, b, c);
  }
  const uvs = new THREE.BufferAttribute(uv, 2);
  const geos = parts.map(ix => {
    const q = new THREE.BufferGeometry();
    q.setAttribute("position", P); q.setAttribute("normal", Nm); q.setAttribute("uv", geo.attributes.uv); q.setAttribute("uvDecal", uvs); q.setIndex(ix);
    return q;
  });
  const loader = new THREE.TextureLoader();
  model.decals = [];
  (F.fix ? ["fix", ...DECALS] : DECALS).forEach((name, k) => {
    const map = loader.load(base + `${model.id}/expr_${name}.webp`);
    map.encoding = THREE.sRGBEncoding; map.anisotropy = 4;
    geos.forEach((q, part) => {
      if(name === "closed" && part === 1) return;      // closing the eyes leaves the mouth as it is
      const m = model.skin.clone();
      Object.assign(m, {map, transparent: true, opacity: 0, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4});
      // the painting goes on by its projection (uvDecal); the skin's normal map stays on the mesh's own uv. Without it the
      // patch shaded flat and lighter than the skin around it, a pale band over the eyes (user: "눈이 너무 어색해", 2026-10-24)
      m.onBeforeCompile = sh => {
        sh.vertexShader = "attribute vec2 uvDecal;\nvarying vec2 vDecalUv;\n" + sh.vertexShader.replace("#include <uv_vertex>", "#include <uv_vertex>\n  vDecalUv = uvDecal;");
        sh.fragmentShader = "varying vec2 vDecalUv;\n" + sh.fragmentShader.replace("#include <map_fragment>",
          "vec4 sampledDiffuseColor = texture2D(map, vDecalUv);\n  diffuseColor *= sampledDiffuseColor;");
      };
      m.customProgramCacheKey = () => "faceDecal";
      const d = new THREE.Mesh(q, m);
      d.position.copy(o.position); d.quaternion.copy(o.quaternion); d.scale.copy(o.scale);
      d.renderOrder = 1 + k; d.frustumCulled = false; d.visible = false;
      o.parent.add(d);
      model.decals.push({mesh: d, name, part});
    });
  });
}
/* Per frame: ease each painting toward its weight for the expression weights w (k: the ease step). The skin's x-ray fade
   and tint carry over; glow: its emissive. */
export function updateDecals(model, w, k, glow = 0){
  const dw = decalWeights(w), sk = model.skin, fade = sk.transparent ? sk.opacity : 1;
  model.decals.forEach(({mesh, name, part}) => {
    const m = mesh.material;
    m.userData.w = (m.userData.w || 0) + ((name === "fix" ? 1 : dw[name][part]) - (m.userData.w || 0))*k;
    m.opacity = m.userData.w*fade;
    mesh.visible = m.opacity > 0.004;
    m.color.copy(sk.color); m.emissiveIntensity = glow;
  });
}

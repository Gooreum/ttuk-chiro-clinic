import * as THREE from "three";
import { assetLoad } from "../platform/analytics.js";
import { slipPose } from "./towelMotion.js";
import { renderer, scene, camera, camBase, camLook } from "./renderer.js";
import { mats } from "./materials.js";
import { head, pivot, bodyParts, hands, handParts, forearms, xrayMats, crackFadeMats } from "./patientModel.js";
import { expressionWeights, decalWeights } from "../core/faceRig.js";
import { flinchProfile } from "../core/fail.js";
import { neckWeight, neckPinch, NECK_LEN, HEAD_NECK_LEN, UPPER_SHARE } from "../core/towel.js";
import { clamp } from "../lib/math.js";
import { S } from "../game/state.js";
import { prepareTowelNeck, showTowelNeck } from "./towelNeck.js";
import { withVisualIds } from "./visualBuild.js";
import { addArmRollRig, poseArmRollRig, wristAngles, limitWrist } from "./armRig.js";
import { finishTowelCharacter } from "./towelCharacterLook.js";
import { clinicSurface, clinicContactSamples, clinicContactShift } from "./clinicContact.js";

/* Realistic glTF models for every patient (AGENTS.md 2, "realistic assets"), one MakeHuman/MPFB2 character (CC0) each,
   built by scripts/assets/*.py from the presets in scripts/assets/patients.py, optimized copies in public/models/<id>.
   The roster's look.model names the id. The first patient loads first, the rest one after another in the background;
   until a patient's model is ready (or if it fails) the primitive version stays.
   Everything is parented under the existing `head` group, so the neck pivot, camera, aiming and judging are untouched.

   Therapist arms: MakeHuman/MPFB2 arms from the shoulder to the fingertips in a T-shirt sleeve (CC0, game_engine rig,
   baked skin), built by scripts/assets/mpfb_export_arms.py into public/models/hands/arms.glb. Real size, one armature
   per side, posed by a two-bone IK every frame (see "therapist arms" below).

   Patient body: the same character below mid-neck (scripts/assets/mpfb_export_body.py, public/models/patient01/body.glb),
   T-shirt and jeans tinted with the gown / pants palette, arms along the sides. It shares the head's GLB space, so it
   is placed with the head's transform at rest; its neck bone turns with the pivot, so the seam with the head stays shut. */
const BASE = import.meta.env.BASE_URL + "models/";
// GLTFLoader + meshopt decoder are loaded on demand (own chunk), so the main bundle stays as small as before
let loaderP = null;
function getLoader(){
  return loaderP || (loaderP = Promise.all([
    import("three/examples/jsm/loaders/GLTFLoader.js"),
    import("three/examples/jsm/libs/meshopt_decoder.module.js")
  ]).then(([{GLTFLoader}, {MeshoptDecoder}]) => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)));
}
/* Soft studio reflections for the realistic head only (eye catchlights, skin sheen). Built once, lazily. */
let envP = null;
export function getEnv(){
  return envP || (envP = import("three/examples/jsm/environments/RoomEnvironment.js").then(({RoomEnvironment}) => {
    const pm = new THREE.PMREMGenerator(renderer);
    const tex = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();
    return tex;
  }));
}
const load = url => getLoader().then(loader => new Promise((res, rej) => loader.load(url, res, undefined, rej)));
/* Shared with scene/xray.js (the spine model): path under public/models. */
export const loadModel = path => load(BASE + path);

/* Therapist fingers (game_engine rig: hand -> <finger>_01..03), see poseFingers below. */
const FINGERS = ["index", "middle", "ring", "pinky"];
const CURL = [0.28, 0.36, 0.22];     // _01, _02, _03 (radians) at grip 0
const CLINIC_CURL = [-0.04, 0.10, 0.08]; // shallow pads on a skull, rather than a power grip round a towel
const PILLAR_WRAP = [1.45, 0.28, 0.16];  // when the hand reaches across, fingers turn behind the occiput at the MCP
const SPREAD = [-0.08, -0.02, 0.04, 0.11];
const POWER_CURL = [1.02, 1.38, 0.8], POWER_THUMB = [-0.45, 0.25, 0.35];
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
function turn(bone, axis, angle){ bone.quaternion.multiply(_q.setFromAxisAngle(axis, angle)); }

const real = {arms: null, models: {}, towelModels: {}, clinicArms: null, towelArms: null};      // models[id] = {head, body, morphs, skin, hair, skinMesh, bodyMeshes}
let wantHands = false, wantModel = null, lastLook = null;

/* ---- patient head ----
   GLB space: metres, +Y up (crown), +Z = face. Measured on each export (mpfb_export_head.py, the MEASURE log line):
   crown y, chin y, back of skull z. The primitive head (head-local) has its crown at z -0.134, chin at z +0.142 and the
   back of the skull (resting on the pillow) at y -0.110. Fit crown/chin exactly with a uniform scale, rest the back of
   the skull where the old one rested, keep x centred. */
const MODELS = {
  patient01: {crown: 1.625, chin: 1.358, back: -0.062},
  patient02: {crown: 1.6154, chin: 1.3592, back: -0.0647},
  patient03: {crown: 1.6278, chin: 1.3606, back: -0.0611},
  patient04: {crown: 1.495, chin: 1.2016, back: -0.0559},
  patient05: {crown: 1.6113, chin: 1.3546, back: -0.0749},
  patient06: {crown: 1.6273, chin: 1.3669, back: -0.0612},   // chin: see below (thin neck)
  patient07: {crown: 1.5043, chin: 1.2129, back: -0.0539},
  patient08: {crown: 1.6227, chin: 1.3551, back: -0.1139},   // chin: see below (thick neck)
  patient09: {crown: 1.4897, chin: 1.1960, back: -0.0375},
  patient10: {crown: 1.3196, chin: 1.0637, back: -0.0471},
  patient11: {crown: 1.6484, chin: 1.3876, back: -0.045,     // image-to-3D, see below
    ear: [0.072, 0.015, 0.027], face: {x: 0, y: 1.51, size: 0.22, split: 0.375}},
  patient12: {crown: 1.6466, chin: 1.4150, back: -0.13,       // 마동철 image-to-3D, see below
    seam: {y: 1.45, rx: 0.12, rz: 0.14, len: 0.06}, face: {x: 0, y: 1.54, size: 0.24, split: 0.31}},
  patient13: {crown: 1.4910, chin: 1.1600, back: -0.20,       // 복순할매 image-to-3D, see below
    ear: [0.095, 0.045, 0.03], seam: {y: 1.21, rx: 0.10, rz: 0.12, cz: 0.03, len: 0.05}, face: {x: 0, y: 1.31, size: 0.22, split: 0.28}},
  patient14: {crown: 1.6801, chin: 1.3931, back: -0.15,       // 조멸치 image-to-3D, see below
    ear: [0.096, -0.021, 0.004], face: {x: 0, y: 1.515, size: 0.22, split: 0.34, fix: true}, twoSided: true}
};
/* patient11 (최필라) is not an MPFB export: a Tripo multi-view mesh cut at mid-neck by hand (scripts/assets/README.md). Its
   crown is the hair top, its chin is patient01's ratio from the chin tip (1.427), like 06/08. Its back is not the hair
   (-0.083) but where the body lies on the table: the hair bulk held the head 4 cm up and the whole body floated over the
   table, so the head sinks into the pillow a little instead. Clinic only: no towel-stage
   copy, so the towel queue skips it (NO_STAGE) instead of asking for files that are not there.
   ear: its real ear (head-local, s = +1), found on the skin-coloured vertices: the hair is the same mesh, so the hand
   poses cannot measure it (borrowedPoses). face: the square its expression paintings cover (faceDecals). */
/* patient12 (마동철, user: "마동철도 만들어보자", 2026-10-24): the same pipeline, but his neck is buried in the traps. A flat cut
   took the traps beside the jaw along with the head (they swung with it), and its wide seam twisted the chest down to the
   shirt. The head is cut at the jaw line (z 1.45) inside an upright elliptic wall up to the traps' top (seam: rx across, rz
   front-back, the same as image3d_patient.py's); neckColumn weighs the body from that seam, the twist within seam.len.
   face: the square of its expression paintings, split between the nose and the mouth (faceDecals, as for patient11).
   Only 마동철 himself uses it, and only in 목꺾기 (look.clinicModel): 목뽑기 and the cast who borrow his build (근육왕,
   메가회장, whose CAST_LOOK paints the MPFB hair and shirt) keep patient08. */
/* patient13 (복순할매, user: "이제 할머니도 해보자", 2026-10-24): the same as patient12, but hunched, her face far ahead of
   the neck and her chin almost on her chest. The cut sits under the chin (z 1.21) and the ellipse moves forward with the
   face (seam.cz, GLB z) so the jaw goes with the head and the hump behind stays on the body. back: her upper back
   (-0.22), not the back of her skull (-0.16), lies on the table. ear: under the perm, as for patient11 (borrowedPoses). Only she uses it, only in 목꺾기: 목뽑기 and 강해녀, 사모님 keep
   patient09. */
/* patient14 (조멸치, user: "멸치남자도 3D 모델 만들고 목꺾기만 일단 진행해. 눈 디테일 신경쓰고", 2026-10-24): the same as
   patient11. His thin neck shows under the jaw, so a flat cut (z 1.42) does; the spiky hair is the crown, the chin is
   patient01's ratio from the chin tip (1.4365), back is his shoulders (-0.15), not the hair. ear: under the hair, as for
   patient11 (borrowedPoses). face.fix: the bangs were thin flaps with skin baked on (cut off, image3d_flaps.py) and the
   scan left smudges on the brow and forehead, a smear on one eye and a glint in the nose, so a corrected front painting
   (expr_fix) lies on the face all the time, under the expressions. twoSided: the cut flaps leave the hairline open. Only he uses it, only
   in 목꺾기: 목뽑기 and 이마라톤, 이스쿠터 keep patient06. */
const NO_STAGE = new Set(["patient11", "patient12", "patient13", "patient14"]);
/* patient06 (very thin neck) and patient08 (very thick neck): the MEASURE chin (lowest centre-line point in front of
   y -0.07) lands on the underside of the jaw for one and low on the fat neck for the other, which would scale their heads
   (and bodies) 17% up / 8% down. Their chin is instead crown - 0.267 x (crown - chin tip) / 0.2266, patient01's ratio,
   so their heads come out patient01-sized (scripts/assets/README.md). */
const PRIM = {crown: -0.134, chin: 0.142, back: -0.110};
const TOWEL_REST_HEAD = head.position.clone();
function glbRoot(g){
  const scale = (PRIM.chin - PRIM.crown) / (g.crown - g.chin);
  const root = new THREE.Group();
  root.rotation.x = -Math.PI/2;                          // +Y (crown) -> -z (camera side), +Z (face) -> +y (ceiling)
  root.scale.setScalar(scale);
  root.position.set(0, PRIM.back - g.back*scale, PRIM.crown + g.crown*scale);
  return root;
}
// MakeHuman hair proxies (material name ends with the asset name)
const HAIR = /\.(short0\d|long0\d|bob0\d|ponytail0\d|braid0\d|afro0\d)$/;
function placeHead(gltf, env, g, model){
  const root = glbRoot(g);
  gltf.scene.traverse(o => {
    if(!o.isMesh) return;
    const src = o.material, name = src.name || "";
    let m = new THREE.MeshStandardMaterial({map: src.map, normalMap: src.normalMap || null, roughness: 0.6, metalness: 0, envMap: env, envMapIntensity: 0.35});
    if(model.towelStage && name.endsWith(".accessory")){
      m.color.copy(src.color); m.roughness = 0.62; m.metalness = 0.08;
    }
    else if(name.endsWith(".body")){
      // skin: a reddish sheen on grazing angles stands in for light scattering under the skin
      m = new THREE.MeshPhysicalMaterial({map: src.map, normalMap: src.normalMap || null, roughness: 0.52, metalness: 0,
        sheen: 0.45, sheenColor: new THREE.Color(0xb04030), sheenRoughness: 0.6, specularIntensity: 0.5,
        envMap: env, envMapIntensity: 0.22});
      if(model.towelStage){ m.normalScale.copy(src.normalScale); m.roughness = 0.6; m.sheen = 0.24; }
      m.emissive = new THREE.Color(0xff7a59); m.emissiveIntensity = 0; model.skin = m; model.skinMesh = o;
      if(g.twoSided) m.side = THREE.DoubleSide;     // a hairline opened by image3d_flaps.py shows the hair behind, not the table
    }
    else if(name.endsWith(".cornea")){
      // clear glossy shell over the eye: only reflections (catchlights), nothing diffuse
      m = new THREE.MeshPhysicalMaterial({color: 0x000000, roughness: 0.04, metalness: 0, envMap: env, envMapIntensity: 1.6,
        transparent: true, opacity: 0.18, depthWrite: false});
    }
    else if(name.endsWith(".high-poly")){
      // eyeball. Older exports carry the cornea shell in a fully transparent texture corner: discard it.
      // A little self-light keeps the sclera readable in the sockets.
      m.roughness = 0.3; m.alphaTest = 0.5; m.emissive = new THREE.Color(0xffffff); m.emissiveMap = src.map; m.emissiveIntensity = 0.1;
    }
    else if(HAIR.test(name)){
      // hair cards: alpha-to-coverage gives soft MSAA edges instead of a jagged cutout
      m.alphaTest = 0.35; m.alphaToCoverage = true; m.side = THREE.DoubleSide; m.roughness = 0.5; m.envMapIntensity = 0.25; model.hair = m;
    }
    else if(name.includes("teeth")){
      // ivory, not paper white, and dimmer than the lips: inside the mouth they sit in shade
      m.color = new THREE.Color(0xb8ad99); m.roughness = 0.5; m.envMapIntensity = 0.35;
    }
    else if(name.includes("tongue")){ m.roughness = 0.5; m.color = new THREE.Color(0xb0a0a0); }
    else { m.transparent = true; m.depthWrite = false; m.alphaTest = 0.02; m.side = THREE.DoubleSide; }   // soft brows/lashes
    if(model.towelStage) finishTowelCharacter(m, src);
    o.material = m;
    const face = name.endsWith(".high-poly") || name.endsWith(".cornea") || /eyebrow|eyelash/.test(name) || /teeth|tongue/.test(name);
    o.castShadow = !face; o.receiveShadow = !face;          // eyeballs sit inside the skull: no self-shadow on them
    o.frustumCulled = false;
    if(o.morphTargetDictionary) model.morphs.push(o);
    // the x-ray fade toggles `transparent` on its materials every frame, which would turn the soft brows/lashes
    // into solid strips, so those two stay out of it (they are thin enough to read through anyway)
    if(!m.transparent) xrayMats.push(m);
  });
  if(g.face && model.skinMesh && !model.towelStage) faceDecals(model, g.face, gltf.scene);
  root.add(gltf.scene);
  root.visible = false;
  head.add(root);
  return root;
}
/* A head without blendshapes (patient11: image-to-3D, its eyes painted open, user: "표정이 시체 같음", 2026-10-24): each face
   is a painting over its front view (scripts/assets/image3d_expr.py), laid on the skin's own front-facing triangles inside
   the painted square, projected straight on. The brows / eyes patch and the mouth patch fade apart (core/faceRig.js
   decalWeights); the paintings stack in DECALS order. Only the changed parts are opaque in each. */
const DECALS = ["closed", "smile", "squeeze", "open"], FRONT_DEPTH = 0.025;
const _dv = new THREE.Vector3();
function faceDecals(model, F, scene){
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
    const map = loader.load(BASE + `${model.id}/expr_${name}.webp`);
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

/* ---- patient body ----
   Head space at rest = the pivot's rest position plus the head offset (the pivot has no rotation at rest), so a frame
   there plus the head's GLB root puts the body exactly under the head. Every frame the neck bone gets the pivot's
   current turn about the pivot itself (D = pivot * pivotRest^-1), the same motion the head makes. */
const _D = new THREE.Matrix4(), _P0 = new THREE.Matrix4(), _M = new THREE.Matrix4(), _St = new THREE.Matrix4();
function placeBody(gltf, env, g, model){
  const frame = new THREE.Group();
  frame.position.copy(pivot.position).add(head.position);
  const root = glbRoot(g);
  frame.add(root); root.add(gltf.scene);
  const morphs = [];
  gltf.scene.traverse(o => {
    if(!o.isMesh) return;
    const src = o.material, name = src.name || "";
    let m;
    if(name.endsWith(".skin")){
      // plain standard skin: the body covers a lot of screen, the sheen of the face and hands would cost fill rate
      m = new THREE.MeshStandardMaterial({map: src.map, roughness: 0.58, metalness: 0, envMap: env, envMapIntensity: 0.22});
      if(model.towelStage){ m.normalMap = src.normalMap; m.normalScale.copy(src.normalScale); m.roughness = 0.65; }
      m.userData.bodySkin = true;       // castTone() tints it with the head
      xrayMats.push(m);                 // the neck fades under the x-ray like the head
    }else{
      // ambient-occlusion map as the base colour, multiplied by the palette colour: folds without the original print
      m = new THREE.MeshStandardMaterial({map: src.map, normalMap: src.normalMap, roughness: 0.9, metalness: 0, envMap: env, envMapIntensity: 0.15});
      m.color = model.towelStage ? src.color.clone() : (name.endsWith(".pants") ? mats.pants : mats.gown).color;
      if(model.towelStage) m.normalScale.copy(src.normalScale);     // shared: follows the patient's gown colour
      if(name.endsWith(".shirt")){ crackFadeMats.push(m); m.userData.shirt = m.color.clone(); }
    }
    if(model.towelStage) finishTowelCharacter(m, src);
    o.material = m; o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
    if(!name.endsWith(".skin") && o.isSkinnedMesh) pinToBody(o);
    if(name.endsWith(".skin") && o.isSkinnedMesh) neckColumn(o, m, model);
    if(model) (model.bodyMeshes || (model.bodyMeshes = [])).push(o);
    if(o.morphTargetDictionary && o.morphTargetDictionary.breath !== undefined) morphs.push(o);
  });
  frame.visible = false;
  scene.add(frame);
  frame.updateMatrixWorld(true);
  const neck = gltf.scene.getObjectByName("neck");
  frame.userData = {morphs, neck, parentInv: neck.parent.matrixWorld.clone().invert(), neckRest: neck.matrixWorld.clone(), z0: frame.position.z};
  _P0.makeTranslation(pivot.position.x, pivot.position.y, pivot.position.z).invert();
  return frame;
}
/* The clothes stay on the trunk: the towel mode's neck stretch (updateRealBody) moves the neck bone, and the shirt
   collar weighted to it stretched like taffy with the skin (user: "목 살이 늘어나야 하는데 옷이 늘어나서 기괴해져버림",
   2026-10-15). Only the skin follows the neck now; the collar's neck weights go to the trunk bone. */
function pinToBody(o){
  const bones = o.skeleton.bones, ni = bones.findIndex(b => b.name === "neck"), bi = bones.findIndex(b => b.name === "body");
  if(ni < 0 || bi < 0) return;
  const si = o.geometry.attributes.skinIndex;
  for(let i = 0; i < si.array.length; i++) if(si.array[i] === ni) si.array[i] = bi;
  si.needsUpdate = true;
}
/* The neck stretches as a neck (user: "목이 과장되게 늘어날거면 진짜 목처럼 늘어나야지. 지금은 무슨 승모근이 그대로
   올라오냐고.. 더 얇게 올라와야 한다고", 2026-10-16). scripts/assets/mpfb_export_body.py fades the neck bone's weight by
   straight distance from the head seam, so it spilled sideways onto the trapezius slope and the shoulders rode up with
   the neck. Here the skin's weights are redone about the column's axis (core/towel.js neckWeight): only the thin column
   under the seam follows; it thins evenly as it stretches, easing off at the collarbones (a vertex-shader pinch, uPinch set per frame;
   neckHead does the upper neck on the head mesh). Geometry space: the body stands along +y with the seam ring on top. */
/* The mesh is coarse where the neck meets the shoulders: the radial cut-off left triangles going from 0.8 to 0 in one
   step, which tore into slivers as the neck drew out. A few rounds of averaging over the mesh neighbours soften it;
   vertices split at the same spot (UV seams) are kept equal so the skin does not crack. */
function smoothWeights(geo, w, fixed, rounds){
  const P = geo.attributes.position, n = P.count, idx = geo.index ? geo.index.array : null;
  if(!idx) return;
  const key = new Map(), weld = new Int32Array(n);
  for(let i = 0; i < n; i++){
    const k = Math.round(P.getX(i)*1e4) + "," + Math.round(P.getY(i)*1e4) + "," + Math.round(P.getZ(i)*1e4);
    if(!key.has(k)) key.set(k, key.size);
    weld[i] = key.get(k);
  }
  const m = key.size, sum = new Float32Array(m), cnt = new Float32Array(m), cur = new Float32Array(m), pin = new Uint8Array(m);
  for(let i = 0; i < n; i++){ cur[weld[i]] = w[i]; if(fixed[i]) pin[weld[i]] = 1; }
  for(let r = 0; r < rounds; r++){
    sum.fill(0); cnt.fill(0);
    for(let f = 0; f < idx.length; f += 3) for(let e = 0; e < 3; e++){
      const a = weld[idx[f + e]], b = weld[idx[f + (e + 1)%3]];
      sum[a] += cur[b]; cnt[a]++; sum[b] += cur[a]; cnt[b]++;
    }
    for(let v = 0; v < m; v++) if(!pin[v] && cnt[v]) cur[v] = 0.5*cur[v] + 0.5*sum[v]/cnt[v];
  }
  for(let i = 0; i < n; i++) w[i] = cur[weld[i]];
}
// a drawn-out neck is a cylinder: the slope's normals (along the neck's axis, +-y) turn out to the side with the stretch,
// or the stretched skin keeps the shoulder slope's shading and reads as a dark band
const NECK_NORMAL = a => `  objectNormal.y *= 1.0 - clamp(uPinch*4.0, 0.0, 1.0)*${a}*0.85; objectNormal = normalize(objectNormal);`;
function neckColumn(o, mat, model){
  const bones = o.skeleton.bones, ni = bones.findIndex(b => b.name === "neck"), bi = bones.findIndex(b => b.name === "body");
  if(ni < 0 || bi < 0) return;
  const P = o.geometry.attributes.position, n = P.count, seam = model && MODELS[model.id] && MODELS[model.id].seam;
  let top = -Infinity, cx = 0, cz = 0, k = 0, R0 = 0, len;
  let X = i => P.getX(i), Y = i => P.getY(i), Z = i => P.getZ(i);
  let rOf = i => Math.hypot(X(i) - cx, Z(i) - cz);
  if(seam){
    // a neck buried in the traps (patient12): the cut, not the highest point (the traps beside the jaw rise past it); r is
    // scaled across the seam's ellipse so its wall gets the full weight (r < NECK_IN R0), and the twist stays within
    // seam.len under the jaw instead of NECK_LEN seam radii down the chest. In the export's metres: the quantized
    // positions come back through the "body" bone's inverse bind (its head at y 0.95, image3d_patient.py).
    const M = new THREE.Matrix4().makeTranslation(0, 0.95, 0).multiply(o.skeleton.boneInverses[bi]), q = new Float32Array(3*n), v = new THREE.Vector3();
    for(let i = 0; i < n; i++) v.fromBufferAttribute(P, i).applyMatrix4(M).toArray(q, 3*i);
    X = i => q[3*i]; Y = i => q[3*i + 1]; Z = i => q[3*i + 2];
    const Rm = (seam.rx + seam.rz)/2;
    top = seam.y; R0 = Rm/1.15; len = seam.len; cz = seam.cz || 0;       // cz: the ellipse sits ahead of a hunched neck (patient13)
    rOf = i => Math.hypot(X(i)/seam.rx, (Z(i) - cz)/seam.rz)*Rm;
  } else {
    for(let i = 0; i < n; i++) top = Math.max(top, Y(i));
    for(let i = 0; i < n; i++) if(Y(i) > top - 0.004){ cx += X(i); cz += Z(i); k++; }
    cx /= k; cz /= k;
    for(let i = 0; i < n; i++) if(Y(i) > top - 0.004) R0 += rOf(i)/k;
    len = NECK_LEN*R0;
  }
  const si = o.geometry.attributes.skinIndex, sw = o.geometry.attributes.skinWeight, full = sw.normalized ? 255 : 1;
  const ws = new Float32Array(n), fixed = new Uint8Array(n);
  for(let i = 0; i < n; i++){
    const r = rOf(i);
    ws[i] = neckWeight((top - Y(i))/len, r, R0);
    if(Y(i) > top - 0.004 || r > 2*R0) fixed[i] = 1;           // the seam ring stays on the head, the shoulders on the trunk
  }
  smoothWeights(o.geometry, ws, fixed, 4);
  const pinch = new Float32Array(n);
  for(let i = 0; i < n; i++){
    const w = ws[i];
    si.array.set([bi, ni, 0, 0], i*4);
    sw.array.set([Math.round((1 - w)*full), Math.round(w*full), 0, 0], i*4);
    pinch[i] = w;
  }
  si.needsUpdate = sw.needsUpdate = true;
  o.geometry.setAttribute("aPinch", new THREE.BufferAttribute(pinch, 1));
  const uPinch = {value: 0}, uNeckC = {value: new THREE.Vector3(cx, 0, cz)};
  mat.onBeforeCompile = sh => {
    sh.uniforms.uPinch = uPinch; sh.uniforms.uNeckC = uNeckC;
    sh.vertexShader = "attribute float aPinch;\nuniform float uPinch;\nuniform vec3 uNeckC;\n" + sh.vertexShader.replace("#include <morphtarget_vertex>",
      "#include <morphtarget_vertex>\n  { vec2 d = transformed.xz - uNeckC.xz; transformed.xz = uNeckC.xz + d*(1.0 - uPinch*smoothstep(0.0, 0.4, aPinch)); }")
      .replace("#include <morphnormal_vertex>", "#include <morphnormal_vertex>\n" + NECK_NORMAL("aPinch"));
  };
  mat.customProgramCacheKey = () => "neckColumn";
  if(model){ model.neckPinch = uPinch; model.neckSkin = o; }
}
/* The upper neck on the head mesh draws out too (core/towel.js UPPER_SHARE): its vertices from the seam up to under the
   jaw lag back toward the body (uLag, the head's geometry +y points to the crown) and thin with the column. The seam
   ring, found from the body's seam in world space, gives the axis; once both meshes of a patient are placed. */
const _hv = new THREE.Vector3(), _hm = new THREE.Matrix4(), _hs = new THREE.Vector3();
function neckHead(model){
  const bo = model.neckSkin, ho = model.skinMesh;
  if(!bo || !ho || !model.neckPinch) return;
  // at rest: the pivot unturned, as placeBody laid the body frame out (its neck bone is still at rest, nothing drives it yet)
  const rot = pivot.rotation.clone();
  pivot.rotation.set(0, 0, 0); pivot.updateMatrixWorld(true);
  model.body.updateWorldMatrix(true, true); ho.updateWorldMatrix(true, false);
  const BP = bo.geometry.attributes.position, SI = bo.geometry.attributes.skinIndex.array, SW = bo.geometry.attributes.skinWeight;
  const full = SW.normalized ? 255 : 1, inv = new THREE.Matrix4().copy(ho.matrixWorld).invert();
  // Rest-space correspondence across the actual (uneven) export cut, using the
  // same manual skin transform as the seam probe, rather than boneTransform.
  const bi = bo.skeleton.bones.findIndex(b => b.name === "body");
  model.neckBodyFrame = new THREE.Matrix4().multiplyMatrices(bo.skeleton.bones[bi].matrixWorld, bo.skeleton.boneInverses[bi])
    .multiply(bo.bindMatrix).invert().multiply(ho.matrixWorld);
  let top = -Infinity;
  for(let i = 0; i < BP.count; i++) top = Math.max(top, BP.getY(i));
  const ring = [];
  for(let i = 0; i < BP.count; i++){
    if(BP.getY(i) <= top - 0.004) continue;
    const p0 = new THREE.Vector3().fromBufferAttribute(BP, i).applyMatrix4(bo.bindMatrix), acc = new THREE.Vector3();
    for(let k = 0; k < 4; k++){
      const w = SW.array[i*4 + k]/full, b = SI[i*4 + k];
      if(w) acc.addScaledVector(_hv.copy(p0).applyMatrix4(_hm.multiplyMatrices(bo.skeleton.bones[b].matrixWorld, bo.skeleton.boneInverses[b])), w);
    }
    ring.push(acc.applyMatrix4(inv));
  }
  pivot.rotation.copy(rot); pivot.updateMatrixWorld(true);
  if(!ring.length) return;
  const c = ring.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1/ring.length);
  const R0 = ring.reduce((a, p) => a + Math.hypot(p.x - c.x, p.z - c.z), 0)/ring.length;
  const P = ho.geometry.attributes.position, aw = new Float32Array(P.count), fixed = new Uint8Array(P.count);
  for(let i = 0; i < P.count; i++){
    const r = Math.hypot(P.getX(i) - c.x, P.getZ(i) - c.z);
    aw[i] = neckWeight((P.getY(i) - c.y)/(HEAD_NECK_LEN*R0), r, R0);
    if((P.getY(i) < c.y && r < 1.2*R0) || r > 2*R0) fixed[i] = 1;    // the skirt under the seam rides with it; the jaw and skull stay
  }
  smoothWeights(ho.geometry, aw, fixed, 4);
  ho.geometry.setAttribute("aNeck", new THREE.BufferAttribute(aw, 1));
  ho.matrixWorld.decompose(_hv, new THREE.Quaternion(), _hs);
  const uLag = {value: 0}, uNeckC = {value: c.clone()}, uPinch = model.neckPinch, mat = ho.material, prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if(prev) prev(sh, r);
    sh.uniforms.uLag = uLag; sh.uniforms.uPinch = uPinch; sh.uniforms.uNeckC = uNeckC;
    sh.vertexShader = "attribute float aNeck;\nuniform float uLag;\nuniform float uPinch;\nuniform vec3 uNeckC;\n" + sh.vertexShader.replace("#include <morphtarget_vertex>",
      "#include <morphtarget_vertex>\n  { vec2 d = transformed.xz - uNeckC.xz; transformed.xz = uNeckC.xz + d*(1.0 - uPinch*smoothstep(0.0, 0.4, aNeck)); transformed.y -= uLag*aNeck; }")
      .replace("#include <morphnormal_vertex>", "#include <morphnormal_vertex>\n" + NECK_NORMAL("aNeck"));
  };
  mat.customProgramCacheKey = () => "neckHead";
  mat.needsUpdate = true;
  model.neckLag = uLag; model.headUnit = _hs.x;     // world metres per head geometry unit
  // Separate geometry/materials: clinic keeps its original skinning and shader byte for byte.
  model.towelNeckFrame = {center: c, radius: R0};
}
const current = () => wantModel && (real.towelModels[wantModel] || real.models[wantModel]);
const allModels = () => [...Object.values(real.models), ...Object.values(real.towelModels)];
// the breath shape: 2.6 cm chest rise, a softer 1.6 cm belly swell, 3 cm shrug
// (2026-10-15: the user asked twice for a bigger body breath; a 2.2x gain on a belly-centred shape then read as a
// grotesque belly balloon, so the shape itself is now chest-led and gentle, with a bigger shrug, at 1x)
const BREATH_GAIN = 1;
/* Per frame from the loop, after the pivot has its rotation. fill: breath 0 (out) .. 1 (in). Towel mode: s, how far
   the head is pulled (m, along the pivot's -z; the neck bone goes with it), body, how far the body slides up the table
   (world -z, a small share of s, core/towel.js BODY_SHARE); the neck skin stretches by the difference. The neck bone is
   solved in the slid body frame: undo the frame's slide, then the head's own transform. */
export function updateRealBody(fill, s = 0, body = s){
  const cur = current();
  if(!cur || !cur.body.visible) return;
  if(S.game === "towel" && !cur.towelNeck && cur.towelNeckFrame){
    const f = cur.towelNeckFrame;
    xrayMats.push(...prepareTowelNeck(cur, f.center, f.radius));
  }
  showTowelNeck(cur, S.game === "towel");
  const {morphs, neck, parentInv, neckRest, z0} = cur.body.userData;
  cur.body.position.z = z0 - body;
  // the upper neck on the head takes UPPER_SHARE of the stretch, so the seam and the neck bone lag the head by that much
  const lag = Math.max(0, s - body)*(cur.neckLag ? UPPER_SHARE : 0);
  if(cur.neckPinch) cur.neckPinch.value = neckPinch(s - body);
  if(cur.neckLag) cur.neckLag.value = lag/cur.headUnit;
  pivot.updateMatrix();
  _D.makeTranslation(0, 0, body).multiply(pivot.matrix).multiply(_St.makeTranslation(0, 0, -(s - lag))).multiply(_P0);
  _M.multiplyMatrices(parentInv, _D).multiply(neckRest);
  _M.decompose(neck.position, neck.quaternion, neck.scale);
  morphs.forEach(o => { o.morphTargetInfluences[o.morphTargetDictionary.breath] = fill*BREATH_GAIN; });
}

/* One patient's head + body. Resolves once both are placed (hidden); shows them if that patient is on the table. */
function loadPatientModel(id, towelStage = false){
  const model = {id, head: null, body: null, morphs: [], skin: null, hair: null, towelStage};
  const base = BASE + (towelStage ? "towel-stage/" : "");
  return Promise.all([load(base + `${id}/${id}.glb`), load(base + `${id}/body.glb`), getEnv()]).then(([gh, gb, env]) => {
    const place = () => {
      model.head = placeHead(gh, env, MODELS[id], model);
      model.body = placeBody(gb, env, MODELS[id], model);
      neckHead(model);
    };
    if(towelStage) withVisualIds(() => {
      // Loading may finish during a tug. Build the seam in the saved rest frame, then restore the live pose atomically.
      const position = head.position.clone(), rotation = pivot.rotation.clone();
      try {
        head.position.copy(TOWEL_REST_HEAD); pivot.rotation.set(0, 0, 0); pivot.updateMatrixWorld(true);
        place();
      } finally {
        head.position.copy(position); pivot.rotation.copy(rotation); pivot.updateMatrixWorld(true);
      }
    }); else place();
    (towelStage ? real.towelModels : real.models)[id] = model;
    if(wantModel === id) setRealPatient(id, lastLook);
  });
}
/* Ten bodies are ~10 MB, so they come one at a time and the body on the table goes first: setRealPatient asks for its
   model at once and the background queue always takes the wanted model before the next one in MODELS order. */
const loading = {};
const needModel = (id, towelStage = false) => loading[(towelStage ? "t:" : "") + id] || (loading[(towelStage ? "t:" : "") + id] = loadPatientModel(id, towelStage));
function loadQueue(towelStage){
  const next = () => {
    const id = [wantModel, ...Object.keys(MODELS)].find(i => MODELS[i] && !(towelStage && NO_STAGE.has(i)) && !loading[(towelStage ? "t:" : "") + i]);
    return id ? needModel(id, towelStage).catch(err => { console.warn("realistic patient not loaded, keeping primitives", id, err); }).then(next) : null;
  };
  return Promise.resolve().then(next);
}
let towelAssetsP = null;
// Both suite modes share the detailed art; original models remain the asynchronous/failure fallback.
function loadTowelCharacters(){
  if(towelAssetsP) return towelAssetsP;
  document.documentElement.dataset.towelCharacters = "loading";
  const patients = loadQueue(true);
  const arms = Promise.all([load(BASE + "towel-stage/hands/arms.glb"), getEnv()]).then(([g, env]) => {
    withVisualIds(() => {
      const made = {}, matFor = src => made[src.name] || (made[src.name] = armMaterial(src, env, true));
      scene.add(g.scene);
      real.towelArms = [placeArm(g.scene.getObjectByName("therapist_arm_r"), -1, matFor, true), placeArm(g.scene.getObjectByName("therapist_arm_l"), 1, matFor, true)];
      real.towelArms.forEach(a => { a.root.visible = false; });
      Object.values(made).forEach(m => crackFadeMats.push(m));
      syncArms();
    });
    document.documentElement.dataset.towelHands = "ready";
  });
  towelAssetsP = Promise.all([patients, arms]).then(() => {
    document.documentElement.dataset.towelCharacters = "ready";
  }).catch(err => {
    console.warn("towel character variants not loaded, keeping original assets", err);
    document.documentElement.dataset.towelCharacters = "failed";
  });
  return towelAssetsP;
}
export function loadRealAssets(){
  const first = wantModel && MODELS[wantModel] ? wantModel : Object.keys(MODELS)[0], t0 = performance.now();
  needModel(first).then(() => {
    document.documentElement.dataset.head = "ready";
    assetLoad("patient_first", true, t0);
  }).catch(err => {
    console.warn("realistic patient not loaded, keeping primitives", first, err);
    document.documentElement.dataset.head = "failed";
    assetLoad("patient_first", false, t0, err && err.message);
  }).then(() => loadQueue(false));
  Promise.all([load(BASE + "hands/arms.glb"), getEnv()]).then(([g, env]) => {
    const made = {};
    const matFor = src => made[src.name] || (made[src.name] = armMaterial(src, env));
    scene.add(g.scene);
    real.clinicArms = [placeArm(g.scene.getObjectByName("therapist_arm_r"), -1, matFor), placeArm(g.scene.getObjectByName("therapist_arm_l"), 1, matFor)];
    real.clinicArms.forEach(a => { a.root.visible = false; });
    Object.values(made).forEach(m => crackFadeMats.push(m));
    syncArms();
    document.documentElement.dataset.hands = "ready";
    assetLoad("arms", true, t0);
  }).catch(err => {
    console.warn("realistic arms not loaded, keeping primitives", err);
    document.documentElement.dataset.hands = "failed";
    assetLoad("arms", false, t0, err && err.message);
  });
}
/* Arm materials: baked skin (diffuse x occlusion) with the face's soft sheen; the sleeve and its hem keep the shirt's
   occlusion as base colour and are tinted with the palette's coat (white) and cuff (teal) colours. */
function armMaterial(src, env, towelStage = false){
  const name = src.name || "";
  if(name.endsWith(".skin")){
    const skin = new THREE.MeshPhysicalMaterial({map: src.map, normalMap: towelStage ? src.normalMap : null, normalScale: towelStage ? src.normalScale : new THREE.Vector2(1, 1), roughness: towelStage ? 0.64 : 0.55, metalness: 0,
    sheen: 0.4, sheenColor: new THREE.Color(0xb04030), sheenRoughness: 0.6, specularIntensity: 0.45,
      envMap: env, envMapIntensity: 0.25});
    return towelStage ? finishTowelCharacter(skin, src) : skin;
  }
  const m = new THREE.MeshStandardMaterial({map: src.map, normalMap: src.normalMap || null, roughness: 0.85, metalness: 0,
    envMap: env, envMapIntensity: 0.15, side: THREE.DoubleSide});      // the sleeve is an open tube: its inside shows
  m.color = towelStage ? src.color.clone() : (name.endsWith(".hem") ? mats.cuff : mats.coat).color;
  if(towelStage) m.normalScale.copy(src.normalScale);     // shared: follows the palette
  return towelStage ? finishTowelCharacter(m, src) : m;
}

/* ---- therapist arms ----
   public/models/hands/arms.glb (scripts/assets/mpfb_export_arms.py): per side an armature therapist_arm_<l|r>
   (upperarm at the shoulder -> lowerarm -> hand -> thumb/index/middle/ring/pinky 01-03), the skinned arm and the
   T-shirt sleeve with its hem band. The arms live in world space, not under `head`: each shoulder is anchored below
   and beside the camera (the therapist's eyes, off screen), the palm goes where the hand pose puts it on the patient,
   and a two-bone IK finds the elbow (solveArm). The poses are measured on each patient's own skin mesh (measureHead),
   from the 98-video reference (2026-10-15):
     rest / cup  both palms cup the jaw angles and cheeks, fingertips behind the neck under the ears
     contact     (the side opposite the face turn, now facing up) index knuckle on the articular pillar behind and
                 below the jaw angle, under the ear lobe; palm over the side of the neck and jaw, thumb along the jaw
                 toward the chin, the other fingers wrapping behind the neck. Crack: a short rotational push toward
                 the opposite eye and a squeeze
     support     (the side the face turns to) palm under the ear and the back of the skull, fingers spread under it,
                 carrying the head's weight
   head-local frame: +y = face (ceiling), -z = crown (camera side), +z = feet. s = +1 on world +x (screen left, the
   therapist's left hand), -1 on world -x (the right hand). */
const ARM_A = 0.2335, ARM_B = 0.2374, ARM_MAX = 0.97*(ARM_A + ARM_B);   // upper arm, forearm (export log LEN)
const PALM_IN = 0.021;          // bone line -> palm skin is 0.0288 (export PALM_DEPTH): less, so the palm presses in a touch
/* Shoulder anchor from the camera's base position (s mirrors x): where a therapist bent over the head end has his
   shoulders, 0.33 m below the eyes, 0.19 m to the sides and a little behind them, so the upper arm never shows; the
   hands then reach the head with the elbows bent about 95-115 deg. (0.27 m below and the elbows free to rise read as
   "squid arms" on the phone, 2026-10-15: upper arms in from the screen sides, elbows bulging up next to the head.) */
const SHOULDER = [0.19, -0.33, -0.03];
const _shT = new THREE.Vector3();
/* The elbows stay below the bottom edge of the therapist's resting view (camBase -> camLook): only the forearms rise
   into the frame from the bottom / bottom corners, as in a chest-cam video. NDC y the elbow keeps under, and how hard. */
const ELBOW_VIEW_Y = -1.12, ELBOW_VIEW_K = 25, ELBOW_VIEW_CORNER = 1.0;
/* The trunk follows the camera's small moves (the set-up lean, the thrust dip, the sway) within 5 cm, smoothed so
   the camera shake never jitters; the big ones (the x-ray orbit, the reaction close-up) are the camera's alone. */
const SHOULDER_FOLLOW = 0.8, SHOULDER_FOLLOW_MAX = 0.05;
/* After the crack (x-ray time): the palms cup the cheeks and roll the head back to the middle, then let go and draw
   back toward the therapist (below the frame) so the face's reaction reads; the pat comes from there. */
const CUP_AT = 1.9, AWAY_AT = 3.0;
const AWAY = [0.26, -0.4, 0.08];                    // palm, from the camera's base position (x mirrored): off screen
/* Poses on the head, relative to the ear (the outermost skin point on that side, scaled by the head's width).
   around: radians about the head's long axis from straight out to the side, + toward the back of the neck / table,
   - toward the face. dz: metres from the ear toward the feet. lift: palm skin off the surface.
   fingers: where the fingers point (head-local, x mirrored), laid onto the surface. grip: finger curl 0..1.
   roll: extra turn of the hand about its finger axis (+ = thumb side away from the skin). */
const HAND_POSES = {
  rest:    {around: -0.3, dz: 0.05,  lift: 0.006, fingers: [0, -0.72, 0.7], grip: 0.3, roll: 0},
  cup:     {around: -0.45, dz: 0.035, lift: 0.004, fingers: [0, -0.7, 0.72], grip: 0.45, roll: 0},
  contact: {around: 0.2,  dz: 0.065, lift: 0.002, fingers: [0, -0.85, 0.52], grip: 0.75, roll: 0},
  support: {around: -0.35, dz: 0.0,  lift: 0.006, fingers: [0, -0.9, 0.42], grip: 0.6, roll: 0}
};
// Clinic palms sit below the ear, with the fingers following the occiput/neck rather than pointing down through
// the cheek. Keep the traction's original measurement table: its transition into the towel grip is unchanged.
const CLINIC_HAND_POSES = {
  rest:    {around: 0.20, dz: 0.005, lift: 0.025, fingers: [0, -0.25, 0.97], grip: 0.20, roll: 0},
  cup:     {around: 0.43, dz: -0.008, lift: 0.025, fingers: [0, -0.20, 0.98], grip: 0.26, roll: 0},
  contact: {around: 0.15, dz: 0.030, lift: 0.040, fingers: [0, -0.28, 0.96], grip: 0.42, roll: 0},
  support: {around: 0.52, dz: -0.018, lift: 0.035, fingers: [0, -0.18, 0.98], grip: 0.24, roll: 0}
};
const POSE_NAMES = Object.keys(HAND_POSES);
// the elbow's preferred side per role (world, x mirrored): always out and down toward the floor, next to the
// therapist's body; the support elbow lowest (forearm low and flat), the contact elbow a little higher and further
// out (its forearm rises steeper onto the up-side neck)
const POLES = {rest: [1, -0.6, -0.3], contact: [1, -0.45, -0.35], support: [1, -0.7, -0.25], pat: [0.6, -1, -0.4], away: [0.6, -1, -0.2], towel: [1, -0.55, -0.4]};
/* Towel mode (core/towel.js): a fist on each towel end beside the jaw (head-local, x mirrored), pulled toward the
   therapist (-z) by the tension, up to TOWEL_PULL. scene/towel.js runs the towel from here around the back of the neck. */
export const TOWEL_GRIP = [0.118, 0.03, 0.035], TOWEL_PULL = 0.06;   // beside the jaw, where the chin sling's ends come up (reference video)

/* Finger pose, rebuilt from the rest skeleton every frame. Every joint turns about an axis fixed in the hand frame,
   converted once into that bone's own rest frame: curl about fingers x normal (tips move toward the palm), spread
   about fingers x across (toward the pinky side).
   grip: 0 loose .. 1 firm. t: seconds, small independent drifts so fingers never freeze. probe: 0..1 fingertips
   palpating (prep). phase: per-hand offset so the two hands don't move in step. */
function poseFingers(h, grip, spread, t, probe, towel = 0, clinic = false, wrap = 0){
  const {joints, fingerRest, phase} = h;
  const power = towel*clamp(grip/1.2, 0, 1);
  fingerRest.forEach(([b, q]) => b.quaternion.copy(q));
  FINGERS.forEach((f, fi) => {
    const drift = (clinic ? 0.3 : 1)*(0.05*Math.sin(t*1.1 + phase + fi*1.7) + 0.025*Math.sin(t*2.9 + phase*2 + fi*0.9));
    // palpating: index / middle tips press and release in turn, ring / pinky follow a little
    const pr = probe*(clinic ? 0.16 : 1)*(fi < 2 ? 0.32 : 0.14)*(0.5 + 0.5*Math.sin(t*7.5 + phase + fi*1.9));
    joints[f].forEach((j, i) => {
      if(i === 0) turn(j.bone, j.spread, SPREAD[fi]*spread*(1 - 0.8*power));
      // A towel needs a cylindrical power grip: MCP, PIP and DIP all wrap, with the thumb closing over them.
      // The clinic's broad supporting hand keeps a shallow arch, with independent fingertip palpation.
      const loose = clinic ? CLINIC_CURL[i]*(1 + 0.5*grip) + PILLAR_WRAP[i]*wrap : CURL[i]*(1 + 0.9*grip), curled = POWER_CURL[i] + fi*0.025;
      turn(j.bone, j.curl, loose + (curled - loose)*power + drift*(1 - i*0.3)*(1 - 0.65*power) + pr*(i === 0 ? 0.6 : 1));
    });
  });
  const thumbDrift = 0.04*Math.sin(t*1.4 + phase*1.3);
  const th = joints.thumb;
  const thumbLoose = clinic ? [-0.75 + thumbDrift*0.3, 0.03, 0.04] : [0.1 + 0.15*grip + thumbDrift, 0.1 + 0.2*grip, 0.08 + 0.15*grip];
  if(clinic) turn(th[0].bone, th[0].opposition, 0.9 + 0.55*wrap);
  // Opposition sweeps the thumb across the folded fingers. Flexing it only toward the palm left a straight
  // digit pointing into the cheek, even with all four fingers curled.
  if(power) turn(th[0].bone, th[0].opposition, 1.40*power);
  th.forEach((j, i) => turn(j.bone, j.curl, thumbLoose[i] + (POWER_THUMB[i] - thumbLoose[i])*power));
}

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _m3 = new THREE.Matrix4(), _m4 = new THREE.Matrix4();
// rotation taking the pair (a1, a2) onto (b1, b2): a1 -> b1 exactly, a2 as close as it goes
// (scratch vectors, no allocation: the elbow search calls it 36 times per arm per frame)
const _pq = [0, 1, 2, 3, 4, 5].map(() => new THREE.Vector3());
function pairQuat(a1, a2, b1, b2, out){
  const [ax, ay, az, bx, by, bz] = _pq;
  ax.copy(a1).normalize(); ay.copy(a2).addScaledVector(ax, -a2.dot(ax)).normalize(); az.crossVectors(ax, ay);
  bx.copy(b1).normalize(); by.copy(b2).addScaledVector(bx, -b2.dot(bx)).normalize(); bz.crossVectors(bx, by);
  _m3.makeBasis(ax, ay, az).transpose();
  _m4.makeBasis(bx, by, bz).multiply(_m3);
  return out.setFromRotationMatrix(_m4);
}

/* One side of arms.glb. Everything is measured on the rest skeleton in GLB space (= world: the GLB scene is added to
   the world scene untransformed): the hand frame (fingers = wrist -> middle knuckle, across = index -> pinky knuckle,
   normal = out of the palm), the palm centre, the elbow hinge axis, and each finger joint's curl / spread axes. */
function placeArm(root, s, matFor, towelStage = false){
  root.traverse(o => {
    if(!o.isMesh) return;
    o.material = matFor(o.material);
    o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
  });
  const sd = s > 0 ? "l" : "r";
  const bones = {};
  root.traverse(o => { if(o.isBone) bones[o.name] = o; });
  const bone = n => bones[`${n}_${sd}`];
  root.updateMatrixWorld(true);
  const at = n => bone(n).getWorldPosition(new THREE.Vector3());
  const upper = bone("upperarm"), lower = bone("lowerarm"), hand = bone("hand");
  const S0 = at("upperarm"), E0 = at("lowerarm"), W0 = at("hand"), K0 = at("middle_01");
  const F0 = K0.clone().sub(W0).normalize();
  const A0 = at("pinky_01").sub(at("index_01"));
  A0.addScaledVector(F0, -A0.dot(F0)).normalize();
  const N0 = F0.clone().cross(A0);
  if(at("thumb_03").sub(W0).dot(N0) < 0) N0.negate();             // out of the palm (the thumb tip sits on that side)
  const palm0 = W0.clone().lerp(K0, 0.5).addScaledVector(N0, PALM_IN);
  const Qu0 = upper.getWorldQuaternion(new THREE.Quaternion()), Ql0 = lower.getWorldQuaternion(new THREE.Quaternion());
  const Qh0 = hand.getWorldQuaternion(new THREE.Quaternion());
  const hinge = E0.clone().sub(S0).cross(W0.clone().sub(E0)).normalize();
  const local = (q, w) => w.clone().applyQuaternion(q.clone().invert());
  // the forearm's direction out of the wrist at a neutral wrist, and the back of the hand, in hand-bone space
  const fore = local(Qh0, E0.clone().sub(W0).normalize());
  const back = local(Qh0, N0.clone().negate()); back.addScaledVector(fore, -back.dot(fore)).normalize();
  const side = fore.clone().cross(back);
  const curlW = F0.clone().cross(N0).normalize(), spreadW = F0.clone().cross(A0).normalize();
  const joints = {}, fingerRest = [];
  ["thumb", ...FINGERS].forEach(f => {
    joints[f] = [1, 2, 3].map(i => {
      const b = bone(`${f}_0${i}`), q = b.getWorldQuaternion(new THREE.Quaternion());
      fingerRest.push([b, b.quaternion.clone()]);
      if(f !== "thumb") return {bone: b, curl: local(q, curlW), spread: local(q, spreadW)};
      // the thumb curls across the palm: about its own direction x the palm normal
      const dir = i < 3 ? at(`thumb_0${i + 1}`).sub(at(`thumb_0${i}`)).normalize() : F0.clone();
      return {bone: b, curl: local(q, dir.cross(N0).normalize()), opposition: local(q, F0.clone().cross(A0).normalize())};
    });
  });
  const rollRig = withVisualIds(() => addArmRollRig(root, lower, hand, W0, F0, towelStage));
  return {root, s, upper, lower, hand, joints, fingerRest, rollRig, phase: s > 0 ? 0 : 2.1,
    contactSamples: clinicContactSamples(root), contactOffset: 0, contactAnchor: new THREE.Vector3(), anchorOff: new THREE.Vector3(),
    F0, N0, Qh0, radial: A0.clone().negate(), palmOff: palm0.clone().sub(W0), indexOff: at("index_01").sub(W0), hingeU: local(Qu0, hinge), hingeL: local(Ql0, hinge),
    handRestL: hand.quaternion.clone(), fore, back, side,
    w: {contact: 0, support: 0, cup: 0, away: 0, pat: 0, towel: 0}, phi: null, shoulder: new THREE.Vector3(), seen: false, palm: new THREE.Vector3()};
}

/* ---- per-patient hand poses, measured on the head's own skin mesh ----
   Rays in head-local space toward the head's long axis (static rest geometry; the expression blendshapes are small).
   The ear on each side is the outermost skin vertex; the head's width scales the offsets. */
const _rc = new THREE.Raycaster();
const EAR_Z = [-0.08, 0.03];
function measureHead(model){
  const clinic = S.game === "clinic", key = clinic ? "clinicHandPoses" : "handPoses";
  if(model[key] !== undefined) return model[key];
  model[key] = null;
  const src = model.skinMesh;
  if(!src) return null;
  const ear = MODELS[model.id] && MODELS[model.id].ear;
  if(clinic && ear){
    model.clinicSurface = clinicSurface(src, head);
    return model[key] = borrowedPoses(ear);
  }
  head.updateMatrixWorld(true); src.updateWorldMatrix(true, false);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", src.geometry.attributes.position);
  if(src.geometry.index) g.setIndex(src.geometry.index);
  const probe = new THREE.Mesh(g, new THREE.MeshBasicMaterial({side: THREE.DoubleSide}));
  probe.matrixAutoUpdate = false;
  probe.matrixWorld.copy(head.matrixWorld).invert().multiply(src.matrixWorld);     // skin -> head-local
  const pos = g.attributes.position, p = new THREE.Vector3();
  const ears = {};
  [1, -1].forEach(s => {
    let best = -1;
    for(let i = 0; i < pos.count; i++){
      p.fromBufferAttribute(pos, i).applyMatrix4(probe.matrixWorld);
      // only the ear band (head-local z, patient01..05 ears at -0.04..-0.01): the heavy neck of 마동철 / 복순할매 below
      // the jaw is wider than their ears, the poses then missed the head and the hands fell back to the capsules
      if(p.z < EAR_Z[0] || p.z > EAR_Z[1]) continue;
      if(p.x*s > best){ best = p.x*s; ears[s] = p.clone(); }
    }
  });
  const nm = new THREE.Matrix3().getNormalMatrix(probe.matrixWorld);
  const hit = (o, d) => {
    _rc.set(o, d.normalize()); _rc.far = 0.4;
    const h = _rc.intersectObject(probe, false)[0];
    if(!h) return null;
    const n = h.face.normal.clone().applyMatrix3(nm).normalize();
    if(n.dot(d) > 0) n.negate();
    return {p: h.point.clone(), n};
  };
  const poses = {};
  for(const s of [1, -1]){
    const E = ears[s], k = Math.abs(E.x)/0.088;
    poses[s] = {};
    for(const name of POSE_NAMES){
      const P = (clinic ? CLINIC_HAND_POSES : HAND_POSES)[name];
      const axis = new THREE.Vector3(0, E.y, E.z + P.dz*k);
      const out = new THREE.Vector3(s*Math.cos(P.around), -Math.sin(P.around), 0);
      const h = hit(axis.clone().addScaledVector(out, 0.3), out.clone().negate());
      if(!h) return null;
      const nIn = h.n.clone().negate();
      const f = new THREE.Vector3(P.fingers[0]*s, P.fingers[1], P.fingers[2]);
      if(!clinic) f.addScaledVector(nIn, -f.dot(nIn));
      f.normalize();
      poses[s][name] = {p: h.p.addScaledVector(h.n, P.lift), f, n: nIn, grip: P.grip, roll: P.roll};
    }
    poses[s].ear = E; poses[s].k = k;
  }
  g.dispose(); probe.material.dispose();
  if(clinic) model.clinicSurface = clinicSurface(src, head);
  return model[key] = poses;
}
/* A head whose hair is one mesh with its skin (patient11): the outermost point of its ear band is hair 12 cm out
   (patient07: 7.6 cm), so measured poses sat 35% too wide on the lumpy hair and took its normals, which wrung the wrists
   (user: "손목이 돌아가 있는 느낌", 2026-10-24). It takes patient07's clinic poses (the same build), measured as above and
   carried over relative to the real ear; the contact fit then slides the hands out onto the hair.
   Per pose, s = +1 (x mirrors for -1): [palm point - ear, palm normal into the head]. */
const CLINIC_POSES_07 = {
  rest:    [[0.0074, -0.0182, 0.0089], [-0.951, 0.248, -0.182]],
  cup:     [[0.0056, -0.0327, -0.0070], [-0.966, 0.257, 0.006]],
  contact: [[0.0114, -0.0177, 0.0430], [-0.871, 0.244, -0.427]],
  support: [[0.0141, -0.0402, -0.0155], [-0.972, 0.234, 0.001]]
};
function borrowedPoses(ear){
  const poses = {};
  for(const s of [1, -1]){
    const E = new THREE.Vector3(s*ear[0], ear[1], ear[2]);
    poses[s] = {ear: E, k: 1};
    for(const name of POSE_NAMES){
      const [d, n] = CLINIC_POSES_07[name], P = CLINIC_HAND_POSES[name];
      poses[s][name] = {p: new THREE.Vector3(s*d[0], d[1], d[2]).add(E), f: new THREE.Vector3(P.fingers[0]*s, P.fingers[1], P.fingers[2]).normalize(),
        n: new THREE.Vector3(s*n[0], n[1], n[2]).normalize(), grip: P.grip, roll: P.roll};
    }
  }
  return poses;
}

/* ---- the patient's chest, for the pat after both sides ----
   World point on the upper chest below the right collarbone: the top of the skinned body there (the rest pose, so
   bone transforms give the real surface; the bind geometry alone sits elsewhere). Once per patient. */
const CHEST = [-0.07, 0.37];      // world x, z
function measureChest(model){
  const clinic = S.game === "clinic", key = clinic ? "clinicChest" : "chest";
  if(model[key] !== undefined) return model[key];
  model[key] = null;
  model.body.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  let top = null;
  (model.bodyMeshes || []).forEach(o => {
    const pos = o.geometry.attributes.position;
    for(let i = 0; i < pos.count; i++){
      v.fromBufferAttribute(pos, i);
      if(o.isSkinnedMesh) o.boneTransform(i, v);
      v.applyMatrix4(o.matrixWorld);
      // The clinic pat lands just below the clavicle: visible in the fixed first-person framing, without reaching
      // far down the sternum and pulling the whole sleeve across the patient's face.
      if(Math.abs(v.x - CHEST[0]) < 0.02 && Math.abs(v.z - (clinic ? 0.245 : CHEST[1])) < 0.02 && (!top || v.y > top.y)) top = v.clone();
    }
  });
  return model[key] = top;
}

/* ---- two-bone IK ----
   Shoulder S, wrist W (from the palm target and the hand's orientation Qh). The elbow sits on the circle of points
   ARM_A from S and ARM_B from W; the point taken is the one that keeps the wrist nearest a natural, slightly extended
   position (a real wrist bends ~1 rad back, less forward, little sideways) while leaning to the role's side (pole).
   The hinge (upper arm x forearm) keeps the elbow a pure hinge; roll helpers distribute pronation along the forearm,
   and a wrist bridge splits the hand's swing. Out of reach: the shoulder leans toward the hand in clinic mode. */
const UPV = new THREE.Vector3(0, 1, 0), YAX = new THREE.Vector3(0, 1, 0);
const _S = new THREE.Vector3(), _W = new THREE.Vector3(), _E = new THREE.Vector3(), _C = new THREE.Vector3();
const _u = new THREE.Vector3(), _e1 = new THREE.Vector3(), _e2 = new THREE.Vector3(), _d = new THREE.Vector3();
const _qu = new THREE.Quaternion(), _ql = new THREE.Quaternion(), _qi = new THREE.Quaternion(), _qt = new THREE.Quaternion();
const _hl = new THREE.Vector3(), _du = new THREE.Vector3(), _dl = new THREE.Vector3(), _hg = new THREE.Vector3();
const SAMPLES = 36;
// the therapist's resting view for the elbow test: eye, forward, up, tan(half fov); set each frame by updateRealHands
const view = {eye: new THREE.Vector3(), f: new THREE.Vector3(0, 0, 1), u: new THREE.Vector3(0, 1, 0), r: new THREE.Vector3(1, 0, 0), tan: 0.47, aspect: 2};
const _ve = new THREE.Vector3();
// how far into the frame a point is above ELBOW_VIEW_Y (NDC y; 0 = under it or behind the eye); toward the sides the
// line rises, so an elbow may sit in a bottom corner but never in the middle of the picture
function inView(p){
  _ve.copy(p).sub(view.eye);
  const fw = _ve.dot(view.f);
  if(fw < 0.02) return 0;
  const ny = _ve.dot(view.u)/(fw*view.tan), nx = Math.abs(_ve.dot(view.r))/(fw*view.tan*view.aspect);
  return Math.max(0, ny - ELBOW_VIEW_Y - ELBOW_VIEW_CORNER*Math.max(0, nx - 0.5));
}
function wristCost(arm, Qh, E, W){
  const {extension: ext, deviation: dev} = wristAngles(arm, Qh, E, W, _wristAngles);
  const e = ext - 0.18;
  return (e/0.55)**2 + (dev/0.24)**2 + 100*(Math.max(0, ext - 1.15, -ext - 1.32)**2 + Math.max(0, Math.abs(dev) - 0.40)**2);
}
const _wristAngles = {};
/* The forearm's turn (pronation / supination, radians) the hand's orientation asks for with the elbow at E: the hand
   frame against the forearm's hinge frame, about the forearm axis, from the rest pose (T-pose, palm down, elbow crease
   forward = the forearm's neutral, thumb ahead). A real forearm turns ~80 deg either way and is at ease within ~45. */
const _tu = new THREE.Vector3(), _tl = new THREE.Vector3(), _th = new THREE.Vector3(), _tq = new THREE.Quaternion(), _tr = new THREE.Quaternion();
function twistAt(arm, S, E, W, Qh){
  _tu.copy(E).sub(S).normalize(); _tl.copy(W).sub(E).normalize();
  _th.crossVectors(_tu, _tl);
  if(_th.lengthSq() < 1e-8) return 0;
  pairQuat(YAX, arm.hingeL, _tl, _th.normalize(), _tq);
  _tq.invert().multiply(Qh).multiply(_tr.copy(arm.handRestL).invert());
  const tw = 2*Math.atan2(_tq.y, _tq.w);
  return Math.atan2(Math.sin(tw), Math.cos(tw));
}
function twistCost(tw){
  const a = Math.abs(tw);
  return (a/0.8)**2 + (a > 1.4 ? 8*(a - 1.4) : 0);
}
function solveArm(arm, S, W, Qh, pole, dt){
  _S.copy(S);
  let d = _d.copy(W).sub(_S).length();
  if(d > ARM_MAX){ _S.sub(W).setLength(ARM_MAX).add(W); d = ARM_MAX; }
  if(d < 0.04){ _S.sub(W).setLength(0.04).add(W); d = 0.04; }
  _u.copy(W).sub(_S).divideScalar(d);
  const x = (ARM_A*ARM_A - ARM_B*ARM_B + d*d)/(2*d), r = Math.sqrt(Math.max(0, ARM_A*ARM_A - x*x));
  _C.copy(_S).addScaledVector(_u, x);
  _e1.copy(UPV).addScaledVector(_u, -UPV.dot(_u)).normalize();
  _e2.crossVectors(_u, _e1);
  let best = 0, bestC = Infinity;
  const pd = _v3.copy(pole).addScaledVector(_u, -pole.dot(_u)).normalize();
  for(let i = 0; (dt > 0 || arm.phi === null) && i < SAMPLES; i++){
    const phi = i/SAMPLES*Math.PI*2;
    _E.copy(_C).addScaledVector(_e1, r*Math.cos(phi)).addScaledVector(_e2, r*Math.sin(phi));
    _v.copy(_E).sub(_C).normalize();
    const low = arm.lowElbow || 0;
    // The seated pull starts with the upper arms hanging beside the ribs. Wrist comfort must not buy a raised,
    // flared elbow: the palm frame is free to settle after the elbow has been chosen.
    let c = (3*(1 - low) + 0.02*low)*wristCost(arm, Qh, _E, W) + (2.2 + 12*low)*(1 - _v.dot(pd));
    c += low*(1200*Math.max(0, _E.y - (_S.y - 0.16))**2 + 1500*Math.max(0, Math.abs(_E.x) - Math.abs(_S.x) - 0.055)**2);
    if(_E.y < 1.02) c += 40*(1.02 - _E.y);                          // never into the table / the patient
    if(_E.x*arm.s < 0.16) c += 80*(0.16 - _E.x*arm.s);               // never across the face (out beside the head)
    c += ELBOW_VIEW_K*inView(_E);                                      // elbow under the frame, not in the middle of it
    c += (2*(1 - low) + 0.02*low)*twistCost(twistAt(arm, _S, _E, W, Qh));
    if(c < bestC){ bestC = c; best = phi; }
  }
  // ease toward the best elbow (no popping between samples)
  if(arm.phi === null) arm.phi = best;
  else{
    let dp = best - arm.phi;
    dp = Math.atan2(Math.sin(dp), Math.cos(dp));
    arm.phi += dp*(1 - Math.exp(-dt*10));
  }
  _E.copy(_C).addScaledVector(_e1, r*Math.cos(arm.phi)).addScaledVector(_e2, r*Math.sin(arm.phi));
  _du.copy(_E).sub(_S).normalize();
  _dl.copy(W).sub(_E).normalize();
  _hg.crossVectors(_du, _dl);
  if(_hg.lengthSq() < 1e-8) _hg.copy(arm.lastHinge || _e1); else _hg.normalize();
  arm.lastHinge = (arm.lastHinge || new THREE.Vector3()).copy(_hg);
  pairQuat(YAX, arm.hingeU, _du, _hg, _qu);
  pairQuat(YAX, arm.hingeL, _dl, _hg, _ql);
  // The entire axial turn belongs to pronation/supination. Four roll bones distribute it along the forearm;
  // the wrist bridge carries only the hand's swing. Leaving 40% here used to wring the wrist like a wrapper.
  _qt.copy(_ql).invert().multiply(Qh).multiply(_qi.copy(arm.handRestL).invert());
  const tw = 2*Math.atan2(_qt.y, _qt.w);
  const twist = Math.atan2(Math.sin(tw), Math.cos(tw));
  poseArmRollRig(arm.rollRig, twist, _ql, Qh, arm.handRestL);
  arm.upper.position.copy(_S);
  arm.upper.quaternion.copy(_qu);
  arm.lower.quaternion.copy(_qi.copy(_qu).invert().multiply(_ql));
  arm.hand.quaternion.copy(_qi.copy(_ql).invert().multiply(Qh));
  arm.metrics = wristAngles(arm, Qh, _E, W, arm.metrics || {});
  arm.metrics.twist = twist;
}

/* Called from applyLook: realistic arms while a realistic patient is on the table (they need its measured poses). */
export function setRealHands(on){ wantHands = on; syncArms(); }
/* The loop calls this when updateRealHands throws: log once, keep the primitive hands for the rest of the session. */
let armsBroken = false;
/* Towel mode: where the two fists hold the towel (world), and how much they hold it (0 = let go). null without the
   realistic arms (scene/towel.js then rests the ends beside the head). */
export function towelGrips(){
  if(!real.arms || !armsShown || armsBroken) return null;
  const l = real.arms.find(a => a.s > 0), r = real.arms.find(a => a.s < 0);
  return l && r && l.seen && r.seen ? {l: l.palm, r: r.palm, hold: Math.min(l.w.towel, r.w.towel)} : null;
}
export function disableRealArms(err){
  if(armsBroken) return;
  armsBroken = true;
  console.warn("realistic arms failed, keeping primitives", err);
  document.documentElement.dataset.arms = "failed";
  syncArms();
}
let armsShown = false;
function syncArms(){
  const selected = real.towelArms || real.clinicArms;
  // Sharing the detailed asset also shares its rig. Re-enter with the same clean pose the old per-mode rigs had.
  if(real.armsMode !== S.game){
    real.armsMode = S.game;
    if(real.arms) real.arms.forEach(a => { a.seen = false; });
  }
  if(real.arms !== selected){
    if(real.arms) real.arms.forEach(a => { a.root.visible = false; a.seen = false; });
    real.arms = selected; real.armsSynced = false;
  }
  const cur = current();
  const use = wantHands && !armsBroken && !!real.arms && !!cur && !!measureHead(cur);
  if(real.arms) real.arms.forEach(a => { a.root.visible = use; if(!use) a.seen = false; });
  if(use === armsShown && real.armsSynced) return use;
  armsShown = use; real.armsSynced = true;
  // the primitive hands and capsule sleeves stay the fallback (no GLB, no realistic head yet)
  handParts.forEach(m => { m.visible = !use; });
  forearms.forEach(f => { f.m.visible = !use; f.cuff.visible = !use; });
  return use;
}
export const realArmsActive = () => armsShown;

/* ---- per frame ----
   st: {t: s, dt: s, now: ms, rot: the aim's turn now (deg, + = face to world -x), aim: sign of the target turn,
        setup: 0..1 how close the aim is, push: 0..1 the crack impulse, after: s since the x-ray opened (-1: none),
        prep: settling a new patient (palpate), results: S.results (a new entry = a patient done)}
   Roles follow the head's actual turn: the up-side hand is the contact hand. The role weights ease, so the hands
   slide between poses (around the head's axis, never through it) and swap roles smoothly on the other side. */
const _qh = new THREE.Quaternion(), _qR = new THREE.Quaternion(), _qB = new THREE.Quaternion(), _qH = new THREE.Quaternion();
const _P = new THREE.Vector3(), _F = new THREE.Vector3(), _N = new THREE.Vector3(), _pole = new THREE.Vector3();
const _camF = new THREE.Vector3(), _sh = new THREE.Vector3();
let lastRoleTurn = 1;
// the pat starts during the second reaction (flow.js: the result is pushed at the crack, the next patient comes 7.25 s later)
const PAT_DELAY = 5400;
let patRes = null, patLen = 0, patAt = -1, patChest = null;
// blend two poses in cylinder coordinates about the head's long axis (x = 0, y = AXIS_Y)
const AXIS_Y = -0.01;
function cylLerp(a, b, w, out){
  const ra = Math.hypot(a.x, a.y - AXIS_Y), rb = Math.hypot(b.x, b.y - AXIS_Y);
  const ta = Math.atan2(a.y - AXIS_Y, a.x);
  let dt = Math.atan2(b.y - AXIS_Y, b.x) - ta; dt = Math.atan2(Math.sin(dt), Math.cos(dt));
  const r = ra + (rb - ra)*w, th = ta + dt*w;
  return out.set(r*Math.cos(th), AXIS_Y + r*Math.sin(th), a.z + (b.z - a.z)*w);
}
const _pa = new THREE.Vector3();
const _contactInverse = new THREE.Matrix4(), _contactStep = new THREE.Vector3();
function poseQuat(arm, f, n, roll, out){
  pairQuat(arm.F0, arm.N0, f, n, out);
  if(roll) out.premultiply(_qB.setFromAxisAngle(f, roll));
  return out;
}
export function updateRealHands(st){
  if(!syncArms()) return;
  const poses = measureHead(current());
  const {t, dt, push} = st, clinic = S.game === "clinic";
  // a patient done (a new result with stars): one hand pats the chest twice before the next patient
  const res = st.results;
  if(res !== patRes){ patRes = res; patLen = res ? res.length : 0; }
  else if(res && res.length > patLen){ patLen = res.length; if(res[patLen - 1].stars > 0){ patAt = st.now + PAT_DELAY; patChest = null; } }
  const pat = patAt > 0 && st.now >= patAt ? (st.now - patAt)/1000 : -1;
  if(pat > 2) patAt = -1;
  // kept after the pat ends: the hand still eases back from it for a few frames (w.pat > 0) once pat is -1 again
  // (reading a null chest there threw every time a patient was done, 2026-10-15)
  if(pat >= 0 && !patChest) patChest = measureChest(current());
  const chest = patChest;
  // which way the head is really turned (hysteresis near the middle); before any turn, the target's side
  if(Math.abs(st.rot) > 4) lastRoleTurn = Math.sign(st.rot);
  else if(Math.abs(st.rot) < 1.5 && st.aim) lastRoleTurn = st.aim;
  const turned = Math.min(1, Math.max(0, (Math.abs(st.rot) - 4)/26));
  const setup = push > 0 ? 1 : Math.max(st.setup, turned*turned*(3 - 2*turned));
  const awayOn = !st.prep && st.after >= AWAY_AT;
  const cupOn = st.prep || (st.after >= CUP_AT && !awayOn);
  head.updateMatrixWorld(true);
  head.getWorldQuaternion(_qH);
  if(clinic) _contactInverse.copy(head.matrixWorld).invert();
  // shoulders: the therapist's trunk, i.e. the camera's base position, following the camera's lean a little
  _camF.copy(camera.position).sub(camBase);
  if(st.towel) _camF.set(0, 0, 0);   // towel mode: the camera is a third-person one, the trunk stays put
  if(_camF.length() > SHOULDER_FOLLOW_MAX) _camF.setLength(SHOULDER_FOLLOW_MAX);
  _camF.multiplyScalar(SHOULDER_FOLLOW);
  view.eye.copy(camBase).add(_camF);
  view.f.copy(camLook).sub(camBase).normalize();
  view.u.set(0, 1, 0).addScaledVector(view.f, -view.f.y).normalize();
  view.r.crossVectors(view.f, view.u);
  view.tan = Math.tan(camera.fov*Math.PI/360); view.aspect = camera.aspect;
  real.arms.forEach(arm => {
    const s = arm.s, P = poses[s], w = arm.w;
    const role = s === lastRoleTurn ? "contact" : "support";
    const k = 1 - Math.exp(-dt*5);
    const patOn = s < 0 && pat >= 0 && pat < 1.15 && !!chest;
    w.contact += ((!cupOn && role === "contact" ? setup : 0) - w.contact)*k;
    w.support += ((!cupOn && role === "support" ? setup : 0) - w.support)*k;
    w.cup += ((cupOn ? 1 : 0) - w.cup)*k;
    w.away += ((awayOn ? 1 : 0) - w.away)*(1 - Math.exp(-dt*3.5));
    w.pat += ((patOn ? 1 : 0) - w.pat)*(1 - Math.exp(-dt*7));
    if(!arm.seen){ w.contact = w.support = w.pat = 0; w.cup = cupOn ? 1 : 0; w.away = awayOn ? 1 : 0; arm.phi = null; }
    // head poses: rest -> contact / support -> cup, around the head's axis
    _pa.copy(P.rest.p);
    cylLerp(_pa, P.contact.p, w.contact, _pa);
    cylLerp(_pa, P.support.p, w.support, _pa);
    cylLerp(_pa, P.cup.p, w.cup, _pa);
    const lerpV = (key, out) => out.copy(P.rest[key]).lerp(P.contact[key], w.contact).lerp(P.support[key], w.support).lerp(P.cup[key], w.cup).normalize();
    lerpV("f", _F); lerpV("n", _N);
    if(!clinic) _F.addScaledVector(_N, -_F.dot(_N)).normalize();
    let grip = P.rest.grip + (P.contact.grip - P.rest.grip)*w.contact + (P.support.grip - P.rest.grip)*w.support + (P.cup.grip - P.rest.grip)*w.cup;
    // small breathing-slow sway; the crack: the contact hand rolls the neck toward the opposite eye (a turn about
    // the head's axis plus a short push), the support hand presses up into the weight; both squeeze
    _pa.x += 0.0012*Math.sin(t*0.9 + arm.phase); _pa.z += 0.001*Math.sin(t*0.7 + arm.phase*1.7);
    const pc = push*w.contact, ps = push*w.support;
    // The head already carries the hands through the rotary thrust. Add only a small pad compression in clinic:
    // rotating a further nine degrees about the head made the contact arm sweep wide away from the trunk impulse.
    let rollAbout = s*(clinic ? 0.035 : 0.16)*pc;
    if(rollAbout){
      const r = Math.hypot(_pa.x, _pa.y - AXIS_Y), th = Math.atan2(_pa.y - AXIS_Y, _pa.x) + rollAbout;
      _pa.set(r*Math.cos(th), AXIS_Y + r*Math.sin(th), _pa.z - (clinic ? 0.002 : 0.008)*pc);
    }
    _pa.addScaledVector(_N, (clinic ? 0.0015 : 0.004)*(pc + ps));
    grip = Math.min(1.25, grip + 0.5*push*(w.contact + w.support));
    poseQuat(arm, _F, _N, 0, _qR);
    if(clinic && w.contact > 0.001){
      // Present the index's radial edge to the pillar, rather than the middle of the palm/extended thumb.
      _v2.copy(arm.radial).applyQuaternion(_qR);
      const radialRoll = Math.atan2(_v.crossVectors(_v2, _N).dot(_F), _v2.dot(_N));
      _qR.premultiply(_qB.setFromAxisAngle(_F, radialRoll*w.contact));
    }
    if(rollAbout) _qR.premultiply(_qB.setFromAxisAngle(_v.set(0, 0, 1), rollAbout));
    if(clinic) _pa.x += s*arm.contactOffset;
    // to world
    _P.copy(_pa).applyMatrix4(head.matrixWorld);
    _qR.premultiply(_qH);
    // a wrong crack way off (core/fail.js "finger"): the therapist's own knuckle cracked, so the contact hand jerks
    // back off the neck toward the shoulder, the fingers open and the wrist shakes it out, then it settles back
    const fl = role === "contact" && st.flinch >= 0 ? flinchProfile(st.flinch) : null;
    if(fl && fl.away > 0){
      _v3.copy(arm.shoulder).sub(_P).normalize();
      _P.addScaledVector(_v3, 0.12*fl.away); _P.y += 0.05*fl.away;   // back toward the shoulder and up off the skin
      _qR.premultiply(_qB.setFromAxisAngle(_v3, fl.shake));
      grip *= 1 - fl.away;
    }
    // drawn back toward the therapist, palm turned in, below the frame
    if(w.away > 0.001){
      _v2.set(camBase.x + (clinic ? 0.28 : AWAY[0])*s, camBase.y + (clinic ? -0.45 : AWAY[1]), camBase.z + (clinic ? -0.03 : AWAY[2]));
      pairQuat(arm.F0, arm.N0, _v.set(-0.35*s, -0.25, 1).normalize(),
        clinic ? _v3.set(-0.8*s, 0.1, -0.35).normalize() : _v3.set(-0.5*s, -0.85, 0).normalize(), _qB);
      _P.lerp(_v2, w.away);
      if(clinic) _P.y += 0.025*Math.sin(Math.PI*w.away);
      _qR.slerp(_qB, w.away);
    }
    // the pat: palm down on the upper chest, two quick pats, then back
    if(w.pat > 0.001 && chest){
      const u = pat, lift = u < 0.45 ? 0.035 : u < 1.05 ? 0.03*(0.5 - 0.5*Math.cos(2*Math.PI*(u - 0.45)/0.3)) : 0.035;
      _v2.copy(chest).add(_v.set(0, PALM_IN*0.2 + lift, 0));
      pairQuat(arm.F0, arm.N0, _v.set(0.25*-s, clinic ? 0 : -0.15, 1).normalize(), _v3.set(0, -1, 0), _qB);
      _P.lerp(_v2, w.pat);
      _qR.slerp(_qB, w.pat);
    }
    // towel mode: both fists on the towel ends beside the jaw, knuckles toward the feet, palms in; pulled toward the
    // therapist with the tension. On a slip both closed fists withdraw with the cloth and feed it back below the neck.
    w.towel += ((st.towel ? 1 : 0) - w.towel)*(1 - Math.exp(-dt*6));
    if(!arm.seen) w.towel = st.towel ? 1 : 0;
    if(w.towel > 0.001){
      const sl = slipPose(st.slip).hand;
      _v2.set(s*TOWEL_GRIP[0], TOWEL_GRIP[1], TOWEL_GRIP[2] - TOWEL_PULL*clamp(st.pull || 0, 0, 1)).applyMatrix4(head.matrixWorld);
      _v2.y -= 0.015*sl; _v2.z -= 0.16*sl; _v2.x += s*0.015*sl;
      // a fist round the towel end (user: "진짜 사람이 잡고 있는것처럼", 2026-10-15): the band runs through the palm, the
      // fingers point across it toward the table and curl round it, the thumb on top; the palm faces the head; the
      // forearm and metacarpals form a pulling line. Curl the fingers around the band, rather than folding the
      // entire hand down at the wrist (the old downward finger frame produced a near-right-angle wrist).
      const pl = clamp(st.pull || 0, 0, 1);
      _v.set(-0.35*s, 0.20 + 0.04*pl, 0.91).normalize().transformDirection(head.matrixWorld);
      _v3.set(-s, 0.2, 0).normalize().transformDirection(head.matrixWorld);
      pairQuat(arm.F0, arm.N0, _v, _v3, _qB);
      _P.lerp(_v2, w.towel);
      _qR.slerp(_qB, w.towel);
      grip += (1.2 - grip)*w.towel;
      // an over-pull: he goes over backwards (scene/therapist.js), lets go of the towel and the arms fly up, hands open
      // (core/towel.js letGoProfile: at once, before the body has moved, so the arms go over with him)
      const fl = clamp(st.drop || 0, 0, 1);
      if(fl > 0.001 && st.shoulder && st.shoulder(s, _shT)){
        const wob = 0.03*Math.sin(t*9 + s);
        _v2.copy(_shT).add(_v.set(s*(0.16 + wob), 0.4, 0.08 + wob));
        pairQuat(arm.F0, arm.N0, _v.set(0.25*s, 1, 0.15).normalize(), _v3.set(0, 0.1, 1).normalize(), _qB);
        _P.lerp(_v2, fl);
        _qR.slerp(_qB, fl);
        grip *= 1 - fl;
      }
    }
    arm.palm.copy(_P);
    _qh.copy(_qR).multiply(arm.Qh0);
    if(clinic){
      // Preserve the INDEX contact through wrist projection, not just before it. Pivoting around the palm while
      // limiting a sideways wrist used to lift the right index MCP several centimetres off its measured pillar.
      arm.contactAnchor.copy(_P);
      arm.anchorOff.copy(arm.palmOff).lerp(arm.indexOff, w.contact*(1 - w.away)*(1 - w.pat));
      _W.copy(arm.anchorOff).applyQuaternion(_qR).negate().add(arm.contactAnchor);
      arm.palm.copy(arm.palmOff).applyQuaternion(_qR).add(_W);
    }else _W.copy(arm.palmOff).applyQuaternion(_qR).negate().add(_P);
    // shoulder and pole
    _sh.set(camBase.x + SHOULDER[0]*s, camBase.y + SHOULDER[1], camBase.z + SHOULDER[2]).add(_camF);
    // towel mode: the shoulders of the seated body (scene/therapist.js), which leans back as he pulls
    // (followed at once: the body can move fast, falling over, and the sleeve must stay on it)
    const onBody = st.towel && st.shoulder && st.shoulder(s, _shT);
    if(onBody) _sh.lerp(_shT, w.towel);
    if(arm.seen && !onBody) arm.shoulder.lerp(_sh, 1 - Math.exp(-dt*8)); else arm.shoulder.copy(_sh);
    // on the body the shoulder stays where it is and the hand comes along out of reach (solveArm would pull the
    // shoulder off the body toward the hand instead)
    if(onBody && _W.distanceTo(arm.shoulder) > ARM_MAX){
      _v.copy(_W); _W.sub(arm.shoulder).setLength(ARM_MAX).add(arm.shoulder);
      arm.palm.add(_v.subVectors(_W, _v));
    }
    const wr = Math.max(0, 1 - w.contact - w.support);
    _pole.set(0, 0, 0);
    [["rest", wr], ["contact", w.contact], ["support", w.support]].forEach(([n, ww]) => {
      const p = POLES[n]; _pole.x += p[0]*s*ww; _pole.y += p[1]*ww; _pole.z += p[2]*ww;
    });
    _pole.lerp(_v.set(POLES.away[0]*s, POLES.away[1], POLES.away[2]), w.away);
    _pole.lerp(_v.set(POLES.pat[0]*s, POLES.pat[1], POLES.pat[2]), w.pat);
    arm.lowElbow = clinic ? 1 : w.towel*(1 - clamp(st.drop || 0, 0, 1));
    _pole.lerp(_v.set(0.18*s, -1, 0.2), arm.lowElbow).normalize();
    const fitContact = clinic && w.away < 0.01 && w.pat < 0.01 && !(fl && fl.away > 0);
    if(clinic && S.thrust > 0){
      if(!arm.thrustBrace && arm.metrics) arm.thrustBrace = {extension: arm.metrics.extension, deviation: arm.metrics.deviation, range: 4*Math.PI/180};
    }else arm.thrustBrace = null;
    // Re-solve about the palm after the small skin-contact correction. No game coordinates or camera values change.
    for(let fit = 0; fit < (fitContact ? 4 : 1); fit++){
      solveArm(arm, arm.shoulder, _W, _qh, _pole, fit ? 0 : arm.seen ? dt : 1);
      // Project the hand frame into its wrist envelope about the PALM, then solve the shifted wrist again. The towel
      // end still sits at arm.palm, including transitions into the fall. Re-solving only the orientation at a fixed
      // wrist would displace the palm by several centimetres.
      for(let pass = 0; pass < 12; pass++){
        const limited = limitWrist(arm, _qh, _E, _W, arm.thrustBrace);
        const twist = twistAt(arm, _S, _E, _W, _qh), maxTwist = 78*Math.PI/180;
        const untwist = clamp(twist, -maxTwist, maxTwist) - twist;
        if(Math.abs(untwist) > 1e-6) _qh.premultiply(_qB.setFromAxisAngle(_dl, untwist));
        if(!limited && Math.abs(untwist) <= 1e-6) break;
        _qR.copy(_qh).multiply(_qB.copy(arm.Qh0).invert());
        if(clinic){
          _W.copy(arm.anchorOff).applyQuaternion(_qR).negate().add(arm.contactAnchor);
          arm.palm.copy(arm.palmOff).applyQuaternion(_qR).add(_W);
        }else _W.copy(arm.palmOff).applyQuaternion(_qR).negate().add(arm.palm);
        if(onBody && _W.distanceTo(arm.shoulder) > ARM_MAX){
          _v.copy(_W); _W.sub(arm.shoulder).setLength(ARM_MAX).add(arm.shoulder);
          arm.palm.add(_v.subVectors(_W, _v));
        }
        solveArm(arm, arm.shoulder, _W, _qh, _pole, 0);
      }
      const fingerGrip = grip*(1 - 0.6*w.away);
      // A sideways approach must wrap behind the head instead of poking straight inward. Use the solved wrist,
      // since its anatomical projection differs between the two hands and between patients.
      let wrap = 0;
      if(clinic){
        _v.copy(arm.F0).applyQuaternion(_qR).transformDirection(_contactInverse);
        wrap = w.contact*clamp(-s*_v.x, 0, 1);
      }
      poseFingers(arm, fingerGrip*(1 - w.pat) + 0.1*w.pat, 1 - 0.5*Math.min(1, fingerGrip), t, st.prep ? w.cup : 0, w.towel, clinic, wrap);
      if(!fitContact || fit === 3) break;
      arm.root.updateMatrixWorld(true);
      const shift = clinicContactShift(current().clinicSurface, arm.contactSamples, _contactInverse, s);
      if(Math.abs(shift) < 0.0002) break;
      const next = clamp(arm.contactOffset + shift, -0.06, 0.06), delta = next - arm.contactOffset;
      if(Math.abs(delta) < 0.0001) break;
      arm.contactOffset = next;
      _contactStep.set(s*delta, 0, 0).applyQuaternion(_qH);
      arm.palm.add(_contactStep); arm.contactAnchor.add(_contactStep); _W.add(_contactStep);
    }
    arm.seen = true;
  });
}

/* Primitive head parts = everything under `head` except the therapist hands and the realistic models. */
function primitiveHeadParts(){
  // the primitive glasses go too: their toy frames float over the realistic face
  const models = allModels().map(m => m.head);
  // the simulated towel (scene/towel.js) hangs under head too: hiding it here lost it from the second patient on
  // (user: "수건 사라짐", 2026-10-15)
  return head.children.filter(o => !models.includes(o) && !handParts.includes(o) && !hands.includes(o) && !o.userData.keep);
}
let hiddenPrims = [];
/* applyLook calls restorePrimitiveHead() first, sets the primitive look, then setRealHead() last,
   so the next patient's own hair/glasses choices are never overwritten. */
export function restorePrimitiveHead(){
  hiddenPrims.forEach(o => { o.visible = o.userData.wasVisible; });
  hiddenPrims = [];
}
/* 영업 일지 cast (patient/cast.js) look overrides on a shared body: realHair {col, lift} recolours the hair cards (lift =
   flat emissive, so white hair works on a dark texture; a texture can only be darkened by a colour), realSkin tints the
   head and neck skin. Always reset, since patients share a model. */
function castTone(cur, look){
  const h = look && look.realHair, tint = new THREE.Color(look && look.realSkin || 0xffffff);
  if(cur.hair){
    cur.hair.visible = !(h && h.hide);
    if(h){ cur.hair.color.setHex(h.col); cur.hair.emissive.setHex(h.lift || 0); }
    else cur.hair.emissive.setHex(0);
  }
  if(cur.skin) cur.skin.color.copy(tint);
  (cur.bodyMeshes || []).forEach(o => {
    const m = o.material;
    if(m.userData.bodySkin) m.color.copy(tint);
    // the detailed (towel stage) shirt keeps its authored colour, so a cast gown has to be asked for (look.realGown)
    if(cur.towelStage && m.userData.shirt) m.color.copy(look && look.realGown ? new THREE.Color(look.gown) : m.userData.shirt);
  });
}
/* Realistic head + body of patient `id` (null: primitives). */
export function setRealPatient(id, look){
  wantModel = id; lastLook = look || lastLook;
  if(id && MODELS[id]) needModel(id).catch(() => {});   // the body on the table jumps the queue
  if(S.phase !== "intro" && (S.game === "towel" || S.game === "clinic")){
    loadTowelCharacters();
    if(id && MODELS[id] && !NO_STAGE.has(id)) needModel(id, true).catch(() => {});
  }
  const cur = current();
  restorePrimitiveHead();
  allModels().forEach(m => { m.head.visible = m === cur; m.body.visible = m === cur; });
  if(S.game === "towel") document.documentElement.dataset.towelPatient = cur?.towelStage ? id : "fallback";
  bodyParts.forEach(m => { m.visible = !cur; });
  if(cur){
    hiddenPrims = primitiveHeadParts();
    hiddenPrims.forEach(o => { o.userData.wasVisible = o.visible; o.visible = false; });
    if(look && cur.hair) cur.hair.color.setHex(cur.towelStage ? 0xffffff : look.hairTint || 0xffffff);
    castTone(cur, look);
  }
  syncArms();
}
export const realHeadActive = () => !!current();

/* Per frame from the loop: ease blendshapes toward the face state, and mirror the in-zone glow on the skin.
   t: seconds (the face's own motion), breathIn: 0..1 breath fill (nostrils). */
export function updateRealFace(face, blinking, k, glow, t = 0, breathIn = 0){
  const w = expressionWeights(face, blinking, t, breathIn);
  const cur = current();
  if(!cur) return;
  cur.morphs.forEach(o => {
    const dict = o.morphTargetDictionary, inf = o.morphTargetInfluences;
    for(const name in w){
      const i = dict[name];
      if(i !== undefined) inf[i] += (w[name] - inf[i]) * k;
    }
  });
  if(cur.skin) cur.skin.emissiveIntensity = glow;
  if(cur.decals){
    // the x-ray fades the skin: the paintings fade with it
    const dw = decalWeights(w), sk = cur.skin, fade = sk.transparent ? sk.opacity : 1;
    cur.decals.forEach(({mesh, name, part}) => {
      const m = mesh.material;
      m.userData.w = (m.userData.w || 0) + ((name === "fix" ? 1 : dw[name][part]) - (m.userData.w || 0))*k;
      m.opacity = m.userData.w*fade;
      mesh.visible = m.opacity > 0.004;
      m.color.copy(sk.color); m.emissiveIntensity = glow;
    });
  }
}

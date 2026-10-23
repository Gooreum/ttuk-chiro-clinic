import { t as tr } from "../i18n/index.js";
import * as THREE from "three";
import { scene } from "./renderer.js";
import { roomMeshes, headRest } from "./room.js";
import { loadModel, getEnv } from "./realAssets.js";
import { withVisualIds } from "./visualBuild.js";
import { S } from "../game/state.js";

// No suite GLB, textures or material allocations until a clinic or towel stage starts.
let suite = null, loading = false, enabled = false, saved = null;
let signCanvas = null, signTexture = null, signMode = null;
const suiteMaterials = new Map();
const surface = (m, kind) => {
  m.onBeforeCompile = shader => {
    shader.vertexShader = "varying vec3 vSuitePosition;\n" + shader.vertexShader.replace(
      "#include <begin_vertex>", "#include <begin_vertex>\n vSuitePosition = position;");
    shader.fragmentShader = "varying vec3 vSuitePosition;\n" + shader.fragmentShader.replace(
      "#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
      float grain = fract(sin(dot(floor(vSuitePosition*${kind === "leather" ? "1900.0" : "900.0"}), vec3(12.9898,78.233,39.425)))*43758.5453);
      roughnessFactor = clamp(roughnessFactor + (grain - .5)*.12, .52, 1.0);
      diffuseColor.rgb *= .97 + grain*.045;`);
  };
  m.customProgramCacheKey = () => "towel-suite-" + kind + "-v1";
};
function paintSign(){
  if(!signCanvas || signMode === S.game) return;
  const clinic = S.game === "clinic", x = signCanvas.getContext("2d");
  x.fillStyle = "#f4efe4"; x.fillRect(0, 0, 1024, 512);
  x.strokeStyle = "#17312c"; x.lineWidth = 5; x.strokeRect(22, 22, 980, 468);
  x.fillStyle = "#17312c"; x.font = '86px "Black Han Sans"'; x.fillText(tr(clinic ? "진료실" : "견인실"), 66, 175);
  x.font = '500 32px "IBM Plex Sans KR"'; x.fillText(tr("뚝 카이로 클리닉"), 70, 245);
  x.fillStyle = "#ff7a59"; x.fillRect(70, 298, 110, 12);
  x.fillStyle = "#17312c"; x.font = '128px "Black Han Sans"'; x.fillText(clinic ? "01" : "02", 700, 384);
  signMode = S.game;
  if(signTexture) signTexture.needsUpdate = true;
}
function signage(){
  signCanvas = document.createElement("canvas"); signCanvas.width = 1024; signCanvas.height = 512;
  paintSign();
  signTexture = new THREE.CanvasTexture(signCanvas); signTexture.encoding = THREE.sRGBEncoding;
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(.57, .285), new THREE.MeshStandardMaterial({map: signTexture, roughness: .84}));
  plaque.position.set(.08, 1.91, -2.289); return plaque;
}
function prepare(g, env){
  suite = g.scene; suite.name = "towel-stage-suite";
  suite.traverse(o => {
    if(!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    const m = o.material; m.envMap = env; m.envMapIntensity = .16;
    suiteMaterials.set(m.name, m);
    if(m.name === "suite.leather") surface(m, "leather");
    if(m.name === "suite.paper") surface(m, "paper");
  });
  withVisualIds(() => suite.add(signage()));
  suite.visible = false; scene.add(suite);
  document.documentElement.dataset.towelStage = "ready";
}
function activate(){
  const lights = scene.children.filter(o => o.isLight);
  saved = {
    visibility: roomMeshes.map(o => o.visible),
    headRestMaterials: headRest.map(o => o.material),
    background: scene.background, fog: scene.fog,
    lights: lights.map(o => ({o, color: o.color.clone(), ground: o.groundColor?.clone(), intensity: o.intensity}))
  };
  withVisualIds(() => {
    const col = new THREE.Color(0x17312c); scene.background = col;
    scene.fog = new THREE.Fog(col, 5, 11);
  });
  for(const s of saved.lights){
    // One shadow-casting key models the forms; restrained soft fill leaves the
    // elbow/knuckle planes legible. Reuse the same four lights and shadow map.
    if(s.o.isHemisphereLight){ s.o.color.setHex(0xf4efe4); s.o.groundColor.setHex(0x17312c); s.o.intensity = .43; }
    else if(s.o.isDirectionalLight){ s.o.color.setHex(0xf4efe4); s.o.intensity = 1.24; }
    else if(s.o.position.z > 2){ s.o.color.setHex(0x8adfbf); s.o.intensity = .16; }
    else { s.o.color.setHex(0xf4efe4); s.o.intensity = .19; }
  }
  enabled = true;
}
export function updateTowelStage(on){
  if(on && !loading){
    loading = true;
    Promise.all([loadModel("towel-stage/room.glb"), getEnv(), document.fonts.ready]).then(([g, env]) => prepare(g, env))
      .catch(err => { document.documentElement.dataset.towelStage = "failed"; console.warn("towel suite not loaded", err); });
  }
  if(!suite) return;
  if(on && !enabled) activate();
  if(!on && enabled){
    roomMeshes.forEach((o, i) => { o.visible = saved.visibility[i]; });
    headRest.forEach((o, i) => { o.material = saved.headRestMaterials[i]; });
    scene.background = saved.background; scene.fog = saved.fog;
    for(const s of saved.lights){ s.o.color.copy(s.color); s.o.intensity = s.intensity; if(s.ground) s.o.groundColor.copy(s.ground); }
    saved = null; enabled = false;
  }
  if(enabled){
    paintSign();
    // The first-person clinic still uses its original head extension. Match its
    // upholstery to the suite; the third-person towel stage keeps it folded away.
    headRest.forEach((o, i) => { o.material = S.game === "clinic" ? suiteMaterials.get(i ? "suite.paper" : "suite.leather") || saved.headRestMaterials[i] : saved.headRestMaterials[i]; });
    roomMeshes.forEach(o => { o.visible = false; });
  }
  suite.visible = enabled;
}

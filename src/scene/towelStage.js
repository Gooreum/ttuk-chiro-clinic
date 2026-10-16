import * as THREE from "three";
import { scene } from "./renderer.js";
import { roomMeshes } from "./room.js";
import { loadModel, getEnv } from "./realAssets.js";
import { withVisualIds } from "./visualBuild.js";

// No suite GLB, textures or material allocations until the towel stage starts.
let suite = null, loading = false, enabled = false, saved = null;
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
function signage(){
  const canvas = document.createElement("canvas"); canvas.width = 1024; canvas.height = 512;
  const x = canvas.getContext("2d");
  x.fillStyle = "#f4efe4"; x.fillRect(0, 0, 1024, 512);
  x.strokeStyle = "#17312c"; x.lineWidth = 5; x.strokeRect(22, 22, 980, 468);
  x.fillStyle = "#17312c"; x.font = '86px "Black Han Sans"'; x.fillText("견인실", 66, 175);
  x.font = '500 32px "IBM Plex Sans KR"'; x.fillText("뚝 카이로 클리닉", 70, 245);
  x.fillStyle = "#ff7a59"; x.fillRect(70, 298, 110, 12);
  x.fillStyle = "#17312c"; x.font = '128px "Black Han Sans"'; x.fillText("02", 700, 384);
  const tex = new THREE.CanvasTexture(canvas); tex.encoding = THREE.sRGBEncoding;
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(.57, .285), new THREE.MeshStandardMaterial({map: tex, roughness: .84}));
  plaque.position.set(.08, 1.91, -2.289); return plaque;
}
function prepare(g, env){
  suite = g.scene; suite.name = "towel-stage-suite";
  suite.traverse(o => {
    if(!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    const m = o.material; m.envMap = env; m.envMapIntensity = .16;
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
    background: scene.background, fog: scene.fog,
    lights: lights.map(o => ({o, color: o.color.clone(), ground: o.groundColor?.clone(), intensity: o.intensity}))
  };
  withVisualIds(() => {
    const col = new THREE.Color(0x17312c); scene.background = col;
    scene.fog = new THREE.Fog(col, 5, 11);
  });
  for(const s of saved.lights){
    if(s.o.isHemisphereLight){ s.o.color.setHex(0xf4efe4); s.o.groundColor.setHex(0x17312c); s.o.intensity = .68; }
    else if(s.o.isDirectionalLight){ s.o.color.setHex(0xf4efe4); s.o.intensity = 1.05; }
    else if(s.o.position.z > 2){ s.o.color.setHex(0x8adfbf); s.o.intensity = .35; }
    else { s.o.color.setHex(0xf4efe4); s.o.intensity = .48; }
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
    scene.background = saved.background; scene.fog = saved.fog;
    for(const s of saved.lights){ s.o.color.copy(s.color); s.o.intensity = s.intensity; if(s.ground) s.o.groundColor.copy(s.ground); }
    saved = null; enabled = false;
  }
  if(enabled) roomMeshes.forEach(o => { o.visible = false; });
  suite.visible = enabled;
}

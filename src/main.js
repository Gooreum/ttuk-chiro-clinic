import "./boot.js";
import "./ui/clinic-hud.css";
/* Boot. Import order matters: the scene is built by module side effects, and room meshes must be added
   before the patient so the scene graph matches the single-file prototype. */
import "./tuning.js";
import { ROSTER, makePatients } from "./patient/roster.js";
import "./scene/renderer.js";
import "./scene/textures.js";
import "./scene/room.js";
import "./scene/shopProps.js";
import "./scene/patientModel.js";
import { applyLook } from "./scene/look.js";
import { loadRealAssets } from "./scene/realAssets.js";
import { loadSpine } from "./scene/xray.js";
import { layout } from "./input/orientation.js";
import "./input/pointer.js";
import "./ui/tuneSheet.js";
import { setFace, finish } from "./game/flow.js";
import { readColors } from "./ui/ring.js";
import { frame } from "./game/loop.js";
import { S } from "./game/state.js";
import { camera } from "./scene/renderer.js";
import { markReady } from "./platform/analytics.js";

readColors();
loadRealAssets();
loadSpine();
// ?patient=마동철 (user: "링크 클릭하면 바로 보이게 해야지", 2026-10-24): that patient lies on the table from the first frame
// (its body loads first) and the free run starts by itself once the head is in; no sensor tap, so drag / keys steer
const pickName = new URLSearchParams(location.search).get("patient"), pick = ROSTER.find(r => r.name === pickName);
applyLook(pick || ROSTER[0]);
if(pick){
  const go = () => document.documentElement.dataset.head ? document.getElementById(new URLSearchParams(location.search).get("mode") === "towel" ? "startTowel" : "start").click() : setTimeout(go, 200);
  go();
}
setFace("rest");
layout();
// load_ready once the first frame has drawn (an error in it instead shows the 다시 시도 card)
requestAnimationFrame(t => { frame(t); markReady(); });
// e2e/shot build only (`npm run build:shot`): tests read the game state; the normal build drops this line.
// roll(name): one roster patient rolled the game's way (e2e/body.spec.js puts the body types on the table)
if(__FORCE_HIT__ || __CASES__) window.__game = { S, finish, camera, roll: name => makePatients(Math.random, 1, ROSTER.filter(p => p.name === name))[0] };
// case build only (`npm run build:cases`): ?case=<id> replays a scripted case live (src/dev/caseRunner.js)
if(__CASES__) import("./dev/caseNeck.js");
// case build + ?necklab=base|chain only: the neck-rig comparison lab (src/dev/neckLab.js)
if(__CASES__ && new URLSearchParams(location.search).has("necklab")) import("./dev/neckLab.js");

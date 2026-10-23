import "./boot.js";
import "./ui/clinic-hud.css";
/* Boot. Import order matters: the scene is built by module side effects, and room meshes must be added
   before the patient so the scene graph matches the single-file prototype. */
import "./tuning.js";
import { ROSTER } from "./patient/roster.js";
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
applyLook(ROSTER[0]);
setFace("rest");
layout();
// load_ready once the first frame has drawn (an error in it instead shows the 다시 시도 card)
requestAnimationFrame(t => { frame(t); markReady(); });
// e2e/shot build only (`npm run build:shot`): tests read the game state; the normal build drops this line.
if(__FORCE_HIT__ || __CASES__) window.__game = { S, finish, camera };
// case build only (`npm run build:cases`): ?case=<id> replays a scripted case live (src/dev/caseRunner.js)
if(__CASES__) import("./dev/caseNeck.js");

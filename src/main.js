/* Boot. Import order matters: the scene is built by module side effects, and room meshes must be added
   before the patient so the scene graph matches the single-file prototype. */
import "./tuning.js";
import { ROSTER } from "./patient/roster.js";
import "./scene/renderer.js";
import "./scene/textures.js";
import "./scene/room.js";
import "./scene/patientModel.js";
import { applyLook } from "./scene/look.js";
import { layout } from "./input/orientation.js";
import "./input/pointer.js";
import "./ui/tuneSheet.js";
import { setFace } from "./game/flow.js";
import { readColors } from "./ui/ring.js";
import { frame } from "./game/loop.js";

readColors();
applyLook(ROSTER[0]);
setFace("rest");
layout();
requestAnimationFrame(frame);

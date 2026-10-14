import { $ } from "../lib/dom.js";
import { T } from "../tuning.js";
import { S } from "../game/state.js";
import { applyDelta } from "../game/feel.js";
import { adjust } from "../game/flow.js";
import { toast } from "../ui/hud.js";
import { canvas } from "../scene/renderer.js";

/* Drag / swipe / keyboard fallback (no sensor, or desktop). Drag deltas are mapped through S.viewRot. */
let drag = null, swipePeak = 0;
canvas.addEventListener("pointerdown", e => {
  drag = {x:e.clientX, y:e.clientY, t:performance.now()}; swipePeak = 0;
  try{ canvas.setPointerCapture(e.pointerId); }catch(err){}
});
canvas.addEventListener("pointermove", e => {
  if(!drag || S.phase !== "play" || S.busy) return;
  const now = performance.now();
  const px = e.clientX - drag.x, py = e.clientY - drag.y;
  const dx = S.viewRot === 90 ? py : S.viewRot === 270 ? -py : px;
  const dy = S.viewRot === 90 ? -px : S.viewRot === 270 ? px : py;
  const speed = Math.hypot(dx, dy) / Math.max(1, now - drag.t);
  drag = {x:e.clientX, y:e.clientY, t:now};
  if(speed > 1.6){ swipePeak = speed; return; }
  if(speed < 0.6) swipePeak = 0;
  if(S.mode === "tilt") return;
  const g = T.sens/1.5;
  applyDelta(dx*0.32*g, -dy*0.24*g*T.bend);
});
canvas.addEventListener("pointerup", () => {
  if(drag && swipePeak > 1.6 && performance.now() - drag.t < 140) adjust("swipe");
  drag = null; swipePeak = 0;
});
canvas.addEventListener("pointercancel", () => { drag = null; swipePeak = 0; });
addEventListener("keydown", e => {
  if(S.phase !== "play" || !$("#tune").hidden) return;
  const k = e.key;
  if(k === "ArrowLeft") applyDelta(-2, 0);
  else if(k === "ArrowRight") applyDelta(2, 0);
  else if(k === "ArrowUp") applyDelta(0, 1.5);
  else if(k === "ArrowDown") applyDelta(0, -1.5);
  else if(k === " " || k === "Enter"){ e.preventDefault(); adjust("button"); return; }
  else return;
  e.preventDefault();
});
$("#zero").addEventListener("click", () => { S.input.rot = 0; S.input.bend = 0; toast("머리를 가운데로", 700); });

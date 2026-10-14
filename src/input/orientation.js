import { $ } from "../lib/dom.js";
import { T } from "../tuning.js";
import { S } from "../game/state.js";
import { canvas, renderer, camera, camBase, camLook } from "../scene/renderer.js";
import { sizeHud } from "../ui/ring.js";

/* Camera framing + self-rotating landscape (AGENTS.md 3-4).
   iOS Safari can't lock orientation, so on a portrait viewport the whole #app is rotated by 90/270 and
   S.viewRot is fed into the sensor angle and drag mapping. Sizes come from clientWidth/clientHeight
   (pre-rotation layout), never getBoundingClientRect. */
export function resize(){
  const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w/h;
  if(camera.aspect >= 1.2){
    // landscape: therapist's eye line, head just below the middle of the screen
    camBase.set(0, 1.52, -0.2); camLook.set(0, 0.98, 0.3); camera.fov = 50;
  }else if(camera.aspect >= 0.9){
    camBase.set(0, 1.55, -0.24); camLook.set(0, 0.97, 0.32); camera.fov = 56;
  }else{
    camBase.set(0, 1.62, -0.3); camLook.set(0, 0.96, 0.3); camera.fov = 68;
  }
  camera.updateProjectionMatrix();
  sizeHud(w, h);
}
export const app = $("#app");
export const isTouch = matchMedia("(pointer: coarse)").matches;
let lastLandscape = 90;
export function physAngle(){
  const a = (screen.orientation && typeof screen.orientation.angle === "number") ? screen.orientation.angle
        : (typeof window.orientation === "number" ? window.orientation : 0);
  return ((a % 360) + 360) % 360;
}
export function layout(){
  const W = innerWidth, H = innerHeight;
  const pa = physAngle();
  if(pa === 90 || pa === 270) lastLandscape = pa;
  let rot = 0;
  if(isTouch && H > W && !T.portrait){
    rot = lastLandscape === 270 ? 270 : 90;
    if(T.flip) rot = rot === 90 ? 270 : 90;
  }
  S.viewRot = rot;
  const st = app.style;
  if(rot){
    app.classList.add("rotated");
    st.width = H + "px"; st.height = W + "px";
    st.transform = rot === 90 ? `translateX(${W}px) rotate(90deg)` : `translateY(${H}px) rotate(-90deg)`;
    st.setProperty("--gl", rot === 90 ? "calc(16px + env(safe-area-inset-top, 0px))" : "calc(16px + env(safe-area-inset-bottom, 0px))");
    st.setProperty("--gr", rot === 90 ? "calc(16px + env(safe-area-inset-bottom, 0px))" : "calc(16px + env(safe-area-inset-top, 0px))");
  }else{
    app.classList.remove("rotated");
    st.width = st.height = st.transform = "";
    st.removeProperty("--gl"); st.removeProperty("--gr");
  }
  $("#lockTip").hidden = !isTouch || T.portrait;
  resize();
}
addEventListener("resize", layout);
if(screen.orientation && screen.orientation.addEventListener) screen.orientation.addEventListener("change", layout);

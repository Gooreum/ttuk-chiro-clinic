import { $ } from "../lib/dom.js";
import { T, saveT, resetT } from "../tuning.js";
import { layout } from "../input/orientation.js";
import { setAmbient } from "../audio/audio.js";

/* Tuning sheet: sliders/checkboxes map 1:1 onto T. */
const SLIDERS = [
  ["sens", v => "×" + (+v).toFixed(1)], ["bend", v => "×" + (+v).toFixed(1)],
  ["heavy", v => Math.round(v*100) + "%"], ["tol", v => "×" + (+v).toFixed(2)],
  ["flick", v => v + "°/s"], ["jerk", v => (+v).toFixed(1) + " m/s²"]
];
const CHECKS = ["breath","tick","sound","flip","portrait"];
function syncTune(){
  SLIDERS.forEach(([k, fmt]) => { $("#t-"+k).value = T[k]; $("#v-"+k).textContent = fmt(T[k]); });
  CHECKS.forEach(k => { $("#t-"+k).checked = !!T[k]; });
}
SLIDERS.forEach(([k, fmt]) => $("#t-"+k).addEventListener("input", e => { T[k] = parseFloat(e.target.value); $("#v-"+k).textContent = fmt(T[k]); saveT(); }));
CHECKS.forEach(k => $("#t-"+k).addEventListener("change", e => {
  T[k] = e.target.checked; saveT();
  if(k === "flip" || k === "portrait") layout();
  if(k === "sound") setAmbient();
}));
$("#treset").addEventListener("click", () => { resetT(); saveT(); syncTune(); layout(); setAmbient(); });
$("#tuneBtn").addEventListener("click", () => { syncTune(); $("#tune").hidden = false; });
$("#tclose").addEventListener("click", () => { $("#tune").hidden = true; });
syncTune();

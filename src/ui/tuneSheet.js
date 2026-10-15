import { $ } from "../lib/dom.js";
import { T, saveT, resetT } from "../tuning.js";
import { layout } from "../input/orientation.js";
import { setAmbient, vib } from "../audio/audio.js";

/* Tuning sheet: sliders/checkboxes map 1:1 onto T. */
const SLIDERS = [
  ["sens", v => "×" + (+v).toFixed(1)], ["bend", v => "×" + (+v).toFixed(1)],
  ["heavy", v => Math.round(v*100) + "%"], ["tol", v => "×" + (+v).toFixed(2)],
  ["flick", v => v + "°/s"], ["jerk", v => (+v).toFixed(1) + " m/s²"]
];
const CHECKS = ["breath","tick","sound","music","flip","portrait"];
function syncTune(){
  SLIDERS.forEach(([k, fmt]) => { $("#t-"+k).value = T[k]; $("#v-"+k).textContent = fmt(T[k]); });
  CHECKS.forEach(k => { $("#t-"+k).checked = !!T[k]; });
  syncMusic();
}
// the quick music switch by the tuning button (same T.music as the sheet's checkbox, kept in localStorage)
function syncMusic(){
  const b = $("#musicBtn");
  b.textContent = T.music ? "음악" : "음악 끔"; b.classList.toggle("off", !T.music); b.setAttribute("aria-pressed", T.music ? "true" : "false");
}
$("#musicBtn").addEventListener("click", () => { T.music = !T.music; saveT(); syncTune(); setAmbient(); });
SLIDERS.forEach(([k, fmt]) => $("#t-"+k).addEventListener("input", e => { T[k] = parseFloat(e.target.value); $("#v-"+k).textContent = fmt(T[k]); saveT(); }));
CHECKS.forEach(k => $("#t-"+k).addEventListener("change", e => {
  T[k] = e.target.checked; saveT();
  if(k === "flip" || k === "portrait") layout();
  if(k === "sound" || k === "music"){ setAmbient(); syncMusic(); }
}));
$("#treset").addEventListener("click", () => { resetT(); saveT(); syncTune(); layout(); setAmbient(); });
$("#tuneBtn").addEventListener("click", () => { syncTune(); $("#tune").hidden = false; });
// tells a phone that never buzzes apart: the browser can't (iPhone, in-app browsers) or the phone's settings mute it
$("#tvib").addEventListener("click", () => {
  $("#vibMsg").textContent = vib([200, 80, 200]) ? "진동 신호를 보냈어요. 안 느껴지면 무음·진동 세기 설정을 확인해 주세요"
    : "이 브라우저는 진동을 못 써요 (아이폰, 카톡 등 앱 안 브라우저). 크롬으로 열어 주세요";
});
$("#tclose").addEventListener("click", () => { $("#tune").hidden = true; });
syncTune();

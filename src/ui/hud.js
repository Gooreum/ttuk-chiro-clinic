import { $ } from "../lib/dom.js";
import { S } from "../game/state.js";
import { canvas, camera } from "../scene/renderer.js";
import { head, tmpA, tmpB, tmpC } from "../scene/patientModel.js";
import { TRAITS } from "../patient/roster.js";

/* DOM HUD helpers: toast, speech bubble, floating text, chart card, mini spine, mode line. */
let toastTimer = 0, bubbleTimer = 0;
export function toast(msg, ms=1200){
  const t = $("#toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(()=>t.classList.remove("show"), ms);
}
/* loud: a wrong-crack line, bigger with a coral rim and a shake */
export function say(text, ms=1800, loud=false){
  hideCoach();   // the patient's bubble and the therapist's pill sit at the same height: the latest line wins
  const b = $("#bubble"); b.textContent = text; b.classList.add("show");
  b.classList.remove("loud"); if(loud){ void b.offsetWidth; b.classList.add("loud"); }   // restart the shake
  clearTimeout(bubbleTimer); bubbleTimer = setTimeout(()=>b.classList.remove("show"), ms);
}
/* The therapist's own line (prep talk, breath cue). The patient keeps the paper bubble; this is a small dark pill. */
let coachTimer = 0;
export function coach(text, ms=1600){
  let c = document.getElementById("coach");
  if(!c){ c = document.createElement("div"); c.id = "coach"; $("#app").appendChild(c); }
  c.textContent = "";
  const who = document.createElement("small"); who.textContent = "선생님";
  c.append(who, text);
  c.classList.add("show");
  clearTimeout(bubbleTimer); $("#bubble").classList.remove("show");
  clearTimeout(coachTimer); coachTimer = setTimeout(()=>c.classList.remove("show"), ms);
}
/* A wrong crack: a big tilted stamp on the empty floor left of the patient, the onomatopoeia over the old toast line. */
let stampTimer = 0;
export function stamp(word, sub, kind, ms = 1700){
  let s = document.getElementById("stamp");
  if(!s){ s = document.createElement("div"); s.id = "stamp"; $("#app").appendChild(s); }
  s.textContent = "";
  const b = document.createElement("b"); b.textContent = word;
  const sm = document.createElement("small"); sm.textContent = sub;
  s.append(b, sm);
  s.className = ""; void s.offsetWidth; s.className = "show " + kind;   // restart the pop
  clearTimeout(stampTimer); stampTimer = setTimeout(() => s.classList.remove("show"), ms);
}
export function hideCoach(){ clearTimeout(coachTimer); const c = document.getElementById("coach"); if(c) c.classList.remove("show"); }
export const headScreen = {x:0, y:0, r:60};
export function projectHead(){
  head.getWorldPosition(tmpA);
  tmpB.copy(tmpA); tmpB.project(camera);
  const cw = canvas.clientWidth, ch = canvas.clientHeight;
  headScreen.x = (tmpB.x+1)/2*cw; headScreen.y = (1-tmpB.y)/2*ch;
  // head radius on screen
  tmpC.copy(tmpA).addScaledVector(camera.up, 0.13).project(camera);
  headScreen.r = Math.abs((1-tmpC.y)/2*ch - headScreen.y);
}
export function floater(text, dx, dy, cls, ms = 1000){
  const el = document.createElement("div");
  el.className = "float" + (cls ? " " + cls : "");
  el.textContent = text;
  el.style.left = (headScreen.x + dx) + "px";
  el.style.top = Math.min(headScreen.y + dy, (canvas.clientHeight || innerHeight) - 56) + "px";   // head sits low: keep it on screen
  $("#app").appendChild(el);
  setTimeout(()=>el.remove(), ms);
}
export function renderPain(){ document.querySelectorAll(".pain i").forEach((el,i)=>el.classList.toggle("on", i < S.pain)); }
export function renderDots(){
  const d = $("#dots"); d.textContent = "";
  S.patients.forEach((p, i) => { const e = document.createElement("i"); if(i < S.idx) e.className = "done"; else if(i === S.idx) e.className = "now"; d.appendChild(e); });
}
export function renderSpine(n, s = $("#spine")){
  s.textContent = "";
  const top = document.createElement("span"); top.textContent = "C1"; s.appendChild(top);
  for(let i=1;i<=7;i++){ const b = document.createElement("b"); b.style.width = (14 + i*2) + "px"; if(i === n || i === n+1) b.className = "hit"; s.appendChild(b); }
  const bot = document.createElement("span"); bot.textContent = "C7"; s.appendChild(bot);
}
/* The big medical chart (user: "환자가 바뀔때 잠깐 화면 가운데에… 게임 시작되면 접게… 터치하면 다시 열리게… 진짜
   차트 모양처럼", 2026-10-15). game/flow.js opens it for each new patient through the prep and folds it when the head is
   handed over; the small chart top left opens it again. While it is open, aiming and cracking stop (uiBlocked). */
export function renderChartSheet(target, idx, total, hint = ""){
  const tr = target.trait ? TRAITS[target.trait] : null, seg = `C${target.seg}–C${target.seg+1}`;
  $("#csNo").textContent = `No.${String(idx+1).padStart(2,"0")}`; $("#csTime").textContent = clockTxt(idx);
  $("#csName").textContent = target.name; $("#csAge").textContent = `${target.age}세`;
  $("#csVisit").textContent = `${idx+1}번째 / ${total}`; $("#csTrait").textContent = tr ? tr.label : "—";
  $("#csCC").textContent = target.cc;
  $("#csSeg").textContent = seg;
  $("#csPlan").textContent = `${target.side > 0 ? "오른쪽" : "왼쪽"} 회전 교정 · 양쪽 모두`;
  $("#csNote").textContent = [tr ? tr.desc : "", hint || (tr ? "" : "숨을 내쉴 때 툭 꺾어 주세요")].filter(Boolean).join(" · ");
  renderSpine(target.seg, $("#csSpine"));
}
let sheetTimer = 0;
// fit the sheet on the screen: #app's pre-rotation size (input/orientation.js), never vh, which is the portrait viewport
// when #app is rotated. --fx/--fy: how far it folds toward the small chart top left
function fitSheet(el){
  const app = $("#app"), b = el.querySelector(".board");
  b.style.setProperty("--fit", 1);
  const k = Math.min(1, (app.clientHeight - 24)/b.offsetHeight, (app.clientWidth - 24)/b.offsetWidth);
  b.style.setProperty("--fit", Math.max(0.6, k).toFixed(3));
  b.style.setProperty("--fx", -0.38*app.clientWidth + "px");
  b.style.setProperty("--fy", -0.38*app.clientHeight + "px");
}
export function openChart(auto){
  if(!auto && (S.phase !== "play" || S.busy || S.chartOpen)) return;
  const el = $("#chartSheet");
  clearTimeout(sheetTimer);
  $("#csHint").textContent = auto ? "잠시 후 시작해요 · 탭해서 닫기" : "탭해서 닫기";
  el.hidden = false; fitSheet(el); el.classList.remove("closing"); el.classList.remove("opening"); void el.offsetWidth; el.classList.add("opening");
  S.chartOpen = true;
}
export function closeChart(){
  if(!S.chartOpen) return;
  S.chartOpen = false;
  const el = $("#chartSheet");
  el.classList.remove("opening"); el.classList.add("closing");   // folds toward the small chart top left
  clearTimeout(sheetTimer); sheetTimer = setTimeout(() => { el.hidden = true; el.classList.remove("closing"); }, 340);
}
// aiming and cracking stop while the tuning sheet or the big chart is up
export const uiBlocked = () => !$("#tune").hidden || S.chartOpen;
$("#chartMini").addEventListener("click", () => openChart(false));
$("#chartSheet").addEventListener("click", closeChart);
export const clockTxt = i => { const m = 120 + i*20; const h = Math.floor(m/60), mm = String(m%60).padStart(2,"0"); return `오후 ${h}:${mm}`; };
export function renderCombo(){ $("#combo").textContent = S.streak >= 2 ? `연속 성공 ×${S.streak}` : ""; }
export function setModeText(){
  if(S.game === "towel"){
    $("#mode").innerHTML = S.mode === "tilt" ? "<b>위쪽을 몸 쪽으로 젖혀</b> 수건 장력 · <b>툭 당겨</b> 견인"
      : `<b>위아래 드래그</b>로 수건 장력 · <b>휙 쓸어서</b> 당기기${matchMedia("(pointer: coarse)").matches ? "" : " · 스페이스"}`;
    return;
  }
  $("#mode").innerHTML = S.mode === "tilt"
    ? "<b>핸들처럼 돌려</b> 회전 · <b>위쪽을 젖혀</b> 위아래 · <b>툭 꺾어</b> 교정"
    : `<b>천천히 드래그</b>로 각도 · <b>휙 쓸어서</b> 교정${matchMedia("(pointer: coarse)").matches ? "" : " · 스페이스"}`;
}
// the title's credits: the copyright and the third-party assets that must be credited (CREDITS.md)
$("#creditsBtn").addEventListener("click", () => { $("#credits").hidden = false; });
$("#creditsClose").addEventListener("click", () => { $("#credits").hidden = true; });

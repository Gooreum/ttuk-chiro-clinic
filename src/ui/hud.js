import { makeHud } from "./hudDom.js";
import { $ } from "../lib/dom.js";
import { S } from "../game/state.js";
import { canvas, camera } from "../scene/renderer.js";
import { head, tmpA, tmpB, tmpC } from "../scene/patientModel.js";
import { TRAITS } from "../patient/roster.js";

/* DOM HUD helpers: toast, speech bubble, floating text, chart card, mini spine, mode line. */
const domHud = makeHud($("#app"));
export const { toast, say, coach, stamp, hideCoach, hideSpeech } = domHud;
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
  domHud.floater(text, headScreen.x + dx,
    Math.min(headScreen.y + dy, (canvas.clientHeight || innerHeight) - 56), cls, ms);
}
export function renderPain(){ document.querySelectorAll(".pain i").forEach((el,i)=>{ el.classList.toggle("on", i < S.pain); el.hidden = i >= S.painMax; }); }
export function renderDots(){
  const d = $("#dots"); d.textContent = "";
  // 심야 진료 (a list that keeps growing) and 보스 러시 (26 patients): a row of dots wrapped the chart's header to three lines (pt10b), so a count instead
  if(S.night || S.patients.length > 8){ d.classList.add("count"); d.textContent = S.night ? `${S.idx + 1}번째` : `${S.idx + 1}/${S.patients.length}`; return; }
  d.classList.remove("count");
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
export const uiBlocked = () => !$("#tune").hidden || !$("#clinicMenu").hidden || S.chartOpen;
$("#chartMini").addEventListener("click", () => openChart(false));
$("#chartSheet").addEventListener("click", closeChart);
export const clockTxt = i => { const m = 120 + i*20; const h = Math.floor(m/60), mm = String(m%60).padStart(2,"0"); return `오후 ${h}:${mm}`; };
export function renderCombo(){ $("#combo").textContent = S.streak >= 2 ? `연속 성공 ×${S.streak}` : ""; }
export function setModeText(){
  $("#app").classList.toggle("suite-look", S.game === "clinic" || S.game === "towel");
  $("#app").classList.toggle("towel-look", S.game === "towel");
  if(S.game === "towel"){
    $("#mode").innerHTML = S.mode === "tilt" ? "<b>위쪽을 몸 쪽으로 젖혀</b> 수건 장력 · <b>툭 당겨</b> 견인"
      : `<b>위아래 드래그</b>로 수건 장력 · <b>휙 쓸어서</b> 당기기${matchMedia("(pointer: coarse)").matches ? "" : ' <span class="towel-key">· 스페이스</span>'}`;
    return;
  }
  $("#mode").innerHTML = S.mode === "tilt"
    ? "<b>핸들처럼 돌려</b> 회전 · <b>위쪽을 젖혀</b> 위아래 · <b>툭 꺾어</b> 교정"
    : `<b>천천히 드래그</b>로 각도 · <b>휙 쓸어서</b> 교정${matchMedia("(pointer: coarse)").matches ? "" : " · 스페이스"}`;
}
// the title's credits: the copyright and the third-party assets that must be credited (CREDITS.md)
$("#creditsBtn").addEventListener("click", () => { $("#credits").hidden = false; });
$("#creditsClose").addEventListener("click", () => { $("#credits").hidden = true; });

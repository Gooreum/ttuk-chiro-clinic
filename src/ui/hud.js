import { makeHud } from "./hudDom.js";
import { $ } from "../lib/dom.js";
import { S } from "../game/state.js";
import { canvas, camera } from "../scene/renderer.js";
import { head, tmpA, tmpB, tmpC } from "../scene/patientModel.js";
import { t } from "../i18n/index.js";
import { TRAITS } from "../patient/roster.js";
import { bodyOf } from "../core/body.js";

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
export function renderPain(){
  document.querySelectorAll(".pain i").forEach((el,i)=>{ el.classList.toggle("on", i < S.pain); el.hidden = i >= S.painMax; });
  const p = $(".clinic-app .pain"); if(p) p.setAttribute("aria-label", t("통증 {n}회 / {max}회", {n: S.pain, max: S.painMax}));   // like back / side
}
export function renderDots(){
  const d = $("#dots"); d.textContent = "";
  // 심야 진료 (a list that keeps growing) and 보스 러시 (26 patients): a row of dots wrapped the chart's header to three lines (pt10b), so a count instead
  if(S.night || S.patients.length > 8){ d.classList.add("count"); d.textContent = S.night ? t("{n}번째", {n: S.idx + 1}) : `${S.idx + 1}/${S.patients.length}`; return; }
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
  const tr = target.trait ? TRAITS[target.trait] : null, bd = bodyOf(target), seg = `C${target.seg}–C${target.seg+1}`;
  $("#csNo").textContent = `No.${String(idx+1).padStart(2,"0")}`; $("#csTime").textContent = clockTxt(idx);
  $("#csName").textContent = t(target.name); $("#csAge").textContent = t("{n}세", {n: target.age});
  $("#csVisit").textContent = t("{n}번째 / {total}", {n: idx+1, total}); $("#csTrait").textContent = [tr && t(tr.label), bd && t(bd.label)].filter(Boolean).join(" · ") || "—";
  $("#csCC").textContent = t(target.cc);
  $("#csSeg").textContent = seg;
  $("#csPlan").textContent = t("{side} 회전 교정 · 양쪽 모두", {side: t(target.side > 0 ? "오른쪽" : "왼쪽")});
  $("#csNote").textContent = [bd ? t(bd.desc) : "", tr ? t(tr.desc) : "", t(hint) || (tr || bd ? "" : t("숨을 내쉴 때 툭 꺾어 주세요"))].filter(Boolean).join(" · ");
  renderSpine(target.seg, $("#csSpine"));
}
let sheetTimer = 0;
// fit the sheet on the screen: #app's pre-rotation size (input/orientation.js), never vh, which is the portrait viewport
// when #app is rotated. --fx/--fy: how far it folds toward the small chart top left. Short screens (a landscape phone,
// 320-430px) get the compact sheet (.short, style.css); the whole board with its clamp and tilt goes in 88% of the height
// and nothing floors the scale, so it can't overflow (user: "차트 화면이 너무 커서 한번에 안보이고 잘려", 2026-10-23)
const TILT = Math.sin(1.2*Math.PI/180), CLAMP_UP = 10;   // the board's rotate(-1.2deg), the clamp's top:-10px
function fitSheet(el){
  const app = $("#app"), b = el.querySelector(".board"), W = app.clientWidth, H = app.clientHeight;
  el.classList.toggle("short", H < 460);
  b.style.setProperty("--fit", 1);
  const bw = b.offsetWidth, bh = b.offsetHeight;
  // centred, so the clamp's overhang counts on both sides
  const k = Math.min(1, H*0.88/(bh + bw*TILT + 2*CLAMP_UP), W*0.94/(bw + bh*TILT));
  b.style.setProperty("--fit", k.toFixed(3));
  b.style.setProperty("--fx", -0.38*W + "px");
  b.style.setProperty("--fy", -0.38*H + "px");
}
// turned / resized while it is open: fit again (the rotation swaps #app's width and height)
if(typeof ResizeObserver !== "undefined") new ResizeObserver(() => { if(S.chartOpen) fitSheet($("#chartSheet")); }).observe($("#app"));
else addEventListener("resize", () => requestAnimationFrame(() => { if(S.chartOpen) fitSheet($("#chartSheet")); }));
export function openChart(auto){
  if(!auto && (S.phase !== "play" || S.busy || S.chartOpen)) return;
  const el = $("#chartSheet");
  clearTimeout(sheetTimer);
  $("#csHint").textContent = t(auto ? "잠시 후 시작해요 · 탭해서 닫기" : "탭해서 닫기");
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
export const clockTxt = i => { const m = 120 + i*20; const h = Math.floor(m/60), mm = String(m%60).padStart(2,"0"); return t("오후 {h}:{mm}", {h, mm}); };
export function renderCombo(){ $("#combo").textContent = S.streak >= 2 ? t("연속 성공 ×{n}", {n: S.streak}) : ""; }
export function setModeText(){
  $("#app").classList.toggle("suite-look", S.game === "clinic" || S.game === "towel");
  $("#app").classList.toggle("towel-look", S.game === "towel");
  const key = matchMedia("(pointer: coarse)").matches ? "" : ' <span class="towel-key">' + t("· 스페이스") + "</span>";
  if(S.game === "towel"){
    // 좌우 중심 too: a skew is an ambulance (2026-10-23 audit)
    $("#mode").innerHTML = S.mode === "tilt" ? t("<b>위쪽을 젖혀</b> 장력 · <b>좌우로 기울여</b> 중심 · <b>툭 당겨</b> 견인")
      : t("<b>위아래</b> 장력 · <b>좌우</b> 중심 · <b>휙 쓸어서</b> 당기기") + key;
    return;
  }
  $("#mode").innerHTML = S.mode === "tilt"
    ? t("<b>핸들처럼 돌려</b> 회전 · <b>위쪽을 젖혀</b> 위아래 · <b>툭 꺾어</b> 교정")
    : t("<b>천천히 드래그</b>로 각도 · <b>휙 쓸어서</b> 교정") + key;
}
// the title's credits: the copyright and the third-party assets that must be credited (CREDITS.md)
$("#creditsBtn").addEventListener("click", () => { $("#credits").hidden = false; });
$("#creditsClose").addEventListener("click", () => { $("#credits").hidden = true; });

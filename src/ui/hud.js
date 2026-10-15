import { $ } from "../lib/dom.js";
import { S } from "../game/state.js";
import { canvas, camera } from "../scene/renderer.js";
import { head, tmpA, tmpB, tmpC } from "../scene/patientModel.js";

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
export function renderSpine(n){
  const s = $("#spine"); s.textContent = "";
  const top = document.createElement("span"); top.textContent = "C1"; s.appendChild(top);
  for(let i=1;i<=7;i++){ const b = document.createElement("b"); b.style.width = (14 + i*2) + "px"; if(i === n || i === n+1) b.className = "hit"; s.appendChild(b); }
  const bot = document.createElement("span"); bot.textContent = "C7"; s.appendChild(bot);
}
export const clockTxt = i => { const m = 120 + i*20; const h = Math.floor(m/60), mm = String(m%60).padStart(2,"0"); return `오후 ${h}:${mm}`; };
export function renderCombo(){ $("#combo").textContent = S.streak >= 2 ? `연속 성공 ×${S.streak}` : ""; }
export function setModeText(){
  $("#mode").innerHTML = S.mode === "tilt"
    ? "<b>핸들처럼 돌려</b> 회전 · <b>위쪽을 젖혀</b> 위아래 · <b>툭 꺾어</b> 교정"
    : "<b>천천히 드래그</b>로 각도 · <b>휙 쓸거나 버튼</b>으로 교정";
}

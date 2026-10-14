import { $ } from "../lib/dom.js";
import { store } from "../lib/store.js";
import { T } from "../tuning.js";
import { S } from "./state.js";
import { distNorm, breath } from "./feel.js";
import { TRAITS, REVIEWS, SHOW_ZONE_UNTIL, makePatients } from "../patient/roster.js";
import { scoreSuccess, rankTitle, patientStars, crackAvg } from "../core/scoring.js";
import { applyLook } from "../scene/look.js";
import { pickReaction } from "../core/faceRig.js";
import { pivot, sparks, tmpA } from "../scene/patientModel.js";
import { ensureAudio, setAmbient, crackSound, tone, chime, vib } from "../audio/audio.js";
import { toast, say, headScreen, floater, renderPain, renderDots, renderSpine, clockTxt, renderCombo, setModeText } from "../ui/hud.js";
import { isTouch, physAngle, layout } from "../input/orientation.js";
import { onMotion, onOrientation } from "../input/motion.js";

/* Flow: loadPatient -> adjust -> success / hurt -> (switchSide -> adjust -> success) -> next patient -> finish
   (day log, best score in localStorage "chiroBest"). Every patient is adjusted on the complaint side, then the opposite. */
let bannerTimer = 0;
let faceTok = 0;
export function setFace(f){ faceTok++; S.face = f; }
/* A run of faces, [ms from now, face] each. Any setFace (next side, next patient, a hurt) cancels what is left. */
function faceRun(steps){
  const tok = ++faceTok;
  // the first face goes on now: the loop's nervous-worry override (base faces only) must not slip in before it
  steps.forEach(([ms, f]) => { if(ms <= 0) S.face = f; else setTimeout(() => { if(tok === faceTok) S.face = f; }, ms); });
}
// S.target = patient merged with the side being adjusted, so distAt / ring / x-ray read rot, bend, side as before.
function aimAt(i){
  const p = S.patients[S.idx];
  S.sideIdx = i;
  S.target = {...p, ...p.sides[i]};
  return S.target;
}
const sideLabel = t => `C${t.seg}–C${t.seg+1} · ${t.side > 0 ? "오른쪽" : "왼쪽"} 회전 ${S.sideIdx+1}/2`;
function showBanner(no, name, trait){
  $("#bnNo").textContent = no; $("#bnName").textContent = name; $("#bnTrait").textContent = trait;
  $("#banner").classList.add("show");
  clearTimeout(bannerTimer); bannerTimer = setTimeout(()=>$("#banner").classList.remove("show"), 2300);
}
function loadPatient(){
  S.busy = true;
  $("#fade").classList.add("on");
  setTimeout(() => {
    S.sidePts = []; S.sideStars = [];
    const target = aimAt(0);
    applyLook(target);
    $("#pno").textContent = `진료 차트 No.${String(S.idx+1).padStart(2,"0")}`;
    $("#clock").textContent = clockTxt(S.idx);
    $("#pname").textContent = target.name;
    $("#page").textContent = `${target.age}세`;
    $("#pcc").textContent = target.cc;
    $("#pseg").textContent = sideLabel(target);
    const tr = target.trait ? TRAITS[target.trait] : null;
    $("#ptrait").hidden = !tr; if(tr) $("#ptrait").textContent = tr.label;
    renderSpine(target.seg); renderDots();
    S.input.rot = S.input.bend = S.cur.rot = S.cur.bend = 0;
    S.inZone = false; S.saidNear = false; S.saidIdle = false; S.painHere = 0;
    S.crackT = -1; S.xray = 0; S.xrayHold = 0; S.xrayIn = 0; S.hurtX = 0;
    setFace(target.trait === "nervous" ? "worried" : "rest");
    $("#fade").classList.remove("on");
    showBanner(`${S.idx+1}번째 환자 · ${clockTxt(S.idx)}`, `${target.name} 님 (${target.age})`,
      tr ? `${tr.label} · ${tr.desc}` : (S.idx < SHOW_ZONE_UNTIL ? "링 안의 초록 구역에 맞춰 보세요" : ""));
    setTimeout(() => say(S.target.lines.start, 2000), 500);
    setTimeout(() => { S.busy = false; S.patientStart = S.breathT0 = performance.now(); }, 450);
  }, 280);
}

/* First side done: same patient, opposite side. Only the aim target is reset, so the head eases back to centre. */
function switchSide(){
  const target = aimAt(1);
  S.input.rot = S.input.bend = 0;
  S.inZone = false; S.saidNear = false; S.saidIdle = false; S.painHere = 0;
  S.crackT = -1; S.xray = 0; S.xrayHold = 0; S.xrayIn = 0; S.hurtX = 0;
  setFace(target.trait === "nervous" ? "worried" : "rest");
  $("#pseg").textContent = sideLabel(target);
  showBanner(`${S.idx+1}번째 환자 · 반대쪽`, `${target.name} 님 (${target.age})`, `${target.side > 0 ? "오른쪽" : "왼쪽"} 회전으로 맞춰 보세요`);
  say("반대쪽도 부탁해요", 1600);
  S.busy = false; S.patientStart = S.breathT0 = performance.now();
}

export function adjust(src){
  const target = S.target;
  if(S.phase !== "play" || S.busy || !target || !$("#tune").hidden) return;
  ensureAudio();
  const d = distNorm();
  if(Math.abs(S.cur.rot) > target.limR || Math.abs(S.cur.bend) > target.limB) return hurt("너무 많이 돌렸어요! 위험해요");
  if(d <= 1) return success(d, T.breath && breath(performance.now()).exhale);
  if(src === "snap" && d > 3){ toast("툭! 그런데 아직 각도가 멀어요", 900); return; }
  hurt(d < 2 ? "조금 빗나갔어요" : "각도가 전혀 달라요");
}

const XRAY_DELAY = 0.35;   // s of real time between the crack and the x-ray
const RELIEF_AT = 2900;    // ms: the x-ray (opens 0.35 s, holds 2.4 s) is fading, the first reaction shows
const THEN_AT = 4700;      // ms: the second reaction, held until the next side
const NEXT_AT = 6900;      // ms: next side / patient
function success(d, exhale){
  const target = S.target;
  S.busy = true;
  const r = scoreSuccess(d, exhale, S.streak, S.painHere);
  const {perfect, base, comboBonus, pts} = r;
  S.streak = r.streak;
  S.score += pts;
  S.sidePts.push(pts); S.sideStars.push(r.stars);
  if(S.sideIdx === 1) S.results.push({name:target.name, age:target.age, pts: S.sidePts[0] + S.sidePts[1], stars: patientStars(S.sideStars), label: perfect ? "PERFECT" : "GOOD"});
  $("#score").textContent = S.score; renderCombo();

  crackSound(perfect ? 3 : 2);
  vib(perfect ? [18,40,18,40,18] : [18,50,18]);
  // the neck turn and the face read first; the x-ray (the vertebra snapping home) opens XRAY_DELAY later
  S.thrust = 1; S.shake = 1; S.slow = 1; S.zoom = 1; S.xrayIn = XRAY_DELAY;
  sparks.forEach(s => {
    pivot.localToWorld(tmpA.set(0,0,-0.04)); s.m.position.copy(tmpA);
    s.v.set(Math.random()-0.5, Math.random()*0.8+0.2, Math.random()-0.5).normalize().multiplyScalar(0.35 + Math.random()*0.4);
    s.life = 1;
  });
  // reaction (the patient's own pools, bigger on a PERFECT, the two sides differ): a jolt at the crack, a first
  // reaction once the x-ray has cleared, then a second one held to the end. The camera leans in on the face meanwhile.
  const react = pickReaction(target.react, perfect, Math.random, S.sideIdx === 1 ? S.reaction : null);
  S.reaction = react;
  faceRun([[0, react.jolt], [RELIEF_AT, react.first], [THEN_AT, react.then]]);
  const t0 = performance.now();
  S.reactFrom = t0 + RELIEF_AT + 250; S.reactUntil = t0 + NEXT_AT - 350;
  setTimeout(() => say(target.lines.jolt, 1000), 90);
  // the hands bring the head back to the middle as the x-ray clears, so the face looks up at the camera
  setTimeout(() => { if(S.phase === "play" && S.busy){ S.input.rot = 0; S.input.bend = 0; } }, RELIEF_AT - 200);
  floater("뚝!", -54, -headScreen.r - 10);
  setTimeout(()=>floater(perfect ? "뚝!" : "뚜둑!", 50, -headScreen.r - 30), 110);
  if(perfect) setTimeout(()=>floater("뚝!", 0, -headScreen.r - 60), 210);
  setTimeout(()=>floater(`${perfect ? "PERFECT" : "GOOD"} +${base}`, 0, headScreen.r + 24, "big"), 320);
  let extra = 0;
  if(exhale) setTimeout(()=>floater("날숨 타이밍 +15", 0, headScreen.r + 54 + (extra++)*0, "small"), 480);
  if(comboBonus) setTimeout(()=>floater(`연속 ×${S.streak} +${comboBonus}`, 0, headScreen.r + (exhale ? 78 : 54), "small"), 600);
  chime(perfect);
  setTimeout(() => say(S.sideIdx === 0 ? target.lines.ahh : target.lines.done, 2600), RELIEF_AT + 300);
  setTimeout(() => { if(S.sideIdx === 0){ switchSide(); return; } S.idx++; if(S.idx >= S.patients.length) finish(); else loadPatient(); }, NEXT_AT);
}

function hurt(msg){
  const target = S.target;
  S.busy = true;
  S.pain++; S.painHere++; S.streak = 0;
  renderPain(); renderCombo();
  tone(170, 85, 0.3, "square", 0.07);
  vib([120]);
  // a screwed-up "ouch", then a sulk that lingers after the hands are free again
  S.jitter = 1;
  const calm = target.trait === "nervous" ? "worried" : "rest";
  faceRun([[0, "ouch"], [1100, "sulk"], [3200, calm]]);
  setTimeout(() => { S.hurtX = 1; }, XRAY_DELAY*1000);
  say(target.lines.ouch, 1100);
  toast(msg, 1100);
  setTimeout(()=>{
    if(S.pain >= 3){ S.results.push({name:target.name, age:target.age, pts: S.sidePts.reduce((a, b) => a + b, 0), stars:0, label:"통증으로 중단"}); finish(); return; }
    S.busy = false;
  }, 1100);
}

function finish(){
  S.phase = "result"; S.busy = true; setAmbient();
  const score = S.score;
  const best = store.get("chiroBest", 0);
  const isBest = score > best && S.pain < 3;
  if(isBest) store.set("chiroBest", score);
  const avg = crackAvg(score, S.patients.length);
  $("#rtitle").textContent = S.pain >= 3 ? "환자들이 도망갔어요" : "오늘 진료 끝";
  $("#rank").textContent = rankTitle(avg, S.pain);
  $("#rtotal").textContent = score;
  $("#newbest").hidden = !isBest;
  const list = $("#rlist"); list.textContent = "";
  S.results.forEach(r=>{
    const li = document.createElement("li");
    const who = document.createElement("span"); who.className = "who"; who.textContent = `${r.name} (${r.age})`;
    const pts = document.createElement("span"); pts.className = "pts"; pts.textContent = r.pts ? `+${r.pts}` : "—";
    const st = document.createElement("span"); st.className = "stars"; st.textContent = r.stars ? "★".repeat(r.stars) + "☆".repeat(3-r.stars) : "중단";
    const rev = document.createElement("span"); rev.className = "rev";
    const pool = REVIEWS[r.stars] || ["다음에 다시 올게요…"];
    rev.textContent = "“" + pool[Math.floor(Math.random()*pool.length)] + "”";
    li.append(who, pts, st, rev);
    list.appendChild(li);
  });
  $("#result").hidden = false;
  $("#bestTxt").textContent = `최고 기록 ${Math.max(best, isBest ? score : 0)}점`;
}

let listening = false;
/* AGENTS.md 3-5: requestPermission() and requestFullscreen() must be the first calls in the tap handler,
   un-awaited, so the user gesture is still alive. Await them only afterwards. Do not reorder. */
async function start(){
  let perm = null, operm = null, fs = null;
  try{ if(window.DeviceMotionEvent && typeof DeviceMotionEvent.requestPermission === "function") perm = DeviceMotionEvent.requestPermission(); }catch(e){}
  try{ if(window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === "function") operm = DeviceOrientationEvent.requestPermission(); }catch(e){}
  try{ if(isTouch && document.documentElement.requestFullscreen && !document.fullscreenElement) fs = document.documentElement.requestFullscreen(); }catch(e){}
  ensureAudio();
  try{ if(perm) await perm; }catch(e){}
  try{ if(operm) await operm; }catch(e){}
  try{
    if(fs){
      await fs;
      if(screen.orientation && screen.orientation.lock){
        const pa = physAngle();
        await screen.orientation.lock(pa === 270 || (pa === 0 && S.viewRot === 270) ? "landscape-secondary" : "landscape-primary");
      }
    }
  }catch(e){}
  layout();
  if(!listening){ addEventListener("devicemotion", onMotion); addEventListener("deviceorientation", onOrientation); listening = true; }
  S.patients = makePatients();
  S.idx = 0; S.score = 0; S.pain = 0; S.streak = 0; S.results = [];
  $("#score").textContent = "0"; renderPain(); renderCombo();
  $("#intro").hidden = true; $("#result").hidden = true;
  S.phase = "play"; setAmbient();
  setModeText();
  loadPatient();
}
$("#start").addEventListener("click", start);
$("#again").addEventListener("click", start);
$("#adjust").addEventListener("click", () => adjust("button"));
{ const b = store.get("chiroBest", 0); $("#bestTxt").textContent = b ? `최고 기록 ${b}점` : "최고 기록 —"; }

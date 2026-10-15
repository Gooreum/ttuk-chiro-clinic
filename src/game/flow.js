import { $ } from "../lib/dom.js";
import { store } from "../lib/store.js";
import { T } from "../tuning.js";
import { S } from "./state.js";
import { distNorm, breath } from "./feel.js";
import { TRAITS, SHOW_ZONE_UNTIL, makePatients } from "../patient/roster.js";
import { scoreSuccess, rankTitle, patientStars, crackAvg } from "../core/scoring.js";
import { applyLook } from "../scene/look.js";
import { pickReaction } from "../core/faceRig.js";
import { failKind, failLine, reviewLine, FAIL_AMP, FORCE_AMP, FAIL_STAMP, failTags, forceTier, FORCE_STAMP, FORCE_LINES } from "../core/fail.js";
import { PREP_MS, PREP_LINES } from "../core/cue.js";
import { pivot, sparks, tmpA } from "../scene/patientModel.js";
import { ensureAudio, setAmbient, crackSound, chime, vib, fizzle, knuckle, boing, crunch, siren, stopSiren } from "../audio/audio.js";
import { toast, say, coach, hideCoach, stamp, headScreen, floater, renderPain, renderDots, renderSpine, clockTxt, renderCombo, setModeText } from "../ui/hud.js";
import { isTouch, physAngle, layout } from "../input/orientation.js";
import { onMotion, onOrientation } from "../input/motion.js";

/* Flow: loadPatient -> adjust -> success / hurt -> (switchSide -> adjust -> success) -> next patient -> finish
   (day log, best score in localStorage "chiroBest"). Every patient is adjusted on the complaint side, then the opposite. */
let bannerTimer = 0;
let faceTok = 0, loadTok = 0, hurtTok = 0;
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
    S.sidePts = []; S.sideStars = []; S.fails = []; S.tiers = [];
    const target = aimAt(0);
    applyLook(target);
    // the chart opens wide for the new patient (complaint, mini spine) and folds to one line once the head is handed
    // over: at full size it covered the top left for the whole game (user: "진료차트가 너무 쓸데 없이 커", 2026-10-15)
    $(".chart").classList.remove("compact");
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
    S.crackT = -1; S.xray = 0; S.xrayHold = 0; S.xrayIn = 0; S.hurtX = 0; S.fracLvl = 0;
    setFace(target.trait === "nervous" ? "worried" : "rest");
    $("#fade").classList.remove("on");
    showBanner(`${S.idx+1}번째 환자 · ${clockTxt(S.idx)}`, `${target.name} 님 (${target.age})`,
      tr ? `${tr.label} · ${tr.desc}` : (S.idx < SHOW_ZONE_UNTIL ? "링 안의 초록 구역에 맞춰 보세요" : ""));
    // prep (core/cue.js PREP_MS, 98-video reference): the patient settles, the hands palpate and rock the head
    // (loop.js reads S.prepUntil), the therapist says to relax. S.busy stays on, so nothing aims or judges until it ends.
    // The breath clock starts now so the chest keeps rising through the prep; patientStart (nervous tightening,
    // idle line, breath cue) starts when the player gets the head.
    const tok = ++loadTok, t0 = performance.now();
    S.prepUntil = t0 + PREP_MS; S.breathT0 = t0;
    // the patient complains, then the therapist answers (one line at a time: hud.js say / coach replace each other)
    setTimeout(() => { if(tok === loadTok) say(S.target.lines.start, 1300); }, 300);
    setTimeout(() => { if(tok === loadTok && S.phase === "play") coach(PREP_LINES[Math.floor(Math.random()*PREP_LINES.length)], 1500); }, 1500);
    setTimeout(() => { if(tok !== loadTok || S.phase !== "play") return; S.busy = false; S.patientStart = performance.now(); $(".chart").classList.add("compact"); }, PREP_MS);
  }, 280);
}

/* First side done: same patient, opposite side. Only the aim target is reset, so the head eases back to centre. */
function switchSide(){
  const target = aimAt(1);
  S.input.rot = S.input.bend = 0;
  S.inZone = false; S.saidNear = false; S.saidIdle = false; S.painHere = 0;
  S.crackT = -1; S.xray = 0; S.xrayHold = 0; S.xrayIn = 0; S.hurtX = 0; S.fracLvl = 0;
  setFace(target.trait === "nervous" ? "worried" : "rest");
  $("#pseg").textContent = sideLabel(target);
  showBanner(`${S.idx+1}번째 환자 · 반대쪽`, `${target.name} 님 (${target.age})`, `${target.side > 0 ? "오른쪽" : "왼쪽"} 회전으로 맞춰 보세요`);
  say("반대쪽도 부탁해요", 1600);
  S.busy = false; S.patientStart = S.breathT0 = performance.now();
}

/* force: how hard the crack was (input/motion.js, input/pointer.js; 0 = unknown, the button). Only the show of a
   wrong crack uses it (core/fail.js forceTier); judging below does not. */
const GRIP_GRACE = 600;    // ms after the head is handed over
/* Would a crack right now land? input/motion.js cracks a good one at once and holds a bad one for the flick's peak. */
export function wouldSucceed(){
  const target = S.target;
  if(S.phase !== "play" || S.busy || !target || !$("#tune").hidden) return false;
  return Math.abs(S.cur.rot) <= target.limR && Math.abs(S.cur.bend) <= target.limB && distNorm() <= 1;
}
export function adjust(src, force = 0){
  const target = S.target;
  if(S.phase !== "play" || S.busy || !target || !$("#tune").hidden) return;
  ensureAudio();
  const d = distNorm();
  if(Math.abs(S.cur.rot) > target.limR || Math.abs(S.cur.bend) > target.limB) return hurt("너무 많이 돌렸어요! 위험해요", "over", force);
  if(d <= 1) return success(d, T.breath && breath(performance.now()).exhale);
  // a flick far off right as the head is handed over is the player settling the grip: a toast, no pain. After that a
  // far-off flick is a wrong crack like any other (user: "초점 안 맞추면 실패가 잘 안돼", 2026-10-15)
  if(src === "snap" && d > 3 && performance.now() - S.patientStart < GRIP_GRACE){ toast("툭! 그런데 아직 각도가 멀어요", 900); return; }
  hurt(d < 2 ? "조금 빗나갔어요" : "각도가 전혀 달라요", failKind(false, d), force);
}

const XRAY_DELAY = 0.7;    // s of real time between the crack and the x-ray: the neck's snap and wobble (core/crack.js) play first
const AHH_AT = 600;       // ms: right after the jolt, an open-mouth "ahh" sigh, eyes still closed (98-video reference)
const RELIEF_AT = 3250;    // ms: the x-ray (opens 0.7 s, holds 2.4 s) is fading, the first reaction shows
const THEN_AT = 5050;      // ms: the second reaction, held until the next side
const NEXT_AT = 7250;      // ms: next side / patient
function success(d, exhale){
  const target = S.target;
  S.busy = true;
  hurtTok++;   // a wrong crack's lines still pending must not talk over the reaction
  const r = scoreSuccess(d, exhale, S.streak, S.painHere);
  const {perfect, base, comboBonus, pts} = r;
  S.streak = r.streak;
  S.score += pts;
  S.sidePts.push(pts); S.sideStars.push(r.stars);
  if(S.sideIdx === 1) S.results.push({name:target.name, age:target.age, pts: S.sidePts[0] + S.sidePts[1], stars: patientStars(S.sideStars), label: perfect ? "PERFECT" : "GOOD",
    fails: [...S.fails], tiers: [...S.tiers], lines: target.lines});
  $("#score").textContent = S.score; renderCombo();

  crackSound(perfect ? 3 : 2);
  vib(perfect ? [18,40,18,40,18] : [18,50,18]);
  // the neck turn and the face read first; the x-ray (the vertebra snapping home) opens XRAY_DELAY later
  S.thrust = 1; S.crackAmp = 1; S.shake = 1; S.slow = 1; S.zoom = 1; S.xrayIn = XRAY_DELAY; S.fracLvl = 0;
  sparks.forEach(s => {
    pivot.localToWorld(tmpA.set(0,0,-0.04)); s.m.position.copy(tmpA);
    s.v.set(Math.random()-0.5, Math.random()*0.8+0.2, Math.random()-0.5).normalize().multiplyScalar(0.35 + Math.random()*0.4);
    s.life = 1;
  });
  // reaction (the patient's own pools, bigger on a PERFECT, the two sides differ): a jolt at the crack, an open-mouth
  // sigh with the eyes still closed, a first reaction once the x-ray has cleared (eyes open and blink, dazed, or a
  // calm patient who never opens them), then a second one held to the end. The camera leans in on the face meanwhile.
  hideCoach();
  const react = pickReaction(target.react, perfect, Math.random, S.sideIdx === 1 ? S.reaction : null);
  S.reaction = react;
  faceRun([[0, react.jolt], [AHH_AT, react.ahh || "sigh"], [RELIEF_AT, react.first], [THEN_AT, react.then]]);
  setTimeout(() => floater(target.lines.sigh || "하아…", -(headScreen.r + 46), -headScreen.r*0.6, "breath out", 1700), AHH_AT);
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
  // first side: "방금 뭐였어요?!" then the relief line; second side: "다 풀린 것 같아요" then the parting line
  const [l1, l2] = S.sideIdx === 0 ? [target.lines.what, target.lines.ahh] : [target.lines.after, target.lines.done];
  setTimeout(() => say(l1 || l2, l1 ? 1600 : 2600), RELIEF_AT + 300);
  if(l1) setTimeout(() => say(l2, 1800), THEN_AT + 250);
  setTimeout(() => { if(S.sideIdx === 0){ switchSide(); return; } S.idx++; if(S.idx >= S.patients.length) finish(); else loadPatient(); }, NEXT_AT);
}

/* A wrong crack (core/fail.js kinds; judging and the pain count are as before, only the show differs):
   over  past the danger limit: a rubber-band boing, the head wobbles, "잠깐잠깐!" then the ouch line
   dud   just off: a half crack (DUD_AMP of the neck motion) that fizzles, "…끝난 거예요?"
   finger way off: the therapist's own knuckle cracks, the contact hand jumps off and shakes out
   Then the patient's own line (sharper with each wrong crack on them), a wary squint ("doubt") held while the
   player tries again with a "this time for real?" line, and the right spot flashes on the ring. */
const DOUBT_AT = { over: 3200, dud: 600, finger: 1000 };   // ms: when the faceRun reaches "doubt"
let ouchTimer = 0;
function flashOuch(){   // a coral flash at the screen edges (style.css #app.ouch)
  const a = $("#app"); a.classList.remove("ouch"); void a.offsetWidth; a.classList.add("ouch");
  clearTimeout(ouchTimer); ouchTimer = setTimeout(() => a.classList.remove("ouch"), 650);
}
const FRAC_AT = 450;       // ms: a hard wrong crack opens the fracture x-ray (scene/xray.js frac)
const FRAC_HOLD = 2.3;     // s the fracture x-ray stays open
const SIREN_AT = FRAC_AT + FRAC_HOLD*1000 + 400;   // ms: the x-ray has closed, the ambulance is called
const AMBULANCE_END = SIREN_AT + 2500;             // ms: the day log
let sirenTimer = 0;
function flashSiren(ms){   // red / blue lights at the screen edges (style.css #app.siren)
  const a = $("#app"); a.classList.add("siren");
  clearTimeout(sirenTimer); sirenTimer = setTimeout(() => a.classList.remove("siren"), ms);
}
function hurt(msg, kind, force = 0){
  const target = S.target, tok = ++hurtTok, idx = S.idx, side = S.sideIdx, tier = forceTier(force);
  S.busy = true;
  S.pain++; S.painHere++; S.streak = 0; S.fails.push(kind); S.tiers.push(tier);
  renderPain(); renderCombo();
  hideCoach();
  // timed lines only while the same patient and side are still up (a new side / patient / the day log cancels them)
  const later = (ms, fn) => setTimeout(() => { if(tok === hurtTok && S.phase === "play" && S.idx === idx && S.sideIdx === side) fn(); }, ms);
  const now = performance.now(), r = headScreen.r;
  S.ghostFrom = now + 300; S.ghostUntil = now + 2800; S.missRot = S.cur.rot; S.missBend = S.cur.bend;
  // the old toast line rides under a big stamp, away from the patient's bubble (they used to overlap)
  stamp(tier ? FORCE_STAMP[tier] : FAIL_STAMP[kind], msg, tier ? (tier > 1 ? "break" : "crack") : kind, tier ? 900 : 1700);   // a hard one: gone before the x-ray zooms in
  if(kind !== "dud" || tier) flashOuch();
  // every wrong crack wrenches the neck, wrong spot or not (core/fail.js FAIL_AMP / FORCE_AMP)
  S.thrust = 1; S.crackAmp = tier ? FORCE_AMP[tier] : FAIL_AMP[kind];
  if(tier){
    // hard (AGENTS.md 3-6): a bone crunch instead of the gag, the neck snaps further, then the x-ray shows the
    // vertebra the player was after cracking (tier 1) or breaking in two (tier 2)
    crunch(tier); vib(tier > 1 ? [120, 40, 200] : [80, 30, 120]);
    S.shake = tier > 1 ? 1.2 : 0.8; S.jitter = tier > 1 ? 1.4 : 0.8;
    faceRun([[0, "gasp"], [350, "ouch"], [tier > 1 ? 2600 : 1800, "sulk"], [tier > 1 ? 4200 : 3400, "doubt"]]);
    const word = tier > 1 ? "아그작" : "으그적";
    floater(word, -64, -r - 10); later(140, () => floater(tier > 1 ? "작!" : "적…", 44, -r - 34, "small"));
    const pool = FORCE_LINES[tier];
    say(pool[Math.floor(Math.random()*pool.length)], 1300, true);
    S.ghostFrom = S.ghostUntil = 0;   // no "여기였어요": the day ends on an ambulance
    later(FRAC_AT, () => { S.xray = 0.001; S.xrayHold = FRAC_HOLD; S.crackT = -1; S.fracLvl = tier; S.fracT = 0; S.fracFired = false; });
  }else if(kind === "over"){
    boing(); vib([60, 40, 60]);
    S.boingAt = now; S.shake = 0.6; S.jitter = 1;
    faceRun([[0, "gasp"], [500, "ouch"], [1500, "sulk"], [3200, "doubt"]]);
    floater("뾰잉", -60, -r - 10); later(220, () => floater("잉~", 40, -r - 30, "small"));
    say(target.lines.stop, 1000, true);
    later(1000, () => say(target.lines.ouch, 900, true));
  }else if(kind === "dud"){
    fizzle(); vib([30]);
    faceRun([[0, "wince"], [500, "doubt"]]);
    later(150, () => floater("…?", 0, -r - 20, "small", 1400));
    later(250, () => say(target.lines.dud, 1500, true));
  }else{
    knuckle(); vib([20, 30, 20]);
    S.flinchAt = now; S.jitter = 0.3;
    faceRun([[0, "startle"], [900, "doubt"]]);
    floater("뚝!", r + 30, -r*0.2); later(90, () => floater("뚝!", r + 60, -r*0.6));
    coach("으, 손가락…", 750);
    later(800, () => say(target.lines.finger, 1500, true));
  }
  later(XRAY_DELAY*1000, () => { S.hurtX = 1; });
  later(2300, () => say(failLine(target.lines, S.fails.length), 2200, true));
  // a crack or a break ends the day whatever the pain count (user: "금가거나 골절되면 삐용 삐용 엠뷸런스 소리 나면서
  // 끝나는게 맞을듯", 2026-10-15): once the x-ray closes the ambulance is called, lights flash, then the day log
  if(tier){
    S.ambulance = true;
    later(SIREN_AT, () => {
      siren(3.4); vib([200, 100, 200, 100, 200]); flashSiren(AMBULANCE_END - SIREN_AT + 300);
      stamp("삐용삐용", "구급차 불러요!", "siren", AMBULANCE_END - SIREN_AT);
      S.input.rot = 0; S.input.bend = 0;
    });
    later(AMBULANCE_END, () => { S.results.push({name:target.name, age:target.age, pts: S.sidePts.reduce((a, b) => a + b, 0), stars:0, label:"구급차 이송", ambulance:true,
      fails: [...S.fails], tiers: [...S.tiers], lines: target.lines}); finish(); });
    return;
  }
  // the squint is small on a phone: a "흠…" by the head when the doubt face sets in
  later(DOUBT_AT[kind], () => floater("흠…", -(r + 40), -r*0.5, "breath", 1700));
  later(4600, () => { if(!S.busy){ say(target.lines.doubt, 1600); floater("?", r + 24, -r - 10, "small", 1200); } });
  // the third one ends the day, a beat later so the gag and the patient's line still land
  if(S.pain >= 3){
    later(3600, () => { S.results.push({name:target.name, age:target.age, pts: S.sidePts.reduce((a, b) => a + b, 0), stars:0, label:"통증으로 중단",
      fails: [...S.fails], tiers: [...S.tiers], lines: target.lines}); finish(); });
    return;
  }
  setTimeout(() => { S.busy = false; }, 1100);
}

function finish(){
  S.phase = "result"; S.busy = true; setAmbient();
  const score = S.score;
  const best = store.get("chiroBest", 0);
  const isBest = score > best && S.pain < 3 && !S.ambulance;
  if(isBest) store.set("chiroBest", score);
  const avg = crackAvg(score, S.patients.length);
  $("#rtitle").textContent = S.ambulance ? "구급차가 왔어요" : S.pain >= 3 ? "환자들이 도망갔어요" : "오늘 진료 끝";
  $("#rank").textContent = rankTitle(avg, S.ambulance ? 3 : S.pain);
  $("#rtotal").textContent = score;
  $("#newbest").hidden = !isBest;
  const list = $("#rlist"); list.textContent = "";
  S.results.forEach(r=>{
    const li = document.createElement("li");
    const who = document.createElement("span"); who.className = "who"; who.textContent = `${r.name} (${r.age})`;
    const pts = document.createElement("span"); pts.className = "pts"; pts.textContent = r.pts ? `+${r.pts}` : "—";
    const st = document.createElement("span"); st.className = "stars"; st.textContent = r.stars ? "★".repeat(r.stars) + "☆".repeat(3-r.stars) : r.ambulance ? "이송" : "중단";
    const rev = document.createElement("span"); rev.className = "rev";
    rev.textContent = "“" + reviewLine(r) + "”";
    li.append(who, pts, st);
    const tags = failTags(r.fails, r.tiers);
    if(tags.length){
      const tg = document.createElement("span"); tg.className = "tags";
      tags.forEach(t => { const i = document.createElement("i"); i.textContent = t; tg.appendChild(i); });
      li.appendChild(tg);
    }
    li.appendChild(rev);
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
  S.idx = 0; S.score = 0; S.pain = 0; S.streak = 0; S.results = []; S.ambulance = false;
  stopSiren(); $("#app").classList.remove("siren");
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

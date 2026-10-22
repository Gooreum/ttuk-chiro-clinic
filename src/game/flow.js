import { $ } from "../lib/dom.js";
import { store } from "../lib/store.js";
import { T } from "../tuning.js";
import { S } from "./state.js";
import { distNorm, breath } from "./feel.js";
import { TRAITS, ROSTER, SHOW_ZONE_UNTIL, makePatients } from "../patient/roster.js";
import { DAYS, CAMPAIGN_KEY, dayRoster, dayStars, readProgress, afterDay, nextDay, dayLabel, dayClears, dayOpen } from "../core/campaign.js";
import { CAST } from "../patient/cast.js";
import { renderDays, showStory, campaignLabel } from "../ui/campaign.js";
import { scoreSuccess, rankTitle, patientStars, crackAvg } from "../core/scoring.js";
import { applyLook } from "../scene/look.js";
import { pickReaction } from "../core/faceRig.js";
import { failKind, failLine, reviewLine, FAIL_AMP, FORCE_AMP, FAIL_STAMP, failTags, forceTier, FORCE_STAMP, FORCE_LINES } from "../core/fail.js";
import { PREP_MS, PREP_LINES } from "../core/cue.js";
import { makeTowelTarget, towelTension, towelKind, towelLine, TOWEL_STAMP, towelTags, towelReview, towelReaction, FALL_HIT, OVER_XRAY, OVER_XRAY_HOLD, OVER_SIREN, skewTier, towelEndsDay } from "../core/towel.js";
import { pivot, sparks, tmpA } from "../scene/patientModel.js";
import { canvas } from "../scene/renderer.js";
import { ensureAudio, setAmbient, crackSound, chime, vib, fizzle, knuckle, boing, crunch, siren, stopSiren, stretchSound, whoosh, thud } from "../audio/audio.js";
import { toast, say, coach, hideCoach, stamp, headScreen, floater, renderPain, renderDots, renderSpine, clockTxt, renderCombo, setModeText, renderChartSheet, openChart, closeChart, uiBlocked } from "../ui/hud.js";
import { isTouch, physAngle, layout } from "../input/orientation.js";
import { mountClinicMenu, renderClinicLinks } from "../ui/clinicSwitch.js";
import { onMotion, onOrientation } from "../input/motion.js";
import { mountMonetize } from "../ui/monetize.js";
import { quietDay, bossMissed } from "../core/monetize.js";
import { track, screenView, setMode, firstSuccess, askReview } from "../platform/analytics.js";
import { EV, runOutcome } from "../core/analytics.js";

/* Flow: loadPatient -> adjust -> success / hurt -> (switchSide -> adjust -> success) -> next patient -> finish
   (day log, best score in localStorage "chiroBest"). Every patient is adjusted on the complaint side, then the opposite.
   Towel practice (S.game "towel", core/towel.js): one tug per patient, adjust -> towelAdjust -> towelSuccess / towelHurt,
   best score in "chiroTowelBest". */
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
/* analytics (docs/analytics.md): patients by roster order only, no names */
const mode = () => S.game === "towel" ? "towel" : "crack";
const TIGHT = 0.8;   // 영업 일지 mods.tight: every zone this much narrower (core/feel.js tolMul for the crack)
const dayNo = () => S.day >= 0 ? S.day + 1 : null;   // 영업 일지 day (1..56, across chapters) on run events, null (dropped) otherwise
const who = () => ({ patient_no: S.idx + 1, roster: S.target ? S.target.look && S.target.look.model || S.target.age : null, trait: S.target && S.target.trait || "none" });
function pushResult(r){
  S.results.push(r);
  track(EV.patientDone, { ...who(), label: r.ambulance ? "ambulance" : r.stars ? "done" : "quit", pts: r.pts, stars: r.stars, fails: r.fails.length });
}
function logAttempt(result, extra){
  const p = { ...who(), side_no: S.game === "towel" ? null : S.sideIdx + 1, result, try_no: S.painHere + 1, aim_ms: performance.now() - S.patientStart, ...extra };
  track(EV.attempt, p);
  if(result === "ok") firstSuccess({ game: mode(), patient_no: S.idx + 1, aim_ms: p.aim_ms });
}
function loadPatient(){
  S.busy = true;
  $("#fade").classList.add("on");
  setTimeout(() => {
    S.sidePts = []; S.sideStars = []; S.fails = []; S.tiers = [];
    const target = aimAt(0);
    applyLook(target);
    $("#pno").textContent = `진료 차트 No.${String(S.idx+1).padStart(2,"0")}`;
    $("#clock").textContent = clockTxt(S.idx);
    $("#pname").textContent = target.name;
    $("#page").textContent = `${target.age}세`;
    $("#pcc").textContent = target.cc;
    $("#pseg").textContent = S.game === "towel" ? "목뽑기 · 장력 맞추고 툭" : sideLabel(target);
    S.towel = S.game === "towel" ? makeTowelTarget(target) : null;
    if(S.towel && S.mods.tight) S.towel = {...S.towel, half: S.towel.half*TIGHT, aimTol: S.towel.aimTol*TIGHT};
    S.stretchAt = 0; S.slipAt = 0; S.overAt = 0; S.stretchHold = 0; S.skewAt = 0; S.saidTense = S.saidTight = false;
    const tr = target.trait ? TRAITS[target.trait] : null;
    $("#ptrait").hidden = !tr; if(tr) $("#ptrait").textContent = tr.label;
    renderSpine(target.seg); renderDots();
    S.input.rot = S.input.bend = S.cur.rot = S.cur.bend = 0;
    S.inZone = false; S.saidNear = false; S.saidIdle = false; S.painHere = 0;
    S.crackT = -1; S.xray = 0; S.xrayHold = 0; S.xrayIn = 0; S.hurtX = 0; S.fracLvl = 0;
    setFace(target.trait === "nervous" ? "worried" : "rest");
    $("#fade").classList.remove("on");
    // the new patient's chart, big in the middle through the prep (the old top banner); folds when the head is handed over
    if(S.game === "towel"){
      renderChartSheet(target, S.idx, S.patients.length, S.idx < S.zoneUntil ? "수건 장력을 초록에 맞추고 숨 내쉴 때 툭 당기세요" : "숨 내쉴 때 툭 당기세요");
      $("#csPlan").textContent = "처방: 수건 견인 · 목 쭈욱";
    }else renderChartSheet(target, S.idx, S.patients.length, S.idx < S.zoneUntil ? "링 안의 초록 구역에 맞춰 보세요" : "");
    openChart(true);
    track(EV.patientStart, { ...who(), of: S.patients.length });
    // prep (core/cue.js PREP_MS, 98-video reference): the patient settles, the hands palpate and rock the head
    // (loop.js reads S.prepUntil), the therapist says to relax. S.busy stays on, so nothing aims or judges until it ends.
    // The breath clock starts now so the chest keeps rising through the prep; patientStart (nervous tightening,
    // idle line, breath cue) starts when the player gets the head.
    const tok = ++loadTok, t0 = performance.now();
    S.prepUntil = t0 + PREP_MS; S.breathT0 = t0;
    // the patient complains, then the therapist answers (one line at a time: hud.js say / coach replace each other)
    setTimeout(() => { if(tok === loadTok) say(S.target.lines.start, 1300); }, 300);
    setTimeout(() => { if(tok === loadTok && S.phase === "play") coach(PREP_LINES[Math.floor(Math.random()*PREP_LINES.length)], 1500); }, 1500);
    setTimeout(() => {
      if(tok !== loadTok || S.phase !== "play") return;
      S.busy = false; S.patientStart = performance.now(); closeChart();
      track(EV.aimStart, { ...who(), control: S.mode });
      // towel practice: how to play, on the first patients
      if(S.game === "towel" && S.idx < S.zoneUntil) coach(S.mode === "tilt" ? "폰을 젖혀 장력, 좌우로 기울여 중심을 초록에 맞추고 숨 내쉴 때 툭!" : "위아래로 장력, 좌우로 중심을 초록에 맞추고 휙 쓸어 당겨요", 3200);
    }, PREP_MS);
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
  if(S.phase !== "play" || S.busy || !target || uiBlocked()) return false;
  if(S.game === "towel") return !!S.towel && (__FORCE_HIT__ || towelKind(towelTension(S.cur.bend), S.towel) === "ok");
  return Math.abs(S.cur.rot) <= target.limR && Math.abs(S.cur.bend) <= target.limB && distNorm() <= 1;
}
export function adjust(src, force = 0){
  const target = S.target;
  if(S.phase !== "play" || S.busy || !target || uiBlocked()) return;
  ensureAudio();
  if(S.game === "towel") return towelAdjust(src);
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
  logAttempt("ok", { perfect, exhale: !!exhale, dist: d, pts });
  S.streak = r.streak;
  S.score += pts;
  S.sidePts.push(pts); S.sideStars.push(r.stars);
  if(S.sideIdx === 1) pushResult({name:target.name, age:target.age, pts: S.sidePts[0] + S.sidePts[1], stars: patientStars(S.sideStars), label: perfect ? "PERFECT" : "GOOD",
    fails: [...S.fails], tiers: [...S.tiers], lines: target.lines});
  $("#score").textContent = S.score; renderCombo();

  crackSound(perfect ? 3 : 2);
  vib(perfect ? [45,40,45,40,80] : [45,50,45]);
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
/* The ambulance (a crack or a break, and in towel mode an over-pull or a skewed tug): S.ambulance now, at `at` ms the
   siren, the red / blue lights and the stamp, AMBULANCE_END - SIREN_AT later the day log with this patient "이송". */
function callAmbulance(later, at, target, pts){
  S.ambulance = true;
  later(at, () => {
    siren(3.4); vib([200, 100, 200, 100, 200]); flashSiren(AMBULANCE_END - SIREN_AT + 300);
    stamp("삐용삐용", "구급차 불러요!", "siren", AMBULANCE_END - SIREN_AT);
    S.input.rot = 0; S.input.bend = 0;
  });
  later(at + AMBULANCE_END - SIREN_AT, () => { pushResult({name:target.name, age:target.age, pts, stars:0, label:"구급차 이송", ambulance:true,
    fails: [...S.fails], tiers: [...S.tiers], lines: target.lines}); finish(); });
}
function hurt(msg, kind, force = 0){
  const target = S.target, tok = ++hurtTok, idx = S.idx, side = S.sideIdx, tier = forceTier(force);
  logAttempt(kind, { tier, force, dist: distNorm() });
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
    later(FRAC_AT, () => { S.xray = 0.001; S.xrayHold = FRAC_HOLD; S.crackT = -1; S.fracLvl = tier; S.fracT = 0; S.fracFired = false; S.shatterFired = false; });
  }else if(kind === "over"){
    boing(); vib([60, 40, 60]);
    S.boingAt = now; S.shake = 0.6; S.jitter = 1;
    faceRun([[0, "gasp"], [500, "ouch"], [1500, "sulk"], [3200, "doubt"]]);
    floater("뾰잉", -60, -r - 10); later(220, () => floater("잉~", 40, -r - 30, "small"));
    say(target.lines.stop, 1000, true);
    later(1000, () => say(target.lines.ouch, 900, true));
  }else if(kind === "dud"){
    fizzle(); vib([60]);
    faceRun([[0, "wince"], [500, "doubt"]]);
    later(150, () => floater("…?", 0, -r - 20, "small", 1400));
    later(250, () => say(target.lines.dud, 1500, true));
  }else{
    knuckle(); vib([40, 30, 40]);
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
    callAmbulance(later, SIREN_AT, target, S.sidePts.reduce((a, b) => a + b, 0));
    return;
  }
  // the squint is small on a phone: a "흠…" by the head when the doubt face sets in
  later(DOUBT_AT[kind], () => floater("흠…", -(r + 40), -r*0.5, "breath", 1700));
  later(4600, () => { if(!S.busy){ say(target.lines.doubt, 1600); floater("?", r + 24, -r - 10, "small", 1200); } });
  // the third one ends the day, a beat later so the gag and the patient's line still land
  if(S.pain >= S.painMax){
    later(3600, () => { pushResult({name:target.name, age:target.age, pts: S.sidePts.reduce((a, b) => a + b, 0), stars:0, label:"통증으로 중단",
      fails: [...S.fails], tiers: [...S.tiers], lines: target.lines}); finish(); });
    return;
  }
  setTimeout(() => { S.busy = false; }, 1100);
}

/* Towel practice (core/towel.js): the tension when the tug lands. A tug on a slack towel right as the head is handed
   over is the player settling the grip (like GRIP_GRACE above): a toast, no pain. */
function towelAdjust(src){
  const t = towelTension(S.cur.bend), kind = __FORCE_HIT__ ? "ok" : towelKind(t, S.towel, S.cur.rot);
  if(kind === "ok") return towelSuccess(distNorm(), T.breath && breath(performance.now()).exhale);
  if(src === "snap" && kind === "slip" && t < 0.1 && performance.now() - S.patientStart < GRIP_GRACE){ crackSound(1); toast("툭! 그런데 아직 수건이 느슨해요", 900); return; }
  towelHurt(kind);
}
/* s: the long neck in the towel and the patient's face read first, then the see-through x-ray shows the spine stretched
   (scene/xray.js traction); the neck holds out until OK_HOLD so the x-ray still sees it long (user: "당기고 나서 환자 얼굴
   보이는 시간이 조금 더 길어야함. 그러고 나서 엑스레이가 나와야함", 2026-10-16; it was 0.55 s and the 1.3 s hold) */
const TOWEL_XRAY_DELAY = 1.6, OK_HOLD = 2.7;
const TOWEL_SLOW = 0.85;   // slow-mo on a good tug (game/loop.js: time × 1 − 0.72·slow, decays 2.2/s)
const CRACK_HOLD = FRAC_AT/1000 + FRAC_HOLD, CRACK_BACK = FRAC_AT + FRAC_HOLD*1000 + 400;   // a crack tug: the neck holds out through the crack x-ray (FRAC_HOLD), the towel is back in hand once it has closed (ms)
const STRETCH_OK = 0.07, STRETCH_OVER = 0.16, STRETCH_TAUT = 0.1;   // m the head snaps out (the neck takes 85%, core/towel.js BODY_SHARE): a good tug, past the limit, between them (taut) (core/towel.js stretchProfile)
function towelSuccess(d, exhale){
  const target = S.target;
  S.busy = true;
  hurtTok++;
  const r = scoreSuccess(d, exhale, S.streak, S.painHere);
  const {perfect, base, comboBonus, pts} = r;
  logAttempt("ok", { perfect, exhale: !!exhale, tension: towelTension(S.cur.bend), pts });
  S.streak = r.streak;
  S.score += pts;
  pushResult({name:target.name, age:target.age, pts, stars: r.stars, label: perfect ? "PERFECT" : "GOOD", fails: [...S.fails], lines: target.lines});
  $("#score").textContent = S.score; renderCombo();
  // the recorded bone crack right on the tug (user: "우두둑 소리는 잡아당기자 마자", 2026-10-15; at the x-ray it fell
  // flat), with a soft "쭈우욱" as the neck shoots out and trembles; the see-through x-ray then shows the spine stretched
  // and the discs go blue as it springs back
  crackSound(perfect ? 3 : 2); stretchSound();
  vib(perfect ? [45,40,45,40,80] : [45,50,45]);
  const now = performance.now();
  S.stretchAt = now; S.stretchPeak = STRETCH_OK*(perfect ? 1.2 : 1); S.stretchHold = OK_HOLD;
  // a short slow-mo and a camera punch on the head as it shoots out, like the clinic crack (2026-10-19 "세개다
  // 반영해봐"): game/loop.js slows the stretch's clock and lets it catch up in the hold; S.zoom stays 0 (its dolly is
  // the clinic's x-ray push)
  S.thrust = 0; S.shake = 0.6; S.slow = TOWEL_SLOW; S.punch = 1; S.zoom = 0; S.xrayIn = TOWEL_XRAY_DELAY; S.fracLvl = 0;
  hideCoach();
  const react = pickReaction(target.react, perfect, Math.random, null);
  S.reaction = react;
  // young and thin: "와 시원하다" right away; older or heavier: a long run of swearing first, then slowly the relief
  // (core/towel.js towelReaction); the rest of the reaction and the next patient wait for it (x)
  const feel = towelReaction(target.name, target.burn || 0), x = feel.extra;
  const early = feel.steps.map(([ms, f]) => [ms, f]);
  faceRun([...(x ? [] : [[0, react.jolt]]), ...early, [RELIEF_AT + x, react.first], [THEN_AT + x, react.then]]);
  feel.steps.forEach(([ms, , line, loud], i) => setTimeout(() => say(line, i + 1 < feel.steps.length ? feel.steps[i + 1][0] - ms + 150 : 1900, loud), ms));
  if(!x) setTimeout(() => floater(target.lines.sigh || "하아…", -(headScreen.r + 46), -headScreen.r*0.6, "breath out", 1700), AHH_AT);
  S.reactFrom = now + RELIEF_AT + x + 250; S.reactUntil = now + NEXT_AT + x - 350;
  if(!x) setTimeout(() => say(target.lines.jolt, 400), 90);
  floater("쭈우욱", -60, -headScreen.r - 10);
  floater(perfect ? "우두둑!" : "뚜둑!", 50, -headScreen.r - 34);
  setTimeout(() => floater(`${perfect ? "PERFECT" : "GOOD"} +${base}`, 0, headScreen.r + 24, "big"), 320);
  if(exhale) setTimeout(() => floater("날숨 타이밍 +15", 0, headScreen.r + 54, "small"), 480);
  if(comboBonus) setTimeout(() => floater(`연속 ×${S.streak} +${comboBonus}`, 0, headScreen.r + (exhale ? 78 : 54), "small"), 600);
  chime(perfect);
  setTimeout(() => say(towelLine(target.name, "ok"), 2400), RELIEF_AT + x + 300);
  setTimeout(() => say(target.lines.done, 1800), THEN_AT + x + 450);
  setTimeout(() => { S.idx++; if(S.idx >= S.patients.length) finish(); else loadPatient(); }, NEXT_AT + x);
}
/* A wrong tug: "over" the neck goes giraffe and tears off the back, "skew" (off the left / right centre) the neck
   wrenches to that side and a vertebra cracks or breaks, "slip" only the towel comes off. Over and a skew break end the
   day on an ambulance (user: "과하게 하면 목뼈가 빠져버리면서 앰뷸런스", "좌우 중심 초점이 안 맞으면 목이 그쪽으로 꺾이면서
   빠지고 골절되던가 금이 가는", 2026-10-16). A crack ("taut", over the band short of the limit, or a skew just off) shows
   its crack x-ray, then costs a pain and the player tugs again (core/towel.js towelEndsDay, 2026-10-19); so does a
   slip, and the third pain ends the day. */
function towelHurt(kind){
  const target = S.target, tok = ++hurtTok, idx = S.idx;
  const tier = kind === "skew" ? skewTier(S.cur.rot, S.towel) : kind === "taut" ? 1 : 0;
  logAttempt(kind, { tier, tension: towelTension(S.cur.bend) });
  S.busy = true;
  S.pain++; S.painHere++; S.streak = 0; S.fails.push(kind); S.tiers.push(tier);
  renderPain(); renderCombo();
  hideCoach();
  const later = (ms, fn) => setTimeout(() => { if(tok === hurtTok && S.phase === "play" && S.idx === idx) fn(); }, ms);
  // a crack that does not end the day: once its x-ray has closed, the doubt line and the towel back in the player's
  // hands, or the third pain ends the day
  const tugAgain = () => {
    if(S.pain >= S.painMax){
      later(CRACK_BACK + 500, () => { pushResult({name:target.name, age:target.age, pts: 0, stars:0, label:"통증으로 중단", fails: [...S.fails], tiers: [...S.tiers], lines: target.lines}); finish(); });
      return;
    }
    later(CRACK_BACK - 200, () => { say(failLine(target.lines, S.fails.length), 2000, true); setFace("doubt"); });
    later(CRACK_BACK, () => { S.busy = false; });
  };
  const now = performance.now(), r = headScreen.r;
  const cw = () => canvas.clientWidth || innerWidth, ch = () => canvas.clientHeight || innerHeight;
  stamp(TOWEL_STAMP[kind], kind === "over" ? "너무 세게 당겼어요!" : kind === "skew" ? "중심이 틀어졌어요!" : kind === "taut" ? "조금 너무 팽팽했어요!" : "수건이 너무 느슨했어요",
    kind === "over" ? "over" : tier ? (tier > 1 ? "break" : "crack") : "dud", kind === "slip" ? 1700 : 950);   // over / skew / taut: gone before the x-ray
  // every tug cracks right as it lands, good or bad (user: "정확하게 당기든 잘못 당기든 당길때 바로 우두둑", 2026-10-15)
  crackSound(kind === "slip" ? 2 : 3);
  floater(kind === "slip" ? "뚜둑!" : "우두둑!", 50, -r - 34);
  if(kind === "over"){
    // the neck pulled out like taffy, and the therapist goes over backwards with his stool (core/towel.js fallProfile;
    // user: "존나 세게 잡아 당기면 치료자도 뒤로 훌러덩 넘어지게", 2026-10-15). Then the see-through x-ray: the whole neck
    // comes off the back at C7/T1 (scene/xray.js; "목뼈랑 척추가 분리되는... 아예 확실히 분리") and stays off; he stays on
    // the floor and the ambulance is called once the x-ray closes (core/towel.js OVER_SIREN)
    flashOuch();
    stretchSound(); vib([60, 40, 60]);
    S.stretchAt = now; S.stretchPeak = STRETCH_OVER; S.stretchHold = 99; S.overAt = now;
    S.shake = 0.6; S.jitter = 0.6; S.xrayIn = OVER_XRAY;
    faceRun([[0, "gasp"], [500, "ouch"], [(OVER_SIREN + 0.4)*1000, "dazed"]]);
    floater("쭈와아악", -64, -r - 10);
    later(FALL_HIT*1000, () => { thud(); vib([90]); S.shake = 1; floater("꽈당!", cw()*0.5 - headScreen.x, ch()*0.22 - headScreen.y, "frac", 1100); });
    later((OVER_XRAY + 0.3)*1000, () => { crunch(2, 0.8); vib([80, 30, 120]); S.shake = 0.9; floater("목뼈 탈출!", cw()/2 - headScreen.x, ch()*0.28 - headScreen.y, "frac", 1500); });
    // the patient's line once the x-ray has closed (a bubble over the x-ray hid the tear)
    later((OVER_XRAY + OVER_XRAY_HOLD)*1000 + 100, () => say(towelLine(target.name, "over"), 2200, true));
    callAmbulance(later, OVER_SIREN*1000, target, 0);
    return;
  }
  if(kind === "skew"){
    // the neck wrenches hard to the side it was off (game/loop.js: the crack profile at FORCE_AMP, as a side bend in
    // towel mode), a crunch, then the clinic's crack / break x-ray on this patient's vertebra (scene/xray.js frac)
    flashOuch();
    S.thrust = 1; S.crackAmp = FORCE_AMP[tier]; S.skewAt = now;
    crunch(tier); vib(tier > 1 ? [120, 40, 200] : [80, 30, 120]);
    S.shake = tier > 1 ? 1.2 : 0.8; S.jitter = tier > 1 ? 1.4 : 0.8;
    faceRun([[0, "gasp"], [350, "ouch"], [SIREN_AT + 400, "dazed"]]);
    floater(tier > 1 ? "아그작" : "으그적", -64, -r - 10); later(140, () => floater(tier > 1 ? "작!" : "적…", 44, -r - 34, "small"));
    later(250, () => say(towelLine(target.name, "skew"), 1500, true));
    later(FRAC_AT, () => { S.xray = 0.001; S.xrayHold = FRAC_HOLD; S.xrayAt = performance.now(); S.crackT = -1; S.fracLvl = tier; S.fracT = 0; S.fracFired = false; S.shatterFired = false; });
    if(towelEndsDay(kind, tier)){ callAmbulance(later, SIREN_AT, target, 0); return; }
    return tugAgain();
  }
  if(kind === "taut"){
    // over the band but short of the limit (user: "정상과 과해요 사이에 있으면 뼈금가는 소리 우리 목꺾기에서 사용했던거
    // 쓰고 뼈 금가는 엑스레이로", 2026-10-16): the neck goes out straight between a good tug and an over-pull and stays
    // there, the clinic's crack crunch (audio.js crunch tier 1), then the clinic's crack x-ray (scene/xray.js frac 1)
    flashOuch();
    crunch(1); vib([80, 30, 120]);
    S.stretchAt = now; S.stretchPeak = STRETCH_TAUT; S.stretchHold = CRACK_HOLD; S.xrayIn = 0;
    S.shake = 0.8; S.jitter = 0.8;
    faceRun([[0, "gasp"], [350, "ouch"], [SIREN_AT + 400, "dazed"]]);
    floater("빠직", -64, -r - 10); later(140, () => floater("금…", 44, -r - 34, "small"));
    later(250, () => say(towelLine(target.name, "taut"), 1500, true));
    later(FRAC_AT, () => { S.xray = 0.001; S.xrayHold = FRAC_HOLD; S.xrayAt = performance.now(); S.crackT = -1; S.fracLvl = 1; S.fracT = 0; S.fracFired = false; S.shatterFired = false; });
    return tugAgain();
  }
  whoosh(); vib([60]);
  S.slipAt = now; S.shake = 0.4;
  faceRun([[0, "wince"], [600, "doubt"]]);
  floater("쏙!", r + 20, r*0.4); later(150, () => floater("…?", 0, -r - 20, "small", 1400));
  later(250, () => say(towelLine(target.name, "slip"), 1600, true));
  later(2300, () => say(failLine(target.lines, S.fails.length), 2200, true));
  later(600, () => floater("흠…", -(r + 40), -r*0.5, "breath", 1700));
  later(4600, () => { if(!S.busy){ say(target.lines.doubt, 1600); floater("?", r + 24, -r - 10, "small", 1200); } });
  if(S.pain >= S.painMax){
    later(3600, () => { pushResult({name:target.name, age:target.age, pts: 0, stars:0, label:"통증으로 중단", fails: [...S.fails], lines: target.lines}); finish(); });
    return;
  }
  setTimeout(() => { S.busy = false; }, 1100);
}

function finish(){
  S.phase = "result"; S.busy = true; setAmbient(); closeChart();
  const score = S.score, towel = S.game === "towel", key = towel ? "chiroTowelBest" : "chiroBest";
  const best = store.get(key, 0);
  const campaign = S.day >= 0;
  const isBest = !campaign && score > best && S.pain < S.painMax && !S.ambulance;
  if(isBest) store.set(key, score);
  const avg = towel ? score / S.patients.length : crackAvg(score, S.patients.length);   // towel: one tug per patient
  $("#rtitle").textContent = S.ambulance ? "구급차가 왔어요" : S.pain >= S.painMax ? (campaign && S.painMax < 3 ? "영업 정지" : "환자들이 도망갔어요") : towel ? "목뽑기 끝" : "오늘 진료 끝";
  $("#rdate").textContent = campaign ? `영업 일지 · ${dayLabel(S.day)} ${DAYS[S.day].title}` : "오늘의 진료 일지";
  $("#rank").textContent = rankTitle(avg, S.ambulance || S.pain >= S.painMax ? 3 : S.pain);
  $("#rtotal").textContent = score;
  $("#newbest").hidden = !isBest;
  const list = $("#rlist"); list.textContent = "";
  S.results.forEach(r=>{
    const li = document.createElement("li");
    const who = document.createElement("span"); who.className = "who"; who.textContent = `${r.name} (${r.age})`;
    const pts = document.createElement("span"); pts.className = "pts"; pts.textContent = r.pts ? `+${r.pts}` : "—";
    const st = document.createElement("span"); st.className = "stars"; st.textContent = r.stars ? "★".repeat(r.stars) + "☆".repeat(3-r.stars) : r.ambulance ? "이송" : "중단";
    const rev = document.createElement("span"); rev.className = "rev";
    rev.textContent = "“" + (towel ? towelReview(r) : reviewLine(r)) + "”";
    li.append(who, pts, st);
    const tags = towel ? towelTags(r.fails) : failTags(r.fails, r.tiers);
    if(tags.length){
      const tg = document.createElement("span"); tg.className = "tags";
      tags.forEach(t => { const i = document.createElement("i"); i.textContent = t; tg.appendChild(i); });
      li.appendChild(tg);
    }
    li.appendChild(rev);
    list.appendChild(li);
  });
  renderClinicLinks($("#resultClinics"), clinicNow());
  $("#result").hidden = false;
  if(!towel) $("#bestTxt").textContent = `최고 기록 ${Math.max(best, isBest ? score : 0)}점`;
  const complete = !S.ambulance && S.pain < S.painMax && S.results.length >= S.patients.length;
  $("#again").textContent = "다시 진료하기";
  dayEnd(complete, avg);
  const outcome = runOutcome({ ambulance: S.ambulance, pain: S.pain, complete });
  track(EV.runEnd, { game: mode(), day: dayNo(), outcome, score, patients: S.results.length, pain: S.pain, best: isBest, continued: S.continued, run_ms: performance.now() - S.runAt, rank: $("#rank").textContent });
  if(complete) track(EV.runComplete, { game: mode(), day: dayNo(), score, continued: S.continued, run_ms: performance.now() - S.runAt });
  screenView("result", { outcome });
  // a run played through: the Toss review prompt once per device (then no interstitial on the same card)
  askReview(complete).then(asked => monetize.showResult({ endedBad: S.ambulance || S.pain >= S.painMax, bossMiss: campaign && bossMissed(DAYS[S.day].beat, complete, avg), used: S.continued, skipInterstitial: asked || quietDay(S.day, S.day >= 0 && !!DAYS[S.day].beat) }));
}
/* 이어하기 (Toss build, a rewarded ad, ui/monetize.js): once per run after pain or an ambulance, the patient it ended on
   comes back from the start with the pain count cleared. Their points so far come off (they are earned again).
   After a boss day under its beat every patient is done (S.idx is past the end), so the last one comes back. */
function continueRun(){
  if(S.phase !== "result") return;
  $("#nextDay").hidden = $("#toDays").hidden = $("#dayOutro").hidden = true;
  const r = S.results.pop();
  if(r) S.score -= r.pts || 0;
  S.idx = Math.min(S.idx, S.patients.length - 1);
  hurtTok++; S.continued = true;
  track(EV.runStart, { game: mode(), day: dayNo(), how: "continue", patient_no: S.idx + 1 });
  screenView("play");
  S.pain = 0; S.streak = 0; S.ambulance = false;
  stopSiren(); $("#app").classList.remove("siren");
  $("#score").textContent = String(S.score); renderPain(); renderCombo();
  $("#result").hidden = true;
  S.phase = "play"; setAmbient();
  setModeText();
  loadPatient();
}
const monetize = mountMonetize({ continueBtn: $("#continueAd"), buyBtn: $("#buyAdFree"), onContinue: continueRun });

let listening = false;
/* AGENTS.md 3-5: requestPermission() and requestFullscreen() must be the first calls in the tap handler,
   un-awaited, so the user gesture is still alive. Await them only afterwards. Do not reorder. */
async function start(game, day = -1){
  let perm = null, operm = null, fs = null;
  if(!__CASES__){
  try{ if(window.DeviceMotionEvent && typeof DeviceMotionEvent.requestPermission === "function") perm = DeviceMotionEvent.requestPermission(); }catch(e){}
  try{ if(window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === "function") operm = DeviceOrientationEvent.requestPermission(); }catch(e){}
  try{ if(isTouch && document.documentElement.requestFullscreen && !document.fullscreenElement) fs = document.documentElement.requestFullscreen(); }catch(e){}
  }
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
  S.day = day >= 0 && day < DAYS.length ? day : -1;
  const d = S.day >= 0 ? DAYS[S.day] : null;
  S.game = (d ? d.game : game) === "towel" ? "towel" : "clinic";
  S.painMax = d ? d.painMax : 3; S.zoneUntil = d ? d.zone : SHOW_ZONE_UNTIL; S.mods = d && d.mods || {};
  setMode(mode()); S.runAt = performance.now();
  track(EV.runStart, { game: mode(), day: dayNo(), how: S.phase === "result" ? "again" : "start", control: S.mode });
  screenView("play");
  S.patients = d ? makePatients(Math.random, 0, dayRoster(S.day, [...ROSTER, ...CAST])) : makePatients();
  S.idx = 0; S.score = 0; S.pain = 0; S.streak = 0; S.results = []; S.ambulance = false; S.continued = false; closeChart();
  stopSiren(); $("#app").classList.remove("siren");
  $("#score").textContent = "0"; renderPain(); renderCombo();
  $("#intro").hidden = true; $("#result").hidden = true; $("#days").hidden = true; $("#story").hidden = true;
  $("#nextDay").hidden = $("#toDays").hidden = $("#dayOutro").hidden = true;
  S.phase = "play"; setAmbient();
  setModeText();
  loadPatient();
}
$("#start").addEventListener("click", () => start("clinic"));
$("#startTowel").addEventListener("click", () => start("towel"));
$("#again").addEventListener("click", () => start(S.game, S.day));
/* 영업 일지 (core/campaign.js): title button -> day list -> story card -> 영업 시작 (the tap that runs start()) */
const progress = () => readProgress(store.get(CAMPAIGN_KEY, null));
let storyDay = 0;
function openDays(){ renderDays(progress(), day => { $("#days").hidden = true; storyDay = day; showStory(day); }); }
function dayEnd(complete, avg){
  if(S.day < 0) return;
  const cleared = dayClears(S.day, complete, avg), d = DAYS[S.day];
  const before = progress(), after = afterDay(before, S.day, cleared, dayStars(avg));
  if(after !== before) store.set(CAMPAIGN_KEY, after);
  const next = cleared ? nextDay(after, S.day) : -1;
  const out = $("#dayOutro");
  out.textContent = cleared ? d.outro : complete ? `평균 ${Math.round(avg)}점. ${d.beat}점을 못 넘었어요. ${d.lose}` : `${dayLabel(S.day)}를 못 버텼어요. 다시 문 열어 봐요.`;
  out.hidden = false;
  $("#nextDay").hidden = next < 0;
  $("#toDays").hidden = false;
  $("#again").textContent = cleared ? "이 날 다시" : "다시 도전";
  $("#campaignSub").textContent = campaignLabel(after);
  track(EV.dayEnd, { day: S.day + 1, cleared, stars: cleared ? dayStars(avg) : 0, score: S.score, run_ms: Math.round(performance.now() - S.runAt) });
}
$("#campaignBtn").addEventListener("click", openDays);
$("#daysClose").addEventListener("click", () => { $("#days").hidden = true; if(S.phase === "result") $("#result").hidden = false; });
// 허리펴기 / 허리비틀기 days run on back.html / side.html (src/{back,side}/main.js read ?day); their start card takes
// the tap for the sensor permission
$("#storyGo").addEventListener("click", () => {
  const page = { back: "back.html", side: "side.html" }[DAYS[storyDay].game];
  if(page){ location.href = `${page}?day=${storyDay}`; return; }
  start("clinic", storyDay);
});
$("#storyBack").addEventListener("click", () => { $("#story").hidden = true; openDays(); });
$("#nextDay").addEventListener("click", () => { $("#result").hidden = true; storyDay = S.day + 1; showStory(storyDay); });
$("#toDays").addEventListener("click", () => { $("#result").hidden = true; openDays(); });
$("#campaignSub").textContent = campaignLabel(progress());
// back.html's and side.html's day result links here: ?days=1 opens the day list, ?story=N the next day's story card
{
  const q = new URLSearchParams(location.search), sd = Number(q.get("story"));
  if(q.has("story") && dayOpen(progress(), sd)){ storyDay = sd; showStory(sd); }
  else if(q.has("days")) openDays();
}
const clinicNow = () => S.game === "towel" ? "towel" : "crack";
mountClinicMenu({ chip: $("#clinicBtn"), menu: $("#clinicMenu"), current: clinicNow });
// index.html?mode=towel (from the 클리닉 menu): 목뽑기 is the main start button
if(new URLSearchParams(location.search).get("mode") === "towel"){ $("#startTowel").className = "btn"; $("#start").className = "btn ghost"; }
screenView("title");
{ const b = store.get("chiroBest", 0); $("#bestTxt").textContent = b ? `최고 기록 ${b}점` : "최고 기록 —"; }

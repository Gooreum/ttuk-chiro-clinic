import { $ } from "../lib/dom.js";
import { t as tl } from "../i18n/index.js";
import { store } from "../lib/store.js";
import { T } from "../tuning.js";
import { S } from "./state.js";
import { distNorm, breath, bonusExhale } from "./feel.js";
import { tightFactor } from "../core/feel.js";
import { TRAITS, ROSTER, SHOW_ZONE_UNTIL, PER_DAY, makePatients, rosterFor } from "../patient/roster.js";
import { bodyOf } from "../core/body.js";
import { DAYS, CAMPAIGN_KEY, dayRoster, dayStars, readProgress, afterDay, afterHard, nextDay, dayLabel, dayClears, dayOpen, dayDef, hardOpen, cracksOf, ENDING } from "../core/campaign.js";
import { CAST } from "../patient/cast.js";
import { renderDays, showStory, campaignLabel, showEnding, showInterlude } from "../ui/campaign.js";
import { mountQuests } from "./questFlow.js";
import { QUESTS, questRoster, questStars, questStarsOf } from "../core/quests.js";
import { SEASON_KEY, readSeasonRec, epStars, epClears, epStarsOf } from "../core/season.js";
import { isReplay } from "../core/shop.js";
import { mountSeason, renderSeasonBtn } from "./seasonFlow.js";
import { SEASON_EPS, seasonRoster } from "../core/season.js";
import { scoreSuccess, rankTitle, patientStars, crackAvg, mixedCracks } from "../core/scoring.js";
import { applyLook } from "../scene/look.js";
import { pickReaction } from "../core/faceRig.js";
import { failKind, failLine, reviewLine, FAIL_AMP, FORCE_AMP, FAIL_STAMP, failTags, forceTier, FORCE_STAMP, FORCE_LINES } from "../core/fail.js";
import { PREP_MS, PREP_LINES } from "../core/cue.js";
import { makeTowelTarget, towelTension, towelKind, towelLine, TOWEL_STAMP, towelTags, towelReview, towelReaction, FALL_HIT, OVER_XRAY, OVER_XRAY_HOLD, OVER_SIREN, skewTier } from "../core/towel.js";
import { pivot, sparks, tmpA } from "../scene/patientModel.js";
import { canvas } from "../scene/renderer.js";
import { ensureAudio, setAmbient, crackSound, chime, vib, fizzle, knuckle, boing, crunch, siren, stopSiren, stretchSound, whoosh, thud } from "../audio/audio.js";
import { toast, say, coach, hideCoach, hideSpeech, stamp, headScreen, floater, renderPain, renderDots, renderSpine, clockTxt, renderCombo, setModeText, renderChartSheet, openChart, closeChart, uiBlocked } from "../ui/hud.js";
import { isTouch, physAngle, layout } from "../input/orientation.js";
import { mountClinicMenu, renderClinicLinks } from "../ui/clinicSwitch.js";
import { onMotion, onOrientation } from "../input/motion.js";
import { mountMonetize, mountPainAd } from "../ui/monetize.js";
import { quietDay, bossMissed, continueOffer } from "../core/monetize.js";
import { mountShop, mountCoupon, mountCoinReward } from "../ui/shop.js";
import { nightBegin, nightFeed, nightResult, nightContinue, renderNightBtn } from "./night.js";
import { nightOpen, nightCount } from "../core/night.js";
import { rushStats } from "../core/rush.js";
import { dayShareText, nightShareText, rushShareText, weeklyShareText, dailyShareText, leaderboardScore } from "../core/share.js";
import { shareResult, submitScore, openRanking, leaderboardOn } from "../platform/share.js";
import { dailyLabel } from "../core/daily.js";
import { paintAttend } from "../ui/attend.js";
import { bossRules, hasRule, bossCues, liveLine, tauntTrips, timerPenalty, bossPts, swapDue, sideSlot } from "../core/boss.js";
import { mountBoss } from "./boss.js";
import { dailyBegin, dailyPrep, dailyContinue, dailyResult, dailyBest, dailyStreak, mountDaily } from "./daily.js";
import { weeklyBegin, weeklyPrep, weeklyContinue, weeklyResult, weeklyBest, renderWeeklyBtn, mountWeekly } from "./weekly.js";
import { rushBegin, rushPrep, rushContinue, rushResult, renderRushBtn, mountRush } from "./rush.js";
import { dexMet, dexDone, dexFailSeen, dexResult, mountDex } from "./dex.js";
import { track, screenView, setMode, firstSuccess, askReview } from "../platform/analytics.js";
import { EV, runOutcome } from "../core/analytics.js";
import { interludeForDay, interludeOf, interludeSeen, markInterludeSeen } from "../core/interlude.js";

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
  S.target = {...p, ...p.sides[sideSlot(i, S.bossSwap)]};
  return S.target;
}
const sideLabel = t => tl("C{a}–C{b} · {side} 회전 {n}/2", {a: t.seg, b: t.seg+1, side: tl(t.side > 0 ? "오른쪽" : "왼쪽"), n: S.sideIdx+1});
function showBanner(no, name, trait){
  $("#bnNo").textContent = tl(no); $("#bnName").textContent = tl(name); $("#bnTrait").textContent = tl(trait);
  $("#banner").classList.add("show");
  clearTimeout(bannerTimer); bannerTimer = setTimeout(()=>$("#banner").classList.remove("show"), 2300);
}
/* analytics (docs/analytics.md): patients by roster order only, no names */
const mode = () => S.game === "towel" ? "towel" : "crack";
// 영업 일지 mods.tight / tighter: every zone narrower by core/feel.js tightFactor (tolMul for the crack, here for the towel)
const dayNo = () => S.day >= 0 ? S.day + 1 : null;   // 영업 일지 day (1..56, across chapters) on run events, null (dropped) otherwise
const who = () => ({ patient_no: S.idx + 1, roster: S.target ? S.target.look && S.target.look.model || S.target.age : null, trait: S.target && S.target.trait || "none" });
function pushResult(r){
  dexDone(r);
  S.results.push(S.night || S.rush || S.weekly || S.daily ? { ...r, game: S.game } : r);   // 심야 진료 mixes both games: the day log rows need to know which
  track(EV.patientDone, { ...who(), label: r.ambulance ? "ambulance" : r.stars ? "done" : "quit", pts: r.pts, stars: r.stars, fails: r.fails.length });
}
function logAttempt(result, extra){
  const p = { ...who(), side_no: S.game === "towel" ? null : S.sideIdx + 1, result, try_no: S.painHere + 1, aim_ms: performance.now() - S.patientStart, since_start_ms: performance.now() - S.runAt, ...extra };
  track(EV.attempt, p);
  if(result === "ok") firstSuccess({ game: mode(), patient_no: S.idx + 1, aim_ms: p.aim_ms });
}
function loadPatient(){
  S.busy = true;
  $("#fade").classList.add("on");
  setTimeout(() => {
    rushPrep();   // 보스 러시: this patient's game and mods first
    weeklyPrep();   // 주간 챌린지: likewise
    dailyPrep();   // 오늘의 도전: likewise
    S.sidePts = []; S.sideStars = []; S.fails = []; S.tiers = [];
    S.bossTaunt = false; S.bossSwap = false; S.bossReady = false;   // 보스 특수 규칙 (core/boss.js) restart with every patient
    const target = aimAt(0);
    dexMet(target.name);
    applyLook(target);
    $("#pno").textContent = tl("진료 차트 No.{n}", {n: String(S.idx+1).padStart(2,"0")});
    $("#clock").textContent = clockTxt(S.idx);
    $("#pname").textContent = tl(target.name);
    $("#page").textContent = tl("{n}세", {n: target.age});
    $("#pcc").textContent = tl(target.cc);
    $("#pseg").textContent = S.game === "towel" ? tl("목뽑기 · 장력 맞추고 툭") : sideLabel(target);
    S.towel = S.game === "towel" ? makeTowelTarget(target) : null;
    const tf = tightFactor(S.mods);
    if(S.towel && tf < 1) S.towel = {...S.towel, half: S.towel.half*tf, aimTol: S.towel.aimTol*tf};
    S.stretchAt = 0; S.slipAt = 0; S.overAt = 0; S.stretchHold = 0; S.skewAt = 0; S.saidTense = S.saidTight = false;
    const tr = target.trait ? TRAITS[target.trait] : null, bd = bodyOf(target);   // core/body.js: the body type sits beside the trait
    $("#ptrait").hidden = !tr && !bd; $("#ptrait").textContent = [tr && tl(tr.label), bd && tl(bd.label)].filter(Boolean).join(" · ");
    renderSpine(target.seg); renderDots();
    S.input.rot = S.input.bend = S.cur.rot = S.cur.bend = 0;
    S.inZone = false; S.saidNear = false; S.saidIdle = false; S.painHere = 0;
    S.crackT = -1; S.xray = 0; S.xrayHold = 0; S.xrayIn = 0; S.hurtX = 0; S.fracLvl = 0;
    setFace(target.trait === "nervous" ? "worried" : "rest");
    $("#fade").classList.remove("on");
    // the new patient's chart, big in the middle through the prep (the old top banner); folds when the head is handed over
    if(S.game === "towel"){
      renderChartSheet(target, S.idx, S.patients.length, S.idx < S.zoneUntil ? "수건 장력을 초록에 맞추고 숨 내쉴 때 툭 당기세요" : "숨 내쉴 때 툭 당기세요");
      $("#csPlan").textContent = tl("처방: 수건 견인 · 목 쭈욱");
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
      S.busy = false; S.patientStart = performance.now(); S.bossReady = true; closeChart();
      bossCue();
      track(EV.aimStart, { ...who(), control: S.mode });
      // towel practice: how to play, on the first patients
      if(S.game === "towel" && S.idx < S.zoneUntil) coach(S.mode === "tilt" ? "폰을 젖혀 장력, 좌우로 기울여 중심을 초록에 맞추고 숨 내쉴 때 툭!" : "위아래로 장력, 좌우로 중심을 초록에 맞추고 휙 쓸어 당겨요", 3200);
    }, PREP_MS);
  }, 280);
}

/* 보스 특수 규칙 (core/boss.js): the rule's one-liner when a patient is handed over (the story card has its chip) */
function bossCue(){
  if(S.phase !== "play" || !S.boss.length) return;
  // one pill per rule, one after the other (8장 has two; both in one pill was too long)
  bossCues(S.boss, S.hard).forEach((cue, i) => setTimeout(() => { if(S.phase === "play" && S.bossReady) coach(cue, 2200); }, i * 2400));
}
/* swap: the patient changes his mind, the target is the opposite side's from now on (same head, same x-ray segment) */
function swapAim(){
  if(!swapDue(S.boss, S.sideIdx, performance.now() - S.patientStart, S.bossSwap) || S.busy || S.phase !== "play") return;
  S.bossSwap = true;
  const target = aimAt(0);
  S.inZone = false; S.saidNear = false; S.ghostFrom = S.ghostUntil = 0;
  $("#pseg").textContent = sideLabel(target) + tl(" · 바뀜");
  // 7차 플레이테스트: the stamp never showed. The 16 s idle line, the "near" line and the cue pill all call say()/coach()
  // and the stamp sat under them at the same size; now the stamp is big, stays 2.6 s, and nothing else talks meanwhile.
  S.saidIdle = true; S.saidNear = true;
  hideCoach();
  stamp("아 거기 말고!", liveLine(S.bossLive, "swap", S.bossLine), "dud boss", 2600, S.bossBy);
  hideSpeech();
  S.swapPulse = performance.now() + 1500;   // ring.js: the new target pulses once
  floater("?!", headScreen.r + 24, -headScreen.r - 10, "small", 1200);
}

/* First side done: same patient, opposite side. Only the aim target is reset, so the head eases back to centre. */
function switchSide(){
  const target = aimAt(1);
  S.input.rot = S.input.bend = 0;
  S.inZone = false; S.saidNear = false; S.saidIdle = false; S.painHere = 0;
  S.crackT = -1; S.xray = 0; S.xrayHold = 0; S.xrayIn = 0; S.hurtX = 0; S.fracLvl = 0;
  setFace(target.trait === "nervous" ? "worried" : "rest");
  $("#pseg").textContent = sideLabel(target);
  showBanner(tl("{n}번째 환자 · 반대쪽", {n: S.idx+1}), tl("{name} 님 ({age})", {name: tl(target.name), age: target.age}), tl("{side} 회전으로 맞춰 보세요", {side: tl(target.side > 0 ? "오른쪽" : "왼쪽")}));
  if(S.bossTaunt){ $("#pseg").textContent += tl(" · 구역 축소"); stamp("도발!", liveLine(S.bossLive, "taunt", S.bossLine), "dud boss", 2600, S.bossBy); }
  else say("반대쪽도 부탁해요", 1600);
  S.busy = false; S.patientStart = S.breathT0 = performance.now(); S.bossReady = true;
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
  if(d <= 1) return success(d, T.breath && bonusExhale(performance.now()));
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
  const {perfect, base, comboBonus} = r;
  const penalty = timerPenalty(S.boss, performance.now() - S.patientStart, S.hard), pts = bossPts(r.pts, penalty);   // 보스 규칙 timer
  if(tauntTrips(S.boss, S.sideIdx, perfect)) S.bossTaunt = true;
  S.bossReady = false;   // the timer rests through the reaction
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
  if(penalty) setTimeout(() => { floater(tl("시간 초과 -{n}", {n: penalty}), 0, headScreen.r + 100, "small"); stamp("시간 초과", liveLine(S.bossLive, "timer", S.bossLine), "dud boss", 2400, S.bossBy); }, 700);
  let extra = 0;
  if(exhale) setTimeout(()=>floater(hasRule(S.boss, "fake") ? "들숨 타이밍 +15" : "날숨 타이밍 +15", 0, headScreen.r + 54 + (extra++)*0, "small"), 480);
  if(comboBonus) setTimeout(()=>floater(tl("연속 ×{n} +{b}", {n: S.streak, b: comboBonus}), 0, headScreen.r + (exhale ? 78 : 54), "small"), 600);
  chime(perfect);
  // first side: "방금 뭐였어요?!" then the relief line; second side: "다 풀린 것 같아요" then the parting line
  const [l1, l2] = S.sideIdx === 0 ? [target.lines.what, target.lines.ahh] : [target.lines.after, target.lines.done];
  setTimeout(() => say(l1 || l2, l1 ? 1600 : 2600), RELIEF_AT + 300);
  if(l1) setTimeout(() => say(l2, 1800), THEN_AT + 250);
  setTimeout(() => { if(S.sideIdx === 0){ switchSide(); return; } S.idx++; nightFeed(); if(S.idx >= S.patients.length) finish(); else loadPatient(); }, NEXT_AT);
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
  S.ambulance = true; dexFailSeen("all", "ambulance");
  later(at, () => {
    siren(3.4); vib([200, 100, 200, 100, 200]); flashSiren(AMBULANCE_END - SIREN_AT + 300);
    hideSpeech();   // the siren stamp sits over the speech row; the line has been up since the pull
    stamp("삐용삐용", "구급차 불러요!", "siren", AMBULANCE_END - SIREN_AT);
    S.input.rot = 0; S.input.bend = 0;
  });
  later(at + AMBULANCE_END - SIREN_AT, () => { pushResult({name:target.name, age:target.age, pts, stars:0, label:"구급차 이송", ambulance:true,
    fails: [...S.fails], tiers: [...S.tiers], lines: target.lines}); finish(); });
}
function hurt(msg, kind, force = 0){
  const target = S.target, tok = ++hurtTok, idx = S.idx, side = S.sideIdx, tier = forceTier(force);
  logAttempt(kind, { tier, force, dist: distNorm() });
  dexFailSeen("clinic", kind, tier);
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
    later(FRAC_AT, () => { document.querySelector(".stamp-card")?.classList.add("tuck"); S.xray = 0.001; S.xrayHold = FRAC_HOLD; S.crackT = -1; S.fracLvl = tier; S.fracT = 0; S.fracFired = false; S.shatterFired = false; });
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
  if(kind === "ok") return towelSuccess(distNorm(), T.breath && bonusExhale(performance.now()));
  if(src === "snap" && kind === "slip" && t < 0.1 && performance.now() - S.patientStart < GRIP_GRACE){ crackSound(1); toast("툭! 그런데 아직 수건이 느슨해요", 900); return; }
  towelHurt(kind);
}
/* s: the long neck in the towel and the patient's face read first, then the see-through x-ray shows the spine stretched
   (scene/xray.js traction); the neck holds out until OK_HOLD so the x-ray still sees it long (user: "당기고 나서 환자 얼굴
   보이는 시간이 조금 더 길어야함. 그러고 나서 엑스레이가 나와야함", 2026-10-16; it was 0.55 s and the 1.3 s hold) */
const TOWEL_XRAY_DELAY = 1.6, OK_HOLD = 2.7;
const TOWEL_SLOW = 0.85;   // slow-mo on a good tug (game/loop.js: time × 1 − 0.72·slow, decays 2.2/s)
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
  if(exhale) setTimeout(() => floater(hasRule(S.boss, "fake") ? "들숨 타이밍 +15" : "날숨 타이밍 +15", 0, headScreen.r + 54, "small"), 480);
  if(comboBonus) setTimeout(() => floater(tl("연속 ×{n} +{b}", {n: S.streak, b: comboBonus}), 0, headScreen.r + (exhale ? 78 : 54), "small"), 600);
  chime(perfect);
  setTimeout(() => say(towelLine(target.name, "ok"), 2400), RELIEF_AT + x + 300);
  setTimeout(() => say(target.lines.done, 1800), THEN_AT + x + 450);
  setTimeout(() => { S.idx++; nightFeed(); if(S.idx >= S.patients.length) finish(); else loadPatient(); }, NEXT_AT + x);
}
/* A wrong tug: "over" the neck goes giraffe and tears off the back, "skew" (off the left / right centre) the neck
   wrenches to that side and a vertebra cracks or breaks, "slip" only the towel comes off. Over, skew and "taut" (over the
   band, short of the limit: a crack) end the day on an ambulance like a clinic crack / break (user: "과하게 하면 목뼈가
   빠져버리면서 앰뷸런스", "좌우 중심 초점이 안 맞으면 목이 그쪽으로 꺾이면서 빠지고 골절되던가 금이 가는", 2026-10-16;
   core/towel.js towelEndsDay, 2026-10-22 one rule set "금·골절 모두 구급차"); a slip costs a pain and the third ends the
   day. */
function towelHurt(kind){
  const target = S.target, tok = ++hurtTok, idx = S.idx;
  const tier = kind === "skew" ? skewTier(S.cur.rot, S.towel) : kind === "taut" ? 1 : 0;
  logAttempt(kind, { tier, tension: towelTension(S.cur.bend) });
  dexFailSeen("towel", kind, tier);
  S.busy = true;
  S.pain++; S.painHere++; S.streak = 0; S.fails.push(kind); S.tiers.push(tier);
  renderPain(); renderCombo();
  hideCoach();
  const later = (ms, fn) => setTimeout(() => { if(tok === hurtTok && S.phase === "play" && S.idx === idx) fn(); }, ms);
  const now = performance.now(), r = headScreen.r;
  const cw = () => canvas.clientWidth || innerWidth, ch = () => canvas.clientHeight || innerHeight;
  stamp(TOWEL_STAMP[kind], kind === "over" ? "너무 세게 당겼어요!" : kind === "skew" ? "중심이 틀어졌어요!" : kind === "taut" ? "너무 팽팽했어요! 금 갔어요" : "수건이 너무 느슨했어요",
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
    later(FRAC_AT, () => { document.querySelector(".stamp-card")?.classList.add("tuck"); S.xray = 0.001; S.xrayHold = FRAC_HOLD; S.xrayAt = performance.now(); S.crackT = -1; S.fracLvl = tier; S.fracT = 0; S.fracFired = false; S.shatterFired = false; });
    callAmbulance(later, SIREN_AT, target, 0);
    return;
  }
  if(kind === "taut"){
    // over the band but short of the limit (user: "정상과 과해요 사이에 있으면 뼈금가는 소리 우리 목꺾기에서 사용했던거
    // 쓰고 뼈 금가는 엑스레이로", 2026-10-16): the neck goes out straight between a good tug and an over-pull and stays
    // there, the clinic's crack crunch (audio.js crunch tier 1), then the clinic's crack x-ray (scene/xray.js frac 1)
    flashOuch();
    crunch(1); vib([80, 30, 120]);
    S.stretchAt = now; S.stretchPeak = STRETCH_TAUT; S.stretchHold = 99; S.xrayIn = 0;
    S.shake = 0.8; S.jitter = 0.8;
    faceRun([[0, "gasp"], [350, "ouch"], [SIREN_AT + 400, "dazed"]]);
    floater("빠직", -64, -r - 10); later(140, () => floater("금…", 44, -r - 34, "small"));
    later(250, () => say(towelLine(target.name, "taut"), 1500, true));
    later(FRAC_AT, () => { document.querySelector(".stamp-card")?.classList.add("tuck"); S.xray = 0.001; S.xrayHold = FRAC_HOLD; S.xrayAt = performance.now(); S.crackT = -1; S.fracLvl = 1; S.fracT = 0; S.fracFired = false; S.shatterFired = false; });
    callAmbulance(later, SIREN_AT, target, 0);
    return;
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

export function finish(){
  S.phase = "result"; S.busy = true; setAmbient(); closeChart();
  const mixed = !!(S.night || S.weekly || S.rush || S.daily);   // both neck games in one run: the last patient's game says nothing about the run
  const score = S.score, towel = S.game === "towel" && !mixed, key = towel ? "chiroTowelBest" : "chiroBest";
  const best = store.get(key, 0);
  const campaign = S.day >= 0;
  const isBest = !campaign && !S.night && !S.rush && !S.weekly && !S.daily && !(S.quest >= 0) && !(S.season >= 0) && score > best && S.pain < S.painMax && !S.ambulance;   // 심야 진료 keeps its own record (game/night.js)
  if(isBest) store.set(key, score);
  // towel: one tug per patient. 심야 진료 and 보스 러시 count the treated patients only (the unplayed rest of an endless / 26-patient run would drag the average, and its coins, to nothing), 주간 챌린지 its whole line-up
  const avg = mixed ? score / Math.max(1, mixedCracks(S.weekly || S.daily ? S.patients.map(p => p.weekly.game) : S.results.filter(r => r.stars > 0).map(r => r.game))) : towel ? score / S.patients.length : crackAvg(score, S.patients.length);
  $("#rtitle").textContent = tl(S.ambulance ? "구급차가 왔어요" : S.pain >= S.painMax ? (campaign && S.painMax < 3 ? "영업 정지" : (S.results.length < S.patients.length ? "환자들이 도망갔어요" : "환자가 도망갔어요")) : S.rush ? "보스 러시 끝" : S.night ? "심야 진료 끝" : S.weekly ? "주간 챌린지 끝" : S.daily ? "오늘의 도전 끝" : S.quest >= 0 ? "의뢰 끝" : S.season >= 0 ? "계절 손님 끝" : towel ? "목뽑기 끝" : "오늘 진료 끝");
  $("#rdate").textContent = campaign ? tl("영업 일지 · {day}{hard} {title}", {day: tl(dayLabel(S.day)), hard: S.hard ? tl(" 역경") : "", title: tl(DAYS[S.day].title)}) : tl("오늘의 진료 일지");
  const rankKo = rankTitle(avg, S.ambulance || S.pain >= S.painMax ? 3 : S.pain);
  $("#rank").textContent = tl(rankKo);
  $("#rtotal").textContent = score;
  $("#newbest").hidden = !isBest;
  const list = $("#rlist"); list.textContent = "";
  const usedReviews = new Set();
  S.results.forEach(r=>{
    const li = document.createElement("li");
    const who = document.createElement("span"); who.className = "who"; who.textContent = tl("{name} ({age})", {name: tl(r.name), age: r.age});
    const pts = document.createElement("span"); pts.className = "pts"; pts.textContent = r.pts ? `+${r.pts}` : "—";
    const st = document.createElement("span"); st.className = "stars"; st.textContent = r.stars ? "★".repeat(r.stars) + "☆".repeat(3-r.stars) : r.ambulance ? tl("이송") : tl("중단");
    const rev = document.createElement("span"); rev.className = "rev";
    rev.textContent = "“" + tl((r.game ? r.game === "towel" : towel) ? towelReview(r, Math.random, usedReviews) : reviewLine(r, Math.random, usedReviews)) + "”";
    li.append(who, pts, st);
    const tags = (r.game ? r.game === "towel" : towel) ? towelTags(r.fails, r.tiers) : failTags(r.fails, r.tiers);
    if(tags.length){
      const tg = document.createElement("span"); tg.className = "tags";
      tags.forEach(t => { const i = document.createElement("i"), [k, n] = t.split(" ×"); i.textContent = tl(k) + " ×" + n; tg.appendChild(i); });
      li.appendChild(tg);
    }
    li.appendChild(rev);
    list.appendChild(li);
  });
  renderClinicLinks($("#resultClinics"), clinicNow());
  $("#result").hidden = false;
  if(!towel) $("#bestTxt").textContent = tl("최고 기록 {n}점", {n: Math.max(best, isBest ? score : 0)});
  const complete = !S.ambulance && S.pain < S.painMax && S.results.length >= S.patients.length;
  $("#again").textContent = tl("한 판 더");   // the free-play primary button: straight into the next run
  const prior0 = progress();   // before dayEnd saves this run: 진료비 replay check (core/shop.js isReplay)
  const priorStars = S.day >= 0 ? (S.hard ? (prior0.hard || [])[S.day] : prior0.stars[S.day]) : S.quest >= 0 ? questStars(prior0, QUESTS[S.quest]) : S.season >= 0 ? epStars(readSeasonRec(store.get(SEASON_KEY, null)), SEASON_EPS[S.season]) : 0;
  const runStars = S.day >= 0 ? (dayClears(S.day, complete, avg, dayDef(S.day, S.hard)) ? dayStars(avg, dayDef(S.day, S.hard)) : 0) : S.quest >= 0 && dayClears(-1, complete, avg, QUESTS[S.quest]) ? questStarsOf(QUESTS[S.quest], avg) : S.season >= 0 && epClears(SEASON_EPS[S.season], complete, avg) ? epStarsOf(SEASON_EPS[S.season], avg) : 0;
  const replay = isReplay(priorStars, runStars);
  dayEnd(complete, avg);
  if(S.night) nightResult();
  rushResult(); weeklyResult(complete); dailyResult(complete); dexResult();
  const outcome = runOutcome({ ambulance: S.ambulance, pain: S.pain, complete });
  track(EV.runEnd, { game: mode(), day: dayNo(), outcome, score, patients: S.results.length, pain: S.pain, best: isBest, continued: S.continued, run_ms: performance.now() - S.runAt, rank: rankKo });
  if(complete) track(EV.runComplete, { game: mode(), day: dayNo(), score, continued: S.continued, run_ms: performance.now() - S.runAt });
  screenView("result", { outcome });
  // a run played through: the Toss review prompt once per device (then no interstitial on the same card)
  const deferAd = campaign && dayClears(S.day, complete, avg, dayDef(S.day, S.hard));
  const endedBad = S.ambulance || S.pain >= S.painMax;
  const bossMiss = campaign && !S.hard && bossMissed(dayDef(S.day, S.hard).beat, complete, avg, bossReplay());
  coinReward.show({ runKey: S.runAt, avg, continueOffered: continueOffer({ endedBad, bossMiss, used: S.continued }) && !S.hard, complete: complete || !!S.night || !!S.rush, cleared: deferAd, replay, endless: !!(S.night || S.rush), cracks: mixedCracks(S.results.filter(r => r.stars > 0).map(r => r.game)), hard: S.hard, game: S.night ? "night" : S.weekly ? "weekly" : S.daily ? "daily" : mode(), day: S.day >= 0 ? S.day + 1 : 0 });   // 진료비 (core/shop.js)
  shareCard(complete, avg, deferAd);
  askReview(complete).then(asked => monetize.showResult({ endedBad, bossMiss, used: S.continued, hard: S.hard, night: !!(S.night || S.rush || S.weekly || S.daily), skipInterstitial: asked || quietDay(S.day, S.day >= 0 && !!DAYS[S.day].beat) }));
}
/* 자랑하기 / 랭킹 보기 on the result card (platform/share.js, rules core/share.js): night and rush always, a 영업 일지 day only when
   cleared. 랭킹 보기 needs the Toss game-center leaderboard (Toss build); the 심야 진료 patient count is the one score submitted. */
let shareText = "", shareWhere = "";
function shareCard(complete, avg, cleared){
  const sb = $("#shareBtn"), rb = $("#rankBtn");
  shareText = ""; shareWhere = "";
  const amb = S.ambulance ? 1 : 0;
  if(S.night){
    const count = nightCount(S.results);
    shareWhere = "night"; shareText = nightShareText({ count, score: S.score, ambulances: amb });
    submitScore(leaderboardScore("night", { count }), "night");
  }else if(S.rush){
    const run = rushStats(S.rush.plan, S.results);
    shareWhere = "rush"; shareText = rushShareText({ cleared: run.cleared, total: S.rush.total, reached: run.reached, ambulances: amb });
  }else if(S.weekly){
    const best = weeklyBest(S.weekly.week);
    if(best > 0){ shareWhere = "weekly"; shareText = weeklyShareText({ best, rule: S.weekly.set.rule.name, label: S.weekly.set.label, ambulances: amb }); }
  }else if(S.daily){
    const best = dailyBest(S.daily.date);
    if(best > 0){ shareWhere = "daily"; shareText = dailyShareText({ best, rule: S.daily.set.rule.name, label: dailyLabel(S.daily.date), streak: dailyStreak(), ambulances: amb }); }
  }else if(S.day >= 0 && cleared){
    shareWhere = "day"; shareText = dayShareText({ label: dayLabel(S.day), title: DAYS[S.day].title, avg, ambulances: amb, hard: S.hard });
  }
  sb.hidden = !shareText;
  rb.hidden = !(leaderboardOn && (shareWhere === "night" || shareWhere === "rush"));
}
$("#shareBtn").addEventListener("click", () => { if(shareText) shareResult(shareText, shareWhere, toast); });
$("#rankBtn").addEventListener("click", () => { openRanking(shareWhere); });

/* 이어하기 (Toss build, a rewarded ad, ui/monetize.js): once per run after pain or an ambulance, the patient it ended on
   comes back from the start with the pain count cleared. Their points so far come off (they are earned again).
   After a boss day under its beat every patient is done (S.idx is past the end), so the last one comes back. */
// what a boss-day replay of the last patient can still win back (core/monetize.js bossMissed)
function bossReplay(){
  const def = dayDef(S.day, S.hard), last = S.results[S.results.length - 1];
  return { cracks: cracksOf(def), lastCracks: def.game === "towel" ? 1 : 2, lastPts: last ? last.pts || 0 : 0 };
}
function continueRun(){
  if(S.phase !== "result") return;
  $("#nextDay").hidden = $("#toDays").hidden = $("#dayOutro").hidden = true;
  const r = S.results.pop();
  if(r) S.score -= r.pts || 0;
  S.idx = Math.min(S.idx, S.patients.length - 1);
  hurtTok++; S.continued = true;
  track(EV.runStart, { game: S.night ? "night" : S.rush ? "rush" : S.weekly ? "weekly" : S.daily ? "daily" : mode(), day: dayNo(), how: "continue", patient_no: S.idx + 1 });
  screenView("play");
  if(S.night) nightContinue(); else if(S.rush) rushContinue(); else if(S.weekly) weeklyContinue(); else if(S.daily) dailyContinue(); else S.pain = 0;   // 심야 진료: +1 pain slot, the pain taken stays
  S.streak = 0; S.ambulance = false;
  stopSiren(); $("#app").classList.remove("siren");
  $("#score").textContent = String(S.score); renderPain(); renderCombo();
  $("#result").hidden = true;
  S.phase = "play"; setAmbient();
  setModeText();
  loadPatient();
}
const monetize = mountMonetize({ continueBtn: $("#continueAd"), buyBtn: $("#buyAdFree"), onContinue: continueRun, leave: [$("#nextDay"), $("#again"), $("#toDays")] });
const painAd = mountPainAd({ btn: $("#storyPain") });
mountShop(); const coupon = mountCoupon(); const coinReward = mountCoinReward($("#nextDay"));   // 진료실 꾸미기 상점·통증 칸 +1권·진료비 줄

let listening = false;
/* AGENTS.md 3-5: requestPermission() and requestFullscreen() must be the first calls in the tap handler,
   un-awaited, so the user gesture is still alive. Await them only afterwards. Do not reorder. */
async function start(game, day = -1, hard = false, extraPain = 0, quest = -1, season = -1){
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
  S.hard = S.day >= 0 && !!hard;   // 역경: the same day on harder rules (core/campaign.js hardDay)
  S.quest = S.day < 0 && quest >= 0 && quest < QUESTS.length ? quest : -1; qf.sync(S.quest);   // 단골 의뢰 (core/quests.js): a free-play run on a quest's rules
  S.season = S.day < 0 && S.quest < 0 && season >= 0 && season < SEASON_EPS.length ? season : -1; sf.sync(S.season);   // 계절 손님 (core/season.js): likewise a free-play run on an episode's rules
  const d = S.day >= 0 ? dayDef(S.day, S.hard) : S.quest >= 0 ? QUESTS[S.quest] : S.season >= 0 ? SEASON_EPS[S.season] : null;
  S.game = (d ? d.game : game) === "towel" ? "towel" : "clinic";
  S.painMax = (d ? d.painMax : 3) + (d && !S.hard ? extraPain : 0); S.zoneUntil = d ? d.zone : SHOW_ZONE_UNTIL; S.mods = d && d.mods || {};
  S.boss = bossRules(d); S.bossLine = d && d.bossTaunt || ""; S.bossLive = d && d.bossLive || {}; S.bossBy = d && d.bossBy || "";
  setMode(mode()); S.runAt = performance.now();
  track(EV.runStart, { game: game === "night" || game === "rush" || game === "weekly" || game === "daily" ? game : mode(), day: dayNo(), how: S.phase === "result" ? "again" : "start", control: S.mode });
  screenView("play");
  const nb = nightBegin(game), rb = rushBegin(game), wb = weeklyBegin(game), db = dailyBegin(game);   // each also clears its own state when it is not the run being started
  S.patients = nb || rb || wb || db || (d ? makePatients(Math.random, 0, (S.quest >= 0 ? questRoster(S.quest, [...ROSTER, ...CAST]) : S.season >= 0 ? seasonRoster(S.season, [...ROSTER, ...CAST]) : dayRoster(S.day, [...ROSTER, ...CAST]))) : makePatients(Math.random, PER_DAY, null, rosterFor(game)));
  // ?patient=마동철: a free run starts with that roster patient (user: "캐릭터당 주소 갖고와", 2026-10-24)
  const pick = !nb && !rb && !wb && !db && !d && rosterFor(game).find(r => r.name === new URLSearchParams(location.search).get("patient"));
  if(pick) S.patients = [...makePatients(Math.random, 1, [pick]), ...S.patients.filter(p => p.name !== pick.name)].slice(0, PER_DAY);
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
$("#nightBtn").addEventListener("click", () => { if(nightOpen(progress())) start("night"); });   // 심야 진료 (core/night.js)
// a 영업 일지 day goes back through its story card (so the 통증 칸 +1 ad is on offer again); free play restarts at once
$("#again").addEventListener("click", () => {
  if(S.day >= 0 && S.day < DAYS.length){ $("#result").hidden = true; openStory(S.day, S.hard); return; }
  start(S.night ? "night" : S.rush ? "rush" : S.weekly ? "weekly" : S.daily ? "daily" : S.game, S.day, S.hard, 0, S.quest, S.season);
});
/* 영업 일지 (core/campaign.js): title button -> day list -> story card -> 영업 시작 (the tap that runs start()) */
const progress = () => readProgress(store.get(CAMPAIGN_KEY, null));
let storyDay = 0, storyHard = false, endingPending = false;
/* 장 막간: the first time a chapter's first day opens, its card comes before the story card (core/interlude.js) */
function openStory(day, hard = false){
  const it = interludeForDay(day), prog = progress();
  if(it && !interludeSeen(prog, it.before)){ store.set(CAMPAIGN_KEY, markInterludeSeen(prog, it.before)); showInterlude(it, tl("사연 보기"), () => openStoryCard(day, hard)); return; }
  openStoryCard(day, hard);
}
const openStoryCard = (day, hard = false) => { qf.reset(); sf.reset(); storyDay = day; storyHard = hard && hardOpen(progress(), day); showStory(day, storyHard, hardOpen(progress(), day)); painAd.show(day, DAYS[day], storyHard); coupon.show(day, storyHard); };
function openDays(){
  // 56일 cleared but the ending card never opened (left the result card without 엔딩 보기): it comes first, once
  if(endingDue(progress())){ openEnding(); return; }
  sf.reset(); renderSeasonBtn(progress()); renderNightBtn(progress()); renderRushBtn(progress()); renderWeeklyBtn(progress());
  renderDays(progress(), day => { $("#days").hidden = true; openStory(day); }, 0, ch => { $("#days").hidden = true; showInterlude(interludeOf(ch), tl("일지로"), openDays); }, () => { $("#days").hidden = true; openEnding(); });
}
/* 엔딩 (core/campaign.js ENDING): seen once -> chiroCampaign.endingSeen (readProgress keeps it; old saves have none), then
   the 영업 일지's 엔딩 다시 보기 chip opens it again (2026-10-23 audit: endingPending lived in memory only, so leaving the
   result card lost the ending for good) */
const endingDue = prog => prog.cleared >= DAYS.length && !prog.endingSeen;
function openEnding(){
  const prog = progress();
  if(!prog.endingSeen) store.set(CAMPAIGN_KEY, {...prog, endingSeen: true});
  endingPending = false; $("#result").hidden = true; showEnding();
}
const qf = mountQuests({ start, back: openDays });
const sf = mountSeason({ start, back: openDays, resetQuest: qf.reset });
function dayEnd(complete, avg){
  if(S.day < 0 && S.quest >= 0) return qf.end(complete, avg);
  if(S.day < 0 && S.season >= 0) return sf.end(complete, avg);
  if(S.day < 0) return;
  const d = dayDef(S.day, S.hard), cleared = dayClears(S.day, complete, avg, d);
  const before = progress(), after = (S.hard ? afterHard : afterDay)(before, S.day, cleared, dayStars(avg, d));
  if(after !== before) store.set(CAMPAIGN_KEY, after);
  const next = cleared ? nextDay(after, S.day) : -1;
  const out = $("#dayOutro");
  const lose = tl(d.lose || "역경은 역경이네요. 손 풀고 다시 와요.");
  out.textContent = cleared ? (S.hard ? tl("역경 통과! {outro}", {outro: tl(d.hardOutro || d.outro)}) : tl(d.outro)) : complete ? tl("평균 {avg}점. {beat}점을 못 넘었어요. {lose}", {avg: Math.round(avg), beat: d.beat, lose}) : tl(S.hard ? "{day} 역경을 못 버텼어요. 다시 문 열어 봐요." : "{day}를 못 버텼어요. 다시 문 열어 봐요.", {day: tl(dayLabel(S.day))});
  if(S.hard && !cleared) out.textContent += tl(" 역경엔 이어하기가 없어요.");
  out.hidden = false;
  // the last day cleared for the first time: the next-day button becomes 엔딩 보기 (the ending card, core/campaign.js ENDING)
  endingPending = cleared && !S.hard && S.day === DAYS.length - 1 && endingDue(after);
  $("#nextDay").textContent = tl(endingPending ? "엔딩 보기" : "다음 날");
  $("#nextDay").hidden = next < 0 && !endingPending;
  $("#toDays").hidden = false;
  $("#again").textContent = tl(cleared ? "이 날 다시" : "다시 도전");
  $("#campaignSub").textContent = campaignLabel(after); renderNightBtn(after); renderRushBtn(after); renderWeeklyBtn(after);
  track(EV.dayEnd, { day: S.day + 1, hard: S.hard ? 1 : 0, cleared, stars: cleared ? dayStars(avg, d) : 0, score: S.score, run_ms: Math.round(performance.now() - S.runAt) });
}
$("#campaignBtn").addEventListener("click", openDays);
$("#daysNight").addEventListener("click", () => { if(nightOpen(progress())) start("night"); });   // 심야 진료 from the 영업 일지 list
$("#daysClose").addEventListener("click", () => { $("#days").hidden = true; if(S.phase === "result") $("#result").hidden = false; });
// 허리펴기 / 허리비틀기 days run on back.html / side.html (src/{back,side}/main.js read ?day); their start card takes
// the tap for the sensor permission
$("#storyGo").addEventListener("click", () => {
  if(qf.sel >= 0) return qf.go();
  if(sf.sel >= 0) return sf.go();
  const page = { back: "back.html", side: "side.html" }[DAYS[storyDay].game];
  if(page) dexMet(DAYS[storyDay].patients[0]);   // back / side days run on their own page: the day's patient still goes in the dex
  const pain = painAd.take(storyDay) || coupon.take(storyDay);   // 1 when the 통증 칸 +1 ad was watched (or a 통증 칸 +1권 spent) on this card
  if(page){ location.href = `${page}?day=${storyDay}${storyHard ? "&hard=1" : ""}${pain ? "&pain=1" : ""}`; return; }
  start("clinic", storyDay, storyHard, pain);
});
$("#storyHard").addEventListener("click", () => openStory(storyDay, !storyHard));
$("#storyBack").addEventListener("click", () => { $("#story").hidden = true; if(qf.sel >= 0) qf.list(); else if(sf.sel >= 0) sf.list(); else openDays(); });
$("#nextDay").addEventListener("click", () => {
  $("#result").hidden = true;
  if(endingPending){ openEnding(); track(EV.click, { target: "ending" }); return; }
  if(S.day + 1 >= DAYS.length) return;   // no day after the last (the button is hidden then; the ending card is the way out)
  openStory(S.day + 1);
});
$("#endingClose").addEventListener("click", () => { $("#ending").hidden = true; openDays(); });
$("#toDays").addEventListener("click", () => { $("#result").hidden = true; if(S.quest >= 0) qf.list(); else if(S.season >= 0) sf.list(); else openDays(); });
$("#campaignSub").textContent = campaignLabel(progress());
renderNightBtn(progress());
mountRush({ start }); mountWeekly({ start }); mountDaily({ start }); paintAttend(); mountBoss({ swap: swapAim }); mountDex();
// back.html's and side.html's day result links here: ?days=1 opens the day list, ?story=N the next day's story card
{
  const q = new URLSearchParams(location.search), sd = Number(q.get("story"));
  if(q.has("story") && dayOpen(progress(), sd)) openStory(sd, q.get("hard") === "1");
  else if(q.has("days")) openDays();
}
const clinicNow = () => S.game === "towel" ? "towel" : "crack";
mountClinicMenu({ chip: $("#clinicBtn"), menu: $("#clinicMenu"), current: clinicNow });
// index.html?mode=towel (from the 클리닉 menu): 목뽑기 is the main start button
if(new URLSearchParams(location.search).get("mode") === "towel"){ $("#startTowel").className = "btn"; $("#start").className = "btn ghost"; }
screenView("title");
{ const b = store.get("chiroBest", 0); $("#bestTxt").textContent = b ? tl("최고 기록 {n}점", {n: b}) : tl("최고 기록 —"); }

/* 심야 진료 glue (core/night.js has the rules): the endless run on top of game/flow.js. flow.js calls these at five points
   (start, next patient, finish, continue, title); S.night is null on every other run. */
import { t } from "../i18n/index.js";
import { $ } from "../lib/dom.js";
import { store } from "../lib/store.js";
import { S } from "./state.js";
import { ROSTER, makePatients } from "../patient/roster.js";
import { CAST } from "../patient/cast.js";
import { setModeText } from "../ui/hud.js";
import { setMode, track } from "../platform/analytics.js";
import { EV } from "../core/analytics.js";
import { NIGHT_KEY, NIGHT_PAIN, kstDate, nightSeed, nightRand, nightPatient, nightTier, nightCount, nightRecord, nightRank, nightOpen } from "../core/night.js";

const POOL = [...ROSTER, ...CAST];

/* patient i, made from the seed alone (target angles included) and set as the current game and mods */
function build(i){
  const spec = nightPatient(S.night.seed, i), base = POOL.find(p => p.name === spec.name);
  const [p] = makePatients(nightRand(S.night.seed, i, 7), 0, [base]);
  S.game = spec.game; S.mods = spec.mods;
  setModeText(); setMode(spec.game === "towel" ? "towel" : "crack");
  return { ...p, night: spec };
}

/* start(game): the patient list of a night run (just the first patient), or null for every other run */
export function nightBegin(game){
  $("#newbest").textContent = t("최고 기록 경신!");
  if(game !== "night"){ S.night = null; return null; }
  const date = kstDate();
  S.night = { date, seed: nightSeed(date) };
  S.painMax = NIGHT_PAIN; S.zoneUntil = 0;
  const first = [build(0)];
  track(EV.nightStart, { date });
  return first;
}
/* after S.idx moved on: the next patient is made on demand (the list grows, a night has no end) */
export function nightFeed(){
  if(S.night && !S.patients[S.idx]) S.patients.push(build(S.idx));
}
/* the rewarded continue of a night: one more pain slot, the pain already taken stays */
export function nightContinue(){ S.painMax += 1; }

/* finish(): the day log as a night record */
export function nightResult(){
  const n = S.night, count = nightCount(S.results);
  const prev = store.get(NIGHT_KEY, null);
  const { record, isBest } = nightRecord(prev, n.date, count, S.score);
  if(record && record !== prev) store.set(NIGHT_KEY, record);
  $("#rdate").textContent = t("심야 진료 · {d}",{d:n.date});
  $("#rank").textContent = t(nightRank(count));
  $("#newbest").textContent = t("오늘 최고 기록 경신!"); $("#newbest").hidden = !isBest;
  const out = $("#dayOutro");
  out.textContent = t("오늘의 심야 기록 {n}명{best}",{n:count,best:record ? t(" · 오늘 최고 {n}명",{n:record.count}) : ""});
  out.hidden = false;
  $("#again").textContent = t("다시 심야 진료");
  track(EV.nightEnd, { date: n.date, count, score: S.score, tier: nightTier(S.idx), outcome: S.ambulance ? "ambulance" : "pain", continued: S.continued, best: isBest, run_ms: performance.now() - S.runAt });
}

/* title button + the one on the 영업 일지 list: open or locked */
export const NIGHT_LOCKED = "56일 다 깨면 열려요", NIGHT_OPEN = "오늘의 손님이 끝없이 와요";
export function renderNightBtn(prog){
  const open = nightOpen(prog);
  for(const [btn, sub] of [["#nightBtn", "#nightSub"], ["#daysNight", "#daysNightSub"]]){
    const b = $(btn), s = $(sub);
    if(b){ b.disabled = !open; b.hidden = !open; }
    if(s) s.textContent = t(open ? NIGHT_OPEN : NIGHT_LOCKED);
  }
}

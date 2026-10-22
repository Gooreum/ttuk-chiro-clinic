/* 보스 러시 glue (core/rush.js has the rules): the boss days of the 영업 일지 in one run on top of game/flow.js. flow.js
   calls these at five points (start, loadPatient, finish, continue, the title buttons); S.rush is null on every other run. */
import { $ } from "../lib/dom.js";
import { store } from "../lib/store.js";
import { S } from "./state.js";
import { ROSTER, makePatients } from "../patient/roster.js";
import { CAST } from "../patient/cast.js";
import { dayRoster } from "../core/campaign.js";
import { CAMPAIGN_KEY, readProgress } from "../core/campaign.js";
import { setModeText, stamp } from "../ui/hud.js";
import { setMode, track } from "../platform/analytics.js";
import { EV } from "../core/analytics.js";
import { RUSH_KEY, RUSH_PAIN, rushOpen, rushPlan, rushStats, rushRecord, rushRank } from "../core/rush.js";

/* start("rush"): every boss patient up front, each carrying its plan row (p.rush). null for every other run. */
export function rushBegin(game){
  if(game !== "rush"){ S.rush = null; return null; }
  const plan = rushPlan(), pool = [...ROSTER, ...CAST];
  const days = [...new Set(plan.map(p => p.day))];
  const fixed = days.flatMap(d => dayRoster(d, pool));
  S.rush = { plan, total: days.length };
  S.painMax = RUSH_PAIN; S.zoneUntil = 0; S.mods = {}; S.boss = []; S.bossLine = ""; S.bossLive = {}; S.bossBy = "";
  track(EV.rushStart, { bosses: days.length, patients: plan.length });
  return makePatients(Math.random, 0, fixed).map((p, i) => ({ ...p, rush: plan[i] }));
}
/* loadPatient(): this patient's game and mods, and a stamp with the boss line when a new boss walks in */
export function rushPrep(){
  const p = S.rush && S.patients[S.idx];
  if(!p) return;
  const r = p.rush;
  S.game = r.game === "towel" ? "towel" : "clinic"; S.mods = r.mods; S.boss = r.boss || []; S.bossLine = r.bossLine || ""; S.bossLive = r.bossLive || {}; S.bossBy = r.bossBy || "";
  setModeText(); setMode(S.game === "towel" ? "towel" : "crack");
  if(r.first) setTimeout(() => { if(S.phase === "play" && S.patients[S.idx] === p) stamp(`보스 ${r.k + 1}/${S.rush.total}`, `${r.title}. ${r.line}`, "dud", 3000); }, 450);
}
/* the rewarded continue: one more pain slot, the pain already taken stays */
export function rushContinue(){ S.painMax += 1; }

/* finish(): the day log as a boss-rush record, and the list of bosses under the day log's header */
export function rushResult(){
  document.querySelectorAll(".rush-list").forEach(e => e.remove());
  if(!S.rush) return;
  const run = rushStats(S.rush.plan, S.results), total = S.rush.total;
  const prev = store.get(RUSH_KEY, null);
  const { record, isBest } = rushRecord(prev, run);
  store.set(RUSH_KEY, record);
  $("#rdate").textContent = `보스 러시 · ${run.cleared}/${total} 보스`;
  $("#rank").textContent = rushRank(run.cleared, total);
  $("#newbest").textContent = "최고 기록 경신!"; $("#newbest").hidden = !isBest;
  const out = $("#dayOutro");
  out.textContent = `보스 ${run.reached}명까지 갔고 ${run.cleared}명을 이겼어요 · 최고 ${record.cleared}명`;
  out.hidden = false;
  const ul = document.createElement("ul"); ul.className = "rush-list";
  run.bosses.forEach(b => {
    const li = document.createElement("li"), t = document.createElement("span"), r = document.createElement("i");
    t.textContent = `${b.k + 1}. ${b.title}`;
    r.textContent = b.cleared ? `평균 ${b.avg} 승리` : b.seen ? (b.done ? `평균 ${b.avg} / ${b.beat} 아쉬움` : "중단") : "도달 못 함";
    li.className = b.cleared ? "ok" : b.seen ? "no" : "";
    li.append(t, r); ul.appendChild(li);
  });
  $("#rlist").before(ul);
  $("#again").textContent = "다시 보스 러시";
  track(EV.rushEnd, { reached: run.reached, cleared: run.cleared, score: S.score, outcome: S.ambulance ? "ambulance" : S.pain >= S.painMax ? "pain" : "complete", continued: S.continued, best: isBest, run_ms: Math.round(performance.now() - S.runAt) });
}

export const RUSH_LOCKED = "56일 다 깨면 열려요", RUSH_OPEN = "보스 6명을 연달아";
export function renderRushBtn(prog){
  const open = rushOpen(prog);
  for(const [btn, sub] of [["#rushBtn", "#rushSub"], ["#daysRush", "#daysRushSub"]]){
    const b = $(btn), s = $(sub);
    if(b){ b.disabled = !open; b.hidden = !open; }
    if(s) s.textContent = open ? RUSH_OPEN : RUSH_LOCKED;
  }
}
export function mountRush({ start }){
  const prog = () => readProgress(store.get(CAMPAIGN_KEY, null));
  for(const b of ["#rushBtn", "#daysRush"]) $(b).addEventListener("click", () => { if(rushOpen(prog())) start("rush"); });
  renderRushBtn(prog());
}

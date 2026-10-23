/* 보스 러시 glue (core/rush.js has the rules): the boss days of the 영업 일지 in one run on top of game/flow.js. flow.js
   calls these at five points (start, loadPatient, finish, continue, the title buttons); S.rush is null on every other run. */
import { t } from "../i18n/index.js";
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
  if(r.first) setTimeout(() => { if(S.phase === "play" && S.patients[S.idx] === p) stamp(t("보스 {k}/{n}",{k:r.k + 1,n:S.rush.total}), `${t(r.title)}. ${t(r.line)}`, "dud", 3000); }, 450);
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
  $("#rdate").textContent = t("보스 러시 · {c}/{n} 보스",{c:run.cleared,n:total});
  $("#rank").textContent = t(rushRank(run.cleared, total));
  $("#newbest").textContent = t("최고 기록 경신!"); $("#newbest").hidden = !isBest;
  const out = $("#dayOutro");
  out.textContent = t("보스 {r}명까지 갔고 {c}명을 이겼어요 · 최고 {b}명",{r:run.reached,c:run.cleared,b:record.cleared});
  out.hidden = false;
  const ul = document.createElement("ul"); ul.className = "rush-list";
  run.bosses.forEach(b => {
    const li = document.createElement("li"), tt = document.createElement("span"), r = document.createElement("i");
    tt.textContent = `${b.k + 1}. ${t(b.title)}`;
    r.textContent = b.cleared ? t("평균 {a} 승리",{a:b.avg}) : b.seen ? (b.done ? t("평균 {a} / {b} 아쉬움",{a:b.avg,b:b.beat}) : t("중단")) : t("도달 못 함");
    li.className = b.cleared ? "ok" : b.seen ? "no" : "";
    li.append(tt, r); ul.appendChild(li);
  });
  $("#rlist").before(ul);
  $("#again").textContent = t("다시 보스 러시");
  track(EV.rushEnd, { reached: run.reached, cleared: run.cleared, score: S.score, outcome: S.ambulance ? "ambulance" : S.pain >= S.painMax ? "pain" : "complete", continued: S.continued, best: isBest, run_ms: Math.round(performance.now() - S.runAt) });
}

export const RUSH_LOCKED = "56일 다 깨면 열려요", RUSH_OPEN = "보스 6명을 연달아";
export function renderRushBtn(prog){
  const open = rushOpen(prog);
  for(const [btn, sub] of [["#rushBtn", "#rushSub"], ["#daysRush", "#daysRushSub"]]){
    const b = $(btn), s = $(sub);
    if(b){ b.disabled = !open; b.hidden = !open; }
    if(s) s.textContent = t(open ? RUSH_OPEN : RUSH_LOCKED);
  }
}
export function mountRush({ start }){
  const prog = () => readProgress(store.get(CAMPAIGN_KEY, null));
  for(const b of ["#rushBtn", "#daysRush"]) $(b).addEventListener("click", () => { if(rushOpen(prog())) start("rush"); });
  renderRushBtn(prog());
}

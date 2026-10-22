/* 주간 챌린지 glue (core/weekly.js has the rules): the week's fixed line-up on top of game/flow.js. flow.js calls these at
   the same points as the 심야 진료 / 보스 러시 (start, loadPatient, finish, continue, the title buttons); S.weekly is null on every other run. */
import { $ } from "../lib/dom.js";
import { store } from "../lib/store.js";
import { S } from "./state.js";
import { ROSTER, makePatients } from "../patient/roster.js";
import { CAST } from "../patient/cast.js";
import { CAMPAIGN_KEY, readProgress } from "../core/campaign.js";
import { setModeText, stamp, coach } from "../ui/hud.js";
import { setMode, track } from "../platform/analytics.js";
import { EV } from "../core/analytics.js";
import { nightRand } from "../core/night.js";
import { SHOP_KEY, readShop, add } from "../core/shop.js";
import { WEEKLY_KEY, WEEKLY_BONUS, weeklyOpen, weekNo, weeklySet, weeklyRead, weeklyTry, weeklyRecord, daysLeft, ruleCue } from "../core/weekly.js";

const POOL = [...ROSTER, ...CAST];

/* start("weekly"): the whole set up front, target angles from the week's seed (everybody gets the same). null for every other run. */
export function weeklyBegin(game){
  if(game !== "weekly"){ S.weekly = null; return null; }
  const week = weekNo(), set = weeklySet(week);
  const rec = weeklyTry(store.get(WEEKLY_KEY, null), week);
  store.set(WEEKLY_KEY, rec);
  S.weekly = { week, set, tries: rec.tries };
  S.painMax = set.painMax; S.zoneUntil = 0; S.mods = set.mods; S.boss = set.boss; S.bossLine = set.rule.line;
  track(EV.weeklyStart, { week, rule: set.rule.id, try_no: rec.tries });
  return set.patients.map((sp, i) => {
    const [p] = makePatients(nightRand(set.seed, i, 7), 0, [POOL.find(b => b.name === sp.name)]);
    return { ...p, weekly: sp };
  });
}
/* loadPatient(): this patient's game; the first one also gets the week's rule as a stamp and a coach line */
export function weeklyPrep(){
  const p = S.weekly && S.patients[S.idx];
  if(!p) return;
  S.game = p.weekly.game === "towel" ? "towel" : "clinic";
  setModeText(); setMode(S.game === "towel" ? "towel" : "crack");
  if(p.weekly.i === 0){
    const set = S.weekly.set;
    setTimeout(() => { if(S.phase === "play" && S.patients[S.idx] === p){ stamp(`이번 주 규칙 · ${set.rule.name}`, set.rule.line, "dud", 3200); if(!set.boss.length) coach(ruleCue(set.rule), 3000); }   // boss rules get their own coach cue in flow.js
 }, 450);
  }
}
/* the rewarded continue: one more pain slot, the pain already taken stays */
export function weeklyContinue(){ S.painMax += 1; }

/* the best of this week (0 when none), for the share text */
export const weeklyBest = week => weeklyRead(store.get(WEEKLY_KEY, null), week).best;

/* finish(): the day log as this week's record. complete: every patient treated, no ambulance, pain under the limit */
export function weeklyResult(complete){
  if(!S.weekly) return;
  const { week, set } = S.weekly;
  const prev = store.get(WEEKLY_KEY, null);
  const { record, isBest, firstClear } = weeklyRecord(prev, week, S.score, complete);
  store.set(WEEKLY_KEY, record);
  if(firstClear){
    store.set(SHOP_KEY, add(readShop(store.get(SHOP_KEY, null)), WEEKLY_BONUS));
    try{ dispatchEvent(new Event("chiro-shop")); }catch(e){}
    track(EV.coinEarn, { game: "weekly", day: 0, hard: 0, coins: WEEKLY_BONUS, step: "weekly", total: readShop(store.get(SHOP_KEY, null)).coins });
  }
  $("#rdate").textContent = `주간 챌린지 · ${set.label} · ${set.rule.name}`;
  $("#newbest").textContent = "이번 주 최고 기록 경신!"; $("#newbest").hidden = !isBest;
  const out = $("#dayOutro");
  out.textContent = record.best > 0
    ? `이번 주 최고 ${record.best}점 · ${record.tries}번째 도전${firstClear ? ` · 첫 클리어 보너스 진료비 +${WEEKLY_BONUS}` : ""}`
    : "끝까지 진료해야 이번 주 기록이 남아요";
  out.hidden = false;
  $("#again").textContent = "다시 주간 챌린지";
  track(EV.weeklyEnd, { week, rule: set.rule.id, score: S.score, complete, outcome: S.ambulance ? "ambulance" : S.pain >= S.painMax ? "pain" : complete ? "complete" : "quit", best: isBest, first_clear: firstClear, continued: S.continued, run_ms: Math.round(performance.now() - S.runAt) });
}

/* the chip on the title and the one on the 영업 일지 list: hidden until 2장 is done */
export function renderWeeklyBtn(prog){
  const open = weeklyOpen(prog), set = weeklySet(weekNo());
  const best = weeklyRead(store.get(WEEKLY_KEY, null), set.week).best;
  for(const [btn, sub] of [["#weeklyBtn", "#weeklySub"], ["#daysWeekly", "#daysWeeklySub"]]){
    const b = $(btn), s = $(sub);
    if(b){ b.disabled = !open; b.hidden = !open; }
    if(s) s.textContent = `${set.rule.short} · ${best > 0 ? `최고 ${best}` : `${daysLeft()}일 남음`}`;
  }
}
export function mountWeekly({ start }){
  const prog = () => readProgress(store.get(CAMPAIGN_KEY, null));
  for(const b of ["#weeklyBtn", "#daysWeekly"]) $(b).addEventListener("click", () => { if(weeklyOpen(prog())) start("weekly"); });
  renderWeeklyBtn(prog());
}

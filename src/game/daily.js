/* 오늘의 도전 glue (core/daily.js has the rules): one patient with the day's rule on top of game/flow.js. flow.js calls these at the
   same points as game/weekly.js (start, loadPatient, finish, continue, the title button); S.daily is null on every other run.
   The patient carries `weekly: {i, name, game}` like a weekly one so flow.js reads the game of each patient the same way. */
import { t } from "../i18n/index.js";
import { $ } from "../lib/dom.js";
import { store } from "../lib/store.js";
import { S } from "./state.js";
import { ROSTER, makePatients } from "../patient/roster.js";
import { CAST } from "../patient/cast.js";
import { setModeText, stamp, coach } from "../ui/hud.js";
import { setMode, track } from "../platform/analytics.js";
import { EV } from "../core/analytics.js";
import { nightRand, kstDate } from "../core/night.js";
import { SHOP_KEY, readShop, add } from "../core/shop.js";
import { ATTEND_KEY, attendRead } from "../core/attend.js";
import { DAILY_KEY, DAILY_BONUS, dailySet, dailyRead, dailyTry, dailyRecord, dailyLabel, dailyCue } from "../core/daily.js";

const POOL = [...ROSTER, ...CAST];

/* start("daily"): the day's one patient, target angles from the date's seed. null for every other run. */
export function dailyBegin(game){
  if(game !== "daily"){ S.daily = null; return null; }
  const date = kstDate(), set = dailySet(date);
  const rec = dailyTry(store.get(DAILY_KEY, null), date);
  store.set(DAILY_KEY, rec);
  S.daily = { date, set, tries: rec.tries };
  S.painMax = set.painMax; S.zoneUntil = 0; S.mods = set.mods; S.boss = set.boss; S.bossLine = set.rule.line; S.bossLive = {}; S.bossBy = "";
  track(EV.dailyStart, { date, rule: set.rule.id, game: set.patients[0].game, try_no: rec.tries });
  return set.patients.map((sp, i) => {
    const [p] = makePatients(nightRand(set.seed, i, 7), 0, [POOL.find(b => b.name === sp.name)]);
    return { ...p, weekly: sp };
  });
}
/* loadPatient(): this patient's game; the rule as a stamp and a coach line */
export function dailyPrep(){
  const p = S.daily && S.patients[S.idx];
  if(!p) return;
  S.game = p.weekly.game === "towel" ? "towel" : "clinic";
  setModeText(); setMode(S.game === "towel" ? "towel" : "crack");
  const set = S.daily.set;
  setTimeout(() => { if(S.phase === "play" && S.patients[S.idx] === p){ stamp(t("오늘의 도전 · {r}",{r:t(set.rule.name)}), t(set.rule.line), "dud weekly", 3200); if(!set.boss.length) coach(t(dailyCue(set.rule)), 3000); } }, 450);
}
export function dailyContinue(){ S.painMax += 1; }
export const dailyBest = date => dailyRead(store.get(DAILY_KEY, null), date).best;
export const dailyStreak = () => attendRead(store.get(ATTEND_KEY, null)).streak;

/* finish(): the day log as today's record. complete: the patient treated, no ambulance, pain under the limit */
export function dailyResult(complete){
  if(!S.daily) return;
  const { date, set } = S.daily;
  const { record, isBest, firstClear } = dailyRecord(store.get(DAILY_KEY, null), date, S.score, complete);
  store.set(DAILY_KEY, record);
  if(firstClear){
    store.set(SHOP_KEY, add(readShop(store.get(SHOP_KEY, null)), DAILY_BONUS));
    try{ dispatchEvent(new Event("chiro-shop")); }catch(e){}
    track(EV.coinEarn, { game: "daily", day: 0, hard: 0, coins: DAILY_BONUS, step: "daily", total: readShop(store.get(SHOP_KEY, null)).coins });
  }
  $("#rdate").textContent = t("오늘의 도전 · {l} · {r}",{l:t(dailyLabel(date)),r:t(set.rule.name)});
  $("#newbest").textContent = t("오늘 최고 기록 경신!"); $("#newbest").hidden = !isBest;
  const out = $("#dayOutro");
  out.textContent = record.best > 0
    ? t("오늘 최고 {b}점 · {n}번째 도전{bonus}",{b:record.best,n:record.tries,bonus:firstClear ? t(" · 첫 클리어 보너스 진료비 +{c}",{c:DAILY_BONUS}) : ""})
    : t("끝까지 진료해야 오늘 기록이 남아요");
  out.hidden = false;
  $("#again").textContent = t("오늘의 도전 다시");
  track(EV.dailyEnd, { date, rule: set.rule.id, game: set.patients[0].game, score: S.score, complete, outcome: S.ambulance ? "ambulance" : S.pain >= S.painMax ? "pain" : complete ? "complete" : "quit", best: isBest, first_clear: firstClear, continued: S.continued, run_ms: Math.round(performance.now() - S.runAt) });
  renderDailyBtn();
}

/* the title button: the rule's name, then today's best */
export function renderDailyBtn(){
  const set = dailySet(kstDate()), best = dailyRead(store.get(DAILY_KEY, null), set.date).best;
  const b = $("#dailyBtn"), s = $("#dailySub");
  if(b) b.hidden = false;
  if(s) s.textContent = best > 0 ? t("{r} · 최고 {b}",{r:t(set.rule.short),b:best}) : t(set.rule.short);
}
export function mountDaily({ start }){
  $("#dailyBtn").addEventListener("click", () => start("daily"));
  renderDailyBtn();
}

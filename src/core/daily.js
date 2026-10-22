/* 오늘의 도전 (2026-10-23, 리텐션): one patient, one variant rule, a 30-60 second run that opens from the title for everybody
   (no campaign progress needed, so a new player has a reason to come back tomorrow). The KST date is the seed: same patient,
   same rule, same target angles for everyone that day. Rules are core/weekly.js's, one per day in rotation (never the same rule
   two days in a row). Pure: no DOM, no three. The glue is game/daily.js. A run is a free run (S.day = -1, S.daily set), so stars,
   the free-play best, 심야 진료 and the weekly record never move. Record: localStorage "chiroDaily" {date, best, tries}. */
import { NIGHT_POOL, mulberry32, nightSeed, kstDate } from "./night.js";
import { WEEKLY_RULES } from "./weekly.js";
import { dateNo } from "./attend.js";
import { BOSS_RULES } from "./boss.js";

export const DAILY_KEY = "chiroDaily";
export const DAILY_BONUS = 30;                 // 진료비 for the first clear of a day (a normal run pays ~90-110)
export const DAILY_POOL = NIGHT_POOL.slice(0, 12);   // the roster + the early cast: a new player has met most of them in the 영업 일지 anyway

/* the rule of a calendar day: the weekly rules in a cycle by day number (no repeat on consecutive days) */
export const ruleOfDay = date => WEEKLY_RULES[((dateNo(date) % WEEKLY_RULES.length) + WEEKLY_RULES.length) % WEEKLY_RULES.length];

/* the day's set: {date, seed, rule, patients: [{i, name, game}], mods, boss, painMax}. Same for everybody. */
export function dailySet(date = kstDate()){
  const seed = nightSeed("daily-" + date), r = mulberry32(seed), rule = ruleOfDay(date);
  const name = DAILY_POOL[Math.floor(r() * DAILY_POOL.length)];
  const game = rule.clinicOnly || r() < 0.5 ? "clinic" : "towel";
  return {
    date, seed, rule,
    patients: [{ i: 0, name, game }],
    mods: rule.mods ? { ...rule.mods } : {},
    boss: rule.boss ? [...rule.boss] : [],
    painMax: rule.painMax || 3
  };
}
/* "10.23" */
export const dailyLabel = date => `${Number(String(date).slice(5, 7))}.${Number(String(date).slice(8, 10))}`;
/* the rule's own text for the stamp / coach at the patient */
export const dailyCue = rule => rule.boss && rule.boss.length ? BOSS_RULES[rule.boss[0]].cue : rule.line;

/* ---- record {date, best, tries}: only today's counts, a new date starts over ---- */
const clean = (prev, date) => prev && prev.date === date && Number.isFinite(prev.best) && Number.isFinite(prev.tries)
  ? { date, best: Math.max(0, prev.best | 0), tries: Math.max(0, prev.tries | 0) } : { date, best: 0, tries: 0 };
export const dailyRead = (prev, date) => clean(prev, date);
/* a run starts: one more try today */
export const dailyTry = (prev, date) => { const c = clean(prev, date); return { ...c, tries: c.tries + 1 }; };
/* A run ends. Only a run played through (complete) counts; firstClear: the day's first clear (the bonus). */
export function dailyRecord(prev, date, score, complete){
  const c = clean(prev, date), s = Math.max(0, Math.round(Number(score) || 0));
  const counts = !!complete && s > 0;
  const isBest = counts && s > c.best;
  return { record: isBest ? { ...c, best: s } : c, isBest, firstClear: counts && c.best === 0 };
}

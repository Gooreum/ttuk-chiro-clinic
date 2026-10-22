/* 주간 챌린지 (2026-10-22, goal "플레이타임 20시간"): one fixed line-up of 3~4 patients (목꺾기 / 목뽑기 mixed) plus one variant
   rule per week. The week (KST, Monday start) is the seed, so everybody plays the same set and the best of the week is
   comparable. The rule is a zone/pain/breath mod or one of core/boss.js's rules (those weeks are 목꺾기 only: the boss rules
   are written for two-sided cracks). Pure: no DOM, no three. The glue is game/weekly.js. A run is a free run (S.day = -1,
   S.weekly set), so stars, the free-play best and 심야 진료 never move. Record: localStorage "chiroWeekly" {week, best, tries}. */
import { NIGHT_POOL, mulberry32 } from "./night.js";
import { BOSS_RULES } from "./boss.js";

export const WEEKLY_KEY = "chiroWeekly";
export const WEEKLY_UNLOCK = 7;      // campaign days cleared (the end of 1장) before the challenge opens
export const WEEKLY_BONUS = 60;      // 진료비 for the first clear of a week (a normal run pays ~90-110, the cap is 160)
export const WEEKLY_TIGHT = 0.75;
const DAY_MS = 86400000;

export const weeklyOpen = prog => !!prog && prog.cleared >= WEEKLY_UNLOCK;

/* The week number: whole KST weeks since the first Monday after the epoch (1970-01-05). A new week starts Monday 00:00 KST. */
export const weekNo = (ms = Date.now()) => Math.floor((Math.floor((ms + 9 * 3600000) / DAY_MS) + 3) / 7);
const dateOf = days => new Date(days * DAY_MS).toISOString().slice(0, 10);
/* Monday and Sunday of a week as KST dates ("2026-10-19", "2026-10-25") */
export const weekRange = week => ({ start: dateOf(week * 7 - 3), end: dateOf(week * 7 + 3) });
/* "10.19 – 10.25" */
export function weekLabel(week){
  const r = weekRange(week), f = d => `${Number(d.slice(5, 7))}.${Number(d.slice(8, 10))}`;
  return `${f(r.start)} – ${f(r.end)}`;
}
/* whole days left in the week including today (7 on Monday, 1 on Sunday) */
export const daysLeft = (ms = Date.now()) => 7 - (((Math.floor((ms + 9 * 3600000) / DAY_MS) + 3) % 7) + 7) % 7;

function fnv(str){
  let h = 2166136261;
  for(let i = 0; i < str.length; i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export const weekSeed = week => fnv("weekly:" + week);

/* the variant rules, one per week in this order (so two weeks in a row never feel alike). boss: core/boss.js rules (target.
   clinicOnly: every patient that week is 목꺾기). mods: core/campaign.js format. short: for the small button line. */
export const WEEKLY_RULES = [
  { id: "tight",  name: "좁은 구역",   short: "좁은 구역",  mods: { tight: WEEKLY_TIGHT }, line: "이번 주는 허용 범위가 75%예요. 손 떨면 끝이에요." },
  { id: "timer",  name: "시간 제한",   short: "12초 제한",  boss: ["timer"],  clinicOnly: true, line: "한 쪽당 12초예요. 넘기면 -20점이에요." },
  { id: "noisy",  name: "숨 안내 없음", short: "숨 안내 없음", mods: { noisy: true }, line: "치료사가 입을 닫았어요. 숨은 직접 봐요." },
  { id: "taunt",  name: "도발 환자",   short: "도발 환자",  boss: ["taunt"],  clinicOnly: true, line: "첫 쪽이 PERFECT가 아니면 반대쪽이 좁아져요." },
  { id: "pain1",  name: "통증 1칸",    short: "통증 1칸",   painMax: 1, line: "통증 칸이 하나뿐이에요. 한 번 틀리면 퇴근이에요." },
  { id: "shrink", name: "점점 좁아짐", short: "점점 좁아짐", boss: ["shrink"], clinicOnly: true, line: "오래 재면 구역이 좁아져요. 빨리 정하세요." },
  { id: "fake",   name: "들숨 보너스", short: "들숨 보너스", boss: ["fake"],   clinicOnly: true, line: "날숨 말고 들숨에 +15예요. 숨 안내는 안 믿어도 돼요." },
  { id: "swap",   name: "마음 바뀜",   short: "마음 바뀜",  boss: ["swap"],   clinicOnly: true, line: "한 번은 목표가 반대쪽으로 바뀌어요. 끝까지 보고 맞추세요." }
];
export const ruleOfWeek = week => WEEKLY_RULES[((week % WEEKLY_RULES.length) + WEEKLY_RULES.length) % WEEKLY_RULES.length];

/* The week's set: {week, seed, rule, label, patients: [{i, name, game}], mods, boss, painMax}. Same for everybody. */
export function weeklySet(week){
  const seed = weekSeed(week), r = mulberry32(seed), rule = ruleOfWeek(week);
  const pool = [...NIGHT_POOL];
  for(let i = pool.length - 1; i > 0; i--){ const j = Math.floor(r() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const count = 3 + Math.floor(r() * 2);
  const games = Array.from({ length: count }, () => rule.clinicOnly || r() < 0.5 ? "clinic" : "towel");
  if(!rule.clinicOnly && games.every(g => g === games[0])) games[count - 1] = games[0] === "clinic" ? "towel" : "clinic";   // a mixed set: both games show up
  return {
    week, seed, rule, label: weekLabel(week), range: weekRange(week),
    patients: games.map((game, i) => ({ i, name: pool[i], game })),
    mods: rule.mods ? { ...rule.mods } : {},
    boss: rule.boss ? [...rule.boss] : [],
    painMax: rule.painMax || 3
  };
}
/* the rule's own text for the stamp / coach at the first patient */
export const ruleCue = rule => rule.boss && rule.boss.length ? BOSS_RULES[rule.boss[0]].cue : rule.line;

/* ---- record {week, best, tries}: only this week's counts, a new week starts over ---- */
const clean = (prev, week) => prev && prev.week === week && Number.isFinite(prev.best) && Number.isFinite(prev.tries)
  ? { week, best: Math.max(0, prev.best | 0), tries: Math.max(0, prev.tries | 0) } : { week, best: 0, tries: 0 };
export const weeklyRead = (prev, week) => clean(prev, week);
/* a run starts: one more try this week */
export const weeklyTry = (prev, week) => { const c = clean(prev, week); return { ...c, tries: c.tries + 1 }; };
/* A run ends. Only a run played through (complete) counts for the best; first: this is the week's first clear (the bonus). */
export function weeklyRecord(prev, week, score, complete){
  const c = clean(prev, week), s = Math.max(0, Math.round(Number(score) || 0));
  const counts = !!complete && s > 0;
  const isBest = counts && s > c.best;
  return { record: isBest ? { ...c, best: s } : c, isBest, firstClear: counts && c.best === 0 };
}

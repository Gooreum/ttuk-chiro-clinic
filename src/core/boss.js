/* 보스 특수 규칙 (2026-10-22, 6차 플레이테스트 "보스가 다 같은 규칙"): every 목꺾기 boss day (core/campaign.js `boss: [rule…]`)
   adds one rule on top of "average at least beat". Pure: no DOM, no three. The rules never touch judging, the sensor, the
   camera or the x-ray timing; they only scale the zone (tolMul), flip which breath window pays, take points off, or re-aim
   the first side once. game/flow.js applies them, game/boss.js draws the timer. The same rules ride on 역경 (hardDay keeps
   `boss`) and on 보스 러시 (core/rush.js plan rows carry `boss`).
   taunt  the first side not PERFECT: the boss jeers and the opposite side's zone is TAUNT_ZONE (0.8) as wide
   timer  each side has TIMER_SEC seconds of aiming (역경 HARD_TIMER_SEC); a crack after it costs TIMER_PENALTY points
   fake   the breath bonus pays on the in-breath instead of the out-breath (and the therapist's breath cues stay quiet)
   swap   SWAP_AT ms into the first side the patient changes his mind: the target becomes the opposite side's, once
   shrink the zone narrows the longer you aim, down to SHRINK_MIN over SHRINK_MS (the nervous trait's rule, for everyone) */
export const TAUNT_ZONE = 0.8;
export const TIMER_SEC = 12, HARD_TIMER_SEC = 9, TIMER_PENALTY = 20, TIMER_WARN = 5;   // 7차 플레이테스트: 20초는 클리어율을 4~10점밖에 못 깎았다
export const SWAP_AT = 6000;
export const SHRINK_MS = 18000, SHRINK_MIN = 0.65;

export const BOSS_RULES = {
  taunt:  { chip: "첫 꺾기 PERFECT 아니면 반대쪽 구역 축소", cue: "첫 쪽을 PERFECT로 못 하면 반대쪽 구역이 좁아져요" },
  timer:  { chip: "한 쪽당 12초 안에 꺾기", cue: "한 쪽당 12초. 넘기면 -20점이에요" },
  fake:   { chip: "숨 안내가 수상함", cue: "오늘은 숨 안내가 수상해요. 박자를 직접 느껴 보세요" },
  swap:   { chip: "중간에 목표가 반대쪽으로 바뀜", cue: "한 번은 마음이 바뀌어요. 끝까지 보고 맞추세요" },
  shrink: { chip: "오래 조준할수록 구역이 좁아짐", cue: "오래 재면 구역이 좁아져요. 빨리 정하세요" }
};
export const bossRules = def => def && Array.isArray(def.boss) ? def.boss.filter(r => BOSS_RULES[r]) : [];
export const hasRule = (rules, r) => !!rules && rules.includes(r);
/* chips for the story card (UI wording is BOSS_RULES.chip) */
/* the cue pills one after another (8장 has two rules; one pill with both was too long) */
export const bossCues = rules => (rules || []).filter(r => BOSS_RULES[r]).map(r => BOSS_RULES[r].cue);
/* the live line of a rule (def.bossLive[rule]) and who says it (def.bossBy) */
export const liveLine = (live, rule, fallback = "") => (live && live[rule]) || fallback;
/* the timer pill shakes and ticks for the last TIMER_WARN seconds */
export const timerWarn = left => left !== null && left > 0 && left <= TIMER_WARN;
export const bossChips = def => bossRules(def).map(r => BOSS_RULES[r].chip);

/* zone factor of the rules (multiplies core/feel.js tolMul): the aim time (ms) and whether a taunt is on */
export function bossTolMul(rules, elapsedMs = 0, taunted = false){
  let m = 1;
  if(hasRule(rules, "taunt") && taunted) m *= TAUNT_ZONE;
  if(hasRule(rules, "shrink")) m *= Math.max(SHRINK_MIN, 1 - (1 - SHRINK_MIN) * Math.max(0, elapsedMs) / SHRINK_MS);
  return m;
}
/* does a first-side crack set off the taunt? (sideIdx 0, not PERFECT) */
export const tauntTrips = (rules, sideIdx, perfect) => hasRule(rules, "taunt") && sideIdx === 0 && !perfect;

export const timerSec = hard => hard ? HARD_TIMER_SEC : TIMER_SEC;
/* seconds left on this side's clock (null when there is no timer); never below 0 */
export const timerLeft = (rules, elapsedMs, hard = false) => hasRule(rules, "timer") ? Math.max(0, Math.ceil(timerSec(hard) - elapsedMs / 1000)) : null;
export const timerPenalty = (rules, elapsedMs, hard = false) => hasRule(rules, "timer") && elapsedMs > timerSec(hard) * 1000 ? TIMER_PENALTY : 0;
/* points of a crack after the rules (never below 0) */
export const bossPts = (pts, penalty) => Math.max(0, pts - penalty);

/* does the breath bonus pay right now? exhale: the patient is breathing out */
export const bonusWindow = (rules, exhale) => hasRule(rules, "fake") ? !exhale : !!exhale;
/* the therapist's breath cues (core/cue.js) are quiet on 'fake' */
export const cuesQuiet = rules => hasRule(rules, "fake");

/* swap: due once, on the first side, after SWAP_AT ms of aiming */
export const swapDue = (rules, sideIdx, elapsedMs, done) => hasRule(rules, "swap") && !done && sideIdx === 0 && elapsedMs >= SWAP_AT;
/* which entry of patient.sides the side being aimed uses */
export const sideSlot = (i, swapped) => swapped ? 1 - i : i;

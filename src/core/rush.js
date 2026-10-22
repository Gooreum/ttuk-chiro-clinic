/* 보스 러시 (endgame, 2026-10-22 goal "플레이타임 20시간"): the boss days of the 영업 일지 back to back. Only the 목꺾기 /
   목뽑기 bosses (a back / side boss runs on its own page), so 2~8장 give 정골원 대결, 해녀 40년, 학회 발표, 라이브 합동,
   청결 인증 and 뚝할배: 6 bosses (3장's boss is 허리펴기). One pain pool for the whole run (3, a rewarded continue adds
   one), each boss keeps its own mods (tight / noisy). Pure: no DOM, no three. The glue is game/rush.js. A run is a free
   run (S.day = -1, S.rush set), so a day's stars and the free-play best never move. Record: localStorage "chiroRush"
   {reached, cleared, score, runs}. */
import { DAYS } from "./campaign.js";
import { bossRules } from "./boss.js";
import { crackAvg } from "./scoring.js";

// the run plays on index.html, so only the neck games (back / side bosses live on their own pages)
const NECK = ["clinic", "towel"];

export const RUSH_KEY = "chiroRush";
export const RUSH_UNLOCK = 56;   // campaign days cleared (all 8 chapters), like 심야 진료
export const RUSH_PAIN = 3;      // pain slots shared by the whole run

export const rushOpen = prog => !!prog && prog.cleared >= RUSH_UNLOCK;

/* the boss days (indexes into DAYS), in story order */
export const rushDays = () => DAYS.map((d, i) => i).filter(i => DAYS[i].beat && NECK.includes(DAYS[i].game));

/* one line of story per boss, shown as the boss walks in */
export const RUSH_LINES = {
  13: "반듯 정골원 원장과 점수 대결이에요. 간판은 이긴 쪽 거예요.",
  27: "해녀 40년 차의 시험이에요. 숨은 길게, 점수는 높게.",
  34: "객석이 전부 교수예요. 틀리면 논문 소재가 돼요.",
  41: "시청자 5만 명이 지켜봐요. 숨 안내도 꺼져 있어요.",
  48: "보건소장이 도장을 들고 왔어요. 점수가 곧 도장이에요.",
  55: "이 클리닉의 첫 원장이에요. 간판 값을 받으러 왔대요."
};

/* The run as a flat list of patients: {k: boss no (0-based), day, name, first, last, game, mods, beat, title, line}. */
export function rushPlan(days = rushDays()){
  const plan = [];
  days.forEach((day, k) => {
    const d = DAYS[day];
    d.patients.forEach((name, j) => plan.push({ k, day, name, first: j === 0, last: j === d.patients.length - 1, game: d.game, mods: d.mods || {}, boss: bossRules(d), bossLine: d.bossTaunt || "", beat: d.beat, title: d.title, line: RUSH_LINES[day] || d.intro[0] }));
  });
  return plan;
}

/* How the run went. results: the day log rows in play order (one per patient, the one the run ended on included; a
   patient with stars is treated). A boss is reached when one of its patients has a row, done when all of them are
   treated, cleared when done and its average (score / cracks) is at least the boss's beat. */
export function rushStats(plan, results){
  const rows = results || [], bosses = [];
  plan.forEach((p, i) => {
    let b = bosses[p.k];
    if(!b) b = bosses[p.k] = { k: p.k, day: p.day, title: p.title, beat: p.beat, n: 0, seen: 0, treated: 0, pts: 0 };
    b.n++;
    const r = rows[i];
    if(r){ b.seen++; b.pts += r.pts || 0; if(r.stars > 0) b.treated++; }
  });
  bosses.forEach(b => {
    b.avg = b.seen ? Math.round(crackAvg(b.pts, b.n) * 10) / 10 : 0;   // clinic bosses: two cracks per patient
    b.done = b.treated === b.n;
    b.cleared = b.done && b.avg >= b.beat;
  });
  return {
    reached: bosses.filter(b => b.seen).length,
    cleared: bosses.filter(b => b.cleared).length,
    score: rows.reduce((a, r) => a + (r.pts || 0), 0),
    bosses
  };
}

/* The kept record: more bosses cleared wins, then more reached, then the score. A run that reached no boss never counts. */
export function rushRecord(prev, run){
  const p = prev && Number.isInteger(prev.cleared) ? { reached: prev.reached | 0, cleared: prev.cleared, score: prev.score | 0, runs: prev.runs | 0 } : null;
  const runs = (p ? p.runs : 0) + 1;
  const better = run.reached > 0 && (!p || run.cleared > p.cleared || (run.cleared === p.cleared && (run.reached > p.reached || (run.reached === p.reached && run.score > p.score))));
  return { record: better ? { reached: run.reached, cleared: run.cleared, score: run.score, runs } : p ? { ...p, runs } : { reached: 0, cleared: 0, score: 0, runs }, isBest: better };
}

export function rushRank(cleared, total = rushDays().length){
  if(cleared >= total) return "보스 러시 완주";
  if(cleared >= 4) return "간판 수호자";
  if(cleared >= 2) return "보스 사냥꾼";
  if(cleared >= 1) return "첫 간판 방어";
  return "보스 구경꾼";
}

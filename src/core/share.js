/* 자랑하기 문구와 리더보드 점수 규칙 (pure, unit-tested). platform/share.js sends them.
   One-liner jokes first, then today's result. No personal data. */
export const SHARE_URL = "https://gooreum.github.io/ttuk-chiro-clinic/";
export const TOSS_PATH = "intoss://ttuk-chiro";   // appName in apps-in-toss.config.ts

const JOKE_DAY = ["이 목을 내가 뚝 했다.", "환자 목은 무사하다. 아마도.", "병맛 카이로 원장님 출근했습니다."];
const JOKE_NIGHT = ["오늘 밤 목 몇 개 뚝했는지 세다가 잠 못 잠.", "심야에도 목은 뚝 소리가 난다."];
const JOKE_RUSH = ["보스들 목을 줄줄이 뚝했다.", "보스 러시, 손목이 먼저 뚝 소리 남."];
const JOKE_WEEKLY = ["이번 주 숙제 끝. 목은 내 숙제가 아니었다.", "주간 챌린지, 환자 목이 주간 지출이었다."];

// a stable pick so the same result always reads the same (no Math.random: it must not touch the game's seeds)
const pick = (list, n) => list[Math.abs(Math.floor(Number(n) || 0)) % list.length];
const pts = n => Math.round(Number(n) || 0);
const ambu = n => `구급차 ${Math.max(0, Math.floor(Number(n) || 0))}번`;

/* 영업 일지 cleared day. label "3장 7일차", title "근육왕 헬스장 대결", avg average score, ambulances count (0/1) */
export function dayShareText({ label, title, avg, ambulances = 0, hard = false }){
  return `${pick(JOKE_DAY, pts(avg))}\n${label}${hard ? " 역경" : ""} ${title} 평균 ${pts(avg)}점, ${ambu(ambulances)}`;
}
// 심야 진료: count patients treated
export function nightShareText({ count, score, ambulances = 0 }){
  const c = Math.max(0, Math.floor(Number(count) || 0));
  return `${pick(JOKE_NIGHT, c)}\n오늘의 심야 진료 ${c}명, ${pts(score)}점, ${ambu(ambulances)}`;
}
// 보스 러시: cleared of total bosses
export function rushShareText({ cleared, total, reached, ambulances = 0 }){
  const c = Math.max(0, Math.floor(Number(cleared) || 0));
  return `${pick(JOKE_RUSH, c)}\n보스 러시 ${total}명 중 ${c}명 격파(${Math.max(c, Math.floor(Number(reached) || 0))}명까지 도달), ${ambu(ambulances)}`;
}
// 주간 챌린지: this week's best score and its rule name
export function weeklyShareText({ best, rule, label, ambulances = 0 }){
  const b = pts(best);
  return `${pick(JOKE_WEEKLY, b)}\n주간 챌린지(${label}) ${rule}, 이번 주 최고 ${b}점, ${ambu(ambulances)}`;
}
export const withLink = (text, link = SHARE_URL) => `${text}\n${link}`;

/* The Toss console gives one leaderboard per mini app, so only one score kind goes in: the 심야 진료 patient count (the endless
   mode ranks naturally). Anything else returns null = nothing is submitted. Score is a float string (Game.setLeaderboardScore). */
export function leaderboardScore(kind, { count } = {}){
  if(kind !== "night") return null;
  const c = Math.floor(Number(count));
  return Number.isFinite(c) && c > 0 ? String(c) : null;
}

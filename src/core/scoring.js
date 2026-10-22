/* 연속 성공 보너스: 두 번째 연속부터 +10씩, COMBO_CAP에서 멈춘다. 상한이 없을 땐 꺾기 수가 많은 날일수록 점수가
   저절로 올라 별·보스 기준이 환자 수에 따라 전혀 다른 난이도였다(playtest 4 #1). */
export const COMBO_CAP = 20;
export const comboOf = streak => streak >= 2 ? Math.min(COMBO_CAP, (streak-1)*10) : 0;
/* 한 번도 안 틀린 판에서 꺾기 n번의 평균 연속 보너스. 영업 일지 별 컷을 꺾기 수에 맞춰 옮길 때 쓴다(core/campaign.js cutShift) */
export function comboAvg(n){ let s = 0; for(let k = 1; k <= n; k++) s += comboOf(k); return n > 0 ? s/n : 0; }
/* Score for a successful adjustment. streak/painHere are the values before this success. */
export function scoreSuccess(d, exhale, streak, painHere){
  const perfect = d < 0.35;
  const base = Math.round(100 - 40*d);
  const firstTry = painHere === 0;
  const nextStreak = firstTry ? streak + 1 : 0;
  const comboBonus = comboOf(nextStreak);
  const pts = base + (exhale ? 15 : 0) + comboBonus;
  const stars = perfect && firstTry ? 3 : painHere <= 1 ? 2 : 1;
  return {perfect, base, firstTry, streak: nextStreak, comboBonus, pts, stars};
}
export const rankTitle = (avg, pain) => pain >= 3 ? "면허 재시험 대상"
  : avg >= 115 ? "손끝의 명의" : avg >= 98 ? "예약 꽉 찬 원장님" : avg >= 82 ? "동네 인기 원장님" : "열정 넘치는 수련의";
/* A patient is adjusted on both sides; the day log shows the weaker side's stars. */
export const patientStars = sideStars => Math.min(...sideStars);
/* Rank thresholds are per crack, and every patient takes two cracks. */
export const crackAvg = (score, patients) => score / (patients * 2);

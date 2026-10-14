/* Score for a successful adjustment. streak/painHere are the values before this success. */
export function scoreSuccess(d, exhale, streak, painHere){
  const perfect = d < 0.35;
  const base = Math.round(100 - 40*d);
  const firstTry = painHere === 0;
  const nextStreak = firstTry ? streak + 1 : 0;
  const comboBonus = nextStreak >= 2 ? (nextStreak-1)*10 : 0;
  const pts = base + (exhale ? 15 : 0) + comboBonus;
  const stars = perfect && firstTry ? 3 : painHere <= 1 ? 2 : 1;
  return {perfect, base, firstTry, streak: nextStreak, comboBonus, pts, stars};
}
export const rankTitle = (avg, pain) => pain >= 3 ? "면허 재시험 대상"
  : avg >= 115 ? "손끝의 명의" : avg >= 98 ? "예약 꽉 찬 원장님" : avg >= 82 ? "동네 인기 원장님" : "열정 넘치는 수련의";

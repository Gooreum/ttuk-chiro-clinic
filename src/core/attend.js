import { t } from "../i18n/index.js";
/* 출근 도장 (2026-10-23, 리텐션): the first finished run of each KST day stamps the clinic's attendance card. Streak days
   in a row, a 7-day cycle of small 진료비 gifts, a missed day starts over at 1. Pure: no DOM, no clock of its own (the caller
   passes today's KST date, core/night.js kstDate). Saved in localStorage "chiroAttend" {last, streak, total}. No personal data. */
export const ATTEND_KEY = "chiroAttend";
export const ATTEND_CYCLE = 7;
export const ATTEND_REWARD = [10, 10, 15, 15, 20, 20, 70];   // 진료비 on day 1..7 of the cycle (a normal run pays ~90-110)
const DAY_MS = 86400000;

/* "2026-10-23" -> whole days since the epoch (NaN for junk) */
export const dateNo = d => /^\d{4}-\d{2}-\d{2}$/.test(String(d)) ? Math.floor(Date.parse(d + "T00:00:00Z") / DAY_MS) : NaN;

/* the stored value -> a clean record (any junk becomes "never came") */
export function attendRead(raw){
  const ok = raw && Number.isFinite(dateNo(raw.last)) && Number.isFinite(raw.streak) && raw.streak > 0;
  return ok ? { last: raw.last, streak: Math.floor(raw.streak), total: Math.max(Math.floor(raw.streak), Math.floor(Number(raw.total) || 0)) } : { last: "", streak: 0, total: 0 };
}
/* the day inside the 7-day cycle (1..7) for a streak length */
export const cycleDay = streak => ((Math.max(1, Math.floor(streak)) - 1) % ATTEND_CYCLE) + 1;
export const rewardFor = streak => ATTEND_REWARD[cycleDay(streak) - 1];

/* where the card stands today: stamped (already today), alive (yesterday was stamped, so a stamp today makes streak+1), or broken */
export function attendStatus(rec, today){
  const r = attendRead(rec), gap = dateNo(today) - dateNo(r.last);
  if(!r.streak) return { state: "new", streak: 0, next: 1 };
  if(gap <= 0) return { state: "stamped", streak: r.streak, next: r.streak + 1 };   // gap < 0: the phone clock went back, never stamp twice
  if(gap === 1) return { state: "alive", streak: r.streak, next: r.streak + 1 };
  return { state: "broken", streak: 0, next: 1 };
}
/* A run finished today. Returns { rec, stamped (a new stamp this call), streak, cycle, coins, gap }. Same record back when already stamped. */
export function attendMark(rec, today){
  const r = attendRead(rec), st = attendStatus(r, today);
  if(st.state === "stamped") return { rec: r, stamped: false, streak: r.streak, cycle: cycleDay(r.streak), coins: 0, gap: 0 };
  const streak = st.next, gap = r.streak ? dateNo(today) - dateNo(r.last) : 0;
  return { rec: { last: today, streak, total: r.total + 1 }, stamped: true, streak, cycle: cycleDay(streak), coins: rewardFor(streak), gap };
}
/* one short line for the title card */
export function attendLine(rec, today){
  const st = attendStatus(rec, today);
  if(st.state === "stamped") return t("출근 {n}일째",{n:st.streak});
  if(st.state === "alive") return t("출근 {n}일째 · 오늘 도장 대기",{n:st.streak});
  return t("첫 판 끝내면 출근 도장");
}
/* the result-card line when a stamp lands: the cycle day and the gift, the 7th day says so */
export function attendStampLine({ streak, cycle, coins }){
  return cycle === ATTEND_CYCLE ? t("출근 {n}일째 · 7일 만근 진료비 +{c}",{n:streak,c:coins}) : t("출근 {n}일째 도장 · 진료비 +{c}",{n:streak,c:coins});
}

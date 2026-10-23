/* Apps-in-Toss monetization rules (src/platform/toss.js wires them to the SDK). Pure, unit-tested.
   Rewarded ad = "이어하기": a run that ended on pain or an ambulance can go on once. Interstitial = on the day log of a
   run that is not offered a continue, at most once per INTERSTITIAL_GAP_MS. The 광고 제거 purchase skips both ads. */
import { comboAvg } from "./scoring.js";
export const INTERSTITIAL_GAP_MS = 240000;
/* A cleared 영업 일지 day's card shows an interstitial only on every second clear of a session (playtest 5: ads on every
   clear felt like a toll). n = how many cleared cards this session has shown, counting the current one. */
export const clearAdDue = n => n >= 2 && n % 2 === 0;
/* 영업 일지: no interstitial on the first ONBOARD_DAYS days (new players learn the game ad-free) or on a boss day's card
   (a win or a loss there should land without an ad on top) */
export const ONBOARD_DAYS = 3;
export const quietDay = (day, boss) => Number.isInteger(day) && day >= 0 && (day < ONBOARD_DAYS || !!boss);

// the run ended badly (or a boss day was played through under its beat) and the one continue of this run is still unused
export const continueOffer = ({ endedBad, bossMiss, used }) => !!(endedBad || bossMiss) && !used;
/* 영업 일지 boss day played to the end with an average under its beat: the rewarded continue replays only the last
   patient (or 허리펴기's last zone) instead of the whole day (user goal 2026-10-22 "중간중간에 과금요소 잘 넣는다") */
// Only a near miss gets the ad offer: a big gap means the day needs a fresh try, not one more patient.
export const BOSS_RETRY_GAP = 8;
/* opts (optional): { cracks, lastCracks, lastPts } = cracks in the whole day, cracks the replay covers, points the last
   patient scored. If a perfect replay of those cracks (115 each + the combo that restarts at 0 after a continue) still
   cannot lift the average to the beat, the ad is not offered (playtest 5 P0: the ad sold a retry that could not win). */
export function bossMissed(beat, complete, avg, opts){
  if(!(!!beat && !!complete && avg < beat && beat - avg <= BOSS_RETRY_GAP)) return false;
  if(!opts || !(opts.cracks > 0) || !(opts.lastCracks > 0)) return true;
  const best = opts.lastCracks * (115 + comboAvg(opts.lastCracks));
  return (avg * opts.cracks - (opts.lastPts || 0) + best) / opts.cracks >= beat;
}

/* 영업 일지 story card: "광고 보고 통증 칸 +1" (rewarded, optional). Only on a plain day with 2 or fewer pain slots, once
   per day; 역경 never gets it (an ad must not undo the difficulty the player chose; user goal 2026-10-22 "중간중간에 과금요소 잘 넣는다"). */
export const PAIN_AD_MAX = 2;
export const painAdOffer = ({ painMax, hard, used }) => !hard && !used && painMax >= 1 && painMax <= PAIN_AD_MAX;

/* Every result card (free play included, in all four modes) holds its interstitial for the leave buttons and shows it only
   on every second such card of a session; pt41: free-play clears used to show one on the 4-minute gap alone (10~15 per
   hour). Returns false (no ad) after a failed/continue-offered card, a review-request card, and 심야·러시·주간·오늘의 도전. */
export const cardAdPlan = ({ offer, skip, night, endedBad, bossMiss }) => !(offer || skip || night || endedBad || bossMiss);

export const interstitialDue = (lastAt, now, adFree) => !adFree && now - lastAt >= INTERSTITIAL_GAP_MS;

/* Completed / refunded orders -> owns the sku? null when the list says nothing about it (an empty or failed lookup
   must not revoke a purchase saved on this phone), false when every order for it was refunded. */
export function ownsSku(orders, sku){
  const mine = (orders || []).filter(o => o && o.sku === sku);
  if(!mine.length) return null;
  return mine.some(o => o.status === "COMPLETED");
}

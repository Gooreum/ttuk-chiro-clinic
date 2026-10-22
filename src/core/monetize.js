/* Apps-in-Toss monetization rules (src/platform/toss.js wires them to the SDK). Pure, unit-tested.
   Rewarded ad = "이어하기": a run that ended on pain or an ambulance can go on once. Interstitial = on the day log of a
   run that is not offered a continue, at most once per INTERSTITIAL_GAP_MS. The 광고 제거 purchase skips both ads. */
export const INTERSTITIAL_GAP_MS = 120000;
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
export const bossMissed = (beat, complete, avg) => !!beat && !!complete && avg < beat && beat - avg <= BOSS_RETRY_GAP;

export const interstitialDue = (lastAt, now, adFree) => !adFree && now - lastAt >= INTERSTITIAL_GAP_MS;

/* Completed / refunded orders -> owns the sku? null when the list says nothing about it (an empty or failed lookup
   must not revoke a purchase saved on this phone), false when every order for it was refunded. */
export function ownsSku(orders, sku){
  const mine = (orders || []).filter(o => o && o.sku === sku);
  if(!mine.length) return null;
  return mine.some(o => o.status === "COMPLETED");
}

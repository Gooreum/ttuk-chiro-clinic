/* Apps-in-Toss monetization rules (src/platform/toss.js wires them to the SDK). Pure, unit-tested.
   Rewarded ad = "이어하기": a run that ended on pain or an ambulance can go on once. Interstitial = on the day log of a
   run that is not offered a continue, at most once per INTERSTITIAL_GAP_MS. The 광고 제거 purchase skips both ads. */
export const INTERSTITIAL_GAP_MS = 120000;

// the run ended badly and the one continue of this run is still unused
export const continueOffer = ({ endedBad, used }) => !!endedBad && !used;

export const interstitialDue = (lastAt, now, adFree) => !adFree && now - lastAt >= INTERSTITIAL_GAP_MS;

/* Completed / refunded orders -> owns the sku? null when the list says nothing about it (an empty or failed lookup
   must not revoke a purchase saved on this phone), false when every order for it was refunded. */
export function ownsSku(orders, sku){
  const mine = (orders || []).filter(o => o && o.sku === sku);
  if(!mine.length) return null;
  return mine.some(o => o.status === "COMPLETED");
}

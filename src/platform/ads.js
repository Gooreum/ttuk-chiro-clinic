/* One door for ads: ui/monetize.js and ui/shop.js import from here. Toss build -> toss.js, store-app build (__APP__) ->
   admob.js, everything else -> toss.js's no-op branches. The ad-free purchase exists only on Toss; in the app it is off. */
import * as toss from "./toss.js";
import * as admob from "./admob.js";

export const adsOn = __APP__ ? admob.isApp : toss.isToss;
export const canWatchRewarded = __APP__ ? admob.canWatchRewarded : toss.canWatchRewarded;
export const watchRewarded = __APP__ ? admob.watchRewarded : toss.watchRewarded;
export const maybeInterstitial = __APP__ ? admob.maybeInterstitial : toss.maybeInterstitial;
export const canBuyAdFree = __APP__ ? () => false : toss.canBuyAdFree;
export const buyAdFree = __APP__ ? async () => false : toss.buyAdFree;
export const adFreePrice = __APP__ ? async () => "" : toss.adFreePrice;
export const adFree = __APP__ ? () => false : toss.adFree;
export const onAdFreeChange = toss.onAdFreeChange;
export const restorePurchases = __APP__ ? async () => {} : toss.restorePurchases;

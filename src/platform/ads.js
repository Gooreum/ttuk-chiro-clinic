/* One door for ads and purchases: ui/monetize.js and ui/shop.js import from here. Ads: Toss build -> toss.js, store-app
   build (__APP__) -> admob.js, everything else -> toss.js's no-op branches. Purchases (both stores): iap.js. */
import * as toss from "./toss.js";
import * as admob from "./admob.js";
import * as iap from "./iap.js";

export const adsOn = __APP__ ? admob.isApp : toss.isToss;
export const canWatchRewarded = __APP__ ? admob.canWatchRewarded : toss.canWatchRewarded;
export const watchRewarded = __APP__ ? admob.watchRewarded : toss.watchRewarded;
export const maybeInterstitial = __APP__ ? admob.maybeInterstitial : toss.maybeInterstitial;
export const { iapOn, canBuy, canBuyAdFree, buyAdFree, adFreePrice, adFree, onAdFreeChange, prices, buy, canRestore, restorePurchases } = iap;
export const recoverPurchases = iap.recover;

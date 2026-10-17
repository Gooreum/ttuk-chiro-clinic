/* Apps-in-Toss ads and purchase (only in `npm run build:toss`, __TOSS__; every other build gets the no-op branches and
   no SDK chunk). Rules: core/monetize.js. IDs come from the Apps-in-Toss console (app ttuk-chiro); an empty ID turns
   that feature off. The purchase is kept on this phone (localStorage) and re-read from Toss orders on boot. */
import { store } from "../lib/store.js";
import { interstitialDue, ownsSku } from "../core/monetize.js";

export const TOSS_IDS = {
  rewarded: "ait.v2.live.6bbec6f5729e47e6",       // 보상형 "뚝이어하기" (보상 이어하기 1)
  interstitial: "ait.v2.live.edc7cd2ebc9947d4",   // 전면형 "한판더"
  adFreeSku: ""       // 비소모성 "광고 제거" (정산 정보 검토가 끝나야 콘솔에서 만들 수 있다, 2026-10-17)
};
export const isToss = __TOSS__;
const AD_FREE = "chiroAdFree";

let sdkP = null;
const sdk = () => __TOSS__ ? (sdkP ||= import("@apps-in-toss/web-framework")) : Promise.reject(new Error("not toss"));
const supported = fn => { try{ return !!fn && fn.isSupported(); }catch(e){ return false; } };

export const adFree = () => store.get(AD_FREE, false);
const setAdFree = v => { store.set(AD_FREE, !!v); listeners.forEach(f => f()); };
const listeners = [];
export const onAdFreeChange = f => listeners.push(f);

/* One full-screen ad: resolves true when the viewer earned the reward (rewarded) or it was shown to the end
   (interstitial: dismissed), false when it could not load or show. */
async function fullScreen(adGroupId, rewarded){
  if(!adGroupId) return false;
  let m;
  try{ m = await sdk(); }catch(e){ return false; }
  if(!supported(m.loadFullScreenAd) || !supported(m.showFullScreenAd)) return false;
  return new Promise(resolve => {
    let earned = false, settled = false, unload = () => {};
    const done = ok => { if(settled) return; settled = true; try{ unload(); }catch(e){} resolve(ok); };
    try{
      unload = m.loadFullScreenAd({
        options: { adGroupId },
        onError: () => done(false),
        onEvent: e => {
          if(e.type !== "loaded") return;
          m.showFullScreenAd({
            options: { adGroupId },
            onError: () => done(false),
            onEvent: ev => {
              if(ev.type === "userEarnedReward") earned = true;
              if(ev.type === "failedToShow") done(false);
              if(ev.type === "dismissed") done(rewarded ? earned : true);
            }
          });
        }
      }) || (() => {});
    }catch(e){ done(false); }
  });
}

export const canWatchRewarded = () => isToss && !!TOSS_IDS.rewarded;
// 이어하기: true = go on. Ad-free players go on without an ad.
export async function watchRewarded(){
  if(!isToss) return false;
  if(adFree()) return true;
  return fullScreen(TOSS_IDS.rewarded, true);
}

let lastInterstitial = performance.now();   // none in the first two minutes of a session
export async function maybeInterstitial(){
  if(!isToss || !TOSS_IDS.interstitial) return;
  const now = performance.now();
  if(!interstitialDue(lastInterstitial, now, adFree())) return;
  lastInterstitial = now;
  await fullScreen(TOSS_IDS.interstitial, false);
}

export const canBuyAdFree = () => isToss && !!TOSS_IDS.adFreeSku && !adFree();
// the price as Toss shows it ("2,200원"), or "" when the product list is not available
export async function adFreePrice(){
  if(!canBuyAdFree()) return "";
  try{
    const m = await sdk();
    if(!supported(m.IAP.getProductItemList)) return "";
    const { products } = await m.IAP.getProductItemList();
    const p = (products || []).find(x => x.sku === TOSS_IDS.adFreeSku);
    return p ? p.displayAmount : "";
  }catch(e){ return ""; }
}
// opens the Toss order sheet; true once the purchase is granted
export async function buyAdFree(){
  if(!canBuyAdFree()) return adFree();
  let m;
  try{ m = await sdk(); }catch(e){ return false; }
  if(!supported(m.IAP.createOneTimePurchaseOrder)) return false;
  return new Promise(resolve => {
    let cleanup = () => {}, settled = false;
    const done = ok => { if(settled) return; settled = true; try{ cleanup(); }catch(e){} resolve(ok); };
    try{
      cleanup = m.IAP.createOneTimePurchaseOrder({
        options: {
          sku: TOSS_IDS.adFreeSku,
          // grant before Toss completes the order: saving the flag is all there is to grant
          processProductGrant: () => { setAdFree(true); return true; }
        },
        onEvent: e => done(e.type === "success" && adFree()),
        onError: () => done(false)
      }) || (() => {});
    }catch(e){ done(false); }
  });
}

/* Boot: orders paid but never granted (the app closed mid-purchase) are granted and completed; completed / refunded
   orders restore or revoke the purchase on a new phone or after a refund. A failed or empty lookup changes nothing. */
export async function restorePurchases(){
  if(!isToss || !TOSS_IDS.adFreeSku) return;
  let m;
  try{ m = await sdk(); }catch(e){ return; }
  try{
    if(supported(m.IAP.getPendingOrders)){
      const { orders } = await m.IAP.getPendingOrders();
      for(const o of orders || []){
        if(o.sku !== TOSS_IDS.adFreeSku) continue;
        setAdFree(true);
        if(supported(m.IAP.completeProductGrant)) await m.IAP.completeProductGrant({ params: { orderId: o.orderId } });
      }
    }
  }catch(e){}
  try{
    if(supported(m.IAP.getCompletedOrRefundedOrders)){
      const { orders } = await m.IAP.getCompletedOrRefundedOrders();
      const owns = ownsSku(orders, TOSS_IDS.adFreeSku);
      if(owns !== null && owns !== adFree()) setAdFree(owns);
    }
  }catch(e){}
}

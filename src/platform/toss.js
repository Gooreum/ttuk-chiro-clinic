/* Apps-in-Toss ads and purchase (only in `npm run build:toss`, __TOSS__; every other build gets the no-op branches and
   no SDK chunk). Rules: core/monetize.js. IDs come from the Apps-in-Toss console (app ttuk-chiro); an empty ID turns
   that feature off. Purchases: platform/iap.js. */
import { interstitialDue } from "../core/monetize.js";
import { adFree } from "./iap.js";
import { sdk, supported } from "./sdk.js";
import { track } from "./analytics.js";
import { EV } from "../core/analytics.js";

export const TOSS_IDS = {
  rewarded: "ait.v2.live.6bbec6f5729e47e6",       // 보상형 "뚝이어하기" (보상 이어하기 1)
  interstitial: "ait.v2.live.edc7cd2ebc9947d4"    // 전면형 "한판더"
};
export const isToss = __TOSS__;
/* One full-screen ad: resolves true when the viewer earned the reward (rewarded) or it was shown to the end
   (interstitial: dismissed), false when it could not load or show. */
async function fullScreen(adGroupId, rewarded){
  if(!adGroupId) return false;
  const format = rewarded ? "rewarded" : "interstitial", t0 = performance.now();
  // every step is logged (docs/analytics.md ad_event): request, loaded, show, impression, clicked, dismissed, reward, error
  const log = (step, extra) => track(EV.adEvent, { format, step, ms: performance.now() - t0, ...extra });
  const errCode = e => String(e && (e.code || e.errorCode || e.message) || e || "").slice(0, 60);
  log("request");
  let m;
  try{ m = await sdk(); }catch(e){ log("error", { stage: "sdk", code: errCode(e) }); return false; }
  if(!supported(m.loadFullScreenAd) || !supported(m.showFullScreenAd)){ log("error", { stage: "unsupported" }); return false; }
  return new Promise(resolve => {
    let earned = false, settled = false, unload = () => {};
    const done = ok => { if(settled) return; settled = true; try{ unload(); }catch(e){} resolve(ok); };
    try{
      unload = m.loadFullScreenAd({
        options: { adGroupId },
        onError: e => { log("error", { stage: "load", code: errCode(e) }); done(false); },
        onEvent: e => {
          if(e.type !== "loaded") return;
          log("loaded");
          m.showFullScreenAd({
            options: { adGroupId },
            onError: e => { log("error", { stage: "show", code: errCode(e) }); done(false); },
            onEvent: ev => {
              if(ev.type === "requested") log("show_requested");
              if(ev.type === "show") log("show");
              if(ev.type === "impression") log("impression");
              if(ev.type === "clicked") log("clicked");
              if(ev.type === "userEarnedReward"){ earned = true; log("reward"); }
              if(ev.type === "failedToShow"){ log("error", { stage: "failedToShow" }); done(false); }
              if(ev.type === "dismissed"){ log("dismissed", { earned }); done(rewarded ? earned : true); }
            }
          });
        }
      }) || (() => {});
    }catch(e){ log("error", { stage: "call", code: errCode(e) }); done(false); }
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
// notice: shown first, so the ad never pops up unannounced (the Toss recommend guide)
export async function maybeInterstitial(notice){
  if(!isToss || !TOSS_IDS.interstitial) return;
  const now = performance.now();
  if(!interstitialDue(lastInterstitial, now, adFree())) return;
  lastInterstitial = now;
  if(notice) await notice();
  await fullScreen(TOSS_IDS.interstitial, false);
}

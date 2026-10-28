/* iOS/Android store-app ads (Capacitor + @capacitor-community/admob). Only in `npm run build:app` (__APP__); every other
   build gets the no-op branches and the plugin is never bundled (dynamic import behind __APP__). Same shape as the ads
   half of platform/toss.js; picked in platform/ads.js. Purchases: platform/iap.js. Rules: core/monetize.js.
   Ad unit IDs: REAL_IDS (AdMob, issued 2026-10-28); an empty entry falls back to Google's TEST ID. */
import { interstitialDue } from "../core/monetize.js";
import { track } from "./analytics.js";
import { adFree } from "./iap.js";
import { EV } from "../core/analytics.js";

export const isApp = __APP__;

// https://developers.google.com/admob/android/test-ads and /ios/test-ads (sample ad units)
const TEST_IDS = {
  android: { rewarded: "ca-app-pub-3940256099942544/5224354917", interstitial: "ca-app-pub-3940256099942544/1033173712" },
  ios: { rewarded: "ca-app-pub-3940256099942544/1712485313", interstitial: "ca-app-pub-3940256099942544/4411468910" }
};
export const REAL_IDS = {
  android: { rewarded: "ca-app-pub-4785237655148075/2365490561", interstitial: "ca-app-pub-4785237655148075/6106967018" },   // 이어하기 / 한판더
  ios: { rewarded: "ca-app-pub-4785237655148075/3480803678", interstitial: "ca-app-pub-4785237655148075/6113163889" }
};

let plugin = null, ready = null;
async function load(){
  if(!__APP__) return null;
  if(!plugin){
    const [{ Capacitor }, mod] = await Promise.all([import("@capacitor/core"), import("@capacitor-community/admob")]);
    plugin = { ...mod, platform: Capacitor.getPlatform() };
  }
  if(!ready) ready = (async () => {
    const m = plugin;
    // iOS 14+: ATT prompt, then UMP consent (EEA/UK). The consent form is shown only when required.
    try{ if(m.platform === "ios") await m.AdMob.requestTrackingAuthorization(); }catch(e){}
    try{
      const info = await m.AdMob.requestConsentInfo();
      if(info.isConsentFormAvailable && info.status === "REQUIRED") await m.AdMob.showConsentForm();
    }catch(e){}
    await m.AdMob.initialize();
  })();
  await ready;
  return plugin;
}
const unitId = kind => {
  const p = plugin && plugin.platform === "ios" ? "ios" : "android";
  return REAL_IDS[p][kind] || TEST_IDS[p][kind];
};

const errCode = e => String(e && (e.code || e.message) || e || "").slice(0, 60);

/* One full-screen ad: true when the reward was earned (rewarded) / the ad was shown and closed (interstitial). */
async function fullScreen(rewarded){
  const format = rewarded ? "rewarded" : "interstitial", t0 = performance.now();
  const log = (step, extra) => track(EV.adEvent, { format, step, ms: performance.now() - t0, ...extra });
  log("request");
  let m;
  try{ m = await load(); }catch(e){ log("error", { stage: "sdk", code: errCode(e) }); return false; }
  if(!m) return false;
  const handles = []; let earned = false;
  const on = (name, fn) => handles.push(m.AdMob.addListener(name, fn));
  try{
    if(rewarded){
      const E = m.RewardAdPluginEvents;
      const done = new Promise(resolve => {
        on(E.Rewarded, () => { earned = true; log("reward"); });
        on(E.Dismissed, () => { log("dismissed", { earned }); resolve(earned); });
        on(E.FailedToShow, e => { log("error", { stage: "show", code: errCode(e) }); resolve(false); });
        on(E.FailedToLoad, e => { log("error", { stage: "load", code: errCode(e) }); resolve(false); });
      });
      await m.AdMob.prepareRewardVideoAd({ adId: unitId("rewarded") });
      log("loaded");
      await m.AdMob.showRewardVideoAd();
      return await done;
    }
    const E = m.InterstitialAdPluginEvents;
    const done = new Promise(resolve => {
      on(E.Dismissed, () => { log("dismissed"); resolve(true); });
      on(E.FailedToShow, e => { log("error", { stage: "show", code: errCode(e) }); resolve(false); });
      on(E.FailedToLoad, e => { log("error", { stage: "load", code: errCode(e) }); resolve(false); });
    });
    await m.AdMob.prepareInterstitial({ adId: unitId("interstitial") });
    log("loaded");
    await m.AdMob.showInterstitial();
    return await done;
  }catch(e){ log("error", { stage: "call", code: errCode(e) }); return false; }
  finally{ handles.forEach(h => Promise.resolve(h).then(x => x && x.remove && x.remove()).catch(() => {})); }
}

export const canWatchRewarded = () => isApp;
export const watchRewarded = () => isApp ? (adFree() ? Promise.resolve(true) : fullScreen(true)) : Promise.resolve(false);

let lastInterstitial = performance.now();
export async function maybeInterstitial(notice){
  if(!isApp) return;
  const now = performance.now();
  if(!interstitialDue(lastInterstitial, now, adFree())) return;
  lastInterstitial = now;
  if(notice) await notice();
  await fullScreen(false);
}

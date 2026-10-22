/* Apps-in-Toss result-card buttons, shared by the three modes: "광고 보고 이어하기" (rewarded, once per run after a
   bad end, or "광고 보고 마지막 환자 다시" after a boss day under its beat) and "광고 제거" (one-time purchase). Outside the Toss build both stay hidden and nothing loads. */
import { isToss, canWatchRewarded, watchRewarded, maybeInterstitial, canBuyAdFree, buyAdFree, adFreePrice, adFree, onAdFreeChange, restorePurchases } from "../platform/toss.js";
import { continueOffer, painAdOffer } from "../core/monetize.js";
import { track } from "../platform/analytics.js";
import { EV } from "../core/analytics.js";

export const AD_NOTICE_MS = 1600;
/* The interstitial is announced first (the Toss recommend guide: no ad without warning). */
function adNotice(){
  track(EV.adNotice, { format: "interstitial" });
  const el = document.createElement("div");
  el.className = "ad-notice"; el.setAttribute("role", "status");
  el.textContent = "잠시 뒤 광고가 1개 나와요";
  document.body.appendChild(el);
  return new Promise(r => setTimeout(() => { el.remove(); r(); }, AD_NOTICE_MS));
}

export function mountMonetize({ continueBtn, buyBtn, onContinue, leave = [] }){
  continueBtn.hidden = true; buyBtn.hidden = true;
  if(!isToss) return { showResult(){} };
  restorePurchases();
  let busy = false;
  let retry = false;   // a boss-day miss: the same button replays the last patient
  const label = () => retry ? (adFree() ? "마지막 환자 다시" : "광고 보고 마지막 환자 다시") : adFree() ? "이어하기" : "광고 보고 이어하기";
  async function renderBuy(){
    buyBtn.hidden = !canBuyAdFree();
    if(buyBtn.hidden) return;
    const price = await adFreePrice();
    buyBtn.textContent = price ? `광고 제거 · ${price}` : "광고 제거";
  }
  continueBtn.addEventListener("click", async () => {
    if(busy) return;
    busy = true; continueBtn.disabled = true;
    track(EV.click, { target: retry ? "boss_retry_ad" : "continue_ad", ad_free: adFree() });
    const ok = await watchRewarded();
    busy = false; continueBtn.disabled = false;
    if(ok){ continueBtn.hidden = true; onContinue(); }
    else continueBtn.textContent = "광고를 못 불러왔어요 · 다시";
  });
  buyBtn.addEventListener("click", async () => {
    if(busy) return;
    busy = true; buyBtn.disabled = true;
    await buyAdFree();
    busy = false; buyBtn.disabled = false;
  });
  onAdFreeChange(() => { renderBuy(); if(!continueBtn.hidden) continueBtn.textContent = label(); });
  /* A cleared 영업 일지 day keeps its punchline (the outro) clear of an ad: the interstitial waits until the player taps
     one of the `leave` buttons (다음 날 / 이 날 다시 / 영업 일지), then runs before that button's own action. */
  let pendingAd = false, leaving = false;
  leave.forEach(el => el && el.addEventListener("click", async e => {
    if(leaving){ e.preventDefault(); e.stopImmediatePropagation(); return; }
    if(!pendingAd) return;
    e.preventDefault(); e.stopImmediatePropagation();
    pendingAd = false; leaving = true;
    try{ await maybeInterstitial(adNotice); }finally{ leaving = false; }
    el.click();
  }, true));
  return {
    // after the day log opens: offer the continue, or show an interstitial when there is none to offer and the
    // card did not just ask for a review. hard (역경): no continue and no boss retry, and no ad right after a failed
    // run. deferInterstitial: hold the interstitial for the leave buttons.
    async showResult({ endedBad, bossMiss, used, hard, skipInterstitial, deferInterstitial }){
      retry = !hard && !endedBad && !!bossMiss;
      pendingAd = false;
      const offer = !hard && continueOffer({ endedBad, bossMiss, used }) && (canWatchRewarded() || adFree());
      continueBtn.hidden = !offer; continueBtn.textContent = label();
      renderBuy();
      if(offer || skipInterstitial) return;
      if(hard && (endedBad || bossMiss)) return;
      if(deferInterstitial){ pendingAd = true; return; }
      await maybeInterstitial(adNotice);
    }
  };
}

/* 영업 일지 story card: the optional "광고 보고 통증 칸 +1" button (Toss build only, rewarded ad ID needed). show() decides
   whether the button appears for the day; take(day) gives the bonus (0/1) to the run that starts now and spends it. */
export function mountPainAd({ btn }){
  btn.hidden = true;
  if(!isToss) return { show(){}, take(){ return 0; } };
  const pending = new Set(), spent = new Set();
  let day = -1, busy = false;
  const text = d => pending.has(d) ? "통증 칸 +1 받았어요" : adFree() ? "통증 칸 +1 받기" : "광고 보고 통증 칸 +1";
  btn.addEventListener("click", async () => {
    if(busy || day < 0 || pending.has(day)) return;
    const d = day;
    busy = true; btn.disabled = true;
    track(EV.painAd, { day: d + 1, step: "click" });
    const ok = await watchRewarded();
    busy = false;
    track(EV.painAd, { day: d + 1, step: ok ? "granted" : "fail" });
    if(ok) pending.add(d);
    btn.textContent = ok ? text(d) : "광고를 못 불러왔어요 · 다시";
    btn.disabled = ok && day === d;
  });
  return {
    show(d, def, hard){
      day = d; busy = false;
      const on = painAdOffer({ painMax: def.painMax, hard, used: spent.has(d) }) && (canWatchRewarded() || adFree());
      btn.hidden = !on; btn.textContent = text(d); btn.disabled = pending.has(d);
    },
    take(d){
      const n = pending.delete(d) ? 1 : 0;
      if(n) spent.add(d);
      return n;
    }
  };
}

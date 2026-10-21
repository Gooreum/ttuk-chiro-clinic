/* Apps-in-Toss result-card buttons, shared by the three modes: "광고 보고 이어하기" (rewarded, once per run after a
   bad end) and "광고 제거" (one-time purchase). Outside the Toss build both stay hidden and nothing loads. */
import { isToss, canWatchRewarded, watchRewarded, maybeInterstitial, canBuyAdFree, buyAdFree, adFreePrice, adFree, onAdFreeChange, restorePurchases } from "../platform/toss.js";
import { continueOffer } from "../core/monetize.js";
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

export function mountMonetize({ continueBtn, buyBtn, onContinue }){
  continueBtn.hidden = true; buyBtn.hidden = true;
  if(!isToss) return { showResult(){} };
  restorePurchases();
  let busy = false;
  const label = () => adFree() ? "이어하기" : "광고 보고 이어하기";
  async function renderBuy(){
    buyBtn.hidden = !canBuyAdFree();
    if(buyBtn.hidden) return;
    const price = await adFreePrice();
    buyBtn.textContent = price ? `광고 제거 · ${price}` : "광고 제거";
  }
  continueBtn.addEventListener("click", async () => {
    if(busy) return;
    busy = true; continueBtn.disabled = true;
    track(EV.click, { target: "continue_ad", ad_free: adFree() });
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
  return {
    // after the day log opens: offer the continue, or show an interstitial when there is none to offer and the
    // card did not just ask for a review
    async showResult({ endedBad, used, skipInterstitial }){
      const offer = continueOffer({ endedBad, used }) && (canWatchRewarded() || adFree());
      continueBtn.hidden = !offer; continueBtn.textContent = label();
      renderBuy();
      if(!offer && !skipInterstitial) await maybeInterstitial(adNotice);
    }
  };
}

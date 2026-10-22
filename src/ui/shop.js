/* 진료비 경제·상점 screens (core/shop.js has the rules). Everything here builds its own DOM so the three pages can share it:
   - mountShop(): the 진료실 꾸미기 buttons (title card, 영업 일지 list) and the shop overlay            (index.html)
   - mountCoupon(): the 통증 칸 +1권 button on the 영업 일지 story card                                  (index.html)
   - mountCoinReward(): the 진료비 line (and the 2x rewarded ad) on a result card                       (index / back / side) */
import "./shop.css";
import { $ } from "../lib/dom.js";
import { store } from "../lib/store.js";
import { SHOP_KEY, ITEMS, readShop, count, owns, coinsFor, doubleOffer, add, buy, spend } from "../core/shop.js";
import { adsOn as isToss, canWatchRewarded, watchRewarded, adFree } from "../platform/ads.js";
import { track } from "../platform/analytics.js";
import { EV } from "../core/analytics.js";

export const loadShop = () => readShop(store.get(SHOP_KEY, null));
function saveShop(st){
  store.set(SHOP_KEY, st);
  try{ dispatchEvent(new Event("chiro-shop")); }catch(e){}
}
const el = (tag, cls, text) => { const e = document.createElement(tag); if(cls) e.className = cls; if(text != null) e.textContent = text; return e; };

/* ---- the shop ---- */
export function mountShop(){
  const app = $("#app");
  const sub = el("span", null, ""); sub.id = "shopSub";
  const titleBtn = el("button", "btn ghost chip-btn", "진료실 꾸미기"); titleBtn.id = "shopBtn"; titleBtn.type = "button"; titleBtn.appendChild(sub);
  const daysBtn = el("button", "btn ghost chip-btn", "진료실 꾸미기"); daysBtn.id = "daysShop"; daysBtn.type = "button";
  const starts = document.querySelector("#intro .starts"), close = $("#daysClose");
  const tRow = document.querySelector("#titleChips"), dRow = document.querySelector("#daysChips");
  if(tRow) tRow.appendChild(titleBtn); else if(starts) starts.insertAdjacentElement("afterend", titleBtn);
  if(dRow) dRow.appendChild(daysBtn); else if(close) close.insertAdjacentElement("beforebegin", daysBtn);

  const ov = el("div", "overlay"); ov.id = "shop"; ov.hidden = true;
  const card = el("div", "card days");
  const head = el("div", "shop-coins");
  const t = el("div"); t.append(el("div", "sub", "진료실 꾸미기"));
  const coins = el("b", null, "0"); coins.id = "shopCoins";
  head.append(t, coins);
  const help = el("div");
  help.append(el("p", "shop-help-title", "진료비"));
  const ul = el("ul", "shop-help");
  ["한 판이 끝나면 점수만큼 받아요.", "소품은 목꺾기·목뽑기 진료실 벽에 놓여요."].forEach(s => ul.appendChild(el("li", null, s)));
  help.appendChild(ul);
  const list = el("ol"); list.id = "shopList";
  const back = el("button", "btn ghost", "돌아가기"); back.id = "shopClose"; back.type = "button";
  card.append(head, help, list, back); ov.appendChild(card); app.appendChild(ov);

  function render(flashId){
    const st = loadShop();
    coins.textContent = String(st.coins);
    sub.textContent = `진료비 ${st.coins}`;
    list.textContent = "";
    ITEMS.forEach(it => {
      const li = el("li"), b = el("button"); b.type = "button"; b.dataset.item = it.id;
      const have = it.kind === "prop" && owns(st, it.id), n = count(st, it.id);
      b.append(el("b", null, it.name), el("small", null, it.kind === "coupon" && n ? `${it.line} (${n}장 있음)` : it.line));
      b.appendChild(el("i", null, have ? "놓였어요" : String(it.price)));
      if(have){ b.classList.add("have"); b.disabled = true; }
      else if(st.coins < it.price) b.classList.add("poor");
      if(flashId === it.id) b.classList.add("flash");
      b.onclick = () => {
        const r = buy(loadShop(), it.id);
        if(!r.ok){ b.classList.remove("flash"); void b.offsetWidth; b.classList.add("flash"); return; }
        saveShop(r.st);
        track(EV.shopBuy, { item: it.id, price: it.price, coins_left: r.st.coins });
        render(it.id);
      };
      li.appendChild(b); list.appendChild(li);
    });
  }
  const open = from => { render(); ov.hidden = false; track(EV.click, { target: "shop_open", from }); };
  titleBtn.addEventListener("click", () => open("title"));
  daysBtn.addEventListener("click", () => open("days"));
  back.addEventListener("click", () => { ov.hidden = true; render(); });
  render();
  addEventListener("chiro-shop", () => render());
  return { render };
}

/* ---- 통증 칸 +1권 on the 영업 일지 story card ---- */
export function mountCoupon(){
  const btn = el("button", "btn ghost", ""); btn.id = "storyCoupon"; btn.type = "button"; btn.hidden = true;
  const anchor = $("#storyPain");
  if(anchor) anchor.insertAdjacentElement("afterend", btn);
  let day = -1, hard = false;
  const pending = new Set();
  const text = () => pending.has(day) ? "통증 칸 +1권 쓰는 중" : `통증 칸 +1권 쓰기 (${count(loadShop(), "pain1")}장)`;
  const refresh = () => {
    // the story card is shared with 단골 의뢰 (its number reads "단골 의뢰 · ..."): only a plain 영업 일지 day takes a coupon
    const questCard = /^단골 의뢰/.test(($("#storyNo") || {}).textContent || "");
    btn.hidden = day < 0 || hard || questCard || count(loadShop(), "pain1") < 1;
    btn.textContent = text(); btn.classList.toggle("on", pending.has(day));
  };
  btn.addEventListener("click", () => {
    if(day < 0) return;
    if(pending.has(day)) pending.delete(day); else pending.add(day);
    refresh();
  });
  const story = $("#story");
  if(story) new MutationObserver(refresh).observe(story, { attributes: true, attributeFilter: ["hidden"] });
  return {
    show(d, h){ day = d; hard = !!h; pending.clear(); refresh(); },
    /* the extra pain slot (0/1) for the run that starts from this card; spends the coupon */
    take(d){
      if(d !== day || !pending.delete(d)) return 0;
      const st = loadShop();
      if(count(st, "pain1") < 1) return 0;
      saveShop(spend(st, "pain1"));
      track(EV.click, { target: "pain_coupon", day: d + 1 });
      refresh();
      return 1;
    }
  };
}

/* ---- the 진료비 line on a result card ----
   anchor: the first button of the card (the line goes before it). show() is called once per finished run; a run that
   finishes again after the rewarded continue (same key) only pays the difference. */
export function mountCoinReward(anchor){
  if(!anchor) return { show(){} };
  const line = el("p", "coin-line"), amt = el("b", null, "+0"), tot = el("small", null, "");
  line.append(el("span", null, "진료비"), amt); line.appendChild(tot);
  const dbl = el("button", "btn ghost", ""); dbl.type = "button"; dbl.hidden = true;
  anchor.insertAdjacentElement("beforebegin", line);
  anchor.insertAdjacentElement("beforebegin", dbl);
  let key = null, paid = 0, doubled = false, hard = false, busy = false, meta = {};
  const label = () => adFree() ? "진료비 2배 받기" : "광고 보고 진료비 2배";
  const paint = () => {
    amt.textContent = `+${paid}`; tot.textContent = `합계 ${loadShop().coins}`;
    dbl.hidden = !(isToss && (canWatchRewarded() || adFree()) && doubleOffer({ earned: paid, hard, used: doubled }));
    dbl.textContent = label();
  };
  dbl.addEventListener("click", async () => {
    if(busy || doubled) return;
    busy = true; dbl.disabled = true;
    track(EV.click, { target: "coin_double_ad", ad_free: adFree() });
    const ok = await watchRewarded();
    busy = false; dbl.disabled = false;
    if(!ok){ dbl.textContent = "광고를 못 불러왔어요 · 다시"; return; }
    doubled = true;
    saveShop(add(loadShop(), paid));
    track(EV.coinEarn, { ...meta, coins: paid, step: "double", total: loadShop().coins });
    paid *= 2; paint();
  });
  return {
    show({ runKey, avg, complete, cleared, hard: h, game, day }){
      const earned = coinsFor({ avg, complete, cleared, hard: h });
      if(runKey !== key){ key = runKey; paid = 0; doubled = false; }
      hard = !!h;
      const gain = doubled ? 0 : Math.max(0, earned - paid);
      meta = { game, day: day == null ? 0 : day, hard: h ? 1 : 0 };
      if(gain > 0){
        saveShop(add(loadShop(), gain)); paid += gain;
        track(EV.coinEarn, { ...meta, coins: gain, step: "run", total: loadShop().coins });
      }
      paint();
    }
  };
}

/* 출근 도장 glue (core/attend.js has the rules): the title line and the stamp on a result card. The stamp is given from
   ui/shop.js's mountCoinReward, which every result card (index / back / side) already calls once per finished run. */
import { $ } from "../lib/dom.js";
import { store } from "../lib/store.js";
import { kstDate } from "../core/night.js";
import { ATTEND_KEY, attendMark, attendLine } from "../core/attend.js";
import { SHOP_KEY, readShop, add } from "../core/shop.js";
import { track } from "../platform/analytics.js";
import { EV } from "../core/analytics.js";

/* the one-line status on the title card (#attendTxt) */
export function paintAttend(){
  const el = $("#attendTxt");
  if(el) el.textContent = attendLine(store.get(ATTEND_KEY, null), kstDate());
}
/* A run played (score or complete) today: stamp the card the first time per KST day and pay the gift. null when there is nothing new. */
export function stampAttend(){
  const m = attendMark(store.get(ATTEND_KEY, null), kstDate());
  if(!m.stamped) return null;
  store.set(ATTEND_KEY, m.rec);
  const shop = add(readShop(store.get(SHOP_KEY, null)), m.coins);
  store.set(SHOP_KEY, shop);
  try{ dispatchEvent(new Event("chiro-shop")); }catch(e){}
  track(EV.attend, { streak: m.streak, cycle: m.cycle, coins: m.coins, gap_days: m.gap, total_days: m.rec.total });
  track(EV.coinEarn, { game: "attend", day: 0, hard: 0, coins: m.coins, step: "attend", total: shop.coins });
  paintAttend();
  return m;
}

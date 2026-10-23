/* 진료비 경제·상점 (pure, unit-tested; ui/shop.js and scene/shopProps.js use it). A finished run pays 진료비 (coins);
   coins buy 진료실 꾸미기 props (seen in the neck modes' room) and a small convenience, the 통증 칸 +1권.
   Saved in localStorage "chiroShop": { coins, owned: [item id, ...] } (a consumable appears once per copy). */
export const SHOP_KEY = "chiroShop";
export const RUN_COIN_CAP = 160;     // one run never pays more than this (before the 2x ad)
export const COUPON_MAX = 5;         // 통증 칸 +1권 you can hold

/* kind "prop": bought once, stands in the room. kind "coupon": consumable, spent on a 영업 일지 story card. */
export const ITEMS = [
  { id: "skull",   kind: "prop",   name: "해골 모형",        line: "눈구멍이 자꾸 환자를 쳐다봐요.",              price: 150 },
  { id: "pain1",   kind: "coupon", name: "통증 칸 +1권",     line: "영업 일지 사연 카드에서 한 번 써요.",          price: 200 },
  { id: "poster",  kind: "prop",   name: "금칠 척추 포스터", line: "경추 7개가 번쩍번쩍해요.",                    price: 400 },
  { id: "cert",    kind: "prop",   name: "수상한 인증서",    line: "세계 뚝 협회 인증. 인쇄는 어제 했어요.",       price: 700 },
  { id: "cactus",  kind: "prop",   name: "척추 선인장",      line: "마디마디 가시가 돋았어요.",                    price: 1100 },
  { id: "trophy",  kind: "prop",   name: "우수 뚝상 트로피", line: "아무도 준 적 없는 상이에요.",                  price: 1600 },
  { id: "bust",    kind: "prop",   name: "원장 흉상",        line: "금빛 얼굴이 문 쪽을 노려봐요.",                price: 2300 },
  { id: "neon",    kind: "prop",   name: "뚝 네온 간판",     line: "밤에도 켜져 있어요.",                          price: 3000 },
  { id: "aquarium",kind: "prop",   name: "금붕어 어항",      line: "금붕어는 목이 없어서 안심이에요.",             price: 3800 },
  { id: "gong",    kind: "prop",   name: "교정 성공 징",     line: "치면 뚝. 안 쳐도 뚝.",                          price: 5500 },
  { id: "chair",   kind: "prop",   name: "안마의자",         line: "환자는 못 앉게 해요. 원장님 전용.",            price: 7000 }
];
export const itemById = id => ITEMS.find(i => i.id === id) || null;
export const PROPS = ITEMS.filter(i => i.kind === "prop");
export const TOTAL_PROP_COST = PROPS.reduce((n, i) => n + i.price, 0);

/* the stored value -> a clean state (any junk becomes an empty shop) */
export function readShop(raw){
  const coins = raw && Number.isFinite(raw.coins) && raw.coins > 0 ? Math.floor(raw.coins) : 0;
  const seen = new Set(), owned = [];
  let coupons = 0;
  for(const id of raw && Array.isArray(raw.owned) ? raw.owned : []){
    const it = itemById(id);
    if(!it) continue;
    if(it.kind === "coupon"){ if(coupons < COUPON_MAX){ coupons++; owned.push(id); } continue; }
    if(!seen.has(id)){ seen.add(id); owned.push(id); }
  }
  return { coins, owned };
}
export const count = (st, id) => st.owned.filter(x => x === id).length;
export const owns = (st, id) => count(st, id) > 0;

/* 진료비 for a finished run. avg: points per crack (the number the rank uses), complete: played through (or a 심야 진료
   night that ran its course), cleared: a 영업 일지 day cleared, hard: 역경. Typical full run ~ 90-110 coins. */
export function coinsFor({ avg, complete, cleared, hard }){
  const a = Number.isFinite(avg) && avg > 0 ? avg : 0;
  let n = Math.round(a * 0.9);
  if(!complete) n = Math.round(n * 0.5);
  if(cleared) n += 15;
  if(hard) n = Math.round(n * 1.3);
  return Math.max(0, Math.min(RUN_COIN_CAP, n));
}
/* the rewarded "진료비 2배": once per run, never on 역경 (no ad there), and only when a run paid something */
/* continueOffered: the card already offers the rewarded "이어하기" / "마지막 환자 다시" (core/monetize.js continueOffer).
   Two rewarded buttons on one card read as a double toll and the continue is worth more, so the 2x waits: once the
   continue is spent (or declined) and the run finishes again, the 2x shows on that card. */
export const doubleOffer = ({ earned, hard, used, continueOffered }) => !hard && !used && !continueOffered && earned > 0;

export const add = (st, n) => ({ coins: st.coins + Math.max(0, Math.floor(n)), owned: st.owned });

/* buy one item. Returns { st, ok, why } - why: "coins" | "have" | "full" | "none" */
export function buy(st, id){
  const it = itemById(id);
  if(!it) return { st, ok: false, why: "none" };
  if(it.kind === "prop" && owns(st, id)) return { st, ok: false, why: "have" };
  if(it.kind === "coupon" && count(st, id) >= COUPON_MAX) return { st, ok: false, why: "full" };
  if(st.coins < it.price) return { st, ok: false, why: "coins" };
  return { st: { coins: st.coins - it.price, owned: [...st.owned, id] }, ok: true, why: "" };
}
/* spend one copy of a coupon; same state back when there is none */
export function spend(st, id){
  const i = st.owned.indexOf(id);
  if(i < 0) return st;
  return { coins: st.coins, owned: st.owned.filter((_, k) => k !== i) };
}

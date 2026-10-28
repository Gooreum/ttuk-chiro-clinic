/* 진료비 경제·상점 (pure, unit-tested; ui/shop.js and scene/shopProps.js use it). A finished run pays 진료비 (coins);
   coins buy 진료실 꾸미기 props (seen in the neck modes' room) and a small convenience, the 통증 칸 +1권.
   Saved in localStorage "chiroShop": { coins, owned: [item id, ...] } (a consumable appears once per copy). */
export const SHOP_KEY = "chiroShop";
export const RUN_COIN_CAP = 160;     // one run never pays more than this (before the 2x ad)
export const ENDGAME_RATE = 0.135;   // 44차: 심야·러시는 꺾기 한 번(약 28초)당 평균 점수 x 0.135 (평균 100점이면 시간당 약 1,740)
export const ENDGAME_COIN_CAP = 500; // 심야·러시 한 판 상한 (보스 러시 완주 약 36번 꺾기)
export const REPLAY_MUL = 0.4;       // 별을 못 늘린 재플레이의 진료비 비율
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
  { id: "chair",   kind: "prop",   name: "안마의자",         line: "환자는 못 앉게 해요. 원장님 전용.",            price: 7000 },
  /* 엔드게임 소비처 (40차): 이미 놓은 소품을 한 단계 올리는 2단계 업그레이드(base 소품이 있어야 살 수 있다)와 레드카펫 */
  { id: "skull2",  kind: "upgrade", base: "skull",  name: "금니 해골",       line: "해골 모형이 금으로 도금했어요.",               price: 8000 },
  { id: "neon2",   kind: "upgrade", base: "neon",   name: "분홍 네온",       line: "간판이 분위기를 잡기 시작했어요.",             price: 10000 },
  { id: "trophy2", kind: "upgrade", base: "trophy", name: "다이아 트로피",   line: "아무도 안 줬는데 이제 반짝이기까지 해요.",     price: 12000 },
  { id: "chair2",  kind: "upgrade", base: "chair",  name: "황금 안마의자",   line: "앉으면 목이 아니라 지갑이 풀려요.",            price: 15000 },
  { id: "carpet",  kind: "prop",   name: "VIP 레드카펫",     line: "환자는 신발 벗고 밟으세요.",                   price: 20000 }
];
export const itemById = id => ITEMS.find(i => i.id === id) || null;
export const PROPS = ITEMS.filter(i => i.kind === "prop");
export const UPGRADES = ITEMS.filter(i => i.kind === "upgrade");
export const TOTAL_PROP_COST = PROPS.reduce((n, i) => n + i.price, 0);
export const TOTAL_UPGRADE_COST = UPGRADES.reduce((n, i) => n + i.price, 0);

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
export function coinsFor({ avg, complete, cleared, hard, replay, endless, cracks }){
  const a = Number.isFinite(avg) && avg > 0 ? avg : 0;
  if(endless){   // 44차: 판이 긴 엔드게임은 한 판 고정액이 아니라 꺾은 횟수에 비례 (시간당이 재플레이 감쇠 후 최고치의 약 1.2배)
    const c = Number.isFinite(cracks) && cracks > 0 ? Math.floor(cracks) : 0;
    return Math.max(0, Math.min(ENDGAME_COIN_CAP, Math.round(a * ENDGAME_RATE * c)));
  }
  let n = Math.round(a * 0.9);
  if(!complete) n = Math.round(n * 0.5);
  if(replay) n = Math.round(n * REPLAY_MUL);   // 43차: 이미 깬 날/의뢰를 별 늘림 없이 다시 돌면 40%, 클리어 보너스 없음 (쉬운 날 반복 파밍 방지)
  else if(cleared) n += 15;
  if(hard) n = Math.round(n * 1.3);
  return Math.max(0, Math.min(RUN_COIN_CAP, n));
}
/* replay: this run is on a day/quest already cleared before (prior = best stars saved before this run, 0 = never cleared)
   and did not beat it (stars = this run's stars, 0 when not cleared). A run that raises the stars pays in full. */
export const isReplay = (prior, stars) => (prior | 0) > 0 && (stars | 0) > 0 && (stars | 0) <= (prior | 0);   // a failed run (0 stars) is not a replay: it already pays half
/* the rewarded "진료비 2배": once per run, never on 역경 (no ad there), and only when a run paid something */
/* continueOffered: the card already offers the rewarded "이어하기" / "마지막 환자 다시" (core/monetize.js continueOffer).
   Two rewarded buttons on one card read as a double toll and the continue is worth more, so the 2x waits: once the
   continue is spent (or declined) and the run finishes again, the 2x shows on that card. */
export const doubleOffer = ({ earned, hard, used, continueOffered }) => !hard && !used && !continueOffered && earned > 0;

export const add = (st, n) => ({ coins: st.coins + Math.max(0, Math.floor(n)), owned: st.owned });

/* buy one item. Returns { st, ok, why } - why: "coins" | "have" | "full" | "base" | "none" */
export function buy(st, id){
  const it = itemById(id);
  if(!it) return { st, ok: false, why: "none" };
  if(it.kind === "upgrade" && !owns(st, it.base)) return { st, ok: false, why: "base" };
  if(it.kind !== "coupon" && owns(st, id)) return { st, ok: false, why: "have" };
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

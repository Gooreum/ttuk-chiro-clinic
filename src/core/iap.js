/* In-app products (pure, unit-tested). One catalog for Apps-in-Toss, Google Play and the App Store; platform/iap.js
   talks to the stores. Toss SKUs are issued by the console (iap_product_create), store IDs are `${STORE_PREFIX}.${key}`.
   adfree = non-consumable (store: non-consumable; Toss: NON_CONSUMABLE). coins_* = consumable 진료비 packs. */
export const STORE_PREFIX = "com.gooreum.ttukchiro";
export const PRODUCTS = {
  adfree:  { kind: "nonconsumable", coins: 0,     name: "광고 제거",      krw: 3300, toss: "ait.0000087748.795abd69.e8e137b6e7.3181915246" },
  coins_s: { kind: "consumable",    coins: 2500,  name: "진료비 주머니",  krw: 1100, toss: "ait.0000087748.f60b90f5.01b39a9846.3181920211" },
  coins_m: { kind: "consumable",    coins: 12000, name: "진료비 상자",    krw: 4400, toss: "ait.0000087748.066d104a.9de1fb31f8.3181921740" }
};
export const KEYS = Object.keys(PRODUCTS);
export const COIN_KEYS = KEYS.filter(k => PRODUCTS[k].kind === "consumable");
export const storeId = key => `${STORE_PREFIX}.${key}`;
export const keyFromStoreId = id => KEYS.find(k => storeId(k) === id) || null;
export const keyFromTossSku = sku => KEYS.find(k => PRODUCTS[k].toss === sku) || null;

export const LEDGER_MAX = 300;
/* order ledger: grants are applied once per order id, however often the store re-delivers it (restore, pending list, retries) */
export const readLedger = raw => Array.isArray(raw) ? raw.filter(x => typeof x === "string").slice(-LEDGER_MAX) : [];
export const seen = (ledger, orderId) => ledger.includes(orderId);
export const record = (ledger, orderId) => readLedger([...ledger, orderId]);

/* Completed / refunded orders -> owns the sku? null when the list says nothing about it (an empty or failed lookup
   must not revoke a purchase saved on this phone), false when every order for it was refunded. */
export function ownsSku(orders, sku){
  const mine = (orders || []).filter(o => o && o.sku === sku);
  if(!mine.length) return null;
  return mine.some(o => o.status === "COMPLETED");
}

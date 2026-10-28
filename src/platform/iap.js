/* In-app purchases for Apps-in-Toss (__TOSS__, IAP SDK) and the store apps (__APP__, @capgo/native-purchases: Google Play
   Billing / StoreKit 2). Every other build gets the no-op branches and no SDK chunk. Catalog + order ledger: core/iap.js.
   Granting is idempotent per order id (ledger), then the order is completed/consumed: an order the app never got to
   finish (closed mid-purchase) is granted and finished by recover() on the next boot. */
import { store } from "../lib/store.js";
import { SHOP_KEY, readShop, add } from "../core/shop.js";
import { PRODUCTS, COIN_KEYS, storeId, keyFromStoreId, keyFromTossSku, readLedger, seen, record, ownsSku } from "../core/iap.js";
import { sdk, supported } from "./sdk.js";
import { track } from "./analytics.js";
import { EV } from "../core/analytics.js";

export const isToss = __TOSS__, isApp = __APP__;
export const iapOn = isToss || isApp;
const AD_FREE = "chiroAdFree", LEDGER = "chiroIapOrders";

/* ---- entitlement state (shared by both stores) ---- */
export const adFree = () => store.get(AD_FREE, false);
const listeners = [];
export const onAdFreeChange = f => listeners.push(f);
const setAdFree = v => { if(!!v === adFree()) return; store.set(AD_FREE, !!v); listeners.forEach(f => f()); };

/* Grant `key` for `orderId` once. true = applied now, false = this order was already granted. */
export function grant(key, orderId){
  const p = PRODUCTS[key];
  if(!p || !orderId) return false;
  const ledger = readLedger(store.get(LEDGER, []));
  if(seen(ledger, orderId)) return false;
  store.set(LEDGER, record(ledger, orderId));
  if(p.kind === "nonconsumable") setAdFree(true);
  if(p.coins > 0){
    store.set(SHOP_KEY, add(readShop(store.get(SHOP_KEY, null)), p.coins));
    try{ dispatchEvent(new Event("chiro-shop")); }catch(e){}
  }
  track(EV.purchase, { step: "granted", item: key });
  return true;
}

const errCode = e => String(e && (e.code || e.errorCode || e.message) || e || "").slice(0, 60);

/* ---- native (Capacitor) ---- */
let nat = null;
async function native(){
  if(!__APP__) return null;
  if(!nat){
    const [{ Capacitor }, mod] = await Promise.all([import("@capacitor/core"), import("@capgo/native-purchases")]);
    nat = { P: mod.NativePurchases, TYPE: mod.PURCHASE_TYPE, platform: Capacitor.getPlatform() };
    try{ await nat.P.configure({ autoFinishTransactions: false }); }catch(e){}
    // iOS: purchases that finish outside purchaseProduct (Ask to Buy approval, interrupted sheet) arrive here
    try{ nat.P.addListener("transactionUpdated", tx => { settleNative(tx).catch(() => {}); }); }catch(e){}
  }
  return nat;
}
const orderIdOf = (n, tx) => n.platform === "android" ? (tx.orderId || tx.purchaseToken) : tx.transactionId;
/* grant, then finish (Android: consume coins / acknowledge the rest, iOS: finish the StoreKit transaction) */
async function settleNative(tx){
  const n = await native(), key = tx && keyFromStoreId(tx.productIdentifier);
  if(!n || !key) return false;
  if(n.platform === "android" && tx.purchaseState != null && String(tx.purchaseState) !== "1") return false;   // pending, not paid yet
  const id = orderIdOf(n, tx);
  if(!id) return false;
  grant(key, id);
  try{
    if(n.platform === "android"){
      if(!tx.purchaseToken) return true;
      if(PRODUCTS[key].kind === "consumable") await n.P.consumePurchase({ purchaseToken: tx.purchaseToken });
      else if(tx.isAcknowledged !== true) await n.P.acknowledgePurchase({ purchaseToken: tx.purchaseToken });
    }else await n.P.finishTransaction({ transactionId: tx.transactionId });
  }catch(e){ track(EV.purchase, { step: "finish_fail", item: key, code: errCode(e) }); }
  return true;
}

/* ---- Toss ---- */
async function tossCall(fn){ try{ const m = await sdk(); return m && m.IAP ? await fn(m.IAP) : null; }catch(e){ return null; } }

/* ---- public API ---- */
export const canBuy = key => !!PRODUCTS[key] && iapOn && !(PRODUCTS[key].kind === "nonconsumable" && adFree());
export const canBuyAdFree = () => canBuy("adfree");
export const canRestore = () => isApp;   // App Store requires a restore button; Toss restores itself on boot

/* localized price strings by key ({} when the store list is unavailable) */
export async function prices(){
  const out = {};
  if(isToss){
    await tossCall(async IAP => {
      if(!supported(IAP.getProductItemList)) return;
      const { products } = await IAP.getProductItemList();
      (products || []).forEach(x => { const k = keyFromTossSku(x.sku); if(k) out[k] = x.displayAmount; });
    });
  }else if(isApp){
    try{
      const n = await native();
      const { products } = await n.P.getProducts({ productIdentifiers: Object.keys(PRODUCTS).map(storeId), productType: n.TYPE.INAPP });
      (products || []).forEach(x => { const k = keyFromStoreId(x.identifier); if(k && x.priceString) out[k] = x.priceString; });
    }catch(e){}
  }
  return out;
}
export const adFreePrice = async () => (await prices()).adfree || "";

/* opens the store sheet; true once granted */
export async function buy(key){
  const p = PRODUCTS[key];
  if(!canBuy(key)) return !!p && p.kind === "nonconsumable" && adFree();
  track(EV.purchase, { step: "start", item: key });
  if(isApp){
    try{
      const n = await native();
      const tx = await n.P.purchaseProduct({ productIdentifier: storeId(key), productType: n.TYPE.INAPP, isConsumable: p.kind === "consumable", autoAcknowledgePurchases: false });
      const ok = await settleNative(tx);
      track(EV.purchase, { step: ok ? "success" : "fail", item: key });
      return ok;
    }catch(e){ track(EV.purchase, { step: "fail", item: key, code: errCode(e) }); return false; }
  }
  let m;
  try{ m = await sdk(); }catch(e){ return false; }
  if(!m.IAP || !supported(m.IAP.createOneTimePurchaseOrder)) return false;
  return new Promise(resolve => {
    let cleanup = () => {}, settled = false, got = false;
    const done = ok => { if(settled) return; settled = true; try{ cleanup(); }catch(e){} resolve(ok); };
    try{
      cleanup = m.IAP.createOneTimePurchaseOrder({
        options: {
          sku: p.toss,
          // approve at once: saving the grant locally is all there is to do (Toss shows a refund page if this is not true)
          processProductGrant: ({ orderId }) => { grant(key, orderId); got = true; return true; }
        },
        onEvent: e => { const ok = e.type === "success" && got; track(EV.purchase, { step: ok ? "success" : "fail", item: key, code: e.type }); done(ok); },
        onError: e => { track(EV.purchase, { step: "fail", item: key, code: errCode(e) }); done(false); }
      }) || (() => {});
    }catch(e){ done(false); }
  });
}
export const buyAdFree = () => buy("adfree");

/* Boot (and the restore button): finish what a closed app left open, and re-read what this store account owns. */
export async function recover(){
  if(isToss){
    await tossCall(async IAP => {
      try{
        if(supported(IAP.getPendingOrders)){
          const { orders } = await IAP.getPendingOrders();
          for(const o of orders || []){
            const key = keyFromTossSku(o.sku);
            if(!key) continue;
            grant(key, o.orderId);
            if(supported(IAP.completeProductGrant)) await IAP.completeProductGrant({ params: { orderId: o.orderId } });
          }
        }
      }catch(e){}
      try{
        if(supported(IAP.getCompletedOrRefundedOrders)){
          const owns = ownsSku(orders, PRODUCTS.adfree.toss);
          if(owns !== null && owns !== adFree()){ setAdFree(owns); track(EV.purchase, { step: owns ? "restore" : "revoke" }); }
        }
      }catch(e){}
    });
  }else if(isApp){
    try{
      const n = await native();
      const { transactions } = await n.P.getUnfinishedTransactions();
      for(const tx of transactions || []) await settleNative(tx);
    }catch(e){}
  }
}
/* the App Store restore button: true when the ad-free purchase of this store account is (now) on this phone */
export async function restorePurchases(){
  if(!isApp) return recover();
  try{
    const n = await native();
    try{ await n.P.restorePurchases(); }catch(e){}
    const { purchases } = await n.P.getPurchases({ productType: n.TYPE.INAPP });
    // only the non-consumable is re-granted from history: consumed coin packs must never come back
    for(const tx of purchases || []) if(keyFromStoreId(tx.productIdentifier) === "adfree") await settleNative(tx);
    await recover();
  }catch(e){ track(EV.purchase, { step: "restore_fail", code: errCode(e) }); }
  return adFree();
}
export { COIN_KEYS };

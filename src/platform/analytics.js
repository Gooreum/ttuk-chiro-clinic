/* Event logging to Toss Analytics (Toss build) and GA4 (web pages and the Toss webview) under the same names and
   params; the names and rules are in core/analytics.js, the table in docs/analytics.md. Errors, page hides and the
   first frame are logged here by themselves. The shot build (e2e) keeps every event in window.__events and sends
   nothing; localhost sends nothing either. No personal data goes in: no names, ids or free text from the player. */
import { EV, visitInfo, entrySource, cleanParams, reviewDue } from "../core/analytics.js";
import { store } from "../lib/store.js";
import { sdk, supported } from "./sdk.js";

export const GA_ID = "G-91N1SBGRDE";   // GA4 property "뚝 카이로 클리닉" (this game only)
const VISIT = "chiroVisit", REVIEWED = "chiroReviewAsked", FIRST_OK = "chiroFirstSuccess", INTERNAL = "chiroInternal";
const SESSION = "chiroSession";
const LOG_TYPE = { [EV.screen]: "screen", [EV.click]: "click", [EV.adNotice]: "popup", [EV.error]: "error", [EV.loadFail]: "error" };

const q = new URLSearchParams(location.search);
const local = location.protocol === "file:" || /^(localhost|127\.|0\.0\.0\.0|192\.168\.|10\.|\[::1\])/.test(location.hostname);
if(q.get("internal") === "1") store.set(INTERNAL, true);
if(q.get("internal") === "0") store.set(INTERNAL, false);
const common = { mode: "", build: __TOSS__ ? "toss" : "web" };
if(store.get(INTERNAL, false)) common.traffic_type = "internal";
if(q.get("debug") === "1") common.debug_mode = true;   // GA4 DebugView

let gtag = null;
function startGa(){
  if(__FORCE_HIT__ || local || !GA_ID) return;
  window.dataLayer = window.dataLayer || [];
  gtag = window.gtag = function(){ window.dataLayer.push(arguments); };
  gtag("js", new Date());
  gtag("config", GA_ID, { send_page_view: false });
  const s = document.createElement("script");
  s.async = true; s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(s);
}

export function track(name, params){
  const p = cleanParams({ ...common, ...params });
  if(__FORCE_HIT__) (window.__events ||= []).push({ name, ...p, t: Math.round(performance.now()) });
  if(gtag) try{ gtag("event", name, p); }catch(e){}
  if(__TOSS__) sdk().then(m => m.Analytics.log({ log_name: name, log_type: LOG_TYPE[name] || "event", params: p })).catch(() => {});
}

let screenName = "", screenAt = 0;
export function screenView(name, params){
  if(name === screenName) return;
  const now = performance.now();
  track(EV.screen, { screen_name: name, prev_screen: screenName || "entry", prev_ms: screenName ? now - screenAt : null, ...params });
  screenName = name; screenAt = now;
}
export const click = (target, params) => track(EV.click, { target, screen_name: screenName, ...params });

let ready = false, failed = false, onFail = null, errors = 0;
export const isReady = () => ready;
// the first frame is on screen
export function markReady(){
  if(ready) return;
  ready = true;
  const nav = performance.getEntriesByType ? performance.getEntriesByType("navigation")[0] : null;
  track(EV.loadReady, { load_ms: performance.now(), dom_ms: nav ? nav.domContentLoadedEventEnd : null, first_open: visit.params.first_open });
}
// the game could not start: logged once, then the 다시 시도 card
export function bootFail(reason, detail){
  if(failed) return;
  failed = true;
  track(EV.loadFail, { reason, detail: String(detail || "").slice(0, 100), after_ms: performance.now() });
  if(onFail) onFail(reason);
}
export const assetLoad = (asset, ok, t0, detail) => track(EV.assetLoad, { asset, ok, ms: performance.now() - t0, detail: ok ? null : String(detail || "") });

function onError(kind, message, source, line){
  if(errors++ >= 10) return;
  const file = String(source || "").split("/").pop().split("?")[0];
  track(EV.error, { kind, message: String(message || "").slice(0, 100), file, line, ready, screen_name: screenName });
  if(!ready) bootFail(kind, message);
}

/* The first visible page of a session is app_open (visits, entry source); a clinic switch reloads the page and
   logs page_switch instead. */
let visit = { params: { first_open: false } };
async function logOpen(mode){
  let prev = null;
  try{ prev = sessionStorage.getItem(SESSION); sessionStorage.setItem(SESSION, mode); }catch(e){}
  if(prev){ track(EV.pageSwitch, { from_mode: prev }); return; }
  let scheme = "";
  if(__TOSS__) try{
    const m = await sdk();
    scheme = m.getSchemeUri() || "";
    if(m.getOperationalEnvironment && m.getOperationalEnvironment() === "sandbox") common.traffic_type = "internal";
  }catch(e){}
  track(EV.appOpen, { ...visit.params, ...entrySource(location.search, document.referrer, scheme) });
}

// the game inside a page changed (index.html: 목꺾기 crack / 목뽑기 towel)
export const setMode = m => { common.mode = m; };

/* Delegated click logging: every button / link / chip on the page, named by id or data-track (UI labels only). */
function onClick(e){
  const b = e.target && e.target.closest && e.target.closest("button, a, [data-track]");
  if(!b) return;
  click(b.dataset.track || b.id || (b.textContent || "").trim().slice(0, 20));
}

export function initAnalytics({ mode, onBootFail }){
  common.mode = mode; onFail = onBootFail || null;
  visit = visitInfo(store.get(VISIT, null), Date.now());
  store.set(VISIT, visit.next);
  startGa();
  window.addEventListener("error", e => onError("error", e.message, e.filename, e.lineno));
  window.addEventListener("unhandledrejection", e => onError("rejection", e.reason && (e.reason.message || e.reason), "", null));
  const hide = reason => track(EV.hide, { reason, dwell_ms: performance.now(), screen_name: screenName, screen_ms: performance.now() - screenAt });
  document.addEventListener("visibilitychange", () => { if(document.visibilityState === "hidden") hide("hidden"); });
  window.addEventListener("popstate", () => hide("back"));
  document.addEventListener("click", onClick, true);
  logOpen(mode);
}

// the very first good crack / tug / press on this device
export function firstSuccess(params){
  if(store.get(FIRST_OK, false)) return;
  store.set(FIRST_OK, true);
  track(EV.firstSuccess, params);
}

/* After a run played through to the end: ask Toss for a review once per device. true when it was asked (the caller
   then skips the interstitial so the two never stack). Toss decides whether the prompt shows; the result is unknown. */
export async function askReview(complete){
  if(!__TOSS__ || !reviewDue({ asked: store.get(REVIEWED, false), complete })) return false;
  let m;
  try{ m = await sdk(); }catch(e){ return false; }
  if(!supported(m.Review && m.Review.request)){ track(EV.review, { supported: false }); return false; }
  store.set(REVIEWED, true);
  track(EV.review, { supported: true });
  try{ await m.Review.request(); }catch(e){ track(EV.review, { supported: true, error: String(e && e.message || e) }); }
  return true;
}

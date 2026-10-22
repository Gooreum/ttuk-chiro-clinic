/* Analytics rules (src/platform/analytics.js sends them to Toss Analytics and GA4 under the same names). Pure, unit-tested.
   Every event name the game sends is in EV; docs/analytics.md lists them with their parameters. No personal data:
   patients are fictional and identified by roster index only. */
export const EV = {
  appOpen: "app_open",            // first page of a session: visit counts and the entry source
  pageSwitch: "page_switch",      // a later page in the same session (the 클리닉 menu reloads the page)
  screen: "screen_view",          // title / play / result / tune / clinic_menu / chart
  loadReady: "load_ready",        // the first frame is on screen
  assetLoad: "asset_load",        // a glTF / scene load finished or failed
  loadFail: "load_fail",          // the game could not start (boot error, scene load failure)
  retry: "retry_click",           // the 다시 시도 button on a load failure
  error: "app_error",             // an uncaught error or rejection
  hide: "app_hide",               // the page went to the background (the dwell so far)
  runStart: "run_start",          // 시작 / 다시 / 이어하기
  patientStart: "patient_start",  // a new patient (or back zone) comes in
  aimStart: "aim_start",          // the prep ends, the player has the head
  attempt: "attempt",             // every crack / tug / press, good or bad
  patientDone: "patient_done",    // a patient (both sides) or a back zone is finished
  runEnd: "run_end",              // the result card opens
  runComplete: "run_complete",    // conversion: a run played through to the end (every patient, no bad end)
  nightStart: "night_start",      // 심야 진료: an endless night run began
  dexOpen: "dex_open",            // 환자 도감 opened (met, fails, from title / days)
  rushStart: "rush_start",        // 보스 러시: a run began
  rushEnd: "rush_end",            // 보스 러시: the run ended (bosses reached / cleared, score)
  nightEnd: "night_end",          // 심야 진료: the run ended (count of patients treated, score, tier reached)
  dayEnd: "day_end",              // 영업 일지: a campaign day ended (cleared or not, stars)
  questStart: "quest_start",      // 단골 의뢰: 의뢰 시작을 누름
  questEnd: "quest_end",          // 단골 의뢰: 의뢰 한 판이 끝남(클리어 여부, 별)
  firstSuccess: "first_success",  // conversion step: the very first good crack on this device
  click: "ui_click",              // buttons and chips: again, clinic, tune, music, chart, center
  adEvent: "ad_event",            // full-screen ads: request / loaded / show / impression / clicked / dismissed / reward / error
  adNotice: "ad_notice",          // the "광고가 나와요" notice before an interstitial
  painAd: "pain_ad",              // 영업 일지 story card: the rewarded "통증 칸 +1" (click / granted / fail)
  shopBuy: "shop_buy",            // 진료실 꾸미기: an item was bought (item, price, coins_left)
  coinEarn: "coin_earn",          // 진료비: a run paid out (step run) or the rewarded 2x paid the same again (step double)
  purchase: "iap_purchase",       // 광고 제거: start / success / fail / restore (not GA4's reserved ecommerce "purchase")
  review: "review_request"        // the Toss review prompt was asked for (whether it shows is up to Toss)
};

export const DAY_MS = 86400000;
const day = ms => { const d = new Date(ms); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

/* Visit bookkeeping kept on the device. prev: the stored record (or null on a first open). Returns the event params
   and the record to store. visit_days counts distinct calendar days with an open, days_since_first whole days. */
export function visitInfo(prev, now){
  const first = !prev || !prev.first;
  const p = first ? { first: now, last: 0, lastDay: "", days: 0, opens: 0 } : prev;
  const today = day(now), newDay = p.lastDay !== today;
  const next = { first: p.first, last: now, lastDay: today, days: p.days + (newDay ? 1 : 0), opens: p.opens + 1 };
  return {
    params: {
      first_open: first,
      first_open_date: day(p.first),
      visit_days: next.days,
      open_count: next.opens,
      days_since_first: Math.floor((now - p.first) / DAY_MS),
      days_since_last: first ? null : Math.floor((now - p.last) / DAY_MS),
      returning_day: !first && newDay
    },
    next
  };
}

const UTM = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
/* Where the open came from: UTM and Toss / deep-link params as they are, plus one source label.
   search: location.search, referrer: document.referrer, scheme: the Toss scheme URI ("" outside Toss). */
export function entrySource(search, referrer, scheme){
  const q = new URLSearchParams(search || "");
  let sq = null;
  try{ if(scheme) sq = new URL(scheme).searchParams; }catch(e){}
  const get = k => q.get(k) || (sq && sq.get(k)) || null;
  const out = {};
  UTM.forEach(k => { out[k] = get(k); });
  out.entry_ref = get("referrer") || get("ref") || get("from") || null;
  out.entry_mode = q.get("mode") || null;
  let host = null;
  try{ if(referrer) host = new URL(referrer).hostname; }catch(e){}
  out.referrer_host = host;
  out.entry_source = out.utm_source || out.entry_ref || (host ? host : scheme ? "toss" : "direct");
  return out;
}

/* Param values the way both backends accept them: no undefined / null, numbers rounded to 3 decimals, strings cut to
   100 chars (GA4's limit), booleans as they are. At most 25 keys (GA4's per-event limit). */
export function cleanParams(p){
  const out = {};
  for(const [k, v] of Object.entries(p || {})){
    if(v === undefined || v === null || Object.keys(out).length >= 25) continue;
    if(typeof v === "number") out[k] = Number.isFinite(v) ? Math.round(v * 1000) / 1000 : String(v);
    else if(typeof v === "boolean") out[k] = v;
    else out[k] = String(v).slice(0, 100);
  }
  return out;
}

/* The Toss review prompt: once per device, right after a run played through to the end (the guide: right after the
   core task). Toss decides whether it actually shows. */
export const reviewDue = ({ asked, complete }) => !asked && !!complete;

/* A run's outcome label for run_end. */
export const runOutcome = ({ ambulance, pain, complete }) => ambulance ? "ambulance" : complete ? "complete" : pain >= 3 ? "pain" : "quit";

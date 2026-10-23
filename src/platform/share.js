/* 자랑하기 (share) and the Toss game-center leaderboard. Toss build: Share.createLink + Share.sendMessage, Game.setLeaderboardScore,
   Game.openLeaderboard (SDK chunk via platform/sdk.js, never in a plain build). Plain / store-app builds: navigator.share, else
   clipboard copy + a toast. Text rules: core/share.js. */
import { t } from "../i18n/index.js";
import { sdk, supported } from "./sdk.js";
import { track } from "./analytics.js";
import { EV } from "../core/analytics.js";
import { TOSS_PATH, SHARE_URL, withLink } from "../core/share.js";

const TOSS = __TOSS__;
export const leaderboardOn = TOSS;
const errCode = e => String(e && (e.code || e.errorCode || e.message) || e || "").slice(0, 60);

/* where: night / rush / day. notify(msg, ms) shows a toast. Resolves to how it went: toss / native / copied / fail */
export async function shareResult(text, where, notify = () => {}){
  if(TOSS){
    try{
      const m = await sdk();
      let link = SHARE_URL;
      try{ if(m.Share && m.Share.createLink) link = await m.Share.createLink({ path: TOSS_PATH }); }catch(e){}   // no link: the web page link
      const send = m.Share && m.Share.sendMessage ? m.Share.sendMessage : m.share;
      if(send){ await send({ message: withLink(text, link) }); track(EV.share, { where, how: "toss" }); return "toss"; }
    }catch(e){ track(EV.share, { where, how: "fail", code: errCode(e) }); return "fail"; }
  }
  const full = withLink(text);
  try{
    if(typeof navigator !== "undefined" && navigator.share){ await navigator.share({ text: full }); track(EV.share, { where, how: "native" }); return "native"; }
  }catch(e){ if(e && e.name === "AbortError") return "fail"; }   // the player closed the sheet
  try{
    await navigator.clipboard.writeText(full);
    notify(t("복사했어요. 붙여넣어 자랑하세요"), 1600);
    track(EV.share, { where, how: "copied" }); return "copied";
  }catch(e){
    notify(t("공유를 못 했어요"), 1400);
    track(EV.share, { where, how: "fail", code: errCode(e) }); return "fail";
  }
}

// score: a float string (core/share.js leaderboardScore). Called once the run is over (a game profile must exist first).
export async function submitScore(score, where){
  if(!TOSS || !score) return false;
  try{
    const m = await sdk();
    if(!m.Game || !supported(m.Game.setLeaderboardScore)) return false;
    const r = await m.Game.setLeaderboardScore({ score });
    const ok = !!r && r.statusCode === "SUCCESS";
    track(EV.leaderboard, { where, step: ok ? "submit" : "submit_fail", code: r ? r.statusCode : "none" });
    return ok;
  }catch(e){ track(EV.leaderboard, { where, step: "submit_fail", code: errCode(e) }); return false; }
}
export async function openRanking(where){
  if(!TOSS) return false;
  try{
    const m = await sdk();
    if(!m.Game || !supported(m.Game.openLeaderboard)) return false;
    track(EV.leaderboard, { where, step: "open" });
    await m.Game.openLeaderboard();
    return true;
  }catch(e){ track(EV.leaderboard, { where, step: "open_fail", code: errCode(e) }); return false; }
}

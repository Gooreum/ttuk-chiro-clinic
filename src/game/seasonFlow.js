/* 계절 손님 wiring (core/season.js, ui/season.js): chip -> season card -> story card (the 영업 일지 #story, like 단골 의뢰) ->
   의뢰 시작 (the tap that runs start(), so the iOS permission calls stay in the user gesture, AGENTS.md 3-5) -> result card
   -> `end`. A season run is a free-play run (S.day = -1, S.season = index into SEASON_EPS), so day stars, boss ads and the
   free-play best never move. The 진료비 bonus for a finished season is added to the shop save like game/weekly.js does. */
import { t } from "../i18n/index.js";
import { $ } from "../lib/dom.js";
import { store } from "../lib/store.js";
import { S } from "./state.js";
import { CAMPAIGN_KEY, readProgress } from "../core/campaign.js";
import { SHOP_KEY, readShop, add } from "../core/shop.js";
import { SEASON_KEY, SEASON_BONUS, SEASON_EPS, SEASON_NAME, seasonOpen, seasonOf, parseSeason, readSeasonRec, epClears, epStarsOf, afterEp, bonusDue, payBonus, seasonCleared } from "../core/season.js";
import { renderSeasons, showSeasonStory, seasonSub } from "../ui/season.js";
import { track } from "../platform/analytics.js";
import { EV } from "../core/analytics.js";

/* the season now; a test / case build can force one with ?season=winter (or window.__forceSeason) */
const testBuild = (typeof __FORCE_HIT__ !== "undefined" && __FORCE_HIT__) || (typeof __CASES__ !== "undefined" && __CASES__);
export function currentSeason(){
  if(testBuild){
    const f = parseSeason(window.__forceSeason) || parseSeason(new URLSearchParams(location.search).get("season"));
    if(f) return f;
  }
  return seasonOf();
}
const rec = () => readSeasonRec(store.get(SEASON_KEY, null));
const prog = () => readProgress(store.get(CAMPAIGN_KEY, null));

/* the chip on the title and the one on the 영업 일지 list: hidden until 1장 is done */
export function renderSeasonBtn(p){
  const open = seasonOpen(p), season = currentSeason(), r = rec();
  for(const [btn, sub] of [["#seasonBtn", "#seasonSub"], ["#daysSeason", "#daysSeasonSub"]]){
    const b = $(btn), s = $(sub);
    if(b){ b.disabled = !open; b.hidden = !open; }
    if(s) s.textContent = seasonSub(season, r);
  }
}

export function mountSeason({ start, back, resetQuest }){
  const sf = {
    sel: -1,
    fromDays: false,
    reset(){ sf.sel = -1; },
    sync(season){ if(season >= 0) $("#toDays").textContent = t("계절 목록"); },
    list(){
      resetQuest(); sf.reset();
      $("#days").hidden = true; $("#story").hidden = true;
      $("#storyBack").textContent = t("일지로");
      renderSeasons(currentSeason(), rec(), prog(), i => sf.story(i));
    },
    story(i){ resetQuest(); sf.sel = i; $("#seasons").hidden = true; showSeasonStory(SEASON_EPS[i]); },
    go(){
      const e = SEASON_EPS[sf.sel], no = sf.sel;
      track(EV.seasonStart, { season: e.season, ep: e.no, ep_id: e.id, rule: e.rule, game: e.game });
      $("#seasons").hidden = true;
      start(e.game, -1, false, 0, -1, no);
    },
    /* the result card of a season run (flow.js finish -> dayEnd) */
    end(complete, avg){
      const e = SEASON_EPS[S.season], cleared = epClears(e, complete, avg), stars = cleared ? epStarsOf(e, avg) : 0;
      let r = afterEp(rec(), e, cleared, stars), bonus = 0;
      if(cleared && bonusDue(r, e.season)){
        bonus = SEASON_BONUS; r = payBonus(r, e.season);
        store.set(SHOP_KEY, add(readShop(store.get(SHOP_KEY, null)), bonus));
        try{ dispatchEvent(new Event("chiro-shop")); }catch(err){}
        track(EV.coinEarn, { game: "season", day: 0, hard: 0, coins: bonus, step: "season", total: readShop(store.get(SHOP_KEY, null)).coins });
      }
      store.set(SEASON_KEY, r);
      $("#rdate").textContent = t("계절 손님 · {s} {n}편 {title}",{s:t(SEASON_NAME[e.season]),n:e.no,title:t(e.title)});
      const out = $("#dayOutro");
      const base = cleared ? t(e.outro) : complete ? t("평균 {a}점. {b}점을 못 넘었어요. 손 풀고 다시 와요.",{a:Math.round(avg),b:e.beat}) : t("손님을 못 버텼어요. 다시 문 열어 봐요.");
      out.textContent = bonus ? `${base} ` + t("{s} 손님을 다 맞았어요. 진료비 +{c}",{s:t(SEASON_NAME[e.season]),c:bonus}) : base;
      out.hidden = false;
      $("#nextDay").hidden = true;
      $("#toDays").hidden = false;
      $("#again").textContent = t(cleared ? "이 손님 다시" : "다시 도전");
      renderSeasonBtn(prog());
      track(EV.seasonEnd, { season: e.season, ep: e.no, ep_id: e.id, rule: e.rule, game: e.game, cleared, stars, score: S.score, bonus: bonus > 0, done: seasonCleared(r, e.season), run_ms: Math.round(performance.now() - S.runAt) });
    }
  };
  for(const b of ["#seasonBtn", "#daysSeason"]) $(b).addEventListener("click", () => { if(seasonOpen(prog())){ sf.fromDays = b === "#daysSeason"; sf.list(); } });
  /* opened from the title: close back to it; from the diary: back to the diary */
  $("#seasonClose").addEventListener("click", () => { $("#seasons").hidden = true; if(sf.fromDays) back(); else if(S.phase === "result") $("#result").hidden = false; });
  renderSeasonBtn(prog());
  return sf;
}

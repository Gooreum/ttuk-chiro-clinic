/* 계절 손님 screens (core/season.js): the season card (#seasons) and the story card shown before an episode. The story card
   is the 영업 일지 one (#story), so game/seasonFlow.js only routes its buttons. Only the current season is listed in full;
   the other seasons are "???" and a count. */
import { $ } from "../lib/dom.js";
import { t } from "../i18n/index.js";
import "./season.css";
import { SEASON_EPS, SEASON_IDS, SEASON_NAME, RULE_NAME, episodesOf, epOpen, epStars, seasonCleared } from "../core/season.js";

const GAME_NAME = { clinic: "목꺾기", towel: "목뽑기" };

/* the chip's second line: "봄 · 0/4" */
export const seasonSub = (season, rec) => `${t(SEASON_NAME[season])} · ${seasonCleared(rec, season)}/${episodesOf(season).length}`;

export function renderSeasons(season, rec, prog, onPick){
  const list = $("#seasonList"); list.textContent = "";
  const eps = episodesOf(season), n = seasonCleared(rec, season);
  $("#seasonLead").textContent = t("{s} 손님 {n}/{m}{done}",{s:t(SEASON_NAME[season]),n,m:eps.length,done:n === eps.length ? t(" · 다 맞았어요") : ""});
  eps.forEach(e => {
    const i = SEASON_EPS.indexOf(e), open = epOpen(rec, e), s = epStars(rec, e);
    const li = document.createElement("li"), b = document.createElement("button");
    b.type = "button"; b.dataset.s = e.id; b.disabled = !open;
    const who = document.createElement("b"); who.textContent = t("{n}편",{n:e.no});
    const tx = document.createElement("span"); tx.textContent = open ? `${t(e.title)} · ${t(GAME_NAME[e.game])} · ${t(RULE_NAME[e.rule])}` : t("앞 편을 깨면 와요");
    const st = document.createElement("i"); st.textContent = s ? "★".repeat(s) + "☆".repeat(3 - s) : "";
    b.append(who, tx, st);
    if(open && !s) b.classList.add("new");
    b.onclick = () => onPick(i);
    li.appendChild(b); list.appendChild(li);
  });
  // the other seasons: no titles, only how many
  const others = SEASON_IDS.filter(id => id !== season);
  $("#seasonLocked").textContent = others.map(id => t("{s} ??? {n}개",{s:t(SEASON_NAME[id]),n:episodesOf(id).length})).join(" · ") + " · " + t("그 계절에만 와요");
  $("#seasons").hidden = false;
}

export function showSeasonStory(e){
  $("#storyNo").textContent = t("계절 손님 · {s} {n}편",{s:t(SEASON_NAME[e.season]),n:e.no});
  $("#storyNo").dataset.kind = "quest";
  $("#story .card").classList.remove("hard-on");
  $("#storyGo").textContent = t("손님 맞기");
  $("#storyHard").hidden = true;
  $("#storyPain").hidden = true;
  $("#storyBack").textContent = t("계절 목록으로");
  $("#storyTitle").textContent = t(e.title);
  const ul = $("#storyLines"); ul.textContent = "";
  e.intro.forEach(line => { const li = document.createElement("li"); li.textContent = t(line); ul.appendChild(li); });
  const rules = $("#storyRules"); rules.textContent = "";
  const chip = (text, warn) => { const i = document.createElement("i"); i.textContent = t(text); if(warn) i.className = "warn"; rules.appendChild(i); };
  chip(GAME_NAME[e.game]);
  chip(t("환자 {n}명",{n:e.patients.length}), e.rule === "many");
  chip(t("통증 {n}번이면 끝",{n:e.painMax}), e.painMax < 3);
  chip("초록 구역 안내 없음", true);
  if(e.mods && e.mods.tight) chip("구역이 좁아요", true);
  if(e.mods && e.mods.noisy) chip("숨 안내 없음", true);
  if(e.beat) chip(t("평균 {n}점 넘기기",{n:e.beat}), true);
  $("#story").hidden = false;
}

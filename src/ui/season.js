/* 계절 손님 screens (core/season.js): the season card (#seasons) and the story card shown before an episode. The story card
   is the 영업 일지 one (#story), so game/seasonFlow.js only routes its buttons. Only the current season is listed in full;
   the other seasons are "???" and a count. */
import { $ } from "../lib/dom.js";
import "./season.css";
import { SEASON_EPS, SEASON_IDS, SEASON_NAME, RULE_NAME, episodesOf, epOpen, epStars, seasonCleared } from "../core/season.js";

const GAME_NAME = { clinic: "목꺾기", towel: "목뽑기" };

/* the chip's second line: "봄 · 0/4" */
export const seasonSub = (season, rec) => `${SEASON_NAME[season]} · ${seasonCleared(rec, season)}/${episodesOf(season).length}`;

export function renderSeasons(season, rec, prog, onPick){
  const list = $("#seasonList"); list.textContent = "";
  const eps = episodesOf(season), n = seasonCleared(rec, season);
  $("#seasonLead").textContent = `${SEASON_NAME[season]} 손님 ${n}/${eps.length}${n === eps.length ? " · 다 맞았어요" : ""}`;
  eps.forEach(e => {
    const i = SEASON_EPS.indexOf(e), open = epOpen(rec, e), s = epStars(rec, e);
    const li = document.createElement("li"), b = document.createElement("button");
    b.type = "button"; b.dataset.s = e.id; b.disabled = !open;
    const who = document.createElement("b"); who.textContent = `${e.no}편`;
    const t = document.createElement("span"); t.textContent = open ? `${e.title} · ${GAME_NAME[e.game]} · ${RULE_NAME[e.rule]}` : "앞 편을 깨면 와요";
    const st = document.createElement("i"); st.textContent = s ? "★".repeat(s) + "☆".repeat(3 - s) : "";
    b.append(who, t, st);
    if(open && !s) b.classList.add("new");
    b.onclick = () => onPick(i);
    li.appendChild(b); list.appendChild(li);
  });
  // the other seasons: no titles, only how many
  const others = SEASON_IDS.filter(id => id !== season);
  $("#seasonLocked").textContent = others.map(id => `${SEASON_NAME[id]} ??? ${episodesOf(id).length}개`).join(" · ") + " · 그 계절에만 와요";
  $("#seasons").hidden = false;
}

export function showSeasonStory(e){
  $("#storyNo").textContent = `계절 손님 · ${SEASON_NAME[e.season]} ${e.no}편`;
  $("#story .card").classList.remove("hard-on");
  $("#storyGo").textContent = "손님 맞기";
  $("#storyHard").hidden = true;
  $("#storyPain").hidden = true;
  $("#storyBack").textContent = "계절 목록으로";
  $("#storyTitle").textContent = e.title;
  const ul = $("#storyLines"); ul.textContent = "";
  e.intro.forEach(line => { const li = document.createElement("li"); li.textContent = line; ul.appendChild(li); });
  const rules = $("#storyRules"); rules.textContent = "";
  const chip = (text, warn) => { const i = document.createElement("i"); i.textContent = text; if(warn) i.className = "warn"; rules.appendChild(i); };
  chip(GAME_NAME[e.game]);
  chip(`환자 ${e.patients.length}명`, e.rule === "many");
  chip(`통증 ${e.painMax}번이면 영업 끝`, e.painMax < 3);
  chip("구역 안내 없음", true);
  if(e.mods && e.mods.tight) chip("구역이 좁아요", true);
  if(e.mods && e.mods.noisy) chip("숨 안내 없음", true);
  if(e.beat) chip(`평균 ${e.beat}점 넘기기`, true);
  $("#story").hidden = false;
}

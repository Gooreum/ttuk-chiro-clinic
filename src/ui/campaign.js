/* 영업 일지 screens (core/campaign.js): the day list and the story card shown before a day. game/flow.js wires them
   to start(); the story card's 영업 시작 is the tap that starts the run, so the iOS permission calls in start() stay
   inside a user gesture (AGENTS.md 3-5). */
import { $ } from "../lib/dom.js";
import { DAYS, dayOpen } from "../core/campaign.js";

const GAME_NAME = {clinic: "목꺾기", towel: "목뽑기"};

export function campaignLabel(prog){
  return prog.cleared >= DAYS.length ? "개업 첫 주 · 다 버텼어요" : `개업 첫 주 · ${prog.cleared + 1}일차`;
}

export function renderDays(prog, onPick){
  const list = $("#dayList"); list.textContent = "";
  DAYS.forEach((d, i) => {
    const li = document.createElement("li"), b = document.createElement("button");
    b.type = "button"; b.dataset.day = String(i);
    const no = document.createElement("b"); no.textContent = `${i + 1}일차`;
    const t = document.createElement("span"); t.textContent = dayOpen(prog, i) ? `${d.title} · ${GAME_NAME[d.game]}` : "잠김";
    const st = document.createElement("i");
    st.textContent = prog.stars[i] ? "★".repeat(prog.stars[i]) + "☆".repeat(3 - prog.stars[i]) : "";
    b.append(no, t, st);
    b.disabled = !dayOpen(prog, i);
    if(i === prog.cleared) b.classList.add("next");
    b.onclick = () => onPick(i);
    li.appendChild(b); list.appendChild(li);
  });
  $("#days").hidden = false;
}

export function showStory(day){
  const d = DAYS[day];
  $("#storyNo").textContent = `${day + 1}일차`;
  $("#storyTitle").textContent = d.title;
  const ul = $("#storyLines"); ul.textContent = "";
  d.intro.forEach(line => { const li = document.createElement("li"); li.textContent = line; ul.appendChild(li); });
  const rules = $("#storyRules"); rules.textContent = "";
  const chip = (text, warn) => { const i = document.createElement("i"); i.textContent = text; if(warn) i.className = "warn"; rules.appendChild(i); };
  chip(GAME_NAME[d.game]);
  chip(`환자 ${d.patients.length}명`);
  chip(`통증 ${d.painMax}번이면 영업 끝`, d.painMax < 3);
  chip(d.zone ? `초록 구역 안내 ${d.zone}명` : "구역 안내 없음", !d.zone);
  $("#story").hidden = false;
}

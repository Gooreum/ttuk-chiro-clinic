/* 단골 의뢰 screens (core/quests.js): the board list (#quests) and the story card shown before a quest. The card is the
   영업 일지 one (#story), so game/questFlow.js only has to route its buttons. */
import { $ } from "../lib/dom.js";
import "./quests.css";
import { QUESTS, RULE_NAME, questOpen, questStars, questOrder, questUnlockDay } from "../core/quests.js";
import { DAYS } from "../core/campaign.js";

const GAME_NAME = {clinic: "목꺾기", towel: "목뽑기"};

export function renderQuests(prog, onPick){
  const list = $("#questList"); list.textContent = "";
  const order = questOrder(), open = order.filter(i => questOpen(prog, QUESTS[i]));
  const stars = open.reduce((n, i) => n + questStars(prog, QUESTS[i]), 0);
  $("#questLead").textContent = open.length
    ? `열린 의뢰 ${open.length}/${QUESTS.length} · 별 ${stars}/${QUESTS.length * 3}`
    : "영업 일지 1일차를 깨면 첫 의뢰가 올라와요";
  let lastCh = 0;
  open.forEach(i => {
    const q = QUESTS[i], ch = DAYS[questUnlockDay(q)].ch;
    if(ch !== lastCh){   // grouped by the chapter the regular first shows up in
      lastCh = ch;
      const h = document.createElement("li"); h.className = "chHead"; h.textContent = `${ch}장 단골`; list.appendChild(h);
    }
    const li = document.createElement("li"), b = document.createElement("button");
    b.type = "button"; b.dataset.q = q.id;
    const who = document.createElement("b"); who.textContent = q.who;
    const t = document.createElement("span"); t.textContent = `${q.ep}편${q.ep >= 3 ? " 완결" : ""} ${q.title} · ${GAME_NAME[q.game]} · ${RULE_NAME[q.rule]}`;
    const st = document.createElement("i"), s = questStars(prog, q);
    st.textContent = s ? "★".repeat(s) + "☆".repeat(3 - s) : "";
    b.append(who, t, st);
    if(!s) b.classList.add("new");
    b.onclick = () => onPick(i);
    li.appendChild(b); list.appendChild(li);
  });
  const left = QUESTS.length - open.length;
  // why the rest is shut: the regular has not shown up yet (the day is not cleared) or the first episode is not cleared
  const waitEp1 = QUESTS.filter(q => !questOpen(prog, q) && prog.cleared > questUnlockDay(q)).length;
  const why = waitEp1 === left ? "앞 편을 깨면 올라와요" : waitEp1 ? "앞 편을 깨거나 단골이 영업 일지에 나오면 올라와요" : "단골이 영업 일지에 나오면 올라와요";
  $("#questLocked").textContent = left ? `잠긴 의뢰 ${left}개 · ${why}` : "";
  $("#questLocked").hidden = !left;
  $("#quests").hidden = false;
}

export function showQuestStory(q){
  $("#storyNo").textContent = `단골 의뢰 · ${q.who} ${q.ep}편${q.ep >= 3 ? " · 완결" : ""}`;
  $("#story .card").classList.remove("hard-on");
  $("#storyGo").textContent = "의뢰 시작";
  $("#storyHard").hidden = true;
  $("#storyPain").hidden = true;
  $("#storyBack").textContent = "의뢰 목록으로";
  $("#storyTitle").textContent = q.title;
  const ul = $("#storyLines"); ul.textContent = "";
  q.intro.forEach(line => { const li = document.createElement("li"); li.textContent = line; ul.appendChild(li); });
  const rules = $("#storyRules"); rules.textContent = "";
  const chip = (text, warn) => { const i = document.createElement("i"); i.textContent = text; if(warn) i.className = "warn"; rules.appendChild(i); };
  chip(GAME_NAME[q.game]);
  chip(`환자 ${q.patients.length}명`, q.rule === "many");
  chip(`통증 ${q.painMax}번이면 영업 끝`, q.painMax < 3);
  chip("구역 안내 없음", true);
  if(q.mods && q.mods.tight) chip("구역이 좁아요", true);
  if(q.mods && q.mods.noisy) chip("숨 안내 없음", true);
  if(q.beat) chip(`의뢰 · 평균 ${q.beat}점 넘기기`, true);
  $("#story").hidden = false;
}

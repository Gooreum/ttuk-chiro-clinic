/* 영업 일지 screens (core/campaign.js): the day list and the story card shown before a day. game/flow.js wires them
   to start(); the story card's 영업 시작 is the tap that starts the run, so the iOS permission calls in start() stay
   inside a user gesture (AGENTS.md 3-5). */
import { $ } from "../lib/dom.js";
import { DAYS, CHAPTERS, dayOpen, dayLabel, dayInChapter, dayDef } from "../core/campaign.js";

const GAME_NAME = {clinic: "목꺾기", towel: "목뽑기", back: "허리펴기", side: "허리비틀기"};

const chapterTitle = no => CHAPTERS.find(c => c.no === no).title;
export function campaignLabel(prog){
  if(prog.cleared >= DAYS.length) return `${chapterTitle(DAYS[DAYS.length - 1].ch)} · 다 버텼어요`;
  return `${chapterTitle(DAYS[prog.cleared].ch)} · ${dayLabel(prog.cleared)}`;
}

/* chapter tabs (#chTabs) over the day list; a chapter opens when its first day does. Starts on the chapter of the
   next day to play. */
let shownCh = 0;
export function renderDays(prog, onPick, ch = 0){
  const nextCh = DAYS[Math.min(prog.cleared, DAYS.length - 1)].ch;
  shownCh = ch || nextCh;
  const tabs = $("#chTabs"); tabs.textContent = "";
  CHAPTERS.forEach(c => {
    const first = DAYS.findIndex(d => d.ch === c.no), t = document.createElement("button");
    t.type = "button"; t.dataset.ch = String(c.no);
    t.disabled = !dayOpen(prog, first);
    t.textContent = t.disabled ? `${c.no}장` : `${c.no}장 ${c.title}`;   // a locked chapter keeps its title a surprise
    if(c.no === shownCh) t.classList.add("on");
    t.onclick = () => renderDays(prog, onPick, c.no);
    tabs.appendChild(t);
  });
  // eight chapters: one scrolling row, the open one in view
  const on = tabs.querySelector(".on");
  if(on) tabs.scrollLeft = Math.max(0, on.offsetLeft - tabs.offsetLeft - 24);
  $("#chLead").textContent = CHAPTERS.find(c => c.no === shownCh).lead;
  const list = $("#dayList"); list.textContent = "";
  DAYS.forEach((d, i) => {
    if(d.ch !== shownCh) return;
    const li = document.createElement("li"), b = document.createElement("button");
    b.type = "button"; b.dataset.day = String(i);
    const no = document.createElement("b"); no.textContent = `${dayInChapter(i) + 1}일차`;
    const t = document.createElement("span"); t.textContent = dayOpen(prog, i) ? `${d.title} · ${GAME_NAME[d.game]}` : "잠김";
    const st = document.createElement("i");
    st.textContent = prog.stars[i] ? "★".repeat(prog.stars[i]) + "☆".repeat(3 - prog.stars[i]) : "";
    // a day beaten on 역경 shows those stars instead (three plain stars are what opened it)
    const hs = prog.hard && prog.hard[i];
    if(hs){ st.textContent = "역경 " + "★".repeat(hs) + "☆".repeat(3 - hs); st.className = "hard"; }
    b.append(no, t, st);
    b.disabled = !dayOpen(prog, i);
    if(i === prog.cleared) b.classList.add("next");
    if(d.beat) b.classList.add("boss");
    b.onclick = () => onPick(i);
    li.appendChild(b); list.appendChild(li);
  });
  $("#days").hidden = false;
}

/* hard: the 역경 rules (core/campaign.js hardDay); canHard: the day has three stars, so the 역경 button shows */
export function showStory(day, hard = false, canHard = false){
  const d = dayDef(day, hard);
  $("#storyNo").textContent = hard ? `${dayLabel(day)} · 역경` : dayLabel(day);
  $("#story .card").classList.toggle("hard-on", hard);
  $("#storyGo").textContent = hard ? "역경 시작" : "영업 시작";
  $("#storyHard").hidden = !canHard;
  $("#storyHard").textContent = hard ? "보통으로 돌아가기" : "역경 모드 · 더 빡세게";
  $("#storyTitle").textContent = d.title;
  const ul = $("#storyLines"); ul.textContent = "";
  const lines = hard ? [...d.intro, "역경: 같은 날을 한 번 더. 이번엔 원장님 손이 아무 도움도 못 받아요."] : d.intro;
  lines.forEach(line => { const li = document.createElement("li"); li.textContent = line; ul.appendChild(li); });
  const rules = $("#storyRules"); rules.textContent = "";
  const chip = (text, warn) => { const i = document.createElement("i"); i.textContent = text; if(warn) i.className = "warn"; rules.appendChild(i); };
  chip(GAME_NAME[d.game]);
  chip(d.game === "back" ? `${d.patients[0]} · 세 구역` : d.game === "side" ? `${d.patients[0]} · 좌우 한 번씩` : `환자 ${d.patients.length}명`);
  chip(`통증 ${d.painMax}번이면 영업 끝`, d.painMax < 3);
  if(d.game !== "back" && d.game !== "side") chip(d.zone ? `초록 구역 안내 ${d.zone}명` : "구역 안내 없음", !d.zone);
  if(d.mods && d.mods.tight) chip("구역이 좁아요", true);
  if(d.mods && d.mods.noisy) chip("숨 안내 없음", true);
  if(d.beat) chip(hard ? `역경 · 평균 ${d.beat}점 넘기기` : `보스 · 평균 ${d.beat}점 넘기기`, true);
  $("#story").hidden = false;
}

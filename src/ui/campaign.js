/* 영업 일지 screens (core/campaign.js): the day list and the story card shown before a day. game/flow.js wires them
   to start(); the story card's 영업 시작 is the tap that starts the run, so the iOS permission calls in start() stay
   inside a user gesture (AGENTS.md 3-5). */
import { $ } from "../lib/dom.js";
import { t } from "../i18n/index.js";
import { DAYS, CHAPTERS, ENDING, dayOpen, dayLabel, dayInChapter, dayDef, hardOpen, HARD_GAMES } from "../core/campaign.js";
import { interludeOpen } from "../core/interlude.js";
import { bossRules, bossChips } from "../core/boss.js";

const GAME_NAME = {clinic: "목꺾기", towel: "목뽑기", back: "허리펴기", side: "허리비틀기"};

const chapterTitle = no => CHAPTERS.find(c => c.no === no).title;
export function campaignLabel(prog){
  if(prog.cleared >= DAYS.length) return t("{title} · 다 버텼어요",{title:t(chapterTitle(DAYS[DAYS.length - 1].ch))});
  return `${t(chapterTitle(DAYS[prog.cleared].ch))} · ${dayLabel(prog.cleared)}`;
}

/* chapter tabs (#chTabs) over the day list; a chapter opens when its first day does. Starts on the chapter of the
   next day to play. */
let shownCh = 0;
export function renderDays(prog, onPick, ch = 0, onInterlude = null){
  const nextCh = DAYS[Math.min(prog.cleared, DAYS.length - 1)].ch;
  shownCh = ch || nextCh;
  const tabs = $("#chTabs"); tabs.textContent = "";
  CHAPTERS.forEach(c => {
    const first = DAYS.findIndex(d => d.ch === c.no), tab = document.createElement("button");
    tab.type = "button"; tab.dataset.ch = String(c.no);
    tab.disabled = !dayOpen(prog, first);
    // every 목꺾기·목뽑기 day of the chapter beaten on 역경 with three stars: a small star on the tab
    const hardDays = DAYS.map((d, i) => i).filter(i => DAYS[i].ch === c.no && HARD_GAMES.includes(DAYS[i].game));
    const allHard = !tab.disabled && hardDays.length > 0 && hardDays.every(i => prog.hard && prog.hard[i] >= 3);
    tab.textContent = tab.disabled ? t("{n}장",{n:c.no}) : t("{n}장 {title}{star}",{n:c.no,title:t(c.title),star:allHard ? " ★" : ""});   // a locked chapter keeps its title a surprise
    if(allHard) tab.classList.add("hard-all");
    if(c.no === shownCh) tab.classList.add("on");
    tab.onclick = () => renderDays(prog, onPick, c.no, onInterlude);
    tabs.appendChild(tab);
  });
  // eight chapters: one scrolling row, the open one in view
  const on = tabs.querySelector(".on");
  if(on) tabs.scrollLeft = Math.max(0, on.offsetLeft - tabs.offsetLeft - 24);
  const ib = $("#chInterlude");   // 장 막간 chip: replay the card that opened this chapter
  ib.hidden = !(onInterlude && interludeOpen(prog, shownCh));
  ib.dataset.ch = String(shownCh);
  ib.onclick = () => onInterlude && onInterlude(shownCh);
  $("#chLead").textContent = t(CHAPTERS.find(c => c.no === shownCh).lead);
  const list = $("#dayList"); list.textContent = "";
  DAYS.forEach((d, i) => {
    if(d.ch !== shownCh) return;
    const li = document.createElement("li"), b = document.createElement("button");
    b.type = "button"; b.dataset.day = String(i);
    const no = document.createElement("b"); no.textContent = t("{n}일차",{n:dayInChapter(i) + 1});
    const ttl = document.createElement("span"); ttl.textContent = dayOpen(prog, i) ? `${t(d.title)} · ${t(GAME_NAME[d.game])}` : t("잠김");
    const st = document.createElement("i");
    st.textContent = prog.stars[i] ? "★".repeat(prog.stars[i]) + "☆".repeat(3 - prog.stars[i]) : "";
    // a day beaten on 역경 shows those stars instead (three plain stars are what opened it)
    const hs = prog.hard && prog.hard[i];
    if(hs){ st.textContent = t("역경") + " " + "★".repeat(hs) + "☆".repeat(3 - hs); st.className = "hard"; }
    else if(hardOpen(prog, i)){ st.textContent += " " + t("역경 열림"); st.className = "hard-open"; }   // three stars: 역경 is open (discoverability)
    b.append(no, ttl, st);
    b.disabled = !dayOpen(prog, i);
    if(i === prog.cleared) b.classList.add("next");
    if(d.beat) b.classList.add("boss");
    b.onclick = () => onPick(i);
    li.appendChild(b); list.appendChild(li);
  });
  $("#days").hidden = false;
}

/* 장 막간 card (index.html #interlude): entry from core/interlude.js; go = the close button's label */
export function showInterlude(entry, go, onClose){
  $("#interludeForm").textContent = t(entry.form);
  $("#interludeTitle").textContent = t(entry.title);
  const ul = $("#interludeLines"); ul.textContent = "";
  entry.lines.forEach(line => { const li = document.createElement("li"); li.textContent = t(line); ul.appendChild(li); });
  $("#interludeGo").textContent = t(go);
  $("#interludeGo").onclick = () => { $("#interlude").hidden = true; onClose(); };
  $("#interlude").hidden = false;
}

/* the ending card (index.html #ending) after the last day's first clear */
export function showEnding(){
  $("#endingTitle").textContent = t(ENDING.title);
  const ul = $("#endingLines"); ul.textContent = "";
  ENDING.lines.forEach(line => { const li = document.createElement("li"); li.textContent = t(line); ul.appendChild(li); });
  $("#endingUnlock").textContent = t(ENDING.unlock);
  $("#ending").hidden = false;
}

/* hard: the 역경 rules (core/campaign.js hardDay); canHard: the day has three stars, so the 역경 button shows */
export function showStory(day, hard = false, canHard = false){
  const d = dayDef(day, hard);
  $("#storyNo").textContent = hard ? t("{d} · 역경",{d:dayLabel(day)}) : dayLabel(day);
  delete $("#storyNo").dataset.kind;
  $("#story .card").classList.toggle("hard-on", hard);
  $("#storyGo").textContent = t(hard ? "역경 시작" : "영업 시작");
  $("#storyHard").hidden = !canHard;
  $("#storyHard").textContent = t(hard ? "보통으로 돌아가기" : "역경 모드 · 더 빡세게");
  $("#storyTitle").textContent = t(d.title);
  const ul = $("#storyLines"); ul.textContent = "";
  // 역경 repeats only the day's situation line plus its real rules (the plain intro's numbers would contradict them)
  const hardRule = () => t("역경: ") + [t("통증 {n}번이면 끝",{n:d.painMax}), d.zone ? t("구역 안내 {n}명",{n:d.zone}) : t("구역 안내 없음"), d.mods && d.mods.tight ? t("구역도 좁아요") : "", d.beat ? t("평균 {n}점",{n:d.beat}) : ""].filter(Boolean).join(", ") + ".";
  const lines = [...(hard ? [d.intro[0], hardRule()] : d.intro), ...(bossRules(d).length && d.bossTaunt ? [d.bossTaunt] : [])];
  lines.forEach(line => { const li = document.createElement("li"); li.textContent = t(line); ul.appendChild(li); });
  const rules = $("#storyRules"); rules.textContent = "";
  const seen = new Set();
  const chip = (text, warn) => { if(seen.has(text)) return; seen.add(text); const i = document.createElement("i"); i.textContent = text; if(warn) i.className = "warn"; rules.appendChild(i); };
  chip(t(GAME_NAME[d.game]));
  chip(d.game === "back" ? t("{p} · 세 구역",{p:t(d.patients[0])}) : d.game === "side" ? t("{p} · 좌우 양쪽",{p:t(d.patients[0])}) : t("환자 {n}명",{n:d.patients.length}));
  chip(t("통증 {n}번이면 영업 끝",{n:d.painMax}), d.painMax < 3);
  const noisy = !!(d.mods && d.mods.noisy), noZone = d.game !== "back" && d.game !== "side" && !d.zone;
  // 안내가 둘 다 없는 날은 칩 하나로 (8장 7일 같은 날에 "구역 안내 없음"과 "숨 안내 없음"이 나란히 떴다)
  if(noZone && noisy) chip(t("구역·숨 안내 없음"), true);
  else{
    if(d.game !== "back" && d.game !== "side") chip(d.zone ? t("초록 구역 안내 {n}명",{n:d.zone}) : t("구역 안내 없음"), !d.zone);
    if(noisy) chip(t("숨 안내 없음"), true);
  }
  if(d.mods && d.mods.tight) chip(t(d.mods.tighter ? "구역이 아주 좁아요" : "구역이 좁아요"), true);
  bossChips(d).forEach(c => chip(t(c), true));
  if(d.beat) chip(t(hard ? "역경 · 평균 {n}점 넘기기" : "보스 · 평균 {n}점 넘기기",{n:d.beat}), true);
  $("#story").hidden = false;
}

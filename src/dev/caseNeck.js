// Case build: 목꺾기 / 목뽑기 scenarios (the moves of scripts/cases/run.mjs actNeck/waitNeck, inside the page).
import { S } from "../game/state.js";
import { adjust } from "../game/flow.js";
import * as feel from "../game/feel.js";
import * as tw from "../core/towel.js";
import { makePatients } from "../patient/roster.js";
import { showEnding } from "../ui/campaign.js";
import { DEX_PATIENTS, DEX_FAILS } from "../core/dex.js";
import { WEEKLY_RULES, weekNo, ruleOfWeek } from "../core/weekly.js";
import { QUESTS } from "../core/quests.js";
import { DAYS } from "../core/campaign.js";
import { runCase, sleep, waitFor } from "./caseRunner.js";

const $ = id => document.getElementById(id);
const now = () => performance.now();
const resultOpen = () => !$("result").hidden;

async function act(step, towel){
  await waitFor(() => S.phase === "play" && !S.busy && S.target, 60000, "환자 준비");
  if(step.hold !== 0) while(now() - S.patientStart < 800) await sleep(16);
  if(step.late) while(now() - S.patientStart < step.late) await sleep(50);   // 보스 규칙 cases: let the clock run (timer / swap / shrink)
  const hold = towel && step.tow?.startsWith("hold-");
  if(step.exhale !== undefined && !hold){ const end = now() + 12000; while(feel.breath(now()).exhale !== step.exhale && now() < end) await sleep(8); }
  const set = (rot, bend) => { S.input.rot = S.cur.rot = rot; S.input.bend = S.cur.bend = bend; };
  const before = { idx: S.idx, sideIdx: S.sideIdx };
  if(!towel){
    const t = S.target, sgn = t.rot >= 0 ? 1 : -1, p = step.pos;
    if(p === "target") set(t.rot, t.bend);
    else if(p.d !== undefined){ let lo = 0, hi = 300; for(let i = 0; i < 40; i++){ const m = (lo + hi) / 2; set(t.rot - sgn * m, t.bend); if(feel.distNorm() < p.d) lo = m; else hi = m; } set(t.rot - sgn * lo, t.bend); }
    else if(p.over) set(sgn * (t.limR + 4), t.bend);
  }else{
    const g = S.towel, F = tw.TOWEL_FULL, k = step.tow;
    if(k === "perfect") set(g.aim, g.mid * F);
    else if(k === "good") set(g.aim + 0.5 * g.aimTol, (g.mid + 0.8 * g.half) * F);
    else if(k === "slip") set(g.aim, Math.max(0, g.mid - 2 * g.half) * F);
    else if(k === "taut") set(g.aim, (g.mid + g.half + (g.limit - g.mid - g.half) * 0.5) * F);
    else if(k === "over" || k === "hold-over") set(g.aim, Math.min(1, g.limit + 0.03) * F);
    else if(k === "skew1") set(g.aim + 1.5 * g.aimTol, g.mid * F);
    else if(k === "skew2") set(g.aim + 3 * g.aimTol, g.mid * F);
    else if(k === "zero") set(g.aim, 0);
    else if(k === "hold-ok") set(g.aim, g.mid * F);
  }
  if(!hold) adjust(step.src || "key", step.force || 0);
  return before;
}
async function after(step, before, c){
  const to = (c.timeout || 90) * 1000, a = step.after || "next";
  if(a.startsWith("ms:")) return sleep(Number(a.slice(3)));
  if(a === "result") return waitFor(resultOpen, to, "결과 화면");
  if(a === "retry"){ await sleep(5200); return waitFor(() => !S.busy && S.phase === "play" || resultOpen(), to, "재도전"); }
  return waitFor(() => S.idx !== before.idx || S.sideIdx !== before.sideIdx || resultOpen(), to, "다음 쪽");
}

/* 영업 일지 cases: a save with the days before `day` cleared, then the same taps a player makes (일지 -> day -> 영업 시작).
   story: stop on the story card. hard: the 역경 run of that day. */
function dexBegin(kind){
  const tales = kind === "tales";
  if(kind === "full"){   // 도감 완성: every patient and every fail met, all quests cleared
    const met = {}, fails = {}, quests = {};
    for(const p of DEX_PATIENTS) met[p.name] = { first: "2026-10-22", n: 3, ok: 2 };
    for(const f of DEX_FAILS) fails[f.id] = { first: "2026-10-22", n: 1 };
    for(const q of QUESTS) quests[q.id] = 3;
    localStorage.setItem("chiroCampaign", JSON.stringify({ cleared: 56, stars: Array(56).fill(3), hard: Array(56).fill(0), quests, seen: [2, 3, 4, 5, 6, 7, 8] }));
    localStorage.setItem("chiroDex", JSON.stringify({ met, fails }));
    $("dexBtn").click(); return;
  }   // 환자 도감: a few met patients and fails saved, then the title's 환자 도감 button (tales: 단골 의뢰를 깬 저장 -> 뒷이야기 줄)
  if(tales) localStorage.setItem("chiroCampaign", JSON.stringify({ cleared: 7, stars: Array(7).fill(2), quests: { "박대리1": 3, "최교수1": 1, "이라이더1": 2, "정작가1": 2 } }));
  localStorage.setItem("chiroDex", JSON.stringify({ met: { "박대리": { first: "2026-10-22", n: 3, ok: 2 }, "최교수": { first: "2026-10-22", n: 1, ok: 1 }, "이라이더": { first: "2026-10-22", n: 2, ok: 0 }, "정작가": { first: "2026-10-22", n: 1, ok: 1 }, "김사장": { first: "2026-10-22", n: 1, ok: 0 } }, fails: { over: { first: "2026-10-22", n: 2 }, crack: { first: "2026-10-22", n: 1 }, "t-slip": { first: "2026-10-22", n: 1 } } }));
  $("dexBtn").click();
}
function weeklyRule(id){   // case build only: shift the clock by whole weeks so the week's rule is `id` (Date.now keeps ticking)
  const cur = weekNo(); let w = cur; while(ruleOfWeek(w).id !== id && w < cur + WEEKLY_RULES.length) w++;
  const off = (w - cur) * 7 * 86400000, real = Date.now.bind(Date);
  Date.now = () => real() + off;
}
function nightBegin(kind){   // 심야 진료 / 보스 러시 / 주간 챌린지: 56일 클리어 저장 -> 영업 일지 -> 심야 진료
  const weekly = kind === "weekly", n = weekly ? 7 : 56;   // 주간 챌린지 opens after 2장
  localStorage.setItem("chiroCampaign", JSON.stringify({ cleared: n, stars: Array(n).fill(2), hard: Array(n).fill(0) }));
  $("campaignBtn").click();
  $(weekly ? "daysWeekly" : kind === "rush" ? "daysRush" : "daysNight").click();
}
function endingBegin(){   // 엔딩 카드: 55일 클리어 저장 -> 영업 일지 -> 엔딩 카드 (실제로는 56일차 첫 클리어 뒤 '엔딩 보기')
  localStorage.setItem("chiroCampaign", JSON.stringify({ cleared: 56, stars: Array(56).fill(2), hard: Array(56).fill(0) }));
  showEnding();
}
function questBegin({ id, story, list, cleared = 7 }){
  const quests = { "박대리1": 3, "최교수1": 1 };
  const m = id && /^(.*?)([123])$/.exec(id);
  if(m) for(let e = 1; e < +m[2]; e++) quests[m[1] + e] = 2;   // 2·3편은 앞 편을 깬 저장에서만 열린다
  localStorage.setItem("chiroCampaign", JSON.stringify({ cleared, stars: Array(cleared).fill(2), quests }));
  $("campaignBtn").click();
  $("questOpen").click();
  if(list) return;
  document.querySelector('#questList button[data-q="' + id + '"]').click();
  if(!story) $("storyGo").click();
}
function seasonBegin({ season, story, list, done, name = "winter" }){   // 계절 손님: 1장 클리어 저장 + 계절 고정(기본 겨울) -> 영업 일지 -> 계절 손님 (앞 편을 깬 저장이면 그 편이 열린다)
  if(season) name = season.replace(/\d+$/, "");
  window.__forceSeason = name;
  const eps = {};
  const no = season ? +season.slice(-1) : done ? 5 : 1;
  for(let i = 1; i < no; i++) eps[name + i] = 2;
  localStorage.setItem("chiroCampaign", JSON.stringify({ cleared: 7, stars: Array(7).fill(2), hard: Array(7).fill(0) }));
  localStorage.setItem("chiroSeason", JSON.stringify({ eps, bonus: {} }));
  $("campaignBtn").click();
  $("daysSeason").click();
  if(list) return;
  document.querySelector('#seasonList button[data-s="' + season + '"]').click();
  if(!story) $("storyGo").click();
}
function campaignBegin({ day, story, hard, quest, list, interlude, season, cleared, seasonName, done }){
  if(season || (list === "season")) return seasonBegin({ season, story, list: list === "season", done, name: seasonName });
  if(quest || list) return questBegin({ id: quest, story, list, cleared });
  // hard: the day itself cleared with three stars, so its 역경 button shows, and pressed
  const n = hard ? day + 1 : day;
  localStorage.setItem("chiroCampaign", JSON.stringify({ cleared: n, stars: Array(n).fill(hard ? 3 : 2), ...(interlude ? {} : { seen: [2, 3, 4, 5, 6, 7, 8] }) }));   // 장 막간 already seen, unless the case is the card itself
  $("campaignBtn").click();
  const tab = document.querySelector(`#chTabs button[data-ch="${DAYS[day].ch}"]`);   // a hard run of an earlier chapter: open that chapter's tab
  if(tab && !tab.classList.contains("on")) tab.click();
  document.querySelector(`#dayList button[data-day="${day}"]`).click();
  if(interlude) return;   // stop on the 장 막간 card
  if(hard) $("storyHard").click();
  if(!story) $("storyGo").click();
}

/* 진료실 꾸미기 cases: a saved shop (coins, bought props); open: stop on the shop card */
function shopBegin(shop){
  localStorage.setItem("chiroShop", JSON.stringify({ coins: shop.coins, owned: shop.owned }));
  dispatchEvent(new Event("chiro-shop"));
  if(shop.open) $("shopBtn").click();
}

runCase({
  ready: () => waitFor(() => document.documentElement.dataset.head && document.documentElement.dataset.hands, 150000, "에셋 로드").then(() => document.fonts.ready),
  begin(c){
    if(c.menu){ $(c.mode === "towel" ? "startTowel" : "start").click(); setTimeout(() => $("clinicBtn").click(), 3500); return; }   // 클리닉 이동 메뉴
    if(c.dex){ dexBegin(c.dex); return; }
    if(c.weekly) weeklyRule(c.weekly);
    if(c.shop) shopBegin(c.shop);
    if(c.shop && c.shop.open) return;
    if(c.ending){ endingBegin(); return; }
    if(c.night){ nightBegin(c.night); return; }
    if(c.campaign){ campaignBegin(c.campaign); return; }
    $(c.mode === "towel" ? "startTowel" : "start").click();
    if(c.patient){
      const i = S.patients.findIndex(p => p.name === c.patient);
      if(i > 0){ const [p] = S.patients.splice(i, 1); S.patients.unshift(p); }
      else if(i < 0){ const p = makePatients().find(q => q.name === c.patient); if(p) S.patients.splice(0, 1, p); }
    }
  },
  async play(c){
    for(const step of c.steps){ if(resultOpen() && step.optional) break; const b = await act(step, c.night ? S.game === "towel" : c.mode === "towel"); await after(step, b, c); }
  }
});

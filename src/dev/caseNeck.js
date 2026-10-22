// Case build: 목꺾기 / 목뽑기 scenarios (the moves of scripts/cases/run.mjs actNeck/waitNeck, inside the page).
import { S } from "../game/state.js";
import { adjust } from "../game/flow.js";
import * as feel from "../game/feel.js";
import * as tw from "../core/towel.js";
import { makePatients } from "../patient/roster.js";
import { runCase, sleep, waitFor } from "./caseRunner.js";

const $ = id => document.getElementById(id);
const now = () => performance.now();
const resultOpen = () => !$("result").hidden;

async function act(step, towel){
  await waitFor(() => S.phase === "play" && !S.busy && S.target, 60000, "환자 준비");
  if(step.hold !== 0) while(now() - S.patientStart < 800) await sleep(16);
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
function campaignBegin({ day, story, hard }){
  // hard: the day itself cleared with three stars, so its 역경 button shows, and pressed
  const n = hard ? day + 1 : day;
  localStorage.setItem("chiroCampaign", JSON.stringify({ cleared: n, stars: Array(n).fill(hard ? 3 : 2) }));
  $("campaignBtn").click();
  document.querySelector(`#dayList button[data-day="${day}"]`).click();
  if(hard) $("storyHard").click();
  if(!story) $("storyGo").click();
}

runCase({
  ready: () => waitFor(() => document.documentElement.dataset.head && document.documentElement.dataset.hands, 150000, "에셋 로드").then(() => document.fonts.ready),
  begin(c){
    if(c.campaign){ campaignBegin(c.campaign); return; }
    $(c.mode === "towel" ? "startTowel" : "start").click();
    if(c.patient){
      const i = S.patients.findIndex(p => p.name === c.patient);
      if(i > 0){ const [p] = S.patients.splice(i, 1); S.patients.unshift(p); }
      else if(i < 0){ const p = makePatients().find(q => q.name === c.patient); if(p) S.patients.splice(0, 1, p); }
    }
  },
  async play(c){
    for(const step of c.steps){ const b = await act(step, c.mode === "towel"); await after(step, b, c); }
  }
});

// Case build: 허리펴기 / 허리비틀기 scenarios through the __backShot / __sideShot probes (scripts/cases/run.mjs stepBack).
import { runCase, sleep, waitFor } from "./caseRunner.js";

const $ = id => document.getElementById(id);
const side = location.pathname.split("/").pop().startsWith("side");
const B = () => side ? window.__sideShot : window.__backShot;
const now = () => performance.now();

async function press(step){
  await waitFor(() => { const s = B().snapshot(); return s.phase === "play" && now() >= s.prepUntil + 100; }, 60000, "준비");
  await sleep(700);
  const s = B().snapshot();
  const hT = side ? B().goal().height : s.heights[s.step], sT = side ? B().goal().roll : s.targets[s.step];
  const val = (spec, tgt) => { if(spec === "target" || spec === "goal") return tgt; if(spec.abs !== undefined) return spec.abs; const d = spec.off ?? spec.goalOff; let v = tgt + d; if(v > 0.97 || v < 0.03) v = tgt - d; return Math.min(1, Math.max(0, v)); };
  const h = val(step.h, hT);
  B().aim(h); await sleep(500);
  let pos = h;
  if(step.s !== null){ B().lock(true); await sleep(500); pos = val(step.s, sT); }
  B().aim(pos); await sleep(300);
  B().press(pos, step.pressure, step.force);
  return { step: s.step, mistakes: s.mistakes };
}

runCase({
  ready: () => waitFor(() => document.documentElement.dataset[side ? "sideReady" : "backReady"] === "true", 150000, "에셋 로드").then(() => document.fonts.ready),
  begin(){ $(side ? "sideTouchStart" : "backTouchStart").click(); },
  async play(c){
    const to = (c.timeout || 120) * 1000;
    for(let i = 0; i < c.steps.length; i++){
      const step = c.steps[i], last = i === c.steps.length - 1;
      if(step.flip){
        await waitFor(() => B().snapshot().phase === "turn", 60000, "돌아눕기");
        await sleep(1300); B().flip(); continue;
      }
      const b = await press(step);
      if(!side) await waitFor(() => !$("backResult").hidden || (() => { const s = B().snapshot(); return s.phase === "play" && (s.step !== b.step || s.mistakes !== b.mistakes); })(), to, "다음 구역");
      else{
        await waitFor(() => B().snapshot().phase !== "anim", to, "연출");
        if(last){ const e = c.end || "play"; await waitFor(() => e === "result" ? !$("sideResult").hidden : B().snapshot().phase === e, to, "끝"); }
      }
    }
  }
});

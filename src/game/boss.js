/* 보스 특수 규칙 glue (core/boss.js has the rules): the timer pill (#bossRule) and the swap check, on a 200 ms tick so
   the frame loop stays untouched. flow.js applies the zone, bonus and score parts itself. */
import { $ } from "../lib/dom.js";
import { S } from "./state.js";
import { timerLeft, hasRule } from "../core/boss.js";

export function mountBoss({ swap }){
  const pill = $("#bossRule");
  if(!pill) return;
  setInterval(() => {
    const now = performance.now();
    const playing = S.phase === "play" && S.bossReady && S.boss && S.boss.length;
    if(!playing){ pill.hidden = true; return; }
    if(hasRule(S.boss, "swap")) swap();
    const left = timerLeft(S.boss, now - S.patientStart, S.hard);
    if(left === null){ pill.hidden = true; return; }
    pill.hidden = false;
    pill.textContent = left > 0 ? `남은 시간 ${left}초` : "시간 초과 -20";
    pill.classList.toggle("late", left <= 5);
  }, 200);
}

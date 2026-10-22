/* 보스 특수 규칙 glue (core/boss.js has the rules): the timer pill (#bossRule) and the swap check, on a 200 ms tick so
   the frame loop stays untouched. flow.js applies the zone, bonus and score parts itself. */
import { $ } from "../lib/dom.js";
import { S } from "./state.js";
import { timerLeft, hasRule, bossTolMul, timerWarn, SHRINK_MIN } from "../core/boss.js";
import { tone, vib } from "../audio/audio.js";

let lastTick = null;   // the whole second last ticked (last 5 s of the timer)
export function mountBoss({ swap }){
  const pill = $("#bossRule");
  if(!pill) return;
  setInterval(() => {
    const now = performance.now();
    const playing = S.phase === "play" && S.bossReady && S.boss && S.boss.length;
    if(!playing){ pill.hidden = true; return; }
    if(hasRule(S.boss, "swap")) swap();
    const left = timerLeft(S.boss, now - S.patientStart, S.hard);
    if(left === null && hasRule(S.boss, "shrink")){   // shrink: show the zone narrowing (it used to be invisible)
      const f = bossTolMul(["shrink"], now - S.patientStart);
      pill.hidden = false; pill.textContent = `구역 ${Math.round(f * 100)}%`;
      pill.classList.toggle("late", f <= SHRINK_MIN + 0.15);
      return;
    }
    if(left === null){ pill.hidden = true; return; }
    pill.hidden = false;
    pill.textContent = left > 0 ? `남은 시간 ${left}초` : "시간 초과 -20";
    const warn = timerWarn(left);
    pill.classList.toggle("late", left <= 5);
    pill.classList.toggle("tick", warn);                     // 7차: the pill shakes for the last 5 s ...
    if(warn && left !== lastTick){ lastTick = left; tone(1040, 980, 0.05, "square", 0.05); vib(15); }   // ... and ticks once a second (the aim-pulse synth)
    if(!warn) lastTick = null;
  }, 200);
}

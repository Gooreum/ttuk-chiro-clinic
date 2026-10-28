/* 보스 특수 규칙 glue (core/boss.js has the rules): the timer pill (#bossRule) and the swap check, on a 200 ms tick so
   the frame loop stays untouched. flow.js applies the zone, bonus and score parts itself. */
import { t } from "../i18n/index.js";
import { $ } from "../lib/dom.js";
import { S } from "./state.js";
import { timerLeft, hasRule, bossTolMul, timerWarn, bossTags, SHRINK_MIN } from "../core/boss.js";
import { tone, vib } from "../audio/audio.js";

let lastTick = null;   // the whole second last ticked (last 5 s of the timer)
// 62차: 화면 가운데 고정이면 짧은 가로 화면에서 차트 오른쪽 끝(시각·칩)을 덮었다. 차트와 점수 패널 사이 빈칸 가운데에 두고,
// 빈칸이 좁으면 점수 패널 아래로 내린다. 레이아웃 좌표(offset*)라 스스로 돌린 가로 화면에서도 맞는다.
function place(pill){
  const chart = $("#chartMini"), side = document.querySelector(".clinic-app .top .side");
  const top = chart && chart.offsetParent;
  if(!top || !side){ pill.style.left = pill.style.top = pill.style.maxWidth = ""; return; }
  const l = top.offsetLeft + chart.offsetLeft + chart.offsetWidth + 8;
  const r = top.offsetLeft + side.offsetLeft - 8;
  if(r - l >= 120){ pill.style.left = (l + r) / 2 + "px"; pill.style.top = ""; pill.style.maxWidth = r - l + "px"; return; }
  pill.style.left = top.offsetLeft + side.offsetLeft + side.offsetWidth / 2 + "px";
  pill.style.top = top.offsetTop + side.offsetTop + side.offsetHeight + 6 + "px";
  pill.style.maxWidth = side.offsetWidth + 40 + "px";
}
// 63차: "반대쪽" 배너(z 4)가 같은 윗줄에 내려와 알약을 덮었다. 배너가 떠 있는 동안 알약을 배너 밑으로 내린다
function dodgeBanner(pill){
  const b = $("#banner");
  if(b && b.classList.contains("show") && b.offsetParent === pill.offsetParent) pill.style.top = b.offsetTop + b.offsetHeight + 6 + "px";
}
export function mountBoss({ swap }){
  const pill = $("#bossRule");
  if(!pill) return;
  setInterval(() => {
    const now = performance.now();
    const hasBoss = !!(S.boss && S.boss.length);
    const live = S.phase === "play" && S.bossReady;
    // 11차: 주간 챌린지는 그 주 규칙 이름을 같은 알약에 상시 띄운다(시간 제한·구역 비율을 보여 주는 규칙은 그 문구가 우선)
    const weeklyTag = S.weekly && S.weekly.set ? t("이번 주 · {r}",{r:t(S.weekly.set.rule.name)}) : S.daily && S.daily.set ? t("오늘 · {r}",{r:t(S.daily.set.rule.name)}) : "";
    if(!live || (!hasBoss && !weeklyTag)){ pill.hidden = true; pill.classList.remove("late", "tick"); return; }
    place(pill); dodgeBanner(pill);
    if(!hasBoss){ pill.hidden = false; pill.textContent = weeklyTag; pill.classList.remove("late", "tick"); return; }
    if(hasRule(S.boss, "swap")) swap();
    const left = timerLeft(S.boss, now - S.patientStart, S.hard);
    if(left === null && hasRule(S.boss, "shrink")){   // shrink: show the zone narrowing (it used to be invisible)
      const f = bossTolMul(["shrink"], now - S.patientStart);
      pill.hidden = false; pill.textContent = t("{r} · 구역 {n}%",{r:t("점점 좁아짐"), n:Math.round(f * 100)});
      pill.classList.toggle("late", f <= SHRINK_MIN + 0.15);
      return;
    }
    if(left === null){
      const tag = weeklyTag || bossTags(S.boss);   // 63차: 보스 날 taunt·swap·fake도 규칙 이름을 띄운다
      if(tag){ pill.hidden = false; pill.textContent = tag; pill.classList.remove("late", "tick"); } else pill.hidden = true;
      return;
    }
    pill.hidden = false;
    pill.textContent = left > 0 ? t("남은 시간 {n}초",{n:left}) : t("시간 초과 -20");
    const warn = timerWarn(left);
    pill.classList.toggle("late", left <= 5);
    pill.classList.toggle("tick", warn);                     // 7차: the pill shakes for the last 5 s ...
    if(warn && left !== lastTick){ lastTick = left; tone(1040, 980, 0.05, "square", 0.05); vib(15); }   // ... and ticks once a second (the aim-pulse synth)
    if(!warn) lastTick = null;
  }, 200);
}

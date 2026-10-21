/* The game could not start (a boot error, a scene that did not load): say so and offer 다시 시도 instead of a frozen
   screen. Style: ui/clinic-hud.css .load-fail. */
import { track } from "../platform/analytics.js";
import { EV } from "../core/analytics.js";

export function showLoadFail(reason){
  if(document.querySelector(".load-fail")) return;
  const box = document.createElement("div");
  box.className = "load-fail"; box.setAttribute("role", "alertdialog");
  const card = document.createElement("div"); card.className = "card";
  const h = document.createElement("h2"); h.textContent = "진료실을 못 열었어요";
  const p = document.createElement("p"); p.textContent = "인터넷 연결을 확인하고 다시 시도해 주세요.";
  const b = document.createElement("button"); b.className = "btn"; b.textContent = "다시 시도"; b.dataset.track = "retry";
  b.addEventListener("click", () => { track(EV.retry, { reason }); setTimeout(() => location.reload(), 150); });
  card.append(h, p, b); box.appendChild(card);
  (document.body || document.documentElement).appendChild(box);
}

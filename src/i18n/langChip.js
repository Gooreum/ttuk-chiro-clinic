/* EN / 한국어 switch: a link-style chip at the end of the first .legal line on the title card (index) and the back / side
   start cards. It names the other language in that language (so it carries lang="ko" on the English screen). Toss builds
   are Korean only and get no chip. Switching saves chiroLang and reloads (setLang). */
import { LANG, setLang } from "./index.js";

export function mountLangChip(doc = document){
  if(typeof __TOSS__ !== "undefined" && __TOSS__) return null;
  const line = doc.querySelector(".card.wide .legal");
  if(!line || doc.getElementById("langBtn")) return null;
  const to = LANG === "en" ? "ko" : "en";
  const b = doc.createElement("button");
  b.type = "button"; b.id = "langBtn"; b.className = "linkbtn";
  b.textContent = to === "ko" ? "한국어" : "EN";
  b.lang = to;
  b.setAttribute("aria-label", to === "ko" ? "한국어로 보기" : "View in English");
  b.addEventListener("click", e => { e.stopPropagation(); setLang(to); });
  line.append(" · ", b);
  return b;
}

if(typeof document !== "undefined") mountLangChip();

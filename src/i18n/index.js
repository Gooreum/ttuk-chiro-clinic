/* 화면 언어 (ko / en). The Korean source text is the key: data modules keep their Korean (patient names double as ids,
   saves and events stay Korean), and every place that puts text on screen runs it through t(). A string missing from
   the dictionary shows as the Korean original, so a gap never breaks the game. Toss builds are Korean only.
   Order: ?lang= -> localStorage chiroLang -> navigator.language (ko* = ko, anything else = en). No browser (vitest) = ko. */
import ui from "./en/ui.json";
import campaign from "./en/campaign.json";
import quests from "./en/quests.json";
import cast from "./en/cast.json";
import lines from "./en/lines.json";
import modes from "./en/modes.json";

export const LANG_KEY = "chiroLang";
export const LANGS = ["ko", "en"];
export const EN_DICT = Object.assign({}, ui, campaign, quests, cast, lines, modes);

export function pickLang({ query, stored, nav, toss } = {}){
  if(toss) return "ko";
  for(const v of [query, stored]) if(LANGS.includes(v)) return v;
  if(typeof nav === "string" && nav) return /^ko\b/i.test(nav) ? "ko" : "en";
  return "ko";
}

function detect(){
  if(typeof __TOSS__ !== "undefined" && __TOSS__) return "ko";
  if(typeof location === "undefined" || typeof document === "undefined") return "ko";
  let stored = null;
  try{ stored = localStorage.getItem(LANG_KEY); }catch(e){}
  const query = new URLSearchParams(location.search).get("lang");
  if(LANGS.includes(query)){ try{ localStorage.setItem(LANG_KEY, query); }catch(e){} }
  return pickLang({ query, stored, nav: navigator.language });
}

export let LANG = detect();
let dict = LANG === "en" ? EN_DICT : null;

/* tests only: switch the language without a page */
export function _setLangForTest(l){ LANG = l; dict = l === "en" ? EN_DICT : null; }

const fill = (s, vars) => vars ? s.replace(/\{(\w+)\}/g, (m, k) => k in vars ? vars[k] : m) : s;

/* t("{n}번째 환자", {n: 2}) -> "Patient 2" in English, "2번째 환자" in Korean */
export function t(ko, vars){
  if(typeof ko !== "string" || ko === "") return ko;
  let s = ko;
  if(dict){
    if(Object.prototype.hasOwnProperty.call(dict, ko)) s = dict[ko];
    else {
      const k = ko.trim();
      if(k !== ko && Object.prototype.hasOwnProperty.call(dict, k)) s = ko.replace(k, () => dict[k]);
    }
  }
  return fill(s, vars);
}
export const hasEn = ko => Object.prototype.hasOwnProperty.call(EN_DICT, ko);

export function setLang(l){
  if(!LANGS.includes(l)) return;
  try{ localStorage.setItem(LANG_KEY, l); }catch(e){}
  const u = new URL(location.href);
  u.searchParams.delete("lang");
  location.replace(u.toString());
}

/* back/side reuse neck review lines: "목" becomes "허리" in Korean, "neck" becomes "back" in English (unless the swapped Korean line has its own entry) */
export function backify(ko){
  const k = ko.replaceAll("목", "허리");
  if(LANG !== "en" || hasEn(k)) return t(k);
  return t(ko).replace(/neck/g, "back").replace(/Neck/g, "Back").replace(/NECK/g, "BACK");
}

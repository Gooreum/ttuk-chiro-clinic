/* 환자 도감 glue (core/dex.js has the rules, ui/dex.js the card). flow.js calls dexMet / dexDone / dexFailSeen /
   dexResult at four points; the save is localStorage "chiroDex". */
import { t } from "../i18n/index.js";
import { $ } from "../lib/dom.js";
import { store } from "../lib/store.js";
import { track } from "../platform/analytics.js";
import { EV } from "../core/analytics.js";
import { kstDate } from "../core/night.js";
import { DEX_KEY, DEX_FAILS, readDex, dexMeet, dexTreat, dexFail, isNewFail, failId, dexCounts } from "../core/dex.js";
import { openDex } from "../ui/dex.js";
import { CAMPAIGN_KEY, readProgress } from "../core/campaign.js";
import { taleCounts } from "../core/tales.js";

const read = () => readDex(store.get(DEX_KEY, null));
const save = d => store.set(DEX_KEY, d);
const readProg = () => readProgress(store.get(CAMPAIGN_KEY, null));
let fresh = [];   // what this run wrote into the dex for the first time (shown on the result card)

/* a patient comes in (loadPatient) */
export function dexMet(name){
  const d = read();
  if(!d.met[name]) fresh.push(name);
  save(dexMeet(d, name, kstDate()));
}
/* a day log row is pushed (pushResult): a treated patient counts */
export function dexDone(r){ if(r && r.stars > 0) save(dexTreat(read(), r.name, kstDate())); }
/* a wrong crack / tug (game: "clinic" | "towel") or the ambulance (game "all", kind "ambulance") */
export function dexFailSeen(game, kind, tier = 0){
  const id = game === "all" ? kind : failId(game, kind, tier), d = read();
  if(isNewFail(d, id)) fresh.push(id);
  save(dexFail(d, id, kstDate()));
}

const label = id => { const f = DEX_FAILS.find(x => x.id === id); return f ? f.name : id; };
/* finish(): a line on the result card with what is new in the dex, and the title button's counts */
export function dexResult(){
  document.querySelectorAll(".dex-new").forEach(e => e.remove());
  if(fresh.length){
    const p = document.createElement("p"); p.className = "dex-new";
    p.textContent = t("도감에 새로 적혔어요: {list}",{list:fresh.map(x => t(DEX_FAILS.some(f => f.id === x) ? label(x) : x)).join(", ")});
    $("#rlist").before(p);
    fresh = [];
  }
  renderDexBtn();
}
export function renderDexBtn(){
  const c = dexCounts(read()), tc = taleCounts(readProg()), txt = t("환자 {a}/{b} · 실패 {c}/{d}",{a:c.met,b:c.patients,c:c.fails,d:c.kinds}) + (tc.read ? t(" · 뒷이야기 {n}",{n:tc.read}) : "");
  for(const s of ["#dexSub", "#daysDexSub"]){ const e = $(s); if(e) e.textContent = txt; }
}
export function mountDex(){
  for(const b of ["#dexBtn", "#daysDex"]) $(b).addEventListener("click", () => {
    const c = openDex(read, readProg);
    track(EV.dexOpen, { met: c.met, fails: c.fails, tales: taleCounts(readProg()).read, from: b === "#dexBtn" ? "title" : "days" });
  });
  renderDexBtn();
}

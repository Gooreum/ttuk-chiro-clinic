/* 환자 도감 card (core/dex.js has the rules): two tabs, 환자 (32 cards, the ones not met yet are a silhouette) and
   실패 연출 (10 kinds with a one-line gag). Built on first open and appended to #app, so index.html only has the buttons. */
import { $ } from "../lib/dom.js";
import "./dex.css";
import { TRAITS } from "../patient/roster.js";
import { DEX_PATIENTS, DEX_FAILS, dexCounts, dexTitle, firstChapter } from "../core/dex.js";

const hex = n => "#" + (n >>> 0).toString(16).padStart(6, "0");
const GAME = { clinic: "목꺾기", towel: "목뽑기", all: "공통" };
const el = (tag, cls, text) => { const e = document.createElement(tag); if(cls) e.className = cls; if(text != null) e.textContent = text; return e; };
let tab = "p", root = null;

function build(){
  root = el("div", "overlay"); root.id = "dex"; root.hidden = true;
  const card = el("div", "card days");
  const head = el("div");
  head.append(el("div", "sub", "환자 도감"), el("p", "days-lead"));
  head.lastChild.id = "dexLead";
  const tabs = el("div", "dex-tabs");
  [["p", "환자"], ["f", "실패 연출"]].forEach(([k, t]) => {
    const b = el("button", "", t); b.type = "button"; b.dataset.tab = k;
    b.onclick = () => { tab = k; render(); };
    tabs.appendChild(b);
  });
  const title = el("p", "dex-title"); title.id = "dexTitle";
  const list = el("ul"); list.id = "dexList";
  const close = el("button", "btn ghost", "돌아가기"); close.type = "button"; close.id = "dexClose";
  close.onclick = () => { root.hidden = true; };
  card.append(head, tabs, title, list, close);
  root.appendChild(card);
  $("#app").appendChild(root);
}

function patientCard(p, m){
  const li = el("li", m ? "" : "miss");
  li.dataset.name = m ? p.name : "";
  const av = el("div", "dex-av" + (m ? "" : " sil"));
  if(m){
    av.style.setProperty("--skin", hex(p.look.skin)); av.style.setProperty("--gown", hex(p.look.gown));
    if(p.look.hair !== "bald") av.style.setProperty("--hair", hex(p.look.hairCol));
  }else av.appendChild(el("span", "", "?"));
  const body = el("div");
  if(m){
    const who = el("div", "who"); who.append(el("b", "", p.name), el("span", "", `${p.age}세`));
    if(p.trait) who.appendChild(el("i", "chip", TRAITS[p.trait].label));
    body.append(who, el("p", "cc", p.cc), el("p", "say", `“${p.lines.start}”`),
      el("p", "meta", `처음 만난 날 ${m.first} · 치료 ${m.ok}번`));
  }else{
    const ch = firstChapter(p.name);
    body.append(el("div", "who").appendChild(el("b", "", "???")).parentNode, el("p", "cc", "아직 못 만났어요."), el("p", "meta", ch ? `${ch}장 어딘가에서 와요` : "어딘가에서 와요"));
  }
  li.append(av, body);
  return li;
}
function failCard(f, s){
  const li = el("li", s ? "" : "miss");
  li.dataset.id = s ? f.id : "";
  li.appendChild(el("div", "fail-ico", s ? "!" : "?"));
  const body = el("div");
  const who = el("div", "who"); who.append(el("b", "", s ? f.name : "???"), el("i", "chip", GAME[f.game]));
  body.append(who, el("p", "cc", s ? f.desc : `${f.game === "all" ? "크게 다치면" : GAME[f.game] + "에서"} 나와요. 아직 못 봤어요.`));
  if(s) body.appendChild(el("p", "meta", `처음 본 날 ${s.first} · ${s.n}번`));
  li.appendChild(body);
  return li;
}

function render(){
  const dex = current();
  const c = dexCounts(dex);
  root.querySelectorAll(".dex-tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === tab));
  $("#dexLead").textContent = `환자 ${c.met}/${c.patients} · 실패 연출 ${c.fails}/${c.kinds}`;
  const t = dexTitle(dex);
  const line = $("#dexTitle"); line.textContent = "";
  if(t){ line.append("칭호 ", el("b", "", t)); }
  else line.textContent = "환자 5명을 만나면 첫 칭호가 붙어요. 환자와 실패를 다 모으면 마지막 칭호가 붙어요.";
  const list = $("#dexList"); list.textContent = "";
  if(tab === "p") DEX_PATIENTS.forEach(p => list.appendChild(patientCard(p, dex.met[p.name])));
  else DEX_FAILS.forEach(f => list.appendChild(failCard(f, dex.fails[f.id])));
  list.scrollTop = 0;
}

let current = () => ({ met: {}, fails: {} });
/* the dex to show: the glue gives a reader of the saved one */
export function openDex(read){
  current = read;
  if(!root) build();
  render();
  root.hidden = false;
  return dexCounts(read());
}

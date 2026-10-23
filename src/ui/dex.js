/* 환자 도감 card (core/dex.js has the rules): two tabs, 환자 (32 cards, the ones not met yet are a silhouette) and
   실패 연출 (10 kinds with a one-line gag). Built on first open and appended to #app, so index.html only has the buttons. */
import { $ } from "../lib/dom.js";
import { t } from "../i18n/index.js";
import "./dex.css";
import { TRAITS } from "../patient/roster.js";
import { DEX_PATIENTS, DEX_FAILS, dexCounts, dexTitle, firstChapter } from "../core/dex.js";
import { readableTales, taleCounts, taleTitle } from "../core/tales.js";

const hex = n => "#" + (n >>> 0).toString(16).padStart(6, "0");
const GAME = { clinic: "목꺾기", towel: "목뽑기", all: "공통" };
const el = (tag, cls, text) => { const e = document.createElement(tag); if(cls) e.className = cls; if(text != null) e.textContent = text; return e; };
let tab = "p", root = null;

function build(){
  root = el("div", "overlay"); root.id = "dex"; root.hidden = true;
  const card = el("div", "card days");
  const head = el("div");
  head.append(el("div", "sub", t("환자 도감")), el("p", "days-lead"));
  head.lastChild.id = "dexLead";
  const tabs = el("div", "dex-tabs");
  [["p", "환자"], ["f", "실패 연출"]].forEach(([k, lb]) => {
    const b = el("button", "", t(lb)); b.type = "button"; b.dataset.tab = k;
    b.onclick = () => { tab = k; render(); };
    tabs.appendChild(b);
  });
  const title = el("p", "dex-title"); title.id = "dexTitle";
  const list = el("ul"); list.id = "dexList";
  const close = el("button", "btn ghost", t("돌아가기")); close.type = "button"; close.id = "dexClose";
  close.onclick = () => { root.hidden = true; };
  card.append(head, tabs, title, list, close);
  root.appendChild(card);
  $("#app").appendChild(root);
}

/* 도감 얼굴: 피부·머리·가운 색(roster/cast의 look)과 소품 이름(CAST_LOOK.props)으로 그리는 작은 SVG. 새 에셋 없음.
   가운 위에 이름 첫 글자를 붙여 같은 몸을 빌린 캠페인 환자도 구분한다. */
const PROP_SVG = {
  beardLong: `<path d="M17 25q7 17 14 0q-7 4-14 0z" fill="#eee"/>`,
  stacheWhite: `<path d="M17 24q7-3 14 0q-7 3-14 0z" fill="#f2f2f2"/>`,
  stacheGrey: `<path d="M17 24q7-3 14 0q-7 3-14 0z" fill="#9a9ea6"/>`,
  browsWhite: `<path d="M17 14h5M26 14h5" stroke="#f2f2f2" stroke-width="2.2" stroke-linecap="round"/>`,
  hairWhiteSides: `<path d="M14 14q-3 8 1 12M34 14q3 8-1 12" stroke="#f2f2f2" stroke-width="3" fill="none" stroke-linecap="round"/>`,
  topknot: `<circle cx="24" cy="4" r="4" fill="#f2f2f2"/>`,
  hairWild: `<path d="M12 12l-5-5 8 2 3-6 4 5 4-5 3 6 8-2-5 5z" fill="#eee"/>`,
  hornSmall: `<path d="M17 9l-2-7 5 5zM31 9l2-7-5 5z" fill="#d0452f"/>`,
  hairSilver: `<path d="M13 15q11-12 22 0q-4-5-11-5t-11 5z" fill="#c9ccd2"/>`,
  hairSlick: `<path d="M13 15q11-12 22 0q-4-5-11-5t-11 5z" fill="#111"/>`,
  glassesGold: `<g fill="none" stroke="#d4a82a" stroke-width="1.6"><circle cx="19.5" cy="17" r="4"/><circle cx="28.5" cy="17" r="4"/><path d="M23.5 17h1"/></g>`,
  glassesBig: `<g fill="none" stroke="#222" stroke-width="1.8"><circle cx="19.5" cy="17" r="5"/><circle cx="28.5" cy="17" r="5"/><path d="M24.5 17h-1"/></g>`,
  headband: `<path d="M12 12h24v4H12z" fill="#e23c3c"/>`,
  neckBrace: `<rect x="17" y="30" width="14" height="6" rx="2" fill="#f4efe4" stroke="#9aa" stroke-width="1"/>`,
  stamp: `<circle cx="38" cy="50" r="5" fill="none" stroke="#e23c3c" stroke-width="1.6"/>`
};
function avatarSvg(p){
  const l = p.look || {}, props = l.props || [];
  const skin = hex(l.skin ?? 0xe0b090), gown = hex(l.gown ?? 0x445566), hairCol = l.hair === "bald" ? null : hex(l.hairCol ?? 0x222222);
  const hair = hairCol ? `<path d="M13 16q0-11 11-11t11 11q-4-6-11-6t-11 6z" fill="${hairCol}"/>` : "";
  const glasses = l.glasses && !props.some(k => k.startsWith("glasses")) ? `<g fill="none" stroke="#222" stroke-width="1.5"><circle cx="19.5" cy="17" r="4"/><circle cx="28.5" cy="17" r="4"/></g>` : "";
  const extras = props.map(k => PROP_SVG[k] || "").join("");
  return `<svg viewBox="0 0 48 56" aria-hidden="true"><path d="M3 56q0-17 21-17t21 17z" fill="${gown}"/>`
    + `<ellipse cx="24" cy="19" rx="11" ry="13" fill="${skin}"/>${hair}`
    + `<circle cx="20" cy="18" r="1.3" fill="#222"/><circle cx="28" cy="18" r="1.3" fill="#222"/><path d="M20 26q4 3 8 0" stroke="#7a3b2e" stroke-width="1.4" fill="none" stroke-linecap="round"/>`
    + glasses + extras
    + `<text x="24" y="53" text-anchor="middle" font-family="Black Han Sans,sans-serif" font-size="12" fill="#f4efe4" stroke="rgba(0,0,0,.4)" stroke-width=".7" paint-order="stroke">${[...t(p.name)][0]}</text></svg>`;
}
function patientCard(p, m){
  const li = el("li", m ? "" : "miss");
  li.dataset.name = m ? p.name : "";
  const av = el("div", "dex-av" + (m ? "" : " sil"));
  if(m) av.innerHTML = avatarSvg(p);
  else av.appendChild(el("span", "", "?"));
  const body = el("div");
  if(m){
    const who = el("div", "who"); who.append(el("b", "", t(p.name)), el("span", "", t("{n}세",{n:p.age})));
    if(p.trait) who.appendChild(el("i", "chip", t(TRAITS[p.trait].label)));
    body.append(who, el("p", "cc", t(p.cc)), el("p", "say", `“${t(p.lines.start)}”`),
      el("p", "meta", t("처음 만난 날 {d} · 치료 {n}번",{d:m.first,n:m.ok})));
    const tales = readableTales(prog(), p.name);
    if(tales.length){   // 뒷이야기: 단골 의뢰를 깬 편만 한 줄씩 적히고, 못 깬 편은 어느 의뢰를 깨면 적히는지만 보인다
      const box = el("div", "tales");
      tales.forEach(tl => box.appendChild(el("p", tl.line ? "tale" : "tale lock", tl.line ? t("{ep}편 {title}: {line}",{ep:tl.ep,title:t(tl.title),line:t(tl.line)}) : t("{ep}편 {title}: 단골 의뢰를 깨면 적혀요.",{ep:tl.ep,title:t(tl.title)}))));
      body.appendChild(box);
    }
  }else{
    const ch = firstChapter(p.name);
    body.append(el("div", "who").appendChild(el("b", "", "???")).parentNode, el("p", "cc", t("아직 못 만났어요.")), el("p", "meta", ch ? t("{n}장 어딘가에서 와요",{n:ch}) : t("어딘가에서 와요")));
  }
  li.append(av, body);
  return li;
}
function failCard(f, s){
  const li = el("li", s ? "" : "miss");
  li.dataset.id = s ? f.id : "";
  li.appendChild(el("div", "fail-ico", s ? "!" : "?"));
  const body = el("div");
  const who = el("div", "who"); who.append(el("b", "", s ? t(f.name) : "???"), el("i", "chip", t(GAME[f.game])));
  body.append(who, el("p", "cc", s ? t(f.desc) : t("{where} 나와요. 아직 못 봤어요.",{where:f.game === "all" ? t("크게 다치면") : t("{g}에서",{g:t(GAME[f.game])})})));
  if(s) body.appendChild(el("p", "meta", t("처음 본 날 {d} · {n}번",{d:s.first,n:s.n})));
  li.appendChild(body);
  return li;
}

function render(){
  const dex = current();
  const c = dexCounts(dex);
  root.querySelectorAll(".dex-tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === tab));
  const tc = taleCounts(prog());
  $("#dexLead").textContent = t("환자 {a}/{b} · 실패 연출 {c}/{d} · 뒷이야기 {e}/{f}",{a:c.met,b:c.patients,c:c.fails,d:c.kinds,e:tc.read,f:tc.total});
  const ti = dexTitle(dex);
  const line = $("#dexTitle"); line.textContent = "";
  const tt = taleTitle(prog());
  if(ti || tt){ line.append(t("칭호") + " "); if(ti) line.append(el("b", "", t(ti))); if(ti && tt) line.append(" · "); if(tt) line.append(el("b", "", t(tt))); }
  else line.textContent = t("환자 5명을 만나면 첫 칭호가 붙어요. 환자와 실패를 다 모으면 마지막 칭호가 붙어요.");
  const list = $("#dexList"); list.textContent = "";
  if(tab === "p") DEX_PATIENTS.forEach(p => list.appendChild(patientCard(p, dex.met[p.name])));
  else DEX_FAILS.forEach(f => list.appendChild(failCard(f, dex.fails[f.id])));
  list.scrollTop = 0;
}

let current = () => ({ met: {}, fails: {} });
let prog = () => ({ cleared: 0, stars: [] });
/* the dex to show: the glue gives a reader of the saved one (and of the campaign save, for the 뒷이야기 lines) */
export function openDex(read, readProg){
  current = read;
  if(readProg) prog = readProg;
  if(!root) build();
  render();
  root.hidden = false;
  return dexCounts(read());
}

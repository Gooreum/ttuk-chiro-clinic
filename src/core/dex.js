/* 환자 도감 (endgame collection, 2026-10-22 goal "플레이타임 20시간"): every patient met (ROSTER + CAST = 39) and every
   kind of wrong crack seen. Pure: no DOM, no three. The glue is game/dex.js, the card is ui/dex.js.
   Save: localStorage "chiroDex" {met: {name: {first: "2026-10-22", n: times met, ok: times finished}}, fails: {id: {first, n}}}.
   Kinds follow the code: 목꺾기 core/fail.js (over / dud / finger, a hard one is 금 / 골절), 목뽑기 core/towel.js
   (over / slip / skew / taut), and the ambulance (callAmbulance in game/flow.js). */
import { ROSTER } from "../patient/roster.js";
import { CAST } from "../patient/cast.js";
import { DAYS } from "./campaign.js";

export const DEX_KEY = "chiroDex";
export const DEX_PATIENTS = [...ROSTER, ...CAST];

export const DEX_FAILS = [
  { id: "over",   game: "clinic", name: "뾰잉",     desc: "한계를 넘겨 꺾었어요. 목이 고무줄처럼 출렁였어요." },
  { id: "dud",    game: "clinic", name: "삑사리",   desc: "살짝 빗나갔어요. 목이 반만 꺾이다 김이 빠졌어요." },
  { id: "finger", game: "clinic", name: "손가락 뚝", desc: "많이 빗나갔어요. 뚝 소리는 치료사 손가락에서 났어요." },
  { id: "crack",  game: "clinic", name: "금",       desc: "세게 틀리게 꺾었어요. 엑스레이에 과자 씹는 소리가 났어요." },
  { id: "break",  game: "clinic", name: "골절",     desc: "아주 세게 틀리게 꺾었어요. 뼈가 사방으로 튀어요." },
  { id: "ambulance", game: "all", name: "구급차",   desc: "삐용삐용. 금, 골절, 엿가락은 이렇게 끝나요." },
  { id: "t-over", game: "towel",  name: "엿가락",   desc: "너무 세게 당겼어요. 목이 늘어나고 치료사가 뒤로 넘어가요." },
  { id: "t-slip", game: "towel",  name: "헛당김",   desc: "수건이 느슨했어요. 쏙 빠져서 주먹 사이에 늘어졌어요." },
  { id: "t-skew", game: "towel",  name: "삐끗",     desc: "좌우 중심이 틀어졌어요. 목이 그쪽으로 꺾였어요." },
  { id: "t-taut", game: "towel",  name: "팽팽 금",  desc: "정상과 과함 사이였어요. 목이 곧게 뻗다 빠직 했어요." }
];

/* the dex id of a wrong crack: kind from the game (core/fail.js failKind / core/towel.js towelKind), tier from the force */
export function failId(game, kind, tier = 0){
  if(game === "towel") return "t-" + kind;
  return tier >= 2 ? "break" : tier === 1 ? "crack" : kind;
}

export function readDex(raw){
  const ok = raw && typeof raw === "object";
  const met = {}, fails = {};
  const names = new Set(DEX_PATIENTS.map(p => p.name)), ids = new Set(DEX_FAILS.map(f => f.id));
  if(ok && raw.met) for(const [k, v] of Object.entries(raw.met)) if(names.has(k) && v && typeof v.first === "string") met[k] = { first: v.first, n: Math.max(1, v.n | 0), ok: Math.max(0, v.ok | 0) };
  if(ok && raw.fails) for(const [k, v] of Object.entries(raw.fails)) if(ids.has(k) && v && typeof v.first === "string") fails[k] = { first: v.first, n: Math.max(1, v.n | 0) };
  return { met, fails };
}

/* the next dex after meeting a patient / finishing one / seeing a wrong crack; the same object back when nothing changed */
export function dexMeet(dex, name, date){
  if(!DEX_PATIENTS.some(p => p.name === name)) return dex;
  const m = dex.met[name];
  return { ...dex, met: { ...dex.met, [name]: m ? { ...m, n: m.n + 1 } : { first: date, n: 1, ok: 0 } } };
}
export function dexTreat(dex, name, date){
  const m = dex.met[name] || (dexMeet(dex, name, date).met[name]);
  if(!m) return dex;
  return { ...dex, met: { ...dex.met, [name]: { ...m, ok: m.ok + 1 } } };
}
export function dexFail(dex, id, date){
  if(!DEX_FAILS.some(f => f.id === id)) return dex;
  const f = dex.fails[id];
  return { ...dex, fails: { ...dex.fails, [id]: f ? { ...f, n: f.n + 1 } : { first: date, n: 1 } } };
}
export const isNewFail = (dex, id) => !dex.fails[id];

export const dexCounts = dex => ({
  met: DEX_PATIENTS.filter(p => dex.met[p.name]).length, patients: DEX_PATIENTS.length,
  fails: DEX_FAILS.filter(f => dex.fails[f.id]).length, kinds: DEX_FAILS.length
});

/* one line of title for what is collected: both complete is the top one. "" when nothing yet. */
export function dexTitle(dex){
  const c = dexCounts(dex), allP = c.met === c.patients, allF = c.fails === c.kinds;
  if(allP && allF) return "뚝 카이로 도감 완성";
  if(allF) return "실패 박물관장";
  if(allP) return "단골 장부 박사";
  if(c.met >= 16) return "동네 소문통";
  if(c.met >= 5) return "단골 수집가";
  return "";
}

/* the chapter a patient first shows up in (a hint for the ones not met yet); 0 when no day has them */
export function firstChapter(name){
  const d = DAYS.find(x => x.patients.includes(name));
  return d ? d.ch : 0;
}

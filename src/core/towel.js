import { clamp } from "../lib/math.js";
import { REVIEWS } from "../patient/roster.js";

/* Towel traction practice (title button "수건 견인 연습", game/flow.js towelAdjust). A towel is wrapped under the
   back of the head and both hands hold its ends. Tilting the phone's top toward the body (the aim's vertical axis,
   S.cur.bend, same sensor path as the clinic) takes up the slack; a tug (the usual snap: flick, swipe, Space) judges
   the tension at that moment. A cartoon gag, not a technique to copy. */
export const TOWEL_FULL = 28;    // degrees of the aim's vertical axis for a fully taut towel
export const towelTension = bend => clamp(bend / TOWEL_FULL, 0, 1);
// the tension band for one patient: elders want less and break sooner, the nervous one gives a narrow band
export function makeTowelTarget(p, rand = Math.random){
  const old = p.trait === "elder", tense = p.trait === "nervous";
  const mid = old ? 0.36 + 0.1*rand() : 0.5 + 0.18*rand();
  const half = tense ? 0.07 : 0.1;
  return {mid, half, limit: Math.min(0.97, mid + half + (old ? 0.12 : 0.18))};
}
export const towelDist = (t, tg) => Math.abs(t - tg.mid) / tg.half;
// "over": past the limit (the neck goes giraffe), "ok": in the band, "slip": too slack (only the towel comes off)
export function towelKind(t, tg){ return t > tg.limit ? "over" : towelDist(t, tg) <= 1 ? "ok" : "slip"; }

/* How far the head slides toward the camera (m) after the tug: shoots out in 0.15 s, holds trembling to 0.65 s,
   then snaps back with a damped spring (a little squash past zero) and is still by STRETCH_LEN. */
export const STRETCH_LEN = 1.6;
export function stretchProfile(t, peak){
  if(t <= 0 || t >= STRETCH_LEN) return 0;
  if(t < 0.15){ const u = t/0.15; return peak*(1 - (1 - u)*(1 - u)); }
  if(t < 0.65) return peak*(1 + 0.05*Math.sin(2*Math.PI*9*(t - 0.15)));
  const u = t - 0.65, len = STRETCH_LEN - 0.65;
  return peak*Math.exp(-5*u)*Math.cos(2*Math.PI*2.2*u)*(1 - u/len);
}

// the big stamp on a wrong tug, and the day log chips
export const TOWEL_STAMP = { over: "쭈와아악?!", slip: "쏙!" };
export const TOWEL_TAG = { over: "엿가락", slip: "헛당김" };
export function towelTags(fails){
  const n = {}; (fails || []).forEach(k => { n[k] = (n[k] || 0) + 1; });
  return Object.keys(TOWEL_TAG).filter(k => n[k]).map(k => `${TOWEL_TAG[k]} ×${n[k]}`);
}
// each patient's lines: ok after a good tug, over when the neck goes too long, slip when the towel comes off
export const TOWEL_LINES = {
  "박대리":   {ok: "키 2cm 큰 것 같아요… 인사고과에 반영되나요?", over: "목이 엿가락이 됐어요! 모니터가 발밑에 있어요!", slip: "수건만 빠졌는데요…? 저 아직 거북이예요"},
  "최교수":   {ok: "경추 간격이… 논문 하나 나오겠네요", over: "목이 늘어나는 건 학계에 보고된 적이 없는데요?!", slip: "방금 건 대조군인가요?"},
  "이라이더": {ok: "오 헬멧 사이즈 바꿔야겠다", over: "목이 기린이에요 기린! 신호등이 보여요!", slip: "수건 배달 완료요? 목은요?"},
  "정작가":   {ok: "목이 3컷은 길어졌어요… 하아…", over: "작화 붕괴! 목 작화 붕괴예요!", slip: "…수건만 퇴고하셨네요"},
  "김사장":   {ok: "허허, 키가 커서 드라이버가 짧아 보이네", over: "어허허허 내 목! 내 목 어디 갔어!", slip: "자네 수건이랑 싸우나?"}
};
const TOWEL_LINE_FALLBACK = {ok: "목이… 길어졌어요?", over: "목이 엿가락이 됐어요!", slip: "수건만 빠졌는데요?"};
export const towelLine = (name, kind) => (TOWEL_LINES[name] || TOWEL_LINE_FALLBACK)[kind] || TOWEL_LINE_FALLBACK[kind] || "";
// day log reviews: walked out -> the patient's parting line, a wrong tug -> the last kind's pool, else the star reviews
export const TOWEL_REVIEWS = {
  over:  ["30초 동안 기린이었어요", "목도리 사이즈가 바뀌었어요", "목이 고무줄 체험판이었어요"],
  slip:  ["수건만 세탁하고 왔어요", "수건이 저보다 먼저 퇴근했어요", "수건 마술쇼인 줄 알았어요"]
};
export function towelReview(r, rand = Math.random){
  const pick = a => a[Math.min(a.length - 1, Math.floor(rand()*a.length))];
  if(!r.stars) return (r.lines && r.lines.quit) || "다음에 다시 올게요…";
  const last = r.fails && r.fails[r.fails.length - 1];
  if(last && TOWEL_REVIEWS[last]) return pick(TOWEL_REVIEWS[last]);
  return pick(REVIEWS[r.stars] || ["다음에 다시 올게요…"]);
}

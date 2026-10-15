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

/* How far the head slides toward the therapist (m) after the tug: shoots out by STRETCH_RISE, holds trembling to
   STRETCH_HOLD (long enough to see the spine stretch on the x-ray), then springs back with a damped spring (a little
   squash past zero) and is still by STRETCH_LEN. The bone crack lands at STRETCH_HOLD, as it snaps back. */
export const STRETCH_RISE = 0.25, STRETCH_HOLD = 1.3, STRETCH_LEN = 2.3;
// the end of the stretch for a given hold (the spring back always takes STRETCH_LEN - STRETCH_HOLD)
export const stretchLen = (hold = STRETCH_HOLD) => hold + STRETCH_LEN - STRETCH_HOLD;
export function stretchProfile(t, peak, hold = STRETCH_HOLD){
  if(t <= 0 || t >= stretchLen(hold)) return 0;
  if(t < STRETCH_RISE){ const u = t/STRETCH_RISE; return peak*(1 - (1 - u)*(1 - u)); }
  if(t < hold) return peak*(1 + 0.05*Math.sin(2*Math.PI*9*(t - STRETCH_RISE)));
  const u = t - hold, len = STRETCH_LEN - STRETCH_HOLD;
  return peak*Math.exp(-4*u)*Math.cos(2*Math.PI*1.8*u)*(1 - u/len);
}
/* An over-pull (game/flow.js towelHurt "over", user: "존나 세게 잡아 당기면 치료자도 뒤로 훌러덩 넘어지게 해줘. 그러고
   나서 환자 목이랑 척추 분리되는 엑스레이", 2026-10-15): the therapist goes over backwards with his stool (FALL_HIT:
   the floor, a little bounce), then the x-ray opens at OVER_XRAY and shows the neck coming off the back (scene/xray.js);
   the long neck holds to OVER_HOLD and springs back, and he bounces back up on his stool from GETUP_AT. Seconds since
   the tug. fallProfile: 0 = sitting, 1 = flat on his back. */
export const FALL_START = 0.1, FALL_HIT = 0.75, OVER_XRAY = 1.0, OVER_HOLD = 3.4, GETUP_AT = 3.5, GETUP_LEN = 0.6;
export function fallProfile(t){
  if(t <= FALL_START) return 0;
  if(t < FALL_HIT){ const u = (t - FALL_START)/(FALL_HIT - FALL_START); return u*u*u; }       // tipping over, faster and faster
  if(t < GETUP_AT){ const u = t - FALL_HIT; return 1 - 0.08*Math.exp(-7*u)*Math.abs(Math.sin(2*Math.PI*2.5*u)); }   // bump, bump
  const u = Math.min(1, (t - GETUP_AT)/GETUP_LEN);
  return Math.max(0, (1 - u)*(1 - u)*(1 + 2*u) - 0.12*Math.sin(Math.PI*u)*u);                // springs back up, rocks past
}
/* The fists let go of the towel the moment he tips (well before the body has moved, so the arms go over with him
   instead of staying on the towel; user: "몸은 뒹구는데 팔은 수건에 붙어 있음", 2026-10-15) and take it again as he
   gets back up. 0 = holding .. 1 = let go. */
export const LETGO_LEN = 0.15;
export function letGoProfile(t){
  if(t <= FALL_START) return 0;
  if(t < GETUP_AT){ const u = Math.min(1, (t - FALL_START)/LETGO_LEN); return u*u*(3 - 2*u); }
  const u = Math.min(1, (t - GETUP_AT)/GETUP_LEN); return 1 - u*u*(3 - 2*u);
}
// while aiming, the towel's tension already draws the head this far toward the therapist (m, at full tension)
export const PREPULL = 0.015;
/* The patient slides whole toward the therapist by the stretch profile (game/loop.js), the neck keeps its length; inside,
   on the x-ray, the spine's gaps open by this share of the slide (a good tug about 3 cm, an over-pull about 7 cm). */
export const SPINE_GAIN = 0.35;
/* The x-ray spine follows the stretch (scene/xray.js): the head end moves by sm (model units), the body end stays, and
   the pull spreads over 8 gaps (skull-C1, C1-C2, six discs), so C(k+1) moves sm*(7-k)/8: C1 7/8, C7 1/8. */
export const spineOffsets = sm => Array.from({length: 7}, (_, k) => sm*(7 - k)/8);
// a disc pulled taller by gap (its rest height h) gets thinner like taffy: same volume
export function discStretch(gap, h){ const sy = 1 + Math.max(0, gap)/h; return {sy, sxz: 1/Math.sqrt(sy)}; }

// the big stamp on a wrong tug, and the day log chips
export const TOWEL_STAMP = { over: "쭈와아악?!", slip: "쏙!" };
export const TOWEL_TAG = { over: "엿가락", slip: "헛당김" };
export function towelTags(fails){
  const n = {}; (fails || []).forEach(k => { n[k] = (n[k] || 0) + 1; });
  return Object.keys(TOWEL_TAG).filter(k => n[k]).map(k => `${TOWEL_TAG[k]} ×${n[k]}`);
}
// each patient's lines: tense as the tension reaches the band, tight past the limit (once each while aiming), ok after a good tug, over when the neck goes too long, slip when the towel comes off
export const TOWEL_LINES = {
  "박대리":   {tense: "어… 목이 늘어나는 느낌인데요? 야근 수당 나오나요?", tight: "저기요 목 끊어져요?! 저 아직 할부 남았어요!",
    ok: "키 2cm 큰 것 같아요… 인사고과에 반영되나요?", over: "목이 엿가락이 됐어요! 모니터가 발밑에 있어요!", slip: "수건만 빠졌는데요…? 저 아직 거북이예요"},
  "최교수":   {tense: "흠… 경추가 늘어나는 게 느껴지는군요", tight: "잠깐! 이건 윤리위원회 통과 안 돼요!",
    ok: "경추 간격이… 논문 하나 나오겠네요", over: "목이 늘어나는 건 학계에 보고된 적이 없는데요?!", slip: "방금 건 대조군인가요?"},
  "이라이더": {tense: "오 뭔가 쭉 펴지는데요", tight: "아 잠깐잠깐 목 배송 사고 나요!",
    ok: "오 헬멧 사이즈 바꿔야겠다", over: "목이 기린이에요 기린! 신호등이 보여요!", slip: "수건 배달 완료요? 목은요?"},
  "정작가":   {tense: "…목이 한 컷 늘어나는 느낌", tight: "선생님 그거 목이에요, 고무줄 아니에요!",
    ok: "목이 3컷은 길어졌어요… 하아…", over: "작화 붕괴! 목 작화 붕괴예요!", slip: "…수건만 퇴고하셨네요"},
  "김사장":   {tense: "어허, 쭉 늘어나는구먼", tight: "어허허 이 사람아 목 뽑히겠어!",
    ok: "허허, 키가 커서 드라이버가 짧아 보이네", over: "어허허허 내 목! 내 목 어디 갔어!", slip: "자네 수건이랑 싸우나?"}
};
const TOWEL_LINE_FALLBACK = {tense: "어… 목이 늘어나는 느낌이에요", tight: "저기요 목 끊어져요?!", ok: "목이… 길어졌어요?", over: "목이 엿가락이 됐어요!", slip: "수건만 빠졌는데요?"};
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

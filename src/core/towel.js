import { clamp } from "../lib/math.js";
import { bodyOf, towelBody } from "./body.js";
import { REVIEWS } from "../patient/roster.js";
import { starPool, chooseReview } from "./personaReviews.js";

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
  const limit = Math.min(0.97, mid + half + (old ? 0.12 : 0.18));
  // the left / right focus (user: "좌우 중심 초점이 안 맞으면 목이 그쪽으로 꺾이면서 빠지고 골절되던가 금이 가는",
  // 2026-10-16): the aim's horizontal axis (S.cur.rot, degrees) has to sit on this patient's centre, a little off zero
  // as the head lies. Drawn after the tension band so the band's draws stay as they were.
  const tg = {mid, half, limit, aim: (rand()*2 - 1)*AIM_SPREAD, aimTol: tense ? AIM_TOL*0.7 : AIM_TOL};
  const b = bodyOf(p);   // core/body.js: the body type moves and narrows the band
  return b ? towelBody(tg, b.towel) : tg;
}
// degrees: half the width of the centre, how far the centre lies off zero (estimates before phone play)
export const AIM_TOL = 7, AIM_SPREAD = 8;
// how far off centre, in tolerances (|x| <= 1 is on centre)
export const aimOff = (rot, tg) => (rot - (tg.aim || 0)) / (tg.aimTol || AIM_TOL);
export const towelDist = (t, tg) => Math.abs(t - tg.mid) / tg.half;
/* "over": past the limit (the neck goes giraffe), "taut": over the band but not past the limit (a vertebra cracks; user:
   "수건 장력이 정상과 과해요 사이에 있으면 뼈금가는 소리 ... 뼈 금가는 엑스레이로", 2026-10-16; it was a slip),
   "slip": too slack (only the towel comes off), "skew": tension right
   but off centre (the neck wrenches to that side and cracks), "ok": in the band and on centre. rot defaults to the
   centre, so a call without it judges the tension alone. */
export function towelKind(t, tg, rot = tg.aim || 0){
  if(t > tg.limit) return "over";
  if(t > tg.mid + tg.half) return "taut";
  if(towelDist(t, tg) > 1) return "slip";
  return Math.abs(aimOff(rot, tg)) > 1 ? "skew" : "ok";
}
// a skewed tug: up to twice the tolerance off cracks the vertebra (1), further breaks it (2)
export const skewTier = (rot, tg) => Math.abs(aimOff(rot, tg)) > 2 ? 2 : 1;
// which wrong tugs call the ambulance: an over-pull, a crack (taut, a skew just off) and a break (a skew way off), the
// same as a clinic crack / break (2026-10-22 one rule set for all four modes: "금·골절 모두 구급차"; 2026-10-19 a towel
// crack was a pain and a retry). Only a slip is a pain and another tug.
export const towelEndsDay = (kind, tier) => kind === "over" || tier > 0;

/* How far the head slides toward the therapist (m) after the tug: shoots out by STRETCH_RISE, holds trembling to
   STRETCH_HOLD (long enough to see the spine stretch on the x-ray), then springs back with a damped spring (a little
   squash past zero) and is still by STRETCH_LEN. The bone crack lands at STRETCH_HOLD, as it snaps back. */
export const STRETCH_RISE = 0.12, STRETCH_HOLD = 1.3, STRETCH_LEN = 2.3;
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
export function fallProfile(t, getup = GETUP_AT){
  if(t <= FALL_START) return 0;
  if(t < FALL_HIT){ const u = (t - FALL_START)/(FALL_HIT - FALL_START); return u*u*u; }       // tipping over, faster and faster
  if(t < getup){ const u = t - FALL_HIT; return 1 - 0.08*Math.exp(-7*u)*Math.abs(Math.sin(2*Math.PI*2.5*u)); }   // bump, bump
  const u = Math.min(1, (t - getup)/GETUP_LEN);
  return Math.max(0, (1 - u)*(1 - u)*(1 + 2*u) - 0.12*Math.sin(Math.PI*u)*u);                // springs back up, rocks past
}
/* The fists let go of the towel the moment he tips (well before the body has moved, so the arms go over with him
   instead of staying on the towel; user: "몸은 뒹구는데 팔은 수건에 붙어 있음", 2026-10-15) and take it again as he
   gets back up. 0 = holding .. 1 = let go. */
export const LETGO_LEN = 0.15;
export function letGoProfile(t, getup = GETUP_AT){
  if(t <= FALL_START) return 0;
  if(t < getup){ const u = Math.min(1, (t - FALL_START)/LETGO_LEN); return u*u*(3 - 2*u); }
  const u = Math.min(1, (t - getup)/GETUP_LEN); return 1 - u*u*(3 - 2*u);
}
/* Since 2026-10-16 an over-pull ends the day (user: "과하게 하면 목뼈가 빠져버리면서 앰뷸런스 불러야"): the neck stays
   off the back, the therapist stays on the floor (getup = Infinity), and once the x-ray (OVER_XRAY, held OVER_XRAY_HOLD)
   has closed the ambulance is called at OVER_SIREN (s since the tug). */
export const OVER_XRAY_HOLD = 2.9, OVER_SIREN = OVER_XRAY + OVER_XRAY_HOLD + 0.3;
// while aiming, the towel's tension already draws the head this far toward the therapist (m, at full tension)
export const PREPULL = 0.015;
/* The head snaps out by the stretch profile and the body below the neck comes along only this share of it (game/loop.js),
   so the neck takes the rest (user: "목 아래는 거의 안움직이면서(조금은 움직여야돼) 목부터는 확 잡아 댕기는", 2026-10-16;
   the whole patient sliding killed the yank, the neck alone stretching 9 cm read as a tongue). */
export const BODY_SHARE = 0.15;
/* How much of a body-mesh vertex follows the neck bone (scene/realAssets.js neckColumn): t, how far down the neck column
   from the head seam (1 = its base, NECK_LEN seam radii down), r, the distance from the column's axis, R0 the seam
   radius. Only the thin column follows, linearly so the stretch spreads over its length; the trapezius slope and the
   shoulders (r >= 1.5 R0) stay on the trunk (user: "승모근이 그대로 올라오냐고.. 더 얇게 올라와야", 2026-10-16). */
export const NECK_LEN = 1.3, NECK_IN = 1.2, NECK_OUT = 1.5;
export function neckWeight(t, r, R0){
  const axial = Math.min(1, Math.max(0, (1 - t)/0.95));   // the seam ring's few mm of slope stay fully on the head
  const u = Math.min(1, Math.max(0, (r/R0 - NECK_IN)/(NECK_OUT - NECK_IN)));
  return axial*(1 - u*u*(3 - 2*u));
}
/* The whole neck draws out, not one piece of it (user: "목 뽑혀 나갈때 진짜 목이 자연스럽게 뽑혀 나가야지 ... 그것만
   길게 뽑냐", 2026-10-16): the upper neck on the head mesh (from under the jaw, HEAD_NECK_LEN seam radii, down to the
   seam) takes UPPER_SHARE of the stretch, the column on the body the rest, both linearly. */
export const HEAD_NECK_LEN = 0.7, UPPER_SHARE = 0.35;
/* As it draws out it thins like a real neck would, a little more than keeping its volume (a neck NECK_REST m long):
   a share of the
   radius, capped at PINCH; even along the neck, easing off near the jaw and the collarbones (scene/realAssets.js). */
export const NECK_REST = 0.14, PINCH = 0.5;
export const neckPinch = stretch => Math.min(PINCH, 1.5*(1 - Math.sqrt(NECK_REST/(NECK_REST + Math.max(0, stretch)))));
/* The x-ray spine follows the stretch (scene/xray.js): the head end moves by sm (model units), the body end stays, and
   the pull spreads over 8 gaps (skull-C1, C1-C2, six discs), so C(k+1) moves sm*(7-k)/8: C1 7/8, C7 1/8. */
export const spineOffsets = sm => Array.from({length: 7}, (_, k) => sm*(7 - k)/8);
// a disc pulled taller by gap (its rest height h) gets thinner like taffy: same volume
export function discStretch(gap, h){ const sy = 1 + Math.max(0, gap)/h; return {sy, sxz: 1/Math.sqrt(sy)}; }

/* How a good tug feels depends on who is on the table (user: "젊고 마른 사람들은 와 시원하다 느낌인데 나이가 있거나
   뚱뚱한 사람들은 와 시발 개 시이이밧 아 시파파학 존나를 오래 가다가 서서히 와 존나 시원햐다 느낌", 2026-10-16).
   burn (s, patient/roster.js): how long they swear first; 0 = relief right away. Steps: [ms after the tug, face, line,
   loud]; extra (ms): how much later than usual the rest of the reaction and the next patient come. */
export const TOWEL_BURN = ["아 씨이이이이…!", "개 시이이이밧…!!", "아 시파파파학…!", "끄으으아 씨…", "으아 시이이…!"];
export const TOWEL_COOL = {
  "박대리": "와… 존나 시원하다… 연차 쓴 느낌…", "최교수": "하아… 이거… 존나 시원하군요… 각주 달고 싶군요…",
  "김사장": "어허… 이거 존나 시원하구먼… 30년 묵은 게 내려가네", "이라이더": "와 시원하다!! 헬멧 벗은 느낌!",
  "정작가": "와… 시원해… 마감 끝난 느낌…",
  // 영업 일지 cast (patient/cast.js)
  "문약사": "하아… 시원하네요… 복약 지도 끝난 느낌…", "허통장": "어허… 존나 시원하구먼… 반상회 열두 번 간 목이 풀리네",
  "오인턴": "와… 시원해요… 정규직 된 느낌…", "최조교": "하아… 이거 졸업 논문 통과한 느낌…",
  "말빨": "와 여러분 이거 시원해요!! 구독 누르면 목도 풀려요!!", "송기사": "어허… 존나 시원하네… 30년 운전한 목이 풀리네",
  "곽셰프": "하아… 존나 시원하다… 불판 15년이 내려가네", "편집장": "와… 시원하네… 마감 연장해 준 느낌…",
  "서병장": "충… 성… 존나 시원합니다…", "근육왕": "오… 이건 근육으로 안 되는 시원함이야",

    "강해녀": "어허… 존나 시원하네… 바다 밑까지 풀리는구먼",
    "이마라톤": "와 시원해요!! 결승선 통과한 느낌!!",
    "사모님": "어머… 존나 시원해요… 어깨 뭉침이 다 날아가네",
    "최프로": "와… 시원하다… 홀인원 한 느낌…",
    "야알바": "와… 시원해요… 야간 수당 받은 느낌…",
    "뚝튜브": "와 시원해요… 이건 건너뛰기 없이 끝까지 볼 영상이에요",
  // body types (2026-10-23); the kid never swears (burn 0)
  "한미모": "하아… 존나 시원해요… 착륙 방송 나온 느낌…",
  "정꼬마": "우와 시원해요!! 게임 이긴 느낌!!"
};
export const towelCool = name => TOWEL_COOL[name] || "와… 시원하다…";
export const BURN_FROM = 250, COOL_AFTER = 900;
export function towelReaction(name, burn = 0){
  const ms = Math.max(0, burn)*1000;
  if(!ms) return {steps: [[400, "bliss", towelCool(name), false]], extra: 0};
  const n = Math.max(2, Math.round(burn/0.9)), gap = ms/n, steps = [];
  for(let i = 0; i < n; i++) steps.push([Math.round(BURN_FROM + i*gap), i % 2 ? "wince" : "ouch", TOWEL_BURN[i % TOWEL_BURN.length], true]);
  steps.push([BURN_FROM + ms, "dazed", "하아…", false]);
  steps.push([BURN_FROM + ms + COOL_AFTER, "bliss", towelCool(name), false]);
  return {steps, extra: ms};
}

// the big stamp on a wrong tug, and the day log chips
export const TOWEL_STAMP = { over: "쭈와아악?!", slip: "쏙!", skew: "삐끗?!", taut: "빠직?!" };
export const TOWEL_TAG = { over: "엿가락", slip: "헛당김", skew: "삐끗", taut: "금" };   // keys = dex ids t-<kind> (core/dex.js failId): keep them
// a skew is always a crack or a break (skewTier) and an ambulance: its chip says which, not a mild 삐끗 (2026-10-23 audit)
export const SKEW_TAG = { 1: "중심 금", 2: "중심 골절" };
const towelTag = (k, tier) => (k === "skew" && SKEW_TAG[tier]) || TOWEL_TAG[k];
const TAG_ORDER = ["엿가락", "헛당김", "중심 금", "중심 골절", "삐끗", "금"];
export function towelTags(fails, tiers){
  const n = {}; (fails || []).forEach((k, i) => { const tag = towelTag(k, tiers && tiers[i]); if(tag) n[tag] = (n[tag] || 0) + 1; });
  return TAG_ORDER.filter(tag => n[tag]).map(tag => tag + " ×" + n[tag]);
}
// each patient's lines: tense as the tension reaches the band, tight past the limit (once each while aiming), ok after a good tug, over when the neck goes too long, slip when the towel comes off
export const TOWEL_LINES = {
  "박대리":   {tense: "어… 목이 늘어나는 느낌인데요? 야근 수당 나오나요?", tight: "저기요 목 끊어져요?! 저 아직 할부 남았어요!",
    ok: "키 2cm 큰 것 같아요… 인사고과에 반영되나요?", over: "목이 엿가락이 됐어요! 모니터가 발밑에 있어요!", slip: "수건만 빠졌는데요…? 저 아직 거북이예요", skew: "목이 옆으로 접혔어요! 산재 처리 되나요?!", taut: "빠직 소리 났어요! 이거 연차 써야 돼요?!"},
  "최교수":   {tense: "흠… 경추가 늘어나는 게 느껴지는군요", tight: "잠깐! 이건 윤리위원회 통과 안 돼요!",
    ok: "경추 간격이… 논문 하나 나오겠네요", over: "목이 늘어나는 건 학계에 보고된 적이 없는데요?!", slip: "방금 건 대조군인가요?", skew: "이 각도는 교과서에 없어요!", taut: "방금 그 소리… 골밀도 학회에 보고하겠습니다!"},
  "이라이더": {tense: "오 뭔가 쭉 펴지는데요. 배송 중인가요", tight: "아 잠깐잠깐 목 배송 사고 나요!",
    ok: "오 헬멧 사이즈 바꿔야겠다", over: "목이 기린이에요 기린! 신호등이 보여요!", slip: "수건 배달 완료요? 목은요?", skew: "목이 커브 돌았어요! 역주행이에요!", taut: "목에서 금 갔어요! 반품 되나요?!"},
  "정작가":   {tense: "…목이 한 컷 늘어나는 느낌", tight: "선생님 그거 목이에요, 고무줄 아니에요!",
    ok: "목이 3컷은 길어졌어요… 하아…", over: "작화 붕괴! 목 작화 붕괴예요!", slip: "…수건만 퇴고하셨네요", skew: "목 작화가 옆으로 틀어졌어요!", taut: "목에 금 그어졌어요… 펜선 아니죠?"},
  "김사장":   {tense: "어허, 쭉 늘어나는구먼", tight: "어허허 이 사람아 목 뽑히겠어!",
    ok: "허허, 키가 커서 드라이버가 짧아 보이네", over: "어허허허 내 목! 내 목 어디 갔어!", slip: "자네 수건이랑 싸우나?", skew: "어허허 목이 옆으로 갔어 이 사람아!", taut: "어허 빠직? 내 목 금 갔어 이 사람아!"},
  "문약사":   {tense: "목이 한 알씩 풀리는 느낌이에요", tight: "잠깐요! 이건 용량 초과예요!",
    ok: "이건 식후 30분마다 와야겠어요", over: "과다 복용이에요! 목이 과다 복용이에요!", slip: "수건이… 변비약처럼 안 듣네요", skew: "목이 처방전처럼 흘려 쓴 글씨예요!", taut: "방금 그 소리 약국까지 들렸어요!"},
  "허통장":   {tense: "어, 쭉 늘어나는구먼. 회람판 같아", tight: "어허 이 사람 통장 목 뽑겠네!",
    ok: "허허, 이제 반상회에서 고개 들고 말하겠어", over: "아이고 내 목이 확성기만큼 늘어났네!", slip: "수건이 반상회 지각했구먼", skew: "목이 옆 동으로 갔어 이 사람아!", taut: "어허 빠직? 이건 민원 넣어야겠어!"},
  "오인턴":   {tense: "저 목 늘어나도 정규직 전환 되죠…?", tight: "자, 잠깐만요 저 인턴이에요!",
    ok: "키 커서 사원증 사진 다시 찍어야겠어요", over: "목이 회사 복도만큼 늘어났어요!", slip: "수건이… 퇴근했네요", skew: "목이 결재 라인처럼 꺾였어요!", taut: "방금 그 소리 인사팀에 들리겠어요"},
  "최조교":   {tense: "경추 간격 측정 들어갑니다…", tight: "이건 실험 프로토콜에 없어요!",
    ok: "데이터 완벽해요. 교수님이 자기 논문이라고 하시겠다", over: "목이 표준편차 밖으로 나갔어요!", slip: "방금 건 대조군으로 쓸게요", skew: "목이 이상치예요!", taut: "그 소리 녹음했어요… 졸업 못 하겠다"},
  "말빨":     {tense: "여러분 지금 목 늘어나는 중!", tight: "잠깐! 이거 방송 정지 먹어요!",
    ok: "목 길이 인증! 썸네일 각!", over: "여러분 목이 화면 밖으로 나갔어요!!", slip: "수건 플렉스 실패 ㅋㅋ", skew: "목이 옆으로 꺾임, 클립 따세요!", taut: "방금 그 소리 ASMR로 올립니다"},
  "송기사":   {tense: "어어, 목이 미터기처럼 올라가네", tight: "정차! 정차! 목 끊어져!",
    ok: "허허, 룸미러가 낮아 보이겠어", over: "내 목이 택시 지붕을 뚫었어!", slip: "수건이 하차했구먼", skew: "목이 유턴했어!", taut: "방금 그 소리, 엔진 나간 소리야"},
  "곽셰프":   {tense: "어, 목이 집게처럼 늘어나네", tight: "불 꺼! 아니 손 놔!",
    ok: "불판이 멀어 보여… 목이 펴졌어", over: "목이 꼬치가 됐어! 꼬치!", slip: "수건이 불판에서 미끄러졌네", skew: "목이 뒤집개처럼 꺾였어!", taut: "방금 그 소리, 갈비 뼈 바르는 소리야"},
  "편집장":   {tense: "흠, 원고처럼 늘어나는군", tight: "이건 분량 초과예요!",
    ok: "목 분량이 딱 맞네요. 통과", over: "목이 연재 분량을 넘었어요!", slip: "수건이 휴재했네요", skew: "목이 오탈자처럼 비뚤어졌어요!", taut: "방금 그 소리… 반려입니다"},
  "서병장":   {tense: "목이 차렷 자세로 늘어납니다!", tight: "잠깐! 이건 가혹행위입니다!",
    ok: "충성! 목이 각 잡혔습니다!", over: "목이 국기 게양대 됐습니다!", slip: "수건이 탈영했습니다!", skew: "목이 우향우 했습니다!", taut: "방금 그 소리, 소대장님께 보고합니다"},
  "근육왕":   {tense: "흡! 목 근육이 버티는 중이다", tight: "야야, 이건 내 PR 넘었어!",
    ok: "목이 1cm 벌크업됐어", over: "목이 덤벨 봉처럼 늘어났어!", slip: "수건이 내 근육에 졌네", skew: "목이 사이드 레터럴 했어!", taut: "방금 소리, 내 목 근육 찢어진 거 아니지?"},

    "강해녀":   {tense: "어어, 목이 물때처럼 늘어나네", tight: "정지! 숨 끊어져!",
      ok: "허허, 바다가 평평해졌구먼", over: "내 목이 해초가 됐어!", slip: "수건이 파도에 쓸려 갔구먼", skew: "목이 조류 따라 갔어!", taut: "방금 그 소리, 소라 깨지는 소리야"},
    "이마라톤": {tense: "목이 쭉 늘어나는 게 느껴져요", tight: "잠깐! 이건 페이스 초과예요!",
      ok: "목이 5cm 기록 단축됐어요", over: "목이 결승선 넘어갔어요!", slip: "수건이 중간에 기권했어요", skew: "목이 코스 이탈했어요!", taut: "방금 그 소리, 근육 파열음이에요?"},
    "사모님":   {tense: "어머, 목이 쑥 늘어나네", tight: "어머어머 목 끊어져요!",
      ok: "영감보다 키가 커졌어요", over: "어머 내 목이 방석 위까지 갔어요!", slip: "수건이 월급처럼 빠져나갔어요", skew: "목이 옆집 쪽으로 꺾였어요!", taut: "빠직? 우리 영감이 알면 큰일이에요"},
    "최프로":   {tense: "목이 퍼팅 라인처럼 쭉 펴져요", tight: "잠깐! 이건 OB예요!",
      ok: "목이 버디예요. 이글은 아쉽네요", over: "목이 페어웨이를 넘어갔어요!", slip: "수건이 해저드에 빠졌어요", skew: "목이 슬라이스 났어요!", taut: "방금 그 소리, 드라이버 부러지는 소리예요"},
    "야알바":   {tense: "어… 목이 야간 근무처럼 늘어나요", tight: "잠깐! 교대 시간이에요!",
      ok: "목이 퇴근한 것처럼 가벼워요", over: "목이 계산대보다 길어졌어요!", slip: "수건이 폐기됐어요", skew: "목이 바코드처럼 틀어졌어요!", taut: "방금 그 소리, 폐기 알림이에요"},
    "뚝튜브":   {tense: "목 늘어나는 중! 자막 크게 갑니다!", tight: "잠깐! 이 장면 연령 제한 걸려요!",
      ok: "목 5cm 늘었습니다! 비포 애프터 분할 화면 갑니다!", over: "목이 프레임 밖으로 나갔어요! 앵글 다시 잡아요!", slip: "수건이 빠졌어요. 이 컷은 NG 모음에 넣을게요", skew: "목이 옆으로 접혔어요, 화면 회전한 줄 알았어요", taut: "방금 소리, 효과음 아니죠? 아픈 소리죠?"},
  "한미모":   {tense: "목이 기내 통로처럼 늘어나요", tight: "잠깐! 이건 비상 탈출이에요!",
    ok: "목이 길어져서 짐칸에 손이 닿겠어요", over: "목이 활주로처럼 길어졌어요!", slip: "수건이 먼저 내렸네요", skew: "목이 옆 좌석으로 갔어요!", taut: "방금 그 소리, 블랙박스에 남았어요"},
  "정꼬마":   {tense: "우와 목이 늘어나요! 고무고무!", tight: "잠깐만요! 목 끊어지면 엄마한테 혼나요!",
    ok: "키 컸다! 이제 놀이기구 탈 수 있겠다!", over: "으앙 목이 기린 됐어요! 사진 찍어도 돼요?", slip: "수건만 빠졌어요. 다시 해요!", skew: "목이 옆으로 갔어요! 버그예요!", taut: "빠직 소리 났어요… 엄마한테 이를 거예요"},
};
const TOWEL_LINE_FALLBACK = {tense: "어… 목이 늘어나는 느낌이에요", tight: "저기요 목 끊어져요?!", ok: "목이… 길어졌어요?", over: "목이 엿가락이 됐어요!", slip: "수건만 빠졌는데요?", skew: "목이 옆으로 꺾였어요!", taut: "목에서 빠직 했어요!"};
export const towelLine = (name, kind) => (TOWEL_LINES[name] || TOWEL_LINE_FALLBACK)[kind] || TOWEL_LINE_FALLBACK[kind] || "";
// day log reviews: walked out -> the patient's parting line, a wrong tug -> the last kind's pool, else the star reviews
export const TOWEL_REVIEWS = {
  over:  ["30초 동안 기린이었어요", "목도리 사이즈가 바뀌었어요", "목이 고무줄 체험판이었어요"],
  slip:  ["수건만 세탁하고 왔어요", "수건이 저보다 먼저 퇴근했어요", "수건 마술쇼인 줄 알았어요"],
  skew:  ["목이 옆으로 접혀서 구급차 탔어요", "삐끗 한 번에 응급실 직행", "수건 하나로 깁스까지 했어요"],
  taut:  ["빠직 소리 듣고 구급차 탔어요", "목에 금 가서 깁스 렌탈 중", "조금만 덜 당겼어도 됐을 텐데요"]
};
export function towelReview(r, rand = Math.random, used = null){
  const pick = a => chooseReview(a, used, rand);
  if(!r.stars && !r.ambulance) return (r.lines && r.lines.quit) || "다음에 다시 올게요…";
  const last = r.fails && r.fails[r.fails.length - 1];
  if(last && TOWEL_REVIEWS[last]) return pick(TOWEL_REVIEWS[last]);
  return pick(starPool(r.name, r.stars, REVIEWS[r.stars] || ["다음에 다시 올게요…"]));
}

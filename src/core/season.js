/* 계절 손님 (2026-10-22, user goal "스토리를 늘려 플레이타임 20시간", Papa's 시리즈의 계절 이벤트 참고): the season of the year
   (KST calendar: 봄 3~5월, 여름 6~8월, 가을 9~11월, 겨울 12~2월) brings four short episodes in which the first chapter's
   regulars come dressed for the season. Only the current season can be played; the others show "???" and a count. An
   episode has the same shape as a 단골 의뢰 (game, patients, painMax, mods, beat, intro, outro, lines) and runs on the same
   rules, so nothing new is judged. Each carries exactly ONE constraint (rule, the names are core/quests.js RULE_NAME);
   episode N+1 needs episode N cleared. 목꺾기·목뽑기 only, and only the 1장 regulars (the chip opens once 1장 is cleared, so
   no later-chapter face is spoiled). Clearing all four of a season pays 진료비 once (SEASON_BONUS). New models and props:
   none, the regulars keep their bodies and wear the season's existing toy props (scene/castProps.js) and gown colour.
   Pure: no DOM, no three. The glue is game/seasonFlow.js, the cards are ui/season.js.
   Record: localStorage "chiroSeason" = {eps: {id: stars}, bonus: {spring: 1, ...}} (its own key; chiroCampaign is untouched). */
import { STAR_CUTS, cutShift, dayClears, dayStars } from "./campaign.js";
import { QUEST_GAP } from "./quests.js";

export const SEASON_KEY = "chiroSeason";
export const SEASON_UNLOCK = 7;     // campaign days cleared (the end of 1장) before the chip shows
export const SEASON_BONUS = 80;     // 진료비 once per season, when all four episodes are cleared (a run pays ~90-110, the cap is 160)
export const SEASON_IDS = ["spring", "summer", "autumn", "winter"];
export const SEASON_NAME = { spring: "봄", summer: "여름", autumn: "가을", winter: "겨울" };
/* the season's look on the borrowed bodies: gown colour (realistic shirt too) and toy props that already exist in scene/castProps.js */
export const SEASON_DRESS = {
  spring: { gown: 0xf2c4d2, props: ["glassesBig"] },
  summer: { gown: 0x4fc3dc, props: ["glassesGold", "headband"] },
  autumn: { gown: 0xd9893a, props: ["headband"] },
  winter: { gown: 0x7f9fd6, props: ["topknot"] }
};
export const RULE_NAME = { tight: "좁은 구역", noisy: "숨 안내 없음", pain1: "통증 1번", pain2: "통증 2번", beat: "평균 점수", many: "네 명 연속" };

export const seasonOpen = prog => !!prog && prog.cleared >= SEASON_UNLOCK;
/* the season of a moment (KST month) */
export function seasonOf(ms = Date.now()){
  const m = new Date(ms + 9 * 3600000).getUTCMonth() + 1;
  return m >= 3 && m <= 5 ? "spring" : m >= 6 && m <= 8 ? "summer" : m >= 9 && m <= 11 ? "autumn" : "winter";
}
/* the forced season of a test/case build ("?season=winter"); anything else is ignored */
export const parseSeason = s => SEASON_IDS.includes(s) ? s : null;

function build(season, no, title, game, patients, rule, intro, outro, who, line){
  const e = {
    id: `${season}${no}`, season, no, title, game, patients, rule, zone: 0, intro, outro, lines: { [who]: line },
    painMax: rule === "pain1" ? 1 : rule === "pain2" ? 2 : 3
  };
  if(rule === "tight") e.mods = { tight: true };
  if(rule === "noisy") e.mods = { noisy: true };
  if(rule === "beat") e.beat = Math.round(STAR_CUTS.three + cutShift(e) - QUEST_GAP);
  return e;
}
const E = build;

export const SEASON_EPS = [
  // 봄
  E("spring", 1, "꽃가루 경보", "clinic", ["박대리"], "noisy",
    ["창밖에 노란 가루가 눈처럼 내려요.", "박대리는 재채기 열두 번에 목이 접혔어요.", "재채기 소리에 숨 안내가 안 들려요. 가슴을 보고 맞춰요."],
    "박대리: 코는 막혔는데 목은 뚫렸어요. 이 균형이 맞는 건가요.", "박대리", "에취! 죄송해요 에취! 목 먼저요 에취!"),
  E("spring", 2, "벚꽃 소풍", "towel", ["정작가", "허통장"], "tight",
    ["정작가가 벚꽃 아래서 스케치하다 고개가 굳었어요.", "허통장은 전단지를 나눠 주다 같이 굳었어요.", "당길 구역이 좁아요. 꽃잎 하나 떨어지는 속도로 당겨요."],
    "허통장: 전단지가 꽃잎인 줄 알고 다들 받아 갔어요. 정작가는 그 장면을 그렸어요.", "정작가", "꽃잎 떨어지는 각도로 부탁해요. 아니, 그건 너무 느린가"),
  E("spring", 3, "봄 이사철", "clinic", ["문약사", "최교수", "이라이더"], "beat",
    ["이사철이라 다들 박스를 들고 왔어요.", "박스 안은 책, 약, 헬멧이에요. 제일 무거운 건 목이에요.", "평균 점수가 기준을 넘어야 짐을 내려놓아요."],
    "이라이더: 이삿짐 센터보다 빠르네요. 근데 짐은 안 날라 주나요.", "문약사", "약 박스 옮기다 목이 먼저 이사 갔어요. 위치가 이상해요"),
  E("spring", 4, "꽃가루 대폭발", "clinic", ["박대리", "정작가", "문약사", "허통장"], "many",
    ["꽃가루 농도가 역대급이래요. 대기실이 노랗게 변했어요.", "단골 넷이 마스크를 두 겹씩 쓰고 줄을 섰어요.", "네 명 연속이에요. 재채기는 쉬는 시간에 해요."],
    "단골 단톡방: '봄은 갔고 목은 남았다'. 간판 위에 노란 가루가 한 줌 앉아 있어요.", "허통장", "마스크 두 장 쓰면 목도 두 배로 굳어요. 계산이 그래요"),
  // 여름
  E("summer", 1, "해변 수박 깨기", "towel", ["이라이더"], "pain1",
    ["이라이더가 해변에서 수박 깨기를 하다 눈 가린 채 목을 돌렸어요.", "수건을 당겨 풀어요. 수박은 아무 잘못이 없어요.", "한 번 삐끗하면 수박이 대신 깨져요."],
    "이라이더: 수박은 박살, 목은 무사! 헬멧 쓰고 수박 깼으면 더 안전했을 거예요.", "이라이더", "눈 가리고 돌았더니 방향 감각이 사라졌어요. 목만 방향이 확실해요"),
  E("summer", 2, "냉방병 대기실", "clinic", ["최교수", "박대리"], "noisy",
    ["에어컨이 최강이라 대기실이 겨울이에요.", "송풍 소리가 커서 숨 안내가 안 들려요.", "둘 다 담요를 둘러쓰고 왔어요. 목만 빼꼼 나왔어요."],
    "박대리: 목이 풀리니까 땀이 나요. 이제 에어컨이 고맙네요. 아까는 원망했는데요.", "최교수", "냉방병 논문을 쓰려다 제가 사례가 됐습니다"),
  E("summer", 3, "열대야 야시장", "clinic", ["정작가", "김사장"], "tight",
    ["열대야라 잠을 못 자서 둘이 야시장에서 만났어요.", "건물주 김사장은 부채를 들고 정작가는 빙수를 들었어요.", "더워서 손이 흔들려요. 구역이 좁아요."],
    "김사장: 빙수값은 월세에서 깎겠네. 자네 손이 시원하구먼. 땀은 나지만.", "김사장", "열대야엔 건물주도 못 자네. 에어컨은 임차인이 꺼 놨나"),
  E("summer", 4, "해수욕장 총출동", "towel", ["박대리", "이라이더", "문약사", "허통장"], "many",
    ["단골 넷이 튜브를 끼고 해수욕장에서 단체로 굳었어요.", "수건이 파도처럼 줄을 섰어요. 모래가 신발에 가득해요.", "네 명 연속이에요. 쉬는 시간엔 썬크림만 발라요."],
    "해수욕장 후기: '파도 소리에 뼈 소리가 묻혔다'. 별점 5점, 모래는 별점에서 빠졌어요.", "문약사", "썬크림 처방은 제가 해요. 수건 처방도 제가 받을게요"),
  // 가을
  E("autumn", 1, "가을 운동회", "clinic", ["이라이더", "허통장"], "pain2",
    ["동네 운동회에서 이어달리기를 하다 둘이 같이 접질렸어요.", "박 터뜨리기 하다 목이 터질 뻔했어요.", "두 번 삐끗하면 응원단장이 심판을 불러요."],
    "허통장: 우승은 청팀. 우리는 파란 수건 두 장 받고 왔어요. 목은 홍팀 것 같아요.", "이라이더", "헬멧 쓰고 달렸더니 반칙이래요. 목은 반칙 아닌데요"),
  E("autumn", 2, "단풍 전망대", "towel", ["김사장"], "tight",
    ["단풍 전망대에서 사진 찍다 고개가 꺾였어요.", "김사장은 인증샷 각도에 목숨을 걸었어요.", "구역이 좁아요. 단풍잎 한 장 두께만큼 정확해요."],
    "김사장: 사진은 망쳤는데 목은 살았구먼. 단풍이 알아서 나와 줬네.", "김사장", "이 각도가 월세 뽑는 각도야. 목만 아니면"),
  E("autumn", 3, "추석 귀성길", "clinic", ["박대리", "문약사", "정작가"], "beat",
    ["귀성길 12시간 운전 끝에 셋이 한 차로 왔어요.", "차 안에서 목을 안 돌려서 같은 방향으로 굳었어요.", "평균 점수가 기준을 넘어야 송편을 먹을 수 있어요."],
    "정작가: 송편 먹으면서 그렸어요. 제 목이 추석 보름달처럼 돌았어요.", "정작가", "고속도로에서 고개를 못 돌렸어요. 앞만 봤어요. 앞만요"),
  E("autumn", 4, "운동회 결승전", "clinic", ["이라이더", "박대리", "최교수", "김사장"], "many",
    ["운동회 결승 전에 네 명이 몰려왔어요.", "청팀 홍팀 가리지 않아요. 목은 한 팀이에요.", "네 명 연속이에요. 호루라기는 우리가 불어요."],
    "운동회 방송: '종합 우승, 뚝 카이로 클리닉'. 접수받은 적이 없는데 상패가 왔어요.", "최교수", "결승 전략을 논문으로 냈는데 반응이 없어요. 목으로 갚겠습니다"),
  // 겨울
  E("winter", 1, "김장 품앗이", "clinic", ["문약사", "허통장"], "tight",
    ["김장 배추 백 포기를 절이다 둘이 허리 숙인 채 굳었어요.", "빨간 장갑이 아직 손에 붙어 있어요.", "손이 얼어서 구역이 좁아요."],
    "허통장: 김치 한 통 두고 가요. 목도 같이 익었는지 확인 좀 해 주세요.", "문약사", "배추 절이다 목도 절여졌어요. 간이 세요"),
  E("winter", 2, "눈썰매장", "towel", ["이라이더"], "pain1",
    ["이라이더가 눈썰매 맨 앞에서 목부터 박았어요.", "헬멧 위에 눈이 쌓여서 아무도 못 알아봤어요.", "한 번 삐끗하면 썰매가 한 바퀴 더 돌아요."],
    "이라이더: 썰매 최고 기록, 목 최저 기록! 이제 눈도 내 편이에요. 그건 아닌가.", "이라이더", "헬멧 안에 눈 들어갔어요. 목은 그것보다 시려요"),
  E("winter", 3, "연말 회식 후유증", "clinic", ["박대리", "최교수", "김사장"], "beat",
    ["연말 회식 3차를 다녀온 셋이 같은 방향으로 굳었어요.", "잔을 같은 쪽 손으로 들어서 목이 한쪽으로 기울었어요.", "평균 점수가 기준을 넘어야 건배를 해요."],
    "박대리: 건배! 목은 맞췄고 내일 아침은 못 맞춰요. 숙취는 접수 안 받는다고요.", "박대리", "건배를 너무 오른쪽으로 했어요. 오른쪽만 계속 했어요"),
  E("winter", 4, "첫눈 총출동", "clinic", ["박대리", "이라이더", "정작가", "김사장"], "many",
    ["첫눈 오는 날 단골 넷이 눈을 털며 들어왔어요.", "눈사람 만들다 고개가 눈사람처럼 굳었대요.", "네 명 연속이에요. 눈 녹은 바닥은 미끄러워요."],
    "단톡방: '올해도 뚝에서 끝'. 눈사람이 간판 앞에서 이쪽을 보고 있어요. 목이 없는 눈사람이에요.", "정작가", "눈사람 목은 안 돌아가요. 저는 돌아가게 해 주세요")
];

export const episodesOf = season => SEASON_EPS.filter(e => e.season === season);
const byId = id => SEASON_EPS.find(e => e.id === id);

/* ---- the record ---- */
export function readSeasonRec(raw){
  const eps = {}, bonus = {};
  if(raw && typeof raw === "object"){
    for(const e of SEASON_EPS){ const s = raw.eps && raw.eps[e.id] | 0; if(s > 0) eps[e.id] = Math.min(3, s); }
    for(const id of SEASON_IDS) if(raw.bonus && raw.bonus[id]) bonus[id] = 1;
  }
  return { eps, bonus };
}
export const epStars = (rec, e) => Math.max(0, Math.min(3, (rec.eps && rec.eps[e.id]) | 0));
/* episode N opens when N-1 is cleared (episode 1 is always open) */
export const epOpen = (rec, e) => e.no === 1 || epStars(rec, byId(`${e.season}${e.no - 1}`)) > 0;
export const seasonCleared = (rec, season) => episodesOf(season).filter(e => epStars(rec, e) > 0).length;
export const seasonDone = (rec, season) => seasonCleared(rec, season) === episodesOf(season).length;
/* a cleared episode keeps its best stars; a miss changes nothing */
export function afterEp(rec, e, cleared, stars){
  if(!cleared) return rec;
  return { ...rec, eps: { ...rec.eps, [e.id]: Math.max(epStars(rec, e), Math.min(3, stars | 0)) } };
}
/* the all-four bonus: due once per season, when the record has just become complete */
export const bonusDue = (rec, season) => seasonDone(rec, season) && !rec.bonus[season];
export const payBonus = (rec, season) => ({ ...rec, bonus: { ...rec.bonus, [season]: 1 } });

export const epClears = (e, complete, avg) => dayClears(-1, complete, avg, e);
export const epStarsOf = (e, avg) => dayStars(avg, e);

/* the episode's patients from the roster, in order, with the episode's start line and the season's dress */
export function seasonRoster(i, roster){
  const e = SEASON_EPS[i], dress = SEASON_DRESS[e.season];
  return e.patients.map(name => {
    const p = roster.find(r => r.name === name);
    if(!p) throw new Error("no patient " + name);
    const start = e.lines && e.lines[name];
    const look = { ...p.look, gown: dress.gown, realGown: true, props: [...new Set([...(p.look.props || []), ...dress.props])] };
    return { ...p, look, lines: start ? { ...p.lines, start } : p.lines };
  });
}

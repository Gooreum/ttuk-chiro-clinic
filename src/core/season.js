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
  // 봄: 노란 가루의 출처를 쫓는다 (박대리 사무실 화분 -> 이삿짐 -> 대기실 -> 창가)
  E("spring", 1, "꽃가루 경보", "clinic", ["박대리"], "noisy",
    ["창밖에 노란 가루가 눈처럼 내려요.", "박대리는 재채기 열두 번에 목이 접혔어요.", "재채기 소리에 숨 안내가 안 들려요. 가슴을 보고 맞춰요."],
    "박대리: 가루가 우리 사무실에서만 유난히 심해요. 책상 위 선물 화분이 수상해요. 누가 보냈는지 카드가 없어요.", "박대리", "에취! 죄송해요 에취! 목 먼저요 에취!"),
  E("spring", 2, "벚꽃 소풍", "towel", ["정작가", "허통장"], "tight",
    ["박대리가 말한 수상한 화분 얘기를 듣고 정작가가 소풍 겸 탐문에 나섰어요.", "정작가는 벚꽃 아래서 화분 몽타주를 그리다 고개가 굳었고, 허통장은 전단지를 나눠 주다 같이 굳었어요.", "당길 구역이 좁아요. 꽃잎 하나 떨어지는 속도로 당겨요."],
    "허통장: 전단지 뒷면에 몽타주를 복사했더니 다들 받아 갔어요. 화분을 보낸 사람은 약국 쪽 번호라던데요.", "정작가", "꽃잎 떨어지는 각도로 부탁해요. 아니, 그건 너무 느린가"),
  E("spring", 3, "봄 이사철", "clinic", ["문약사", "최교수", "이라이더"], "beat",
    ["약국 쪽 번호라는 말에 문약사가 먼저 걸렸어요.", "이삿짐 박스에 책, 약, 헬멧, 가루 묻은 화분이 섞여 있어요.", "평균 점수가 기준을 넘어야 짐을 내려놓아요."],
    "이라이더: 이삿짐 센터보다 빠르네요. 근데 화분이 우리 쪽 트럭에 실려 왔어요. 지금 대기실 구석에 있어요.", "문약사", "약 박스 옮기다 목이 먼저 이사 갔어요. 화분은 제 책임 아니에요"),
  E("spring", 4, "꽃가루 대폭발", "clinic", ["박대리", "정작가", "문약사", "허통장"], "many",
    ["대기실 구석 화분이 만개했어요. 꽃가루 농도가 역대급이라 대기실이 노랗게 변했어요.", "단골 넷이 마스크를 두 겹씩 쓰고 줄을 섰어요. 범인은 화분이에요.", "네 명 연속이에요. 재채기는 쉬는 시간에 해요."],
    "단톡방: '화분은 창가로 옮겼고 가루는 멈췄다. 봄 끝.' 간판 앞에 노란 꽃이 한 송이 피어 있어요. 카드는 끝내 없었어요.", "허통장", "마스크 두 장 쓰면 목도 두 배로 굳어요. 화분 범인 잡은 건 저예요"),
  // 여름: 못 깬 수박 한 통의 행방 (해변 -> 대기실 냉장고 -> 야시장 빙수 -> 해수욕장)
  E("summer", 1, "해변 수박 깨기", "towel", ["이라이더"], "pain1",
    ["이라이더가 해변에서 수박 깨기를 하다 눈 가린 채 목을 돌렸어요.", "수건을 당겨 풀어요. 수박은 한 통이 안 깨지고 남았어요.", "한 번 헛당기면 남은 수박도 깨져요."],
    "이라이더: 수박은 한 통 살았고 목도 무사! 이 수박, 상하기 전에 대기실 냉장고에 맡겨도 되죠.", "이라이더", "눈 가리고 돌았더니 방향 감각이 사라졌어요. 목만 방향이 확실해요"),
  E("summer", 2, "냉방병 대기실", "clinic", ["최교수", "박대리"], "noisy",
    ["에어컨이 최강이라 대기실이 겨울이에요. 냉장고에는 이라이더의 수박이 한 통 들어 있어요.", "송풍 소리가 커서 숨 안내가 안 들려요.", "최교수는 대기실이 추운 원인이 수박일 거라는 가설을 세우고 담요를 둘렀어요."],
    "박대리: 목이 풀리니까 땀이 나요. 수박 냉기설은 틀렸고 에어컨 탓이래요. 수박은 야시장에서 찾는다고 가져갔어요.", "최교수", "냉방병 논문을 쓰려다 제가 사례가 됐습니다. 수박은 무죄입니다"),
  E("summer", 3, "열대야 야시장", "clinic", ["정작가", "김사장"], "tight",
    ["열대야라 잠을 못 자서 둘이 야시장에서 만났어요. 빙수집 사장이 수박 한 통만 달라고 애원 중이에요.", "김사장은 부채를 들고 정작가는 간판 그림을 그렸어요. 수박은 빙수 그릇이 됐어요.", "더워서 손이 흔들려요. 구역이 좁아요."],
    "김사장: 빙수 그릇이 수박이라 값을 세 배 받더구먼. 남은 건 해수욕장 파티로 가져간다네.", "김사장", "열대야엔 누구도 못 자네. 수박 빙수는 잘 넘어가는데 목은 안 넘어가"),
  E("summer", 4, "해수욕장 총출동", "towel", ["박대리", "이라이더", "문약사", "허통장"], "many",
    ["단골 넷이 튜브를 끼고 해수욕장에서 수박 빙수 파티를 열다 단체로 굳었어요.", "수건이 파도처럼 줄을 섰어요. 모래가 신발에 가득해요.", "네 명 연속이에요. 쉬는 시간엔 썬크림만 발라요."],
    "해수욕장 후기: '수박 한 통이 여름을 다 건너왔다'. 이라이더가 씨 하나를 간판 앞 화분 흙에 심었어요.", "문약사", "썬크림 처방은 제가 해요. 수건 처방도 제가 받을게요"),
  // 가을: 운동회 결승 소집령 (이어달리기 -> 현수막 -> 송편 내기 -> 결승)
  E("autumn", 1, "가을 운동회", "clinic", ["이라이더", "허통장"], "pain2",
    ["동네 운동회에서 이어달리기를 하다 둘이 같이 접질렸어요.", "박 터뜨리기 하다 목이 터질 뻔했어요.", "두 번 삐끗하면 응원단장이 심판을 불러요."],
    "허통장: 예선 탈락인데 심판이 '결승은 단풍 질 때'라며 봉투를 줬어요. 봉투는 아직 안 열었어요.", "이라이더", "헬멧 쓰고 달렸더니 반칙이래요. 목은 반칙 아닌데요"),
  E("autumn", 2, "단풍 전망대", "towel", ["김사장"], "tight",
    ["단풍 전망대에서 사진 찍다 고개가 꺾였어요. 사진 한쪽에 운동회 결승 현수막이 찍혔어요.", "김사장은 인증샷 각도에 목숨을 걸었어요.", "구역이 좁아요. 단풍잎 한 장 두께만큼 정확해요."],
    "김사장: 사진은 망쳤는데 현수막은 건졌구먼. 결승은 추석 직후라네. 허통장 봉투가 초대장일세.", "김사장", "이 각도가 인증샷 각도야. 목만 아니면"),
  E("autumn", 3, "추석 귀성길", "clinic", ["박대리", "문약사", "정작가"], "beat",
    ["귀성길 12시간 운전 끝에 셋이 한 차로 왔어요. 차 안에는 결승 초대장 봉투가 굴러다녀요.", "차 안에서 목을 안 돌려서 같은 방향으로 굳었어요.", "평균 점수가 기준을 넘어야 송편을 먹을 수 있어요."],
    "정작가: 송편 먹으면서 봉투를 열어 봤어요. 결승 출전 신청서래요. 접수처가 우리 클리닉으로 적혀 있어요.", "정작가", "고속도로에서 고개를 못 돌렸어요. 앞만 봤어요. 앞만요"),
  E("autumn", 4, "운동회 결승전", "clinic", ["이라이더", "박대리", "최교수", "김사장"], "many",
    ["신청서대로 클리닉이 결승에 출전하게 됐어요. 네 명이 목을 풀러 몰려왔어요.", "청팀 홍팀 가리지 않아요. 목은 한 팀이에요.", "네 명 연속이에요. 호루라기는 우리가 불어요."],
    "운동회 방송: '종합 우승, 뚝 카이로 클리닉'. 접수한 적 없다던 신청서는 정작가가 그림으로 낸 거였어요. 상패는 대기실 선반에 올라갔어요.", "최교수", "결승 전략을 논문으로 냈는데 반응이 없어요. 목으로 갚겠습니다"),
  // 겨울: 김치 한 통의 겨울나기 (김장 -> 썰매 -> 회식 -> 첫눈)
  E("winter", 1, "김장 품앗이", "clinic", ["문약사", "허통장"], "tight",
    ["김장 배추 백 포기를 절이다 둘이 고개 숙인 채 목이 굳었어요.", "빨간 장갑이 아직 손에 붙어 있어요.", "손이 얼어서 구역이 좁아요."],
    "허통장: 김치 한 통 두고 가요. 첫눈 오는 날 열어야 맛이 든대요. 그때까지 아무도 열지 마세요.", "문약사", "배추 절이다 목도 절여졌어요. 간이 세요"),
  E("winter", 2, "눈썰매장", "towel", ["이라이더"], "pain1",
    ["이라이더가 눈썰매 맨 앞에서 목부터 박았어요. 썰매 뒤에는 김치 한 통이 묶여 있어요.", "김치는 눈 속에 묻어 두면 잘 익는대요. 헬멧 위에 눈이 쌓여서 아무도 못 알아봤어요.", "한 번 헛당기면 썰매가 한 바퀴 더 돌아요."],
    "이라이더: 썰매 최고 기록, 목 최저 기록! 김치는 눈 속에 묻고 왔어요. 첫눈 전까진 안 열어요.", "이라이더", "헬멧 안에 눈 들어갔어요. 목은 그것보다 시려요"),
  E("winter", 3, "연말 회식 후유증", "clinic", ["박대리", "최교수", "김사장"], "beat",
    ["연말 회식 3차를 다녀온 셋이 같은 방향으로 굳었어요.", "3차 안주 얘기에 눈 속 김치가 거론됐어요.", "평균 점수가 기준을 넘어야 건배를 해요."],
    "박대리: 건배! 김치는 입맛만 다시고 참았어요. 눈 속에서 꺼내는 건 정말 첫눈 때래요.", "박대리", "건배를 너무 오른쪽으로 했어요. 오른쪽만 계속 했어요"),
  E("winter", 4, "첫눈 총출동", "clinic", ["박대리", "이라이더", "정작가", "김사장"], "many",
    ["첫눈 오는 날 단골 넷이 눈을 털며 들어왔어요. 눈 속에서 파낸 김치 통도 같이 왔어요.", "눈사람 만들다 고개가 눈사람처럼 굳었대요.", "네 명 연속이에요. 눈 녹은 바닥은 미끄러워요."],
    "단톡방: '김치 개봉, 맛 합격'. 간판 앞 눈사람은 목이 없어서 배추잎 목도리를 두르고 이쪽을 보고 있어요.", "정작가", "눈사람 목은 안 돌아가요. 저는 돌아가게 해 주세요")
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

/* 장 막간 (user goal "스토리를 늘려 플레이타임 20시간", 2026-10-22; Papers Please's between-day newspaper, Good Pizza's
   text-message beats): after a chapter's boss is first beaten, the next chapter's first day shows one short card before
   its story card. Each card closes the last chapter's result and plants the next chapter's hook, as a small made-up
   document (동네 신문, 단톡방, 팩스, 엽서 ...). Pure data and helpers: no DOM, no three. Seen chapters live in
   localStorage "chiroCampaign".seen = [chapter numbers] (core/campaign.js readProgress keeps it; old saves have none). */
import { DAYS, dayOpen } from "./campaign.js";

/* before: the chapter this card opens. form: what the card pretends to be. lines: 3-5, one sentence each. */
export const INTERLUDES = [
  {before: 2, form: "동네 신문 1면", title: "월세 동결, 맞은편엔 현수막",
   lines: ["뚝 카이로 클리닉이 개업 일주일 만에 월세를 동결했다.", "건물주 김사장은 '손이 좋고 목이 가벼워졌다'고 밝혔다.", "한편 길 건너 빈 점포에 '반듯 정골원' 현수막이 걸렸다. 글씨는 우리 간판의 세 배다.", "단골 박대리는 의리를 지키겠다며 현수막 사진을 세 장 찍었다."]},
  {before: 3, form: "단톡방 '수요일 합동'", title: "침대는 내 걸 쓰게",
   lines: ["강직한: 후배님, 수요일마다 가겠네. 허리 침대도 가져가지.", "원장: 간판은요?", "강직한: 간판은 내 게 더 크네. 침대는 허리용이고.", "모르는 번호: 허리 코너 생긴다며? 우리 헬스장 회원 허리가 줄줄이 나갔어. 난 아직 멀쩡해.", "박대리: 1호 손님은 제가 할게요. 의리로요."]},
  {before: 4, form: "해수욕장 관리소 팩스", title: "파라솔 아래 임시 진료소",
   lines: ["수신: 뚝 카이로 클리닉. 발신: 해수욕장 관리소.", "근육왕 회원님들이 칭찬이 자자하셔서 파라솔 한 칸을 비워 둡니다.", "모래는 알아서 털고 오세요. 파도 소리가 커서 안내 방송은 못 합니다.", "팩스 맨 아래에 낡은 효자손 그림과 '뚝' 글자가 손으로 그려져 있다.", "원장은 근육왕 말대로 팔굽혀펴기를 두 개 했다. 두 번째에서 팩스를 놓쳤다."]},
  {before: 5, form: "소라가 든 소포", title: "간판이 한 뼘 내려앉았다",
   lines: ["강해녀가 소라 세 개를 보냈다. 간판에 달면 무겁다는 경고문이 붙어 있다.", "소라 밑에서 학회 초청장이 나왔다. 후원사 칸에 '메가 척추그룹' 도장이 찍혀 있다.", "사모님 쪽지: 소라 간판은 끈을 양쪽으로 다세요. 한쪽만 달면 기울어요.", "원장은 소라를 간판에 달았다. 간판이 한 뼘 내려앉았다."]},
  {before: 6, form: "학회 소식지 부록 3면", title: "박수 소리가 컸던 발표",
   lines: ["'목은 왜 뚝 소리가 나는가' 발표에 심사위원 전원이 박수를 보냈다.", "최교수 소감: 질문하고 싶었는데 박수가 먼저 나왔다.", "이날 유일하게 발표를 촬영한 사람은 구독자 3천 명의 뚝튜브다.", "최프로는 우리 건물 지하 계단에서 효자손을 든 노인을 봤다고 한다. 확인되지 않았다.", "후원사 메가 척추그룹은 '다음 호에 또 뵙겠다'고 남겼다."]},
  {before: 7, form: "실시간 검색어", title: "3위 원장, 5위 메가 허리",
   lines: ["3위 뚝 카이로 클리닉 원장.", "4위 반듯 정골원. 5위 메가 허리.", "댓글 절반은 같은 건물 와이파이에서 달렸다. 구청 민원도 같은 와이파이로 들어왔다.", "구청 알림: 위생 감사 시즌 시작. 담당은 개업 때 다녀간 나공무 점검관.", "뚝튜브: 감사도 생방송 할까요? 원장: 안 돼요."]},
  {before: 8, form: "청결 인증서 뒷면", title: "액자 뒤에서 떨어진 명함",
   lines: ["인증서 번호 0001. 발급인 나공무.", "뒷면 메모: 제 목은 괜찮아졌습니다. 지하 계단의 효자손 노인은 점검하지 못했습니다.", "강직한 쪽지: 스티커 뗐네. 간판 옆이 허전하긴 하군.", "액자 뒤에서 명함이 떨어졌다. '메가 척추그룹 회장, 직접 방문 예정'."]}
];

export const interludeOf = ch => INTERLUDES.find(i => i.before === ch) || null;
/* the card to show before a day's story: only the first day of a chapter has one */
export function interludeForDay(day){
  const d = DAYS[day];
  if(!d || DAYS.findIndex(x => x.ch === d.ch) !== day) return null;
  return interludeOf(d.ch);
}
export const interludeSeen = (prog, ch) => !!(prog.seen && prog.seen.includes(ch));
/* open once the chapter's first day is open (its boss was cleared) */
export const interludeOpen = (prog, ch) => !!interludeOf(ch) && dayOpen(prog, DAYS.findIndex(d => d.ch === ch));
export function markInterludeSeen(prog, ch){
  if(interludeSeen(prog, ch)) return prog;
  return {...prog, seen: [...(prog.seen || []), ch].sort((a, b) => a - b)};
}

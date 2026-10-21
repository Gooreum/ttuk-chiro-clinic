/* 영업 일지 (campaign, user 2026-10-21 "이거 이제 스토리를 늘리거나 뭐 해야할거아냐"): the clinic's first week.
   Rent is due on day 7 and the last patient turns out to be the landlord. Each day fixes the game (목꺾기 clinic /
   목뽑기 towel), who comes in and in what order, how many pains close the clinic (painMax), how many patients get the
   green-zone hint (zone), and story lines: intro (the card before the day), outro (after a cleared day), lines (a
   patient's start line on that day, for regulars coming back). Pure: no DOM, no three. Progress lives in
   localStorage "chiroCampaign" ({cleared: day count, stars: [per day]}), read and written by game/flow.js. */
export const DAYS = [
  {title:"개업 첫날", game:"clinic", patients:["박대리", "이라이더"], painMax:3, zone:2,
   intro:["뚝 카이로 클리닉, 오늘 문 열었어요.", "월세는 일주일 뒤에 내야 해요.", "첫 손님 두 명. 망치면 소문 다 나요."],
   outro:"첫날 매출 두 건. 박대리가 단톡방에 후기를 올렸대요."},
  {title:"입소문", game:"clinic", patients:["정작가", "최교수", "박대리"], painMax:3, zone:1,
   intro:["단톡방 후기 보고 손님이 왔어요.", "박대리도 또 왔어요. 이번엔 팀장 욕을 하면서요.", "구역 안내는 첫 손님에게만 보여요."],
   outro:"정작가가 웹툰에 클리닉을 그렸대요. 원장 얼굴이 좀 이상하게 나왔어요.",
   lines:{"박대리":"또 왔어요. 팀장이 제 목을 또 꺾어 놨어요"}},
  {title:"중고 수건", game:"towel", patients:["이라이더", "정작가", "최교수"], painMax:3, zone:2,
   intro:["중고 거래로 목욕 수건을 샀어요.", "오늘은 수건으로 목을 뽑아 봐요.", "너무 세게 당기면 원장이 넘어져요."],
   outro:"수건 두 장째 구입. 판매자가 '어디 쓰세요?'라고 물었어요."},
  {title:"위생 점검", game:"clinic", patients:["최교수", "이라이더", "정작가"], painMax:2, zone:1,
   intro:["구청에서 위생 점검이 나왔어요.", "오늘은 통증 두 번이면 영업 정지예요.", "점검관은 대기실에서 다 듣고 있어요."],
   outro:"점검관이 나가면서 자기 목도 좀 봐 달래요. 다음 주에 온대요.",
   lines:{"최교수":"오늘 점검 나온 거 알아요? 조용히 해 주세요", "이라이더":"밖에 공무원 있던데요? 쌤 괜찮아요?"}},
  {title:"단골의 귀환", game:"clinic", patients:["박대리", "정작가", "이라이더", "최교수"], painMax:3, zone:0,
   intro:["오늘은 아는 얼굴만 와요.", "단골은 봐주는 거 없어요. 구역 안내도 없어요.", "네 명. 밥 먹을 시간 없어요."],
   outro:"단골 네 명이 서로 인사하고 갔어요. 대기실이 동네 사랑방이 됐어요.",
   lines:{"박대리":"저 이제 단골이죠? 할인은요?", "정작가":"지난번 그 웹툰, 조회수 터졌어요", "이라이더":"콜 끊고 왔어요. 빨리요", "최교수":"학회에서 여기 얘기했어요. 좋은 쪽으로요"}},
  {title:"목뽑기 데이", game:"towel", patients:["박대리", "최교수", "이라이더", "정작가"], painMax:3, zone:1,
   intro:["'목 길어지는 집'으로 소문났어요.", "오늘은 다들 수건만 찾아요.", "엿가락 만들면 바로 구급차예요."],
   outro:"동네 사진관에 '목 길어지기 전후' 사진이 걸렸어요.",
   lines:{"박대리":"목 길어지는 집 맞죠? 저 3cm만요", "최교수":"견인 요법 논문 써도 되죠?"}},
  {title:"건물주", game:"clinic", patients:["정작가", "이라이더", "최교수", "박대리", "김사장"], painMax:3, zone:0,
   intro:["월세 내는 날이에요.", "오늘 마지막 손님이 건물주래요.", "다섯 명 다 고치면 월세를 깎아 줄지도 몰라요."],
   outro:"김사장: 자네 손 좋구먼. 월세는 동결이야. 대신 매주 와서 봐 주게.",
   lines:{"김사장":"자네가 새 세입자구먼. 잘하면 월세 깎아 주지", "박대리":"건물주 오늘 온다던데요? 파이팅이요"}}
];
export const CAMPAIGN_KEY = "chiroCampaign";

/* the day's patients from the roster, in the day's order, each with that day's start line */
export function dayRoster(day, roster){
  const d = DAYS[day];
  return d.patients.map(name => {
    const p = roster.find(r => r.name === name);
    if(!p) throw new Error("no patient " + name);
    const start = d.lines && d.lines[name];
    return start ? {...p, lines: {...p.lines, start}} : p;
  });
}

/* a cleared day's stars from the run's average (the rankTitle cuts in core/scoring.js: 115 / 98 / 82) */
export function dayStars(avg){ return avg >= 115 ? 3 : avg >= 98 ? 2 : 1; }

/* progress = {cleared, stars}; a bad save reads as a fresh start */
export function readProgress(raw){
  const ok = raw && Number.isInteger(raw.cleared) && Array.isArray(raw.stars);
  const cleared = ok ? Math.max(0, Math.min(DAYS.length, raw.cleared)) : 0;
  return {cleared, stars: DAYS.map((_, i) => ok && i < cleared ? Math.max(1, Math.min(3, raw.stars[i] | 0)) : 0)};
}
/* a day is open when every day before it is cleared */
export const dayOpen = (prog, day) => day >= 0 && day < DAYS.length && day <= prog.cleared;
/* after a run on `day`: a cleared day unlocks the next and keeps its best stars; a failed run changes nothing */
export function afterDay(prog, day, cleared, stars){
  if(!cleared) return prog;
  const s = prog.stars.slice(); s[day] = Math.max(s[day] || 0, stars);
  return {cleared: Math.max(prog.cleared, day + 1), stars: s};
}
export const nextDay = (prog, day) => day + 1 < DAYS.length && dayOpen(prog, day + 1) ? day + 1 : -1;

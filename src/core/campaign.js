/* 영업 일지 (campaign, user 2026-10-21 "이거 이제 스토리를 늘리거나 뭐 해야할거아냐"): the clinic's first week.
   Rent is due on day 7 and the last patient turns out to be the landlord. Each day fixes the game (목꺾기 clinic /
   목뽑기 towel), who comes in and in what order, how many pains close the clinic (painMax), how many patients get the
   green-zone hint (zone), and story lines: intro (the card before the day), outro (after a cleared day), lines (a
   patient's start line on that day, for regulars coming back). Pure: no DOM, no three. Progress lives in
   localStorage "chiroCampaign" ({cleared: day count, stars: [per day], hard: [역경 stars per day]}), read and written by game/flow.js.
   Chapters (ch) only group the one list of days, so a save from before 2장 reads as it was and a new chapter just
   appends days. 3장 adds game "back" (허리펴기, back.html?day=N): one patient, three zones, avg = score / 3. 5장 adds game "side"
   (허리비틀기, side.html?day=N): one patient, two sides, avg = score / 2. 2장 adds: mods (tight = a tighter zone, noisy = no breath coaching), beat (a boss day is cleared only
   with an average at least this high; lose = the boss line on a miss) and patients from patient/cast.js. 4장~8장 (휴가철 출장, 비틀어 학회, 방송 타고, 위생 감사 시즌, 프랜차이즈 전쟁) reuse the same
   days format with bosses at 97/93/102/104/107/108/111 (2~8장, 연속 보너스 상한 +20 기준); 6~8장 also have painMax 1-2 days. The story ends with 뚝할배, the clinic's first owner. */
import { comboAvg } from "./scoring.js";
export const CHAPTERS = [
  {no:1, title:"개업 첫 주", lead:"월세 내는 날까지 버텨요"},
  {no:2, title:"소문의 대가", lead:"맞은편에 반듯 정골원이 생겼어요"},
  {no:3, title:"허리 펴러 오세요", lead:"허리 코너를 새로 열었어요"},
  {no:4, title:"휴가철 출장", lead:"해수욕장에서 파라솔 진료를 해요"},
  {no:5, title:"비틀어 학회", lead:"학회가 원장에게 비틀린 목 발표를 맡겨요"},
  {no:6, title:"방송 타고", lead:"실패 장면이 영상으로 돌아다녀요"},
  {no:7, title:"위생 감사 시즌", lead:"점검관이 통보 없이 찾아와요"},
  {no:8, title:"프랜차이즈 전쟁", lead:"체인 회장이 클리닉을 사겠대요"}
];
export const DAYS = [
  {ch:1, title:"개업 첫날", game:"clinic", patients:["박대리", "이라이더"], painMax:3, zone:2,
   intro:["뚝 카이로 클리닉, 오늘 문 열었어요.", "월세는 일주일 뒤에 내야 해요.", "첫 손님 두 명. 망치면 소문 다 나요."],
   outro:"첫날 매출 두 건. 박대리 후기: '목에서 소리가 났는데 인생도 같이 났어요'. 별점 5점, 댓글은 '무서워요'."},
  {ch:1, title:"입소문", game:"clinic", patients:["정작가", "최교수", "박대리"], painMax:3, zone:1,
   intro:["단톡방 후기 보고 손님이 왔어요.", "박대리도 또 왔어요. 이번엔 팀장 욕을 하면서요.", "구역 안내는 첫 손님에게만 보여요."],
   outro:"정작가 웹툰에 클리닉이 나왔어요. 원장 얼굴이 낯선 사람이에요. 본인도 못 알아봤어요.",
   lines:{"박대리":"또 왔어요. 팀장이 회의 중에 제 목을 또 꺾어 놨어요. 말로요"}},
  {ch:1, title:"중고 수건", game:"towel", patients:["이라이더", "정작가", "최교수"], painMax:3, zone:2,
   intro:["중고 거래로 목욕 수건을 샀어요.", "오늘은 수건으로 목을 뽑아 봐요.", "너무 세게 당기면 원장이 넘어져요."],
   outro:"수건 두 장째 구입. 판매자가 '어디 쓰세요?' 하고 물었고, 원장은 '사람 목이요'라고 답했어요."},
  {ch:1, title:"위생 점검", game:"clinic", patients:["최교수", "이라이더", "정작가"], painMax:2, zone:1,
   intro:["구청에서 위생 점검이 나왔어요.", "오늘은 통증 두 번이면 영업 정지예요.", "점검관은 대기실에서 다 듣고 있어요."],
   outro:"점검관이 나가며 속삭였어요. '제 목도 봐 주실 수 있나요. 점검 아니고요.' 다음 주에 또 와요.",
   lines:{"최교수":"점검 나온 거 알죠? 오늘은 제 목이 뚝 소리 내면 안 돼요", "이라이더":"밖에 공무원 있던데요? 저 무면허 아니에요, 목만 아파요"}},
  {ch:1, title:"단골의 귀환", game:"clinic", patients:["박대리", "정작가", "이라이더", "최교수"], painMax:3, zone:0,
   intro:["오늘은 아는 얼굴만 와요.", "단골은 봐주는 거 없어요. 구역 안내도 없어요.", "네 명. 밥 먹을 시간 없어요."],
   outro:"단골 네 명이 서로 목 안부를 묻고 갔어요. 대기실이 경로당 분위기가 됐어요.",
   lines:{"박대리":"저 이제 단골이죠? 할인은요? 아님 목 하나 덤이라도요", "정작가":"지난번 그 웹툰, 조회수 터졌어요", "이라이더":"콜 끊고 왔어요. 별점 5점 줄 테니 빨리요", "최교수":"학회에서 여기 얘기했어요. 좋은 쪽으로요"}},
  {ch:1, title:"목뽑기 데이", game:"towel", patients:["박대리", "최교수", "이라이더"], painMax:3, zone:1,
   intro:["'목 길어지는 집'으로 소문났어요.", "오늘은 다들 수건만 찾아요.", "엿가락 만들면 바로 구급차예요."],
   outro:"동네 사진관에 '목 길어지는 집' 합성 사진이 걸렸어요. 아무도 합성인 줄 몰랐어요.",
   lines:{"박대리":"목 길어지는 집 맞죠? 저 3cm만요", "최교수":"견인 요법 논문 써도 되죠? 제 목이 1저자예요"}},
  {ch:1, title:"건물주", game:"clinic", patients:["정작가", "이라이더", "최교수", "박대리", "김사장"], painMax:3, zone:0,
   intro:["월세 내는 날이에요.", "오늘 마지막 손님이 건물주래요.", "다섯 명 다 고치면 월세를 깎아 줄지도 몰라요."],
   outro:"김사장: 자네 손 좋구먼. 월세는 동결이야. 대신 매주 와서 내 목 봐 주게. 공짜로.",
   lines:{"김사장":"자네가 새 세입자구먼. 잘하면 월세 깎아 주지. 못하면 내 목값을 받겠네", "박대리":"건물주 오늘 온다던데요? 제 월세도 같이 부탁해요"}},
  // 2장 소문의 대가
  {ch:2, title:"맞은편 간판", game:"clinic", patients:["오인턴", "박대리", "최조교"], painMax:3, zone:1,
   intro:["길 건너에 '반듯 정골원'이 문을 열었어요.", "간판 크기가 우리 간판의 세 배예요.", "오늘 온 손님은 지킨다. 간판 싸움은 그다음이에요."],
   outro:"오인턴이 정규직 되면 회사 사람 다 데려온다고 했어요. 우편함엔 반듯 정골원 전단지가 꽂혀 있었어요. 글씨가 우리 간판보다 컸어요.",
   lines:{"박대리":"맞은편 생겼던데요? 전 의리예요. 간판이 커서 흔들리긴 했어요"}},
  {ch:2, title:"홈쇼핑 생방송", game:"towel", patients:["말빨", "송기사", "최조교"], painMax:3, zone:1,
   intro:["유튜버 말빨이 카메라를 들고 들어와 '목 길어지는 수건'을 홈쇼핑에 팔자고 해요.", "생방송 시연이에요. 세 명 연속.", "엿가락 만들면 반품 폭탄이에요."],
   outro:"주문 폭주. 품절. 근데 우리 수건이 아니라 반듯 정골원 수건이 팔렸어요.",
   lines:{"말빨":"여러분 수건 하나면 목이 쭉! 구급차는 별매! 쌤 지금이요!", "최조교":"이거 시연 논문에 넣어도 돼요? 환자 동의는 수건이 해 줬어요"}},
  {ch:2, title:"선배 욕 대회", game:"clinic", patients:["말빨", "이라이더", "오인턴"], painMax:3, zone:0, mods:{noisy:true},
   intro:["홈쇼핑 대박 뒤로 말빨이 단골 선배 이라이더를 끌고 또 들어왔어요.", "채팅이 시끄러워서 숨 안내가 꺼져요.", "환자 가슴이 오르내리는 걸 직접 보고, 내쉴 때 꺾어요."],
   outro:"선배 욕 대회 우승은 이라이더예요. 상품은 헬멧 방석인데 아무도 앉지 않았어요.",
   lines:{"이라이더":"선배 욕은 헬멧 안에서만 해요. 방음 잘 돼요", "오인턴":"저 상사 얘기 나오면 목이 먼저 숙여져요. 반사예요"}},
  {ch:2, title:"염탐꾼", game:"clinic", patients:["김평범", "정작가", "김사장"], painMax:2, zone:0,
   intro:["반듯 정골원에서 사람을 보냈대요.", "통증 두 번이면 바로 '그 집 별로'라는 소문이 나요.", "누가 염탐꾼인지는… 메모장 든 사람이에요."],
   outro:"김평범이 나가면서 명함을 떨어뜨렸어요. '반듯 정골원 실장'. 전혀 평범하지 않았어요.",
   lines:{"김사장":"맞은편 그 정골원, 내 건물이야. 둘 다 세입자지", "정작가":"저 사람 아까부터 메모하던데요?"}},
  {ch:2, title:"박팀장의 사과", game:"clinic", patients:["박팀장", "박대리", "최교수"], painMax:3, zone:0, mods:{tight:true},
   intro:["박대리 팀장이 왔어요. 박대리 목을 꺾어 놓은 사람이요.", "박팀장 앞이라 다들 어깨가 올라가서 구역이 좁아요.", "박대리 앞에서 팀장 목을 풀어 줘요."],
   outro:"박팀장이 박대리에게 반차를 줬어요. 박대리는 울었고 박팀장은 결재선 때문에 참았어요. 단톡방엔 우리 링크가 돌아요.",
   lines:{"박대리":"팀장님 오셨어요…? 저 먼저 꺾일게요. 아니 맞을게요", "최교수":"오늘 다들 왜 이렇게 굳어 있어요? 제가 안 굳은 건가요"}},
  {ch:2, title:"새벽 배송", game:"towel", patients:["송기사", "이라이더", "오인턴"], painMax:3, zone:0, mods:{noisy:true},
   intro:["새벽 다섯 시. 밤샌 사람들이 줄을 섰어요.", "다들 졸려서 숨 소리도 제각각이에요.", "숨 안내 없이 수건으로 쭉 뽑아요."],
   outro:"송기사 택시에 우리 스티커가 붙었어요. 반듯 정골원 스티커 위에요. 반듯의 '반'만 남았어요.",
   lines:{"이라이더":"새벽 콜 다 쳤어요. 이제 뽑아 주세요", "오인턴":"출근 전에 목 좀… 정규직 됐어요!"}},
  {ch:2, title:"정골원 대결", game:"clinic", patients:["최조교", "말빨", "박팀장", "강직한"], painMax:3, zone:0, mods:{tight:true}, beat:97, boss:["taunt"], bossTaunt:"강직한: 후배님, 첫 쪽이 PERFECT가 아니면 반대쪽은 내가 좁게 버티겠네.", bossBy:"— 강직한 원장", bossLive:{taunt:"첫 쪽이 그게 뭔가. 반대쪽은 좁혀 놨네."}, lose:"강직한: 후배님, 간판은 아직 내 쪽이 더 커.",
   intro:["반듯 정골원 원장이 도전장을 보냈어요.", "완주만으로는 안 돼요. 점수로 이겨야 해요.", "마지막 손님은 원장 본인이에요."],
   outro:"강직한: 후배님, 내 목이 반듯해졌어. 간판은 내 게 더 크지만 봐주지. 수요일마다 같이 일하자고.",
   hardOutro:"강직한: 역경에서도 이기다니. 간판을 한 뼘 더 키워야겠군. 자네 때문에.",
   lines:{"최조교":"교수님이 오늘 결과 보고 오래요", "말빨":"저는 중립이에요. 간판 큰 쪽 응원할게요, 아직 모르지만", "박팀장":"박대리가 꼭 이기래. 나도 응원은 하지"}},
  // 3장 허리 펴러 오세요
  {ch:3, title:"허리 코너 신설", game:"back", patients:["박대리"], painMax:3, zone:0,
   intro:["강직한 원장이 수요일마다 와서 허리 침대를 놓고 갔어요.", "첫 허리 손님은 역시 박대리예요.", "높이 고정하고, 좌우 맞추고, 툭."],
   outro:"박대리: 허리가 펴지니까 팀장님이 생각보다 작아요. 그동안 접혀서 올려다봤나 봐요.",
   lines:{"박대리":"목은 다 나았는데 이번엔 허리가 접혀요. 몸이 번갈아 출근해요"}},
  {ch:3, title:"밤샘 마감", game:"clinic", patients:["편집장", "정작가", "말빨"], painMax:3, zone:0, mods:{noisy:true},
   intro:["정작가 웹툰 마감날이에요. 편집장이 따라왔어요.", "대기실에서 원고 독촉 소리가 계속 나요.", "숨 안내가 안 들려요. 눈으로 보고 꺾어요."],
   outro:"정작가 웹툰 이번 화 제목: '편집장 목 꺾인 날'. 편집장이 결재했어요.",
   lines:{"정작가":"마감 세 시간 남았어요. 목만 빨리요", "말빨":"여러분 웹툰 작가님 실물이에요! 눈 밑이 원작 그대로예요!"}},
  {ch:3, title:"무거운 군장", game:"back", patients:["서병장"], painMax:2, zone:0,
   intro:["휴가 나온 서병장이 왔어요. 군장 40kg에 허리가 굽었대요.", "복귀 버스가 두 시간 뒤예요.", "통증 두 번이면 복귀 못 하고 탈영이에요."],
   outro:"서병장이 경례하고 나가다 문에 헬멧을 박았어요. 부대엔 '허리는 펴는데 머리는 박는 집' 소문이 돌 거예요.",
   lines:{"서병장":"충성! 군장 풀러 왔습니다! 허리는 군장 안에 있습니다!"}},
  {ch:3, title:"불판 앞 15년", game:"towel", patients:["곽셰프", "이라이더", "최조교"], painMax:3, zone:1,
   intro:["고깃집 곽셰프가 고개를 숙인 채 들어왔어요.", "불판만 15년 봤대요. 목이 집게 각도로 굳었어요.", "수건으로 쭉 뽑아 줘요."],
   outro:"곽셰프가 회식 쿠폰을 놓고 갔어요. 이라이더가 그 쿠폰을 배달로 써도 되냐고 물었어요.",
   lines:{"이라이더":"이 셰프님 가게 제가 배달해요. 맛있어요", "최조교":"교수님 회식 장소가 여기 셰프님 집이에요"}},
  {ch:3, title:"근육왕 입장", game:"back", patients:["근육왕"], painMax:3, zone:0,
   intro:["동네 헬스장 관장 근육왕이 왔어요.", "데드리프트 300kg 하다 허리가 '띵' 했대요.", "근육이 두꺼워서 손이 안 들어가요. 정확히 눌러요."],
   outro:"근육왕: 이거 좋네. 우리 회원들도 보낼게. 대신 내일 모레 나랑 붙자.",
   lines:{"근육왕":"허리? 안 아파. 그냥 좀 '띵' 했을 뿐이야"}},
  {ch:3, title:"단체 손님", game:"clinic", patients:["곽셰프", "편집장", "서병장"], painMax:3, zone:0, mods:{tight:true},
   intro:["근육왕 소문에 몸 풀러 온 손님이 몰렸어요.", "운동하다 뭉친 손님들이라 구역이 좁아요.", "내일이 근육왕과의 대결이에요. 손 풀어 둬요."],
   outro:"서병장이 근육왕 헬스장 1년 회원권을 끊었어요. 근육왕이 '내일 기대해'라고 문자했는데 '내일 기절해'로 오타가 났어요.",
   lines:{"곽셰프":"헬스장 관장님 소문 듣고 왔어요. 닭가슴살 납품 좀…", "서병장":"대결 전날 정찰 왔습니다! 군장 대신 프로틴 메고 왔습니다!"}},
  {ch:3, title:"헬스장 대결", game:"back", patients:["근육왕"], painMax:3, zone:0, beat:93, lose:"근육왕: 워밍업 끝났나? 이제 시작인데.",
   intro:["근육왕이 헬스장 회원 전원을 데리고 왔어요.", "점수로 인정받으면 헬스장에 소문이 퍼져요.", "근육 속 척추를 정확히 찾아요."],
   outro:"근육왕: 인정. 우리 헬스장 회원 다 너한테 맡긴다. 그리고 너도 운동 좀 해.",
   hardOutro:"근육왕: 좁은 구역도 한 방이라니. 오늘부터 내 허리 담당은 너다. 프로틴은 내가 쏜다.",
   lines:{"근육왕":"오늘은 진짜야. 회원들이 다 보고 있어. 아까부터 응원봉 흔들어"}},
  // 4장 휴가철 출장
  {ch:4, title:"출장 가방", game:"clinic", patients:["서병장", "송기사", "박대리"], painMax:3, zone:1, mods:{noisy:true},
   intro:["근육왕 소문을 듣고 해수욕장 관리소에서 연락이 왔어요.", "파라솔 아래 임시 진료소예요. 파도 소리에 숨 안내가 묻혀요.", "모래가 신발에 들어가도 꺾을 땐 집중해요."],
   outro:"서병장이 군복 대신 튜브를 끼고 갔어요. 송기사는 모래사장에 택시를 세우고 주차 단속을 기다렸어요.",
   lines:{"서병장":"충성! 휴가 나와서 바다까지 행군했습니다!", "송기사":"모래 위라 미터기가 안 돌아가네. 파도가 요금 받는 건 아니겠지", "박대리":"출장 오셨어요? 저도 휴가 겸 왔어요"}},
  {ch:4, title:"파라솔 진료", game:"clinic", patients:["강해녀", "이마라톤", "박대리"], painMax:3, zone:1,
   intro:["물질 40년 강해녀가 첫 손님이에요.", "목이 문제가 아니라 바다가 문제래요.", "그 뒤에 마라톤 완주자가 줄 서 있어요."],
   outro:"강해녀가 소라를 한 바구니 놓고 갔어요. 바구니 밑에 '뚝'이 새겨진 낡은 효자손이 깔려 있었는데, 40년 전 이 간판 달던 영감 거라며 도로 챙겨 갔어요. 이마라톤은 목이 결승선을 통과한 뒤 몸을 기다렸어요.",
   lines:{"강해녀":"내 목은 괜찮아. 바다가 좀 삐뚤어졌을 뿐이야", "이마라톤":"풀코스 뛰고 왔더니 목이 먼저 도착했어요"}},
  {ch:4, title:"모래 위 허리", game:"back", patients:["사모님"], painMax:3, zone:1,
   intro:["김사장 부인 사모님이 모래 위 침대에 누웠어요.", "남편 흉을 보는 동안 허리를 눌러야 해요.", "높이 고정하고, 좌우 맞추고, 툭."],
   outro:"사모님: 영감이 월세를 올리랬는데 제가 영감 베개를 숨겼어요. 사흘은 허리 못 펴고 협상도 못 해요.",
   lines:{"사모님":"우리 영감 흉 좀 볼게요. 요즘 서류에 도장 찍느라 손목이 나갔대요. 나는 허리요"}},
  {ch:4, title:"수건 투척", game:"towel", patients:["곽셰프", "이마라톤", "이라이더"], painMax:3, zone:1,
   intro:["바닷바람이 세서 수건이 자꾸 날아가요.", "갈매기가 수건을 노려봐요. 구경만 하는 거예요.", "너무 세게 당기면 원장은 모래에 넘어져요."],
   outro:"수건 한 장이 갈매기에게 납치됐어요. 곽셰프가 앞치마를 내줬는데 갈매기가 그것도 물고 갔어요.",
   lines:{"곽셰프":"바닷가에서 목 뽑는 건 처음인데, 뒤집다 놓치는 건 고기랑 똑같네", "이마라톤":"뽑아 주세요. 골인 지점이 보여요"}},
  {ch:4, title:"모자 상봉", game:"clinic", patients:["김상무", "사모님", "김사장"], painMax:3, zone:0, mods:{tight:true},
   intro:["사모님이 아들 김상무를 끌고 왔어요.", "김사장은 아들이 왔다는 걸 아직 몰라요.", "서로 눈치 보느라 목이 굳어서 구역이 좁아요."],
   outro:"김상무가 귓속말했어요. '아버지가 뭘 꾸미고 있어요.' 김사장이 문 앞에서 헛기침했어요. 둘 다 원장 뒤통수를 봤어요.",
   lines:{"김상무":"저는 그냥 지나가던 사람입니다. 목만 봐 주세요", "사모님":"우리 아들이에요. 말은 안 해도 효자예요", "김사장":"자네, 저 젊은이 어디서 봤는데. 거울에서 봤나"}},
  {ch:4, title:"일몰 단체", game:"towel", patients:["이마라톤", "서병장", "말빨", "정작가"], painMax:2, zone:0,
   intro:["해가 질 때 단체 손님이 몰렸어요.", "일몰 사진 찍으려다 다들 목이 굳었대요.", "오늘은 수건으로 뽑아요. 두 번 삐끗하면 파라솔이 접혀요. 노을은 기다려 주지 않아요."],
   outro:"정작가가 일몰 웹툰을 올렸어요. 원장 뒤통수만 열 컷 나왔고, 마지막 컷 구석에서 양복 입은 사람이 간판 사진을 찍고 있었어요.",
   lines:{"말빨":"여러분 일몰 생방 갑니다! 쌤 목 먼저요!", "정작가":"노을 그리다가 목이 90도로 꺾였어요"}},
  {ch:4, title:"해녀 40년", game:"clinic", patients:["서병장", "송기사", "사모님", "강해녀"], painMax:3, zone:0, beat:102, boss:["fake"], bossTaunt:"강해녀: 숨은 들이쉴 때가 제일 값져. 내쉴 때 꺾으면 물 먹는다.", bossBy:"— 강해녀 해녀회장", bossLive:{}, lose:"강해녀: 바다는 기다려 주지. 다시 오게.",
   intro:["강해녀가 원장을 시험하러 왔어요.", "강해녀를 이기려면 완주만으로는 안 돼요. 점수로 인정받아야 해요.", "마지막 손님은 해녀 본인이에요. 숨은 길게 쉬어요."],
   outro:"강해녀: 숨 참는 건 내가 낫지만, 목 푸는 건 자네가 낫네. 소라 달아 줄게. 간판에. 무거울 거야.",
   hardOutro:"강해녀: 이 파도를 숨 안 쉬고 버텼구먼. 소라 말고 진주를 달아 줄게. 간판이 더 무거워지겠어.",
   lines:{"강해녀":"바다는 속여도 목은 못 속이지", "사모님":"해녀 언니, 우리 영감 흉 같이 봐요. 영감 닮은 사람이 저기도 있네"}},

  // 5장 비틀어 학회
  {ch:5, title:"학회 초청장", game:"clinic", patients:["최교수", "최조교", "유어시"], painMax:3, zone:1,
   intro:["학회에서 초청장이 왔어요. 원장이 발표를 해 달래요.", "발표 주제는 '목은 왜 뚝 소리가 나는가'예요.", "연습 환자로 최교수 팀과 정작가 어시스턴트가 왔어요."],
   outro:"최교수: 발표 슬라이드는 내가 봐 주지. 단, 내 이름이 먼저야. 초청장 후원사 칸에는 '메가 척추그룹' 도장이 제일 크게 찍혀 있었어요.",
   lines:{"최교수":"학회 부위원장 됐어요. 직함만요. 잘 부탁해요", "최조교":"교수님 몰래 왔어요. 발표 자료 훔쳐보려고요", "유어시":"저는 정작가님 배경만 그리다 왔어요. 제 이름은 엔딩에도 없어요"}},
  {ch:5, title:"쌍둥이 아닌 동생", game:"side", patients:["이스쿠터"], painMax:3, zone:0,
   intro:["학회 시연용으로 허리비틀기 데모를 연습해요.", "이스쿠터가 옆으로 눕자마자 형 이야기를 시작했어요.", "한쪽 비틀고, 굴려서 반대쪽도. 통증 세 번이면 시연은 취소예요."],
   outro:"이스쿠터: 형은 한쪽만 했대요. 저는 양쪽 다 했으니까 오늘부터 제가 형이에요.",
   lines:{"이스쿠터":"형이 여기서 한쪽만 비틀고 갔잖아요. 저는 양쪽이요. 두 배로요"}},
  {ch:5, title:"발표 연습", game:"towel", patients:["말빨", "최교수", "최프로"], painMax:3, zone:1,
   intro:["발표 대본 대신 수건으로 시연해요.", "말빨은 방송용 멘트를 연습하고 최교수는 질문을 준비했어요.", "최프로는 시선이 공에 고정돼서 안 돌아가요."],
   outro:"최프로: 이제 목이 홀인원이에요. 최교수는 질문지를 세 번 고쳐 쓰고 결국 자기 이름을 맨 위에 적었어요.",
   lines:{"말빨":"학회 첫 생방 가겠습니다! 구독자 박사님들 안녕!", "최프로":"공을 따라가다 목이 고정됐어요. 돌려 주세요", "최교수":"질문이 많으니 천천히 당겨요. 답은 당기고 나서 들을게요"}},
  {ch:5, title:"한의원 습격", game:"clinic", patients:["장원장", "박팀장", "김평범"], painMax:2, zone:0, mods:{tight:true},
   intro:["한의원 장원장이 염탐하러 왔어요. 이번엔 진짜 손님인 척이에요.", "박팀장은 보고서를 쓰러, 김평범은 또 평범하게 왔어요.", "스파이 의심에 다들 경계해서 구역이 좁아요. 두 번 삐끗하면 한의원이 웃어요."],
   outro:"장원장이 침 하나를 두고 갔어요. 쓰지 말래요. 기념품이래요. 영수증은 안 줬어요.",
   lines:{"장원장":"한방과 양방의 대결입니다. 저는 그냥 손님이고요", "박팀장":"여기서 또 보네. 학회도 나가나? 구청에서 이 동네 감사 일정을 묻더라. 개업 때 그 점검관이 담당이래", "김평범":"저는 평범하게 장원장님 따라왔어요. 이번엔 스파이 아니고 미행이에요"}},
  {ch:5, title:"이씨 삼형제(아님)", game:"clinic", patients:["이라이더", "이스쿠터", "이마라톤"], painMax:3, zone:0, mods:{noisy:true},
   intro:["이라이더, 이스쿠터, 이마라톤. 이름이 다 이씨 같아요.", "얼굴이 똑같아서 가운 색으로 구분해요. 대기실도 시끄러워요.", "숨 안내 없이 누가 누군지 잘 봐요."],
   outro:"원장이 셋 이름을 다 틀렸어요. 셋 다 '내가 형이야' 하며 싸웠고 맞는 이름은 끝까지 없었어요.",
   lines:{"이라이더":"쟤가 동생이에요. 저는 형. 헬멧 쓴 쪽이 형이에요", "이스쿠터":"동생 맞는데 오늘만 형 할게요. 스쿠터 키는 제가 들고 있으니까요", "이마라톤":"저는 이씨 아닌데요? 마라톤은 뛰었는데요"}},
  {ch:5, title:"좌우 균형", game:"side", patients:["최프로"], painMax:3, zone:0,
   intro:["최프로는 스윙이 한쪽으로만 가서 허리가 꼬였어요.", "옆으로 눕혀 한쪽 비틀고, 굴려서 반대쪽도 같은 세기로 비틀어요.", "양쪽 세기가 비슷하면 보너스예요. 통증 세 번이면 라운드 종료예요."],
   outro:"최프로: 이제 양쪽 다 스윙해도 되겠어요. 오른쪽만 치는 건 못 고치겠지만요.",
   lines:{"최프로":"좌우 균형이 전부예요. 허리도, 퍼팅도. 오는 길에 지하 계단에서 영감이 효자손으로 벽을 뚝뚝 치던데요"}},
  {ch:5, title:"학회 발표", game:"clinic", patients:["최교수", "장원장", "최조교", "곽셰프"], painMax:3, zone:0, mods:{tight:true}, beat:104, boss:["timer"], bossTaunt:"최교수: 발표는 20분이 아니라 한 쪽에 12초일세. 넘기면 감점이야.", bossBy:"— 최교수 학회장", bossLive:{timer:"시간 초과일세. 이 결과는 부록으로 넣겠네."}, lose:"최교수: 이 결과는 부록으로 넣겠네.",
   intro:["학회장에 올라섰어요. 객석에 환자 대신 교수들이 앉아 있어요.", "점수가 높아야 박수가 나와요.", "실패하면 최교수가 논문 소재로 써요."],
   outro:"최교수: 발표는 성공일세. 심사위원이 질문 대신 박수를 쳤어. 나는 질문하고 싶었는데.",
   hardOutro:"최교수: 이건 부록이 아니라 본문이네. 각주에 자네 이름은 넣어 주지. 아주 작은 글씨로.",
   lines:{"최교수":"모두 지켜보고 있어요. 긴장하지 말아요. 나는 긴장했어요", "장원장":"한방을 대표해 왔습니다. 침은 숨겼습니다", "곽셰프":"학회 회식 장소가 우리 가게예요. 고기 준비했어요"}},

  // 6장 방송 타고
  {ch:6, title:"구독자 3천", game:"clinic", patients:["뚝튜브", "박대리", "말빨"], painMax:3, zone:1,
   intro:["뚝튜브가 카메라를 들고 들어왔어요.", "구독자는 3천 명. 클리닉 촬영을 허락해 달래요.", "실패하면 구독자가 늘어요. 성공하면 댓글이 줄어요. 이상한 세계예요."],
   outro:"뚝튜브가 영상 대신 후기 한 줄만 남겼어요. '재미없다'. 칭찬이 제일 아픈 날이에요.",
   lines:{"뚝튜브":"안녕하세요 뚝튜브입니다! 오늘은 목에서 소리 나면 구독 누르는 카이로 체험!", "박대리":"저 카메라 앞이면 목이 더 굳어요. 원래도 굳었지만요", "말빨":"후배가 카메라 잡았네. 선배는 대기석에서 팝콘이나 먹을게"}},
  {ch:6, title:"실패 클립", game:"clinic", patients:["뚝튜브", "이라이더", "오인턴"], painMax:2, zone:0,
   intro:["실패한 장면만 잘라서 올리는 사람이 생겼어요.", "두 번 삐끗하면 영상이 퍼져요. 댓글은 편집이 안 돼요.", "그래도 인지도는 오르는 이상한 구조예요."],
   outro:"클립 하나가 30만 뷰예요. 댓글에는 '쌤 손가락 괜찮아요?'만 달렸어요. 첫 댓글은 매번 프로필 사진이 낡은 효자손인 계정이에요.",
   lines:{"뚝튜브":"실패 장면 기다립니다. 아니 성공도 괜찮아요", "이라이더":"저 클립에 나온 사람 맞죠? 서명해 드릴까요", "오인턴":"인사팀이 영상 봤대요… 제 목이 얼굴이 됐어요"}},
  {ch:6, title:"한 방 승부", game:"back", patients:["근육왕"], painMax:1, zone:0,
   intro:["통증 한 번이면 끝이에요. 실수 한 번이 곧 방송 사고예요.", "근육왕이 생방송 중 '한 방에 펴 달라'고 선언했어요.", "시청자가 4만 명이에요."],
   outro:"근육왕: 한 방에 펴졌다! 시청자들이 프로틴 쏘고 있어!",
   lines:{"근육왕":"한 방이면 돼. 두 방이면 방송 사고야. 4만 명이 이 허리를 보고 있어"}},
  {ch:6, title:"홈쇼핑 재방송", game:"towel", patients:["말빨", "사모님", "송기사"], painMax:3, zone:0, mods:{noisy:true},
   intro:["말빨이 '홈쇼핑 대박 기념 재방송'을 켰어요.", "구독자 항의 전화가 섞여 들어와 호흡 안내가 안 들려요.", "재방송에 구급차가 또 나오면 시청률이 폭주해요. 얌전히 해요."],
   outro:"말빨이 수건에 걸려 넘어졌어요. 사모님 방석은 또 품절이에요. 영감은 방석 없이 앉았어요.",
   lines:{"말빨":"재방송이라 대본 외웠어요. 목이 쭉! 쭉! 어제도 쭉이었어요!", "사모님":"방석도 같이 팔아 줘요. 우리 영감 은퇴 선물이에요. 본인은 아직 모르지만요", "송기사":"홈쇼핑 처음 나와 보네. 미터기 안 켜졌지?"}},
  {ch:6, title:"악플 대처", game:"clinic", patients:["편집장", "박팀장", "손경호"], painMax:3, zone:0, mods:{tight:true},
   intro:["클리닉 영상에 악플이 달렸어요. '손가락 뚝 소리가 징그럽다'.", "오늘은 악플 단 사람들이 직접 왔어요. 다들 굳었어요.", "악플은 칭찬으로 뒤집어요. 목을 꺾어서요."],
   outro:"편집장이 악플을 모아 사과문을 썼어요. 제일 긴 문장은 '소리가 징그럽다더니 계속 듣게 돼요'였어요. 악플 절반은 같은 건물 와이파이에서 달렸다는 메모가 붙었는데, 건물 이름은 잉크가 번져 있었어요.",
   lines:{"편집장":"제가 '목 꺾는 소리 징그럽다'고 썼어요. 사과하러 왔어요", "박팀장":"나도 악플 하나 달았는데… 지웠어", "손경호":"……(고개를 안 돌린다)"}},
  {ch:6, title:"뚝튜브 구독자 1만", game:"towel", patients:["야알바", "서병장", "이마라톤", "뚝튜브"], painMax:2, zone:0,
   intro:["뚝튜브 구독자가 1만을 넘었어요. 구독자들이 단체로 찾아왔어요.", "야알바는 편의점에서 졸다 목이 접혔어요.", "두 번 삐끗하면 방송이 끊겨요. 내일은 소음 속 합동 라이브예요."],
   outro:"구독자 1만 기념 케이크가 왔어요. 초 대신 수건이 꽂혀 있었어요.",
   lines:{"야알바":"야간 근무 끝나고 바로 왔어요. 졸려서 쌤도 바코드로 보여요", "뚝튜브":"1만 명이 제 목을 보고 있어요. 쌤, 한 번 더 뽑아 주세요", "서병장":"구독자 부대 대표로 왔습니다! 보급품은 응원봉입니다!"}},
  {ch:6, title:"라이브 합동", game:"clinic", patients:["뚝튜브", "말빨", "야알바", "최프로", "김평범"], painMax:3, zone:0, mods:{tight:true, noisy:true}, beat:104, boss:["swap"], bossTaunt:"뚝튜브: 방송 중에 채팅 투표가 뜰 거예요. 결과는 저도 몰라요!", bossBy:"— 뚝튜브 방장", bossLive:{swap:"채팅 투표 나왔어요! 반대쪽이래요, 반대쪽!"}, lose:"뚝튜브: 방금 컷, 클립 따서 올릴게요. 제목은 '원장님의 눈물'.",
   intro:["유튜버 둘이 합동 라이브를 열었어요. 시청자 5만 명이 지켜봐요.", "채팅 소음에 숨 안내가 안 들려요. 구역도 좁아요.", "점수가 높으면 검색어 순위에 올라요."],
   outro:"합동 라이브 최고 시청자 수 6만. 원장 이름이 검색어 3위가 됐어요. 반듯 정골원은 4위, 5위는 갑자기 '메가 허리'래요.",
   hardOutro:"뚝튜브: 이번 컷은 눈물 말고 박수 편집이에요. 구독자 3만 됐어요.",
   lines:{"뚝튜브":"합동 방송 시작합니다! 쌤 꺾어 주세요!", "말빨":"여러분 오늘은 레전드 갈아치웁니다!", "김평범":"저는 평범하게 시청자로 참여했어요. 닉네임은 반듯실장이에요"}},

  // 7장 위생 감사 시즌
  {ch:7, title:"감사 공문", game:"clinic", patients:["나공무", "최교수"], painMax:3, zone:1,
   intro:["구청에서 위생 감사 공문이 왔어요. 개업 때 다녀간 그 점검관이 담당이래요.", "나공무 점검관이 클립보드를 들고 앉았어요.", "통증이 세 번이면 영업 정지예요."],
   outro:"나공무가 점검표에 '양호'와 '양호하지 않음'을 둘 다 쳤어요. 내일 또 온대요.",
   lines:{"나공무":"점검 나왔습니다. 개업 때 목 봐 준다고 했던 거, 기억합니다. 오늘은 점검입니다", "최교수":"감사 오는 날이라 같이 왔어요. 증인으로요. 제 증언 비용은 별도입니다"}},
  {ch:7, title:"소독 시간", game:"towel", patients:["곽셰프", "이라이더", "오인턴"], painMax:3, zone:1,
   intro:["감사 규정: 수건은 한 번 쓰면 소독해야 해요.", "수건이 소독기에서 막 나와서 아직 따뜻해요.", "너무 세게 당기면 원장이 넘어져요."],
   outro:"곽셰프가 수건을 고깃집 소독기로 돌렸어요. 수건은 깨끗한데 냄새가 갈비탕이에요. 이라이더가 배고파했어요.",
   lines:{"곽셰프":"소독은 우리 가게가 전문이야. 수건도 고기처럼 삶으면 돼", "이라이더":"수건 배달 담당할게요", "오인턴":"점검표에 제 이름이 있어요… 뭐 잘못했나요"}},
  {ch:7, title:"점검관 고장 난 날", game:"clinic", patients:["송기사", "정작가", "사모님"], painMax:2, zone:0,
   intro:["나공무가 점검표를 거꾸로 들고 왔어요. 아무도 말 못 했어요.", "송기사는 새벽 운행 끝나서, 사모님은 영감 흉을 보러 왔어요.", "통증 두 번이면 위생 점수 깎여요."],
   outro:"나공무가 점검표에 '눈대중이 정확하네요'라고 적었어요. 점검관이 칭찬을 쓴 건 처음이라 손이 떨렸어요.",
   lines:{"송기사":"점검 나왔다고? 미터기는 켜 놨어", "정작가":"점검 장면 웹툰으로 그릴게요. 점검표 거꾸로 든 것까지요", "사모님":"감사관님 우리 영감 좀 점검해 주세요. 청결은 모르겠고 이틀째 안 씻었어요"}},
  {ch:7, title:"좁은 점검", game:"back", patients:["보건소장"], painMax:2, zone:0,
   intro:["점검관 눈이 보건소장 허리만 쫓아요. 실수 한 번이 곧 감점이에요.", "보건소장은 도장 찍느라 30년 굽어서, 빗나가면 서류에 다 남아요.", "통증 두 번이면 영업 정지예요. 정확히 눌러요."],
   outro:"보건소장: 좁은 데를 정확히 누르는군. 인증서 도장은 아직이오. 허리 도장이 먼저요.",
   lines:{"보건소장":"허리가 도장처럼 굳었소. 정확히 눌러 주시오"}},
  {ch:7, title:"도깨비 영감", game:"clinic", patients:["도깨비영감", "강해녀", "김사장"], painMax:3, zone:0, mods:{noisy:true},
   intro:["감사 중에 동네 전설 도깨비 영감이 나타났어요.", "사실은 소문만 무성한 그냥 영감이래요.", "대기실이 웅성웅성해서 숨 안내가 안 들려요."],
   outro:"도깨비 영감이 효자손을 놓고 갔어요. 뒷면에 '뚝'이 새겨져 있었어요. 원장은 어디서 본 글씨라고 생각했어요.",
   lines:{"도깨비영감":"내가 이 동네 도깨비라네. 나이는 팔십팔, 올해만. 뚝 소리는 내가 먼저 냈지", "강해녀":"도깨비 형님! 건물주 형님이랑 쌍둥이 같구려!", "김사장":"저 영감 우리 건물 지하에 살아. 얼굴이 날 닮은 건 사촌이라서 그래"}},
  {ch:7, title:"점검관의 허리", game:"side", patients:["나공무"], painMax:3, zone:0,
   intro:["퇴근한 나공무가 몰래 찾아왔어요.", "클립보드를 내려놓고 옆으로 누웠어요. 오늘은 점검 아니에요.", "허리가 직각이라 한쪽만 하면 반대쪽이 점검 나와요. 양쪽 다 비틀어요."],
   outro:"나공무: 이건 점검이 아니었습니다. 제 허리 하나로 청결 인증은 약속 못 합니다. 점검표 뒷면엔 '허리 시원함: 양호'라고 적혀 있었어요.",
   lines:{"나공무":"퇴근했습니다. 지금부터 저는 그냥 손님입니다"}},
  {ch:7, title:"청결 인증", game:"clinic", patients:["나공무", "보건소장", "박대리", "강직한"], painMax:2, zone:0, mods:{tight:true}, beat:105, boss:["shrink"], bossTaunt:"나공무: 점검 기준은 시간이 갈수록 엄격해질 예정입니다.", bossBy:"— 나공무 점검관", bossLive:{}, lose:"나공무: 점검 결과, 재점검 대상입니다.",
   intro:["보건소장과 감사관이 함께 최종 점검을 나왔어요.", "점수가 높아야 보건소장이 인증서에 도장을 찍어요.", "마지막 손님은 강직한 원장이에요. 통증 두 번이면 인증은 없던 일이에요."],
   outro:"청결 인증서를 받았어요. 강직한이 간판 옆에 '반듯 인증' 스티커를 붙였다 떼었어요.",
   hardOutro:"나공무: 재점검 결과, 양호합니다. 점검표에 양호를 세 번 썼습니다. 제 평생 처음입니다.",
   lines:{"나공무":"최종 점검입니다. 감정 없이 평가하겠습니다", "보건소장":"저는 보건소장입니다. 목은 좀 굳었습니다", "박대리":"저 감사 증인으로 왔어요. 제일 단골이라서요", "강직한":"동업자로서 지켜보겠네"}},

  // 8장 프랜차이즈 전쟁
  {ch:8, title:"인수 제안", game:"clinic", patients:["메가회장", "김상무"], painMax:3, zone:0,
   intro:["메가 척추그룹 회장이 직접 찾아왔어요.", "클리닉을 사겠대요. 금액을 듣고 원장이 의자에서 한 번 미끄러졌어요.", "김상무가 몰래 귓속말했어요. '거절하세요.' 원장은 이미 고개를 젓고 있었어요."],
   outro:"회장: 거절? 재밌군. 일주일 안에 이 골목에 체인점 1호를 열겠네. 간판은 자네 것보다 한 뼘 더 크게.",
   lines:{"메가회장":"본인은 메가 척추그룹 회장이오. 목은 3미터 쭉 펴져 있소", "김상무":"저는 이분 부하 직원입니다. 사실은 저 아버지가…"}},
  {ch:8, title:"직원 빼가기", game:"clinic", patients:["오인턴", "박팀장", "최조교"], painMax:2, zone:0, mods:{noisy:true},
   intro:["회장이 단골들을 스카우트하고 있어요.", "오인턴, 박팀장, 최조교가 스카우트 제안서를 들고 왔어요.", "소음이 커서 숨 안내가 안 들려요. 마음이 복잡해서요."],
   outro:"셋 다 제안서를 찢었어요. 오인턴만 한 장 접어서 양말에 넣었어요.",
   lines:{"오인턴":"연봉이 두 배래요… 그래도 의리로요", "박팀장":"나는 이직 안 해. 박대리 반차 줄 사람이 없잖아", "최조교":"교수님이 가지 말래요. 대신 연구비를 주셨어요"}},
  {ch:8, title:"체인점 1호", game:"back", patients:["곽셰프"], painMax:2, zone:0,
   intro:["정골원 옆 건물에 체인점 1호가 문을 열었어요.", "현수막에 '메가 허리, 전국 100호점 돌파'라고 적혀 있어요.", "곽셰프는 의리로 우리한테 왔어요. 정확히 눌러요."],
   outro:"곽셰프: 체인점은 고기로 치면 냉동이야. 이 집은 생고기지. 창밖에서 강직한이 체인점 번호표 줄을 세다가 우리 쪽을 가리켰어요.",
   lines:{"곽셰프":"저 집은 번호표 뽑고 기다려. 우리는 바로 구워 줘"}},
  {ch:8, title:"새 단골 총출동", game:"towel", patients:["오인턴", "말빨", "곽셰프", "사모님"], painMax:3, zone:0, mods:{tight:true},
   intro:["오인턴, 말빨, 곽셰프, 사모님. 그동안 쌓인 단골이 줄을 섰어요.", "얼굴은 다 아는데 구역은 평소보다 좁아요.", "체인점 대신 우리를 고른 사람들이에요."],
   outro:"새 단골 넷이 대기실에서 사진을 찍었어요. 액자 제목은 '체인점 안 간 멤버'예요.",
   lines:{"오인턴":"체인점이 연봉 두 배 준댔는데 의리로 왔어요. 월급은 아직 인턴이에요", "말빨":"여러분 체인점 말고 여기! 광고 아닙니다… 아니 광고예요, 쿠폰 받았어요", "곽셰프":"체인점 앞에서 고기 구웠더니 다 이리 왔어", "사모님":"영감은 체인점 갔대요. 나는 여기"}},
  {ch:8, title:"회장 면접", game:"side", patients:["메가회장"], painMax:2, zone:0,
   intro:["회장이 직접 옆으로 누웠어요. 오늘 손맛을 보고 인수 얘기를 접을지 정한대요.", "허리에 돈이 많이 들어 있어서 두꺼워요.", "양쪽 세기가 다르면 회장이 눈썹을 올려요. 대칭이 합격 조건이에요."],
   outro:"회장: 이 손맛 인정한다. 인수는 보류야. 마지막 판단은 이 클리닉의 원조에게 맡기지.",
   lines:{"메가회장":"나는 돈으로 허리 펴는 사람이야. 이번엔 손으로 부탁하지"}},
  {ch:8, title:"마지막 월세", game:"clinic", patients:["김사장", "사모님", "김상무"], painMax:2, zone:0, mods:{noisy:true},
   intro:["김사장 가족이 한자리에 모였어요.", "김사장이 월세를 올리겠대요. 사모님이 막아서고 김상무는 눈치만 봐요.", "대기실이 시끄러워서 숨 안내가 안 들려요."],
   outro:"김사장: 월세는 동결이야. 이번엔 진짜로. 메가 척추그룹, 내가 은퇴하면서 회장 녀석한테 넘긴 거야. 오늘 아침에 자네한테 먼저 말하려던 거고. 김상무가 처음으로 아버지 앞에서 고개를 들었어요.",
   lines:{"김사장":"월세 올린다고 했지. 근데 자네 손이 이상하게 좋아서 말이야", "사모님":"영감 또 흉을 잡을 거예요. 이번엔 제가 먼저 잡았어요", "김상무":"아버지, 이제 말씀하세요"}},
  {ch:8, title:"뚝할배", game:"clinic", patients:["박대리", "이라이더", "정작가", "최교수", "뚝할배"], painMax:3, zone:0, mods:{tight:true, noisy:true}, beat:105, boss:["taunt", "swap"], bossTaunt:"뚝할배: 이놈아, 첫 쪽이 흐트러지면 반대쪽은 좁게 간다. 그리고 내 마음은 가끔 바뀐다.", bossBy:"— 뚝할배 원조 원장", bossLive:{taunt:"이놈아, 첫 쪽이 그게 뭐냐! 반대쪽은 좁게 간다!", swap:"마음이 바뀌었다! 반대쪽이다, 이놈아!"}, lose:"뚝할배: 간판 값이 아직 모자라구나.",
   intro:["최종 손님은 뚝할배예요. 이 클리닉 첫 원장이고, 지하에 살던 그 도깨비 영감이에요.", "첫 주 단골 넷이 응원하러 왔어요. 맞은편 강직한도 뒷줄에 앉았어요. 숨 안내도 구역 안내도 없어요.", "통증이 세 번 나오면 끝이고, 구역도 좁아요. 점수도 최고여야 해요."],
   outro:"뚝할배: 합격이다. 이 모든 게 손님이 원장을 고르는 시험이었지. 간판은 네 거야. 뒷줄에서 메가회장이 인수 서류를 조용히 찢었어요.",
   hardOutro:"뚝할배: 이 빡센 판을 버텨? 간판 값은 됐다. 다음엔 내가 효자손 값을 내지.",
   lines:{"뚝할배":"내가 처음 이 간판을 단 사람이다. 목 한번 맡겨 보지", "박대리":"할배, 저희 원장님 진짜 잘해요!", "이라이더":"응원하러 배달 끊고 왔어요!", "정작가":"마지막 화는 이 장면으로 그릴게요", "최교수":"학회 대표로 증인 서겠습니다"}}
];
export const CAMPAIGN_KEY = "chiroCampaign";

/* 엔딩 (playtest 5 P0): shown once after the 56th day (뚝할배, 목꺾기) is cleared for the first time, behind the result card.
   unlock is the one-line notice that the 심야 진료 opens (text only; the mode itself is another task). */
export const ENDING = {
  title: "뚝 카이로 클리닉, 간판은 계속 달려 있어요",
  lines: [
    "뚝할배는 지하에서 올라와 접수대에 앉았어요. 간판은 새로 닦았고, 손은 아직 안 풀렸대요.",
    "김사장은 약속대로 월세를 동결했어요. 메가 척추그룹을 회장에게 넘긴 사람도 결국 이분이었어요.",
    "메가회장은 인수 서류를 찢고 대기표를 뽑았어요. 김상무가 옆에서 접수를 도와요.",
    "맞은편 정골원 강직한 원장은 오늘도 창문으로 훔쳐봐요. 손을 흔들었더니 커튼을 쳤어요.",
    "원장은 오늘도 손을 풀어요. 이건 만화니까 진짜 목에는 따라 하지 마세요."
  ],
  unlock: "심야 진료가 열렸어요"
};

/* "2장 3일차": a day's label inside its chapter */
export const dayInChapter = day => DAYS.slice(0, day).filter(d => d.ch === DAYS[day].ch).length;
export const dayLabel = day => `${DAYS[day].ch}장 ${dayInChapter(day) + 1}일차`;
export const chapterOf = no => CHAPTERS.find(c => c.no === no);
/* a played-through day counts as cleared unless it is a boss day and the average fell short (def: the day as played,
   hardDay for 역경) */
export const dayClears = (day, complete, avg, def = DAYS[day]) => !!complete && !(def.beat && avg < def.beat);

/* 역경 (hard replay, playtest round 3 "20시간" plan 3.2): a day with 3 stars opens again with one pain fewer, no green
   zone, the tight zone, and an average to beat (boss days +6, the rest HARD_BEAT). 목꺾기·목뽑기 run it in index.html; 허리펴기·허리비틀기
   get it as back.html / side.html ?day=N&hard=1. Stars of hard runs live in prog.hard. */
export const HARD_BEAT = 100;   // a 6-crack day; other lengths shift by cutShift (below)
export const HARD_BOSS_PLUS = 6;         // boss days: beat +6 on 역경 ...
export const HARD_BOSS_PLUS_FINAL = 3;   // ... 8장 only +3 (six-pain-free, narrow zone and no breath cue already stack up there; playtest 6 P1-2)
export const HARD_GAMES = ["clinic", "towel", "back", "side"];
export const hardOpen = (prog, day) => day >= 0 && day < DAYS.length && HARD_GAMES.includes(DAYS[day].game) && prog.stars[day] >= 3;
/* Pain: one fewer but never under 2 (a 1-pain day stays 1, nothing gets more). A day that was already tight gets
   `tighter` (core/feel.js tightFactor) instead of the same zone again. Non-boss beat shifts with the day's crack count. */
export function hardDay(day){
  const d = DAYS[day], wasTight = !!(d.mods && d.mods.tight);
  return {...d, hard: true, painMax: Math.min(d.painMax, Math.max(2, d.painMax - 1)), zone: 0,
    mods: {...(d.mods || {}), tight: true, ...(wasTight ? {tighter: true} : {})}, beat: d.beat ? d.beat + (d.ch === 8 ? HARD_BOSS_PLUS_FINAL : HARD_BOSS_PLUS) : HARD_BEAT + cutShift(d)};
}
/* the day as it is played: plain or 역경 */
export const dayDef = (day, hard) => hard ? hardDay(day) : DAYS[day];

/* the day's patients from the roster (and the campaign cast), in the day's order, each with that day's start line */
export function dayRoster(day, roster){
  const d = DAYS[day];
  return d.patients.map(name => {
    const p = roster.find(r => r.name === name);
    if(!p) throw new Error("no patient " + name);
    const start = d.lines && d.lines[name];
    return start ? {...p, lines: {...p.lines, start}} : p;
  });
}

/* a cleared day's stars from the run's average. The cuts are for a 6-crack day (3 patients on the neck); a day with
   more or fewer cracks moves them by the difference in the clean-run combo bonus (core/scoring.js comboAvg), so the
   same play earns the same stars on every mode (playtest 4 #1). Without a def the 6-crack cuts apply. The rankTitle
   cuts of free play (115 / 98 / 82) are separate. */
export const STAR_CUTS = {three: 110, two: 94, ref: 6};
/* cracks a day takes when played clean: 목꺾기 two sides per patient, 목뽑기 one tug, 허리펴기 three zones, 허리비틀기 two sides */
export const cracksOf = def => def.game === "towel" ? def.patients.length : def.game === "back" ? 3 : def.game === "side" ? 2 : def.patients.length*2;
export const cutShift = def => def ? Math.round(comboAvg(cracksOf(def)) - comboAvg(STAR_CUTS.ref)) : 0;
export function dayStars(avg, def){ const s = cutShift(def); return avg >= STAR_CUTS.three + s ? 3 : avg >= STAR_CUTS.two + s ? 2 : 1; }

/* progress = {cleared, stars}; a bad save reads as a fresh start */
export function readProgress(raw){
  const ok = raw && Number.isInteger(raw.cleared) && Array.isArray(raw.stars);
  const cleared = ok ? Math.max(0, Math.min(DAYS.length, raw.cleared)) : 0;
  const stars = DAYS.map((_, i) => ok && i < cleared ? Math.max(1, Math.min(3, raw.stars[i] | 0)) : 0);
  const hard = DAYS.map((_, i) => ok && Array.isArray(raw.hard) && stars[i] >= 3 ? Math.max(0, Math.min(3, raw.hard[i] | 0)) : 0);
  return {cleared, stars, hard, ...(ok && raw.quests && typeof raw.quests === "object" ? {quests: raw.quests} : {})};   // quests: 단골 의뢰 stars by id (core/quests.js)
}
/* a day is open when every day before it is cleared */
export const dayOpen = (prog, day) => day >= 0 && day < DAYS.length && day <= prog.cleared;
/* after a run on `day`: a cleared day unlocks the next and keeps its best stars; a failed run changes nothing */
export function afterDay(prog, day, cleared, stars){
  if(!cleared) return prog;
  const s = prog.stars.slice(); s[day] = Math.max(s[day] || 0, stars);
  return {...prog, cleared: Math.max(prog.cleared, day + 1), stars: s};
}
/* after a 역경 run: a clear keeps its best hard stars, a miss changes nothing */
export function afterHard(prog, day, cleared, stars){
  if(!cleared) return prog;
  const h = (prog.hard || DAYS.map(() => 0)).slice(); h[day] = Math.max(h[day] || 0, stars);
  return {...prog, hard: h};
}
export const nextDay = (prog, day) => day + 1 < DAYS.length && dayOpen(prog, day + 1) ? day + 1 : -1;

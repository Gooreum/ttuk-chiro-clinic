/* react: faces after a good crack (core/faceRig.js pickReaction): jolt at the crack, ahh (an open-mouth sigh, eyes
   still closed) right after, first as the x-ray clears (eyes open and blink / dazed), then held to the end; big
   replaces then on a PERFECT. 정작가 is the calm one (98-video reference): eyes stay closed, no flinch.
   lines after a crack: sigh (floats up with the ahh face), first side what -> ahh, second side after -> done.
   lines after a wrong crack (game/flow.js hurt, core/fail.js): stop then ouch (past the limit), dud (a half crack),
   finger (the therapist's knuckle cracked); then fail[n] for the n-th one on this patient, doubt as the player
   tries again, quit on the day log if the day ends on them. */
/* Patients: a pool of 10 (the first 5 plus 5 body types: skinny, glam, muscle hog, granny, kid), PER_DAY of them drawn at random each day. xr = what the x-ray shows for the complaint (scene/xray.js: flat, muscle, disc, rot, facet). makePatients() rolls each day's target angles (both sides) and danger limits. */
import { bodyOf, withBody } from "../core/body.js";
export const TRAITS = {
  nervous:  {label:"긴장형", desc:"오래 끌면 점점 굳어요"},
  stiff:    {label:"근육 뭉침", desc:"머리가 묵직해서 잘 안 돌아가요"},
  flexible: {label:"유연함", desc:"평소보다 크게 돌려야 해요"},
  elder:    {label:"어르신", desc:"조금만 무리해도 위험해요"}
};
export const ROSTER = [
  {name:"박대리", xr:"flat", age:32, cc:"모니터 앞 하루 9시간. 고개가 앞으로 쏠려 있어요.", seg:5, side:1, tolR:9, tolB:6, breath:4.4, burn:1.6,
   look:{hair:"short", hairCol:0x2a211c, skin:0xeabd9b, gown:0x8f86c4, glasses:false, model:"patient01", hairTint:0x4a3a30},
   react:{jolt:["startle", "gasp"], ahh:["sigh"], first:["awake", "dazed", "bliss"], then:["relief", "beam"], big:["teary", "beam"]},
   lines:{start:"목이 돌덩이예요…", near:"어, 거기 뭔가 걸려요", ouch:"아야!", jolt:"헉!", sigh:"하아…", what:"방금 뭐였어요?!", ahh:"아… 이거지… 시원하다",
          after:"어깨까지 다 풀린 것 같아요", done:"와… 고개가 돌아가요!", idle:"선생님…?",
          dud:"…끝난 거예요?", finger:"선생님 손에서 난 거 같은데요?", stop:"잠깐잠깐잠깐!", doubt:"이번엔 진짜죠?", quit:"산재 신청하러 갑니다",
          fail:["이거 산재 처리 되나요?", "팀장님한테 반차 쓴다고 해야겠다", "저 내일 출근해야 돼요…"]}},
  {name:"최교수", xr:"muscle", age:54, cc:"논문 마감 주간. 왼쪽 목이 결려서 잠을 못 잤어요.", seg:4, side:-1, tolR:8, tolB:5.5, breath:3.0, burn:2.6, trait:"nervous",
   look:{hair:"short", hairCol:0x8d8680, skin:0xe4b493, gown:0x6fa3bd, glasses:true, model:"patient02"},
   react:{jolt:["wince", "startle"], ahh:["sigh"], first:["awake", "dazed", "wow"], then:["wow", "relief"], big:["grin", "teary"]},
   lines:{start:"아, 아프게 하시면 안 돼요…", near:"으음… 거기요?", ouch:"으악!", jolt:"으엇?!", sigh:"후우…", what:"어…? 방금 그게 다예요?", ahh:"어…? 시원한데요?",
          after:"뻐근한 게 다 풀렸네요", done:"어? 하나도 안 아팠어요", idle:"아직이에요…? 무서워요",
          dud:"음…? 아직 시작 안 하신 거죠?", finger:"방금 그 소리… 선생님 관절인데요?", stop:"잠깐! 잠깐만요!", doubt:"이번엔 확실하죠…?", quit:"학회에 보고하겠습니다",
          fail:["이거 부작용 사례로 논문 쓸 수 있겠네요", "학회에 보고해야 하나…", "IRB 승인은 받으셨죠?"]}},
  {name:"이라이더", xr:"disc", age:27, cc:"헬멧 쓰고 하루 12시간 배달. 목이 꽉 막혔어요.", seg:3, side:1, tolR:7, tolB:5, breath:3.6, burn:0, trait:"stiff",
   look:{hair:"messy", hairCol:0x1e1a17, skin:0xd9a47e, gown:0xb08f68, glasses:false, model:"patient03"},
   react:{jolt:["wince", "gasp"], ahh:["sigh"], first:["awake", "grin", "bliss"], then:["relief", "beam"], big:["beam", "laugh"]},
   lines:{start:"빨리 해주세요, 콜 밀려요", near:"오 거기 거기", ouch:"아 씨… 아파요", jolt:"어우 씨!", sigh:"크으…", what:"헐, 방금 뭐예요?!", ahh:"와 미쳤다, 개운해",
          after:"목이 완전 다 풀렸어요", done:"오 대박, 헬멧이 가벼워질 듯", idle:"콜 들어오는데…",
          dud:"어? 뭐예요, 끝?", finger:"쌤 손가락 괜찮아요?", stop:"아 잠깐 잠깐!", doubt:"이번엔 제대로 하는 거죠?", quit:"별점 하나 드리고 갑니다",
          fail:["아 씨, 별점 테러 각인데요", "콜 세 개 날아갔어요", "헬멧보다 이게 더 무거워요"]}},
  {name:"정작가", xr:"rot", age:31, cc:"웹툰 마감 사흘째 밤샘. 고개가 끝까지 안 돌아가요.", seg:5, side:-1, tolR:6.5, tolB:4.5, breath:4.8, burn:0, trait:"flexible",
   look:{hair:"long", hairCol:0x3a2418, skin:0xf0c7a8, gown:0xc98a95, glasses:false, model:"patient04"},
   react:{jolt:["calm"], ahh:["sigh"], first:["serene", "bliss"], then:["serene", "relief"], big:["serene", "teary"]},
   lines:{start:"요가 좀 해서 많이 돌아가요", near:"아 거기가 막힌 데예요", ouch:"악! 손목보다 아파요", jolt:"흐읍…", sigh:"후우…", what:"…방금 소리 났죠?", ahh:"하아… 살 것 같아요",
          after:"다 풀린 것 같아요…", done:"오늘 마감 할 수 있겠다", idle:"원고 생각나네…",
          dud:"…지금 하신 거예요?", finger:"방금 선생님 손에서 소리 났어요", stop:"스톱! 스톱!", doubt:"…이번엔 그리지 않게 해주세요", quit:"다음 화 악역은 선생님입니다",
          fail:["이거 웹툰에 그릴게요. 실명으로", "다음 화 악역 생겼다", "콘티 각이네요"]}},
  {name:"김사장", xr:"facet", age:63, cc:"골프 스윙하다 삐끗. 오른쪽 목이 걸려요.", seg:6, side:1, tolR:5.5, tolB:4, breath:4.0, burn:3.6, trait:"elder",
   look:{hair:"bald", hairCol:0x9a948d, skin:0xdcab88, gown:0x86a37f, glasses:false, model:"patient05"},
   react:{jolt:["startle", "wince"], ahh:["sigh"], first:["dazed", "awake", "bliss"], then:["laugh", "relief"], big:["laugh"]},
   lines:{start:"살살 해, 나 나이 있어", near:"어허, 거기 맞네", ouch:"어이쿠!", jolt:"어이쿠야!", sigh:"어허…", what:"어허, 방금 뭐가 이리 시원해?", ahh:"어허~ 시원하다",
          after:"십 년은 젊어졌구먼", done:"허허, 이 맛에 오지", idle:"자네 졸고 있나?",
          dud:"어허, 하다 말았나?", finger:"자네 손가락이 더 아프겠구먼", stop:"어허허허 잠깐!", doubt:"이번엔 똑바로 하게", quit:"원장 나오라 그래!",
          fail:["자네… 면허는 있지?", "이거 우리 집사람한테 말하면 안 돼", "내가 골프채로 해도 이것보단 낫겠어"]}},
  // body types (core/body.js BODY_OF: patient06 slim, 07 beauty, 08 bulk, 09 granny, 10 child; the difficulty multipliers live there)
  {name:"조멸치", xr:"flat", age:28, cc:"밤샘 개발자. 사흘째 배포 중이라 목이 젓가락처럼 꺾였어요.", seg:5, side:-1, tolR:8, tolB:5.5, breath:3.4, burn:0.3, trait:"nervous",
   look:{hair:"messy", hairCol:0x1a1614, skin:0xe8c2a4, gown:0x7a8fa6, glasses:false, model:"patient06", clinicModel:"patient14", backModel:"patient14"}, waist:"의자에서 배포 기다리다 허리가 무한 루프로 꼬였어요.",
   react:{jolt:["startle", "gasp"], ahh:["sigh"], first:["dazed", "awake", "wow"], then:["relief", "teary"], big:["teary", "beam"]},
   lines:{start:"저 커밋만 하고 누워도 돼요? 목이 젓가락이에요", near:"어, 거기 버그 있는 데예요", ouch:"으악! 런타임 에러!", jolt:"힉!", sigh:"하아…", what:"방금 그거… 핫픽스예요?", ahh:"와… 빌드 한 방에 성공한 기분이에요",
          after:"반대쪽도 머지 완료", done:"오늘은 칼퇴… 아니 그냥 퇴근이라도", idle:"서버 터졌다는 알림 왔는데…",
          dud:"…이거 로딩 중인 거죠?", finger:"선생님 손가락에서 예외 발생했어요", stop:"잠깐! 저장 안 했어요!", doubt:"이번엔 테스트 돌리고 해 주세요", quit:"이 버그 선생님한테 할당합니다",
          fail:["이거 장애 보고서 써야 돼요", "롤백… 목도 롤백 되나요?", "제 목은 레거시 코드예요. 아무도 못 건드려요"]}},
  {name:"한미모", xr:"rot", age:26, cc:"국제선 승무원. 12시간 기내 미소로 고개 숙이다 목이 인사 각도로 굳었어요.", seg:4, side:1, tolR:7, tolB:5, breath:3.8, burn:0.4, trait:"flexible",
   look:{hair:"long", hairCol:0x2b1a12, skin:0xf3cfb6, gown:0x2f4e7a, glasses:false, model:"patient07"},
   react:{jolt:["gasp", "wince"], ahh:["sigh"], first:["awake", "bliss", "grin"], then:["beam", "relief"], big:["beam", "teary"]},
   lines:{start:"손님, 좌석 등받이 세워 주세요… 아 제가 누웠구나", near:"어머, 거기가 인사하는 각도예요", ouch:"꺅! 난기류예요!", jolt:"앗!", sigh:"후우…", what:"방금 그거… 기장님 방송이에요?", ahh:"하아… 미소 근육이 드디어 퇴근했어요",
          after:"반대쪽도 순항 고도 도달", done:"다음 비행 땐 비즈니스로 모실게요. 마음만요", idle:"탑승 시간 다 됐는데…",
          dud:"…이륙 지연인가요?", finger:"선생님 손가락, 구명조끼 필요하세요?", stop:"잠깐만요! 안전벨트 표시등 켜졌어요!", doubt:"이번엔 부드럽게 착륙해 주세요", quit:"승객 불만 접수하겠습니다. 미소로요",
          fail:["이건 회항 사유예요", "기내 방송으로 사과해 주세요", "미소는 유지 중이에요. 목은 아니고요"]}},
  {name:"마동철", xr:"muscle", age:38, cc:"씨름선수. 목이 원래 없대요. 샅바 잡다 어깨에 묻힌 목이 걸렸어요.", seg:6, side:1, tolR:7, tolB:5, breath:4.6, burn:3.2, trait:"stiff",
   look:{hair:"short", hairCol:0x161210, skin:0xc98f6a, gown:0x3c3c44, glasses:false, model:"patient08", clinicModel:"patient12"}, waist:"샅바 잡다 허리가 씨름판처럼 굳어 버렸어요.",
   react:{jolt:["wince", "startle"], ahh:["sigh"], first:["dazed", "grin", "wow"], then:["laugh", "relief"], big:["laugh", "beam"]},
   lines:{start:"제 목 찾으실 수 있겠어요? 저도 못 찾았어요", near:"오, 거기 목 맞아요. 처음 알았네", ouch:"으어어! 들배지기 당했다!", jolt:"흐읍!", sigh:"후우우…", what:"방금… 제 목 나온 거예요?", ahh:"와… 모래판에서 일어난 기분이에요",
          after:"반대쪽에도 목이 있었네요", done:"천하장사 되면 쌀 한 가마 보낼게요", idle:"밥때 지났는데…",
          dud:"…간지러운데요?", finger:"선생님 손가락이 제 승모근에 졌어요", stop:"잠깐! 샅바 다시 잡을게요!", doubt:"이번엔 뒤집기 한 판 가요", quit:"모래판으로 돌아갑니다. 쿵쿵",
          fail:["목 대신 승모근만 돌았어요", "감독님이 보면 기권패예요", "목이 또 어깨 속으로 숨었어요"]}},
  {name:"복순할매", xr:"disc", age:79, cc:"시장 나물 장수 50년. 쪼그려 앉아 고사리 다듬다 목이 굳었어.", seg:6, side:-1, tolR:5.5, tolB:4, breath:4.8, burn:3.0, trait:"elder",
   look:{hair:"messy", hairCol:0xcfcac2, skin:0xd9a988, gown:0xa86f8c, glasses:false, model:"patient09", clinicModel:"patient13", backModel:"patient13", sideModel:"patient13"}, waist:"50년 좌판에 앉았더니 허리가 고사리처럼 말렸어.",
   react:{jolt:["startle", "wince"], ahh:["sigh"], first:["dazed", "bliss", "awake"], then:["laugh", "relief"], big:["laugh", "teary"]},
   lines:{start:"아이고 선생, 살살 혀. 나물 다 시들어", near:"어이구, 거기여 거기. 고사리 다듬던 데", ouch:"아이고 데이고!", jolt:"아이고머니!", sigh:"아이고오…", what:"방금 뭐여? 장판 터지는 소리여?", ahh:"아이고… 뜨신 물에 들어간 것 같네",
          after:"반대쪽도 시금치처럼 숨이 죽었네", done:"이따 시장 와. 콩나물 한 줌 더 줄게", idle:"장 파할 시간인디…",
          dud:"어이구, 하다 만 겨?", finger:"선생 손가락에 파스 붙여 줄까?", stop:"아이고 잠깐! 잠깐만 혀!", doubt:"이번엔 제대로 혀 봐. 할미 기다려", quit:"우리 손주한테 일러야겄어",
          fail:["아이고, 나물보다 내 목이 먼저 시들겄네", "이 할미 오래 살라고 하는 거여?", "고사리도 이렇게는 안 꺾어"]}},
  {name:"정꼬마", xr:"facet", age:11, cc:"초등학교 4학년. 태블릿 게임 6시간에 목이 거북이가 됐어요. 엄마 몰래 왔대요.", seg:3, side:1, tolR:8, tolB:5.5, breath:4.0, burn:0,
   look:{hair:"short", hairCol:0x231b16, skin:0xf2c9a8, gown:0xf2b134, glasses:false, model:"patient10"},
   react:{jolt:["startle", "gasp"], ahh:["sigh"], first:["wow", "awake", "grin"], then:["beam", "laugh"], big:["laugh", "beam"]},
   lines:{start:"엄마한테는 학원 간다고 했어요. 비밀이에요!", near:"오, 거기가 게임하는 쪽이에요", ouch:"으앙! 아파요!", jolt:"으앗!", sigh:"휴우…", what:"우와, 방금 레벨업 소리 났어요!", ahh:"우와… 목이 새 거 됐어요!",
          after:"반대쪽도 아이템 먹었어요", done:"친구들한테 자랑할 거예요. 엄마 빼고요", idle:"학원 끝날 시간인데…",
          dud:"…로딩 중이에요?", finger:"선생님 손가락도 게임 많이 했어요?", stop:"잠깐만요! 일시정지!", doubt:"이번엔 진짜 깨 주세요", quit:"집에 갈래요. 엄마한테 다 말할 거예요!",
          fail:["엄마한테 이를 거예요…", "게임이었으면 리셋했어요", "선생님, 이번 판은 패배예요"]}},
  // image-to-3D body (2026-10-24, Codex concept -> Tripo multi-view -> scripts in scripts/assets/README.md): 목꺾기 only for now,
  // there is no towel-stage copy (user: "지금 한미모는 냅두고 뉴 캐릭터로 넣자. 일단 목꺾기에만 넣어봐")
  {name:"최필라", xr:"flat", age:27, cc:"필라테스 강사. 회원들 코어 잡아 주다 정작 자기 목이 일자로 굳었어요.", seg:5, side:-1, tolR:7, tolB:5, breath:3.6, burn:0.3, trait:"flexible",
   look:{hair:"long", hairCol:0x1e140f, skin:0xf0cdb4, gown:0x22324f, glasses:false, model:"patient11", backModel:"patient11", sideModel:"patient11"}, waist:"코어는 단단한데 허리가 리포머 위에서 접혀 버렸어요.",
   react:{jolt:["gasp", "startle"], ahh:["sigh"], first:["awake", "bliss", "wow"], then:["beam", "relief"], big:["beam", "laugh"]},
   lines:{start:"코어에 힘 주고 누울게요. 목은 힘 빼고요, 아마도", near:"어, 거기 코어랑 연결된 데예요", ouch:"악! 리포머 스프링 튕겼어요!", jolt:"헙!", sigh:"후우우…", what:"방금 그거… 척추 분절이에요?", ahh:"하아… 플랭크 3분 끝난 기분이에요",
          after:"반대쪽도 정렬 완료", done:"다음 수업에 회원님들한테 자랑할게요", idle:"수업 10분 전인데…",
          dud:"…이거 워밍업이죠?", finger:"선생님 손가락 코어가 약하시네요", stop:"잠깐! 호흡부터 맞춰요!", doubt:"이번엔 들숨에 준비, 날숨에 툭이요", quit:"오늘 수업 환불이에요",
          fail:["이건 자세 교정 반대예요", "회원님들이 보면 안 돼요", "목이 리포머에 낀 것 같아요"]}}
];
export const rosterFor = game => ROSTER.filter(p => !p.games || p.games.includes(game));   // games: the modes a patient has a body for
/* 허리누르기 / 허리비틀기 (game "back" / "side") outside the 영업 일지: ?patient=<name> when that patient has a body for the
   mode, else one at random of 박대리 (the mode's own MPFB body) and the image-to-3D patients with look.backModel /
   sideModel (back/patientNN.glb, side/patientNN.glb); fixed (the shot and case builds): 박대리. */
export function lumbarPatient(game, pick, rand = Math.random, fixed = false){
  const key = game + "Model", pool = [ROSTER.find(p => p.name === "박대리"), ...ROSTER.filter(p => p.look[key])];
  return pool.find(p => p.name === pick) || (fixed ? pool[0] : pool[Math.floor(rand()*pool.length)]);
}
export const SHOW_ZONE_UNTIL = 2;
export const REVIEWS = {
  3:["손이 약손이에요. 단골 할게요", "들어올 때랑 나갈 때 목이 달라요", "소리부터 시원했어요"],
  2:["시원했어요. 조금 무서웠지만", "다음에도 올게요", "목이 한결 가벼워요"],
  1:["다음엔 살살 부탁해요", "시원하긴 한데 좀 아팠어요", "용기 내서 또 올게요"]
};
/* Each patient is adjusted on both sides: the complaint side (p.side) first, then the opposite side.
   Every side rolls its own target angle. rand is injectable for tests.
   A day sees PER_DAY patients drawn from the roster in random order (5 of the same loop dragged, user 2026-10-16).
   fixed: a 영업 일지 day's patients (core/campaign.js dayRoster), taken as given in that order. */
export const PER_DAY = 3;
export function makePatients(rand = Math.random, count = PER_DAY, fixed = null, from = ROSTER){
  const pool = fixed ? fixed.slice() : from.slice();
  if(!fixed) for(let i = pool.length - 1; i > 0; i--){ const j = Math.floor(rand()*(i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool.slice(0, fixed ? pool.length : count).map(p => {
    const big = p.trait === "flexible", old = p.trait === "elder", b = bodyOf(p), k = b ? b.mag : 1;
    const roll = side => {
      const mag = (big ? 44 + rand()*9 : old ? 24 + rand()*10 : 28 + rand()*14) * k;
      return {side, rot: side * mag, bend: -side * (old ? 6 + rand()*8 : 8 + rand()*10)};
    };
    const out = {...p, sides: [roll(p.side), roll(-p.side)], limR: old ? 50 : 63, limB: old ? 22 : 27};
    return b ? withBody(out, b) : out;   // core/body.js: the body type scales the zone, the danger lines and the breath
  });
}

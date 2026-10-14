/* Patients: 5 per day. makePatients() rolls each day's target angles (both sides) and danger limits. */
export const TRAITS = {
  nervous:  {label:"긴장형", desc:"오래 끌면 점점 굳어요"},
  stiff:    {label:"근육 뭉침", desc:"머리가 묵직해서 잘 안 돌아가요"},
  flexible: {label:"유연함", desc:"평소보다 크게 돌려야 해요"},
  elder:    {label:"어르신", desc:"조금만 무리해도 위험해요"}
};
export const ROSTER = [
  {name:"박대리", age:32, cc:"모니터 앞 하루 9시간. 고개가 앞으로 쏠려 있어요.", seg:5, side:1, tolR:9, tolB:6, breath:4.4,
   look:{hair:"short", hairCol:0x2a211c, skin:0xeabd9b, gown:0x8f86c4, glasses:false},
   lines:{start:"목이 돌덩이예요…", near:"어, 거기 뭔가 걸려요", ouch:"아야!", done:"와… 고개가 돌아가요!", idle:"선생님…?"}},
  {name:"최교수", age:54, cc:"논문 마감 주간. 왼쪽 목이 결려서 잠을 못 잤어요.", seg:4, side:-1, tolR:8, tolB:5.5, breath:3.0, trait:"nervous",
   look:{hair:"short", hairCol:0x8d8680, skin:0xe4b493, gown:0x6fa3bd, glasses:true},
   lines:{start:"아, 아프게 하시면 안 돼요…", near:"으음… 거기요?", ouch:"으악!", done:"어? 하나도 안 아팠어요", idle:"아직이에요…? 무서워요"}},
  {name:"이라이더", age:27, cc:"헬멧 쓰고 하루 12시간 배달. 목이 꽉 막혔어요.", seg:3, side:1, tolR:7, tolB:5, breath:3.6, trait:"stiff",
   look:{hair:"messy", hairCol:0x1e1a17, skin:0xd9a47e, gown:0xb08f68, glasses:false},
   lines:{start:"빨리 해주세요, 콜 밀려요", near:"오 거기 거기", ouch:"아 씨… 아파요", done:"오 대박, 헬멧이 가벼워질 듯", idle:"콜 들어오는데…"}},
  {name:"정작가", age:31, cc:"웹툰 마감 사흘째 밤샘. 고개가 끝까지 안 돌아가요.", seg:5, side:-1, tolR:6.5, tolB:4.5, breath:4.8, trait:"flexible",
   look:{hair:"long", hairCol:0x3a2418, skin:0xf0c7a8, gown:0xc98a95, glasses:false},
   lines:{start:"요가 좀 해서 많이 돌아가요", near:"아 거기가 막힌 데예요", ouch:"악! 손목보다 아파요", done:"오늘 마감 할 수 있겠다", idle:"원고 생각나네…"}},
  {name:"김사장", age:63, cc:"골프 스윙하다 삐끗. 오른쪽 목이 걸려요.", seg:6, side:1, tolR:5.5, tolB:4, breath:4.0, trait:"elder",
   look:{hair:"bald", hairCol:0x9a948d, skin:0xdcab88, gown:0x86a37f, glasses:false},
   lines:{start:"살살 해, 나 나이 있어", near:"어허, 거기 맞네", ouch:"어이쿠!", done:"허허, 이 맛에 오지", idle:"자네 졸고 있나?"}}
];
export const SHOW_ZONE_UNTIL = 2;
export const REVIEWS = {
  3:["손이 약손이에요. 단골 할게요", "들어올 때랑 나갈 때 목이 달라요", "소리부터 시원했어요"],
  2:["시원했어요. 조금 무서웠지만", "다음에도 올게요", "목이 한결 가벼워요"],
  1:["다음엔 살살 부탁해요", "시원하긴 한데 좀 아팠어요", "용기 내서 또 올게요"]
};
/* Each patient is adjusted on both sides: the complaint side (p.side) first, then the opposite side.
   Every side rolls its own target angle. rand is injectable for tests. */
export function makePatients(rand = Math.random){
  return ROSTER.map(p => {
    const big = p.trait === "flexible", old = p.trait === "elder";
    const roll = side => {
      const mag = big ? 44 + rand()*9 : old ? 24 + rand()*10 : 28 + rand()*14;
      return {side, rot: side * mag, bend: -side * (old ? 6 + rand()*8 : 8 + rand()*10)};
    };
    return {...p, sides: [roll(p.side), roll(-p.side)], limR: old ? 50 : 63, limB: old ? 22 : 27};
  });
}

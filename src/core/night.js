/* 심야 진료 (endgame, endless mode): after the 8th chapter the clinic stays open at night. Patients (목꺾기 / 목뽑기 mixed)
   keep coming until the shared pain slots run out or an ambulance is called. Everything is decided by a daily seed
   (the KST calendar date), so every player gets the same line-up on the same day and the best of the day is comparable.
   Pure: no DOM, no three. The glue (state, DOM, events) is game/night.js. Record: localStorage "chiroNightBest"
   {date, count, score}: the best run of that date (a new date starts over). */
export const NIGHT_KEY = "chiroNightBest";
export const NIGHT_UNLOCK = 56;   // campaign days cleared (all 8 chapters) before the mode opens
export const NIGHT_PAIN = 3;      // pain slots shared by the whole run (a rewarded continue adds one)
export const TIER_SIZE = 5;       // every 5 patients the night gets harder
export const NOISY_FROM = 10;     // from the 11th patient on the therapist's breath coaching is off
export const TIGHT_STEP = 0.07;   // zones shrink this much per tier ...
export const TIGHT_MIN = 0.5;     // ... down to half
export const DEEP_FROM = 8;       // tier 8 = the 41st patient: the zones keep shrinking below half (playtest 6 P1-3, the night used to flatten out at ~35)
export const DEEP_STEP = 0.03;    // per tier past DEEP_FROM ...
export const DEEP_MIN = 0.35;     // ... down to about a third of the normal zone

// campaign cast + roster that play on 목꺾기 / 목뽑기 days (patient/roster.js, patient/cast.js)
export const NIGHT_POOL = ["박대리", "최교수", "이라이더", "정작가", "김사장", "오인턴", "최조교", "말빨", "박팀장", "송기사", "김평범", "강직한",
  "편집장", "곽셰프", "서병장", "강해녀", "이마라톤", "사모님", "김상무", "장원장", "최프로", "유어시", "이스쿠터", "뚝튜브", "손경호", "야알바",
  "나공무", "보건소장", "도깨비영감", "메가회장", "뚝할배",
  "한미모", "정꼬마"];   // body types (2026-10-23), appended at the end

export const nightOpen = prog => !!prog && prog.cleared >= NIGHT_UNLOCK;

/* the calendar date in Korea ("2026-10-22"), whatever the phone's own time zone */
export const kstDate = (ms = Date.now()) => new Date(ms + 9 * 3600000).toISOString().slice(0, 10);

function fnv(str){
  let h = 2166136261;
  for(let i = 0; i < str.length; i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
/* a date string ("2026-10-22") or a timestamp (ms) -> an unsigned 32-bit seed */
export const nightSeed = date => fnv("night:" + (typeof date === "number" ? kstDate(date) : String(date)));

export function mulberry32(a){
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/* the random stream of patient i (salt: separate streams, e.g. the target-angle roll) */
export const nightRand = (seed, i, salt = 0) => mulberry32((seed ^ Math.imul(i + 1, 0x9E3779B1) ^ Math.imul(salt + 1, 0x85EBCA6B)) >>> 0);

export const nightTier = i => Math.floor(Math.max(0, i) / TIER_SIZE);
/* mods in the format of core/campaign.js: tight = a zone scale (a number here, a campaign day's true means 0.8), noisy = no breath coaching */
export function nightMods(i){
  const tier = nightTier(i), mods = {};
  if(tier >= DEEP_FROM) mods.tight = Math.max(DEEP_MIN, Math.round((TIGHT_MIN - DEEP_STEP * (tier - DEEP_FROM + 1)) * 100) / 100);
  else if(tier >= 1) mods.tight = Math.max(TIGHT_MIN, Math.round((1 - TIGHT_STEP * tier) * 100) / 100);
  if(i >= NOISY_FROM) mods.noisy = true;
  return mods;
}

/* patient i of the night: {i, tier, game, name, mods}. Never the same name twice in a row, never three of the same game in a row. */
export function nightPatient(seed, i){
  let prevName = "", g1 = "", g2 = "", out = null;
  for(let k = 0; k <= i; k++){
    const r = nightRand(seed, k);
    let idx = Math.floor(r() * NIGHT_POOL.length);
    if(NIGHT_POOL[idx] === prevName) idx = (idx + 1) % NIGHT_POOL.length;
    let game = r() < 0.5 ? "towel" : "clinic";
    if(g1 === game && g2 === game) game = game === "towel" ? "clinic" : "towel";
    prevName = NIGHT_POOL[idx]; g2 = g1; g1 = game;
    out = { i: k, tier: nightTier(k), game, name: prevName, mods: nightMods(k) };
  }
  return out;
}

/* patients who were fully treated (a star rating on the day log row); the one the run ended on is not counted */
export const nightCount = results => (results || []).filter(r => r && r.stars > 0).length;

/* The day's record. prev: the stored value (or null). More patients wins, equal count -> higher score. A run with no
   patient never counts. Returns the record to keep and whether this run set it. */
export function nightRecord(prev, date, count, score){
  const today = prev && prev.date === date && Number.isInteger(prev.count) ? { date, count: prev.count, score: prev.score | 0 } : null;
  const better = count > 0 && (!today || count > today.count || (count === today.count && score > today.score));
  return { record: better ? { date, count, score } : today, isBest: better };
}

export function nightRank(count){
  if(count >= 40) return "심야의 전설";
  if(count >= 25) return "야간 진료 달인";
  if(count >= 15) return "올빼미 원장";
  if(count >= 8) return "야근 원장";
  if(count >= 3) return "수습 야근자";
  return "불 끄고 퇴근";
}

/* Shared mutable game state (was closure variables in the single-file prototype). */
export const S = {
  patients: [], idx: 0, score: 0, pain: 0, painHere: 0, streak: 0, results: [],
  phase: "intro", busy: false,
  input: {rot:0, bend:0}, cur: {rot:0, bend:0},        // aim target -> smoothed aim
  target: null, inZone: false, patientStart: 0, saidNear: false, saidIdle: false,
  mode: "drag",
  thrust: 0, shake: 0, jitter: 0, face: "rest",
  reactFrom: 0, reactUntil: 0, reaction: null,         // crack reaction: camera leans in on the face from..until (ms); last pick
  breathT0: 0,
  prepUntil: 0,                                        // new patient: hands palpate / rock the head until then (ms); no aiming or judging
  rate: 0, peakRate: 0, jerkPeak: 0, flickCool: 0, nextPulse: 0, sensorSeen: false,
  slow: 0, zoom: 0, xray: 0, xrayHold: 0, wave: 0,
  crackT: -1, xrayIn: 0, hurtX: 0,                     // x-ray: seconds since it opened, delay before it opens, wrong-crack throb
  crackAmp: 1,                                         // scale of the neck's crack motion (a dud wrong crack: core/fail.js DUD_AMP)
  fails: [], boingAt: 0, flinchAt: 0, ghostFrom: 0, ghostUntil: 0,   // wrong-crack kinds on this patient; gag clocks (ms)
  missRot: 0, missBend: 0,        // where the wrong crack was aimed (the coral X on the ring)
  tiers: [], fracLvl: 0, fracT: 0, fracFired: false,   // how hard each wrong crack was (0..2); fracture x-ray: tier, seconds, cue played
  ambulance: false, lastForce: 0, chartOpen: false,                      // a crack / break ended the day; the last flick's peak strength (tuning panel)
  viewRot: 0,                                          // self-rotation of #app: 0 / 90 / 270
  sideIdx: 0, sidePts: [], sideStars: [],             // both-side adjustment: 0 = complaint side, 1 = opposite
  game: "clinic",                                      // "clinic" | "towel" (the title's practice mode; S.mode is the input mode)
  towel: null,                                         // towel mode: this patient's tension band {mid, half, limit} (core/towel.js)
  stretchAt: 0, stretchPeak: 0, slipAt: 0,             // towel mode gag clocks (ms) and how far the neck goes (m)
  stretchHold: 0, overAt: 0, xrayAt: 0,                           // the stretch's hold (s, 0 = core/towel.js STRETCH_HOLD), the over-pull's clock (ms)
  saidTense: false, saidTight: false                   // towel mode: the patient's tension lines, once each per patient
};

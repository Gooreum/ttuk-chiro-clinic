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
  viewRot: 0,                                          // self-rotation of #app: 0 / 90 / 270
  sideIdx: 0, sidePts: [], sideStars: []               // both-side adjustment: 0 = complaint side, 1 = opposite
};

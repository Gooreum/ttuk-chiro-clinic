/* Face state -> blendshape weights for the realistic head (MakeHuman expression units, Asian set).
   Patients lie with eyes closed ("rest"), open them when worried or tense and blink while open. A wrong crack is
   "ouch", then a sulk. A good crack plays a reaction (pickReaction): a jolt at the crack, a first reaction as the
   x-ray clears, then a second one held until the next side. Which faces a patient uses is the roster's `react`. */
const BOTH = (l, r, v) => ({[l]: v, [r]: v});
const LR = (unit, v) => BOTH(unit.replace("*", "left"), unit.replace("*", "right"), v);
const closure = v => LR("eye-*-closure", v);
const slit = v => LR("eye-*-slit", v);
const wide = v => LR("eye-*-opened-up", v);
const browUp = v => LR("eyebrows-*-inner-up", v);
const browOut = v => LR("eyebrows-*-extern-up", v);
const browDown = v => LR("eyebrows-*-down", v);
const sneer = v => LR("nose-*-elevation", v);
const flare = v => LR("nose-*-dilatation", v);

export const EXPRESSION_UNITS = [
  "eye-left-closure", "eye-right-closure", "eye-left-slit", "eye-right-slit",
  "eyebrows-left-inner-up", "eyebrows-right-inner-up", "eyebrows-left-down", "eyebrows-right-down",
  "mouth-corner-puller", "mouth-open", "mouth-compression", "mouth-pursing",
  "eye-left-opened-up", "eye-right-opened-up", "eyebrows-left-extern-up", "eyebrows-right-extern-up",
  "mouth-retraction", "mouth-upward-retraction", "mouth-elevation", "mouth-depression",
  "nose-left-elevation", "nose-right-elevation", "mouth-protusion", "mouth-eversion",
  "nose-left-dilatation", "nose-right-dilatation"
];
// w: the face's weights. live(t, w): slow motion on top (seconds), so a held face keeps breathing / laughing.
// prim: what the primitive (fallback) face shows.
const FACES = {
  rest:    {w: {...closure(1)}, prim: "rest"},
  worried: {w: {...browUp(0.8)}, prim: "worried"},
  tense:   {w: {...browUp(0.5), ...browDown(0.45), ...slit(0.35), "mouth-compression": 0.7, ...flare(0.3)}, prim: "tense"},
  // wrong crack: screwed-up eyes, a snarl; then a pout with a frown
  ouch:    {w: {...closure(1), ...slit(1), ...browDown(1), ...sneer(0.6), "mouth-open": 0.45, "mouth-elevation": 0.45, "mouth-retraction": 0.4}, prim: "ouch"},
  sulk:    {w: {...closure(0.45), ...browUp(0.7), ...browDown(0.25), "mouth-compression": 0.45, "mouth-protusion": 0.5, "mouth-pursing": 0.25}, prim: "worried",
            live: (t, w) => { w["mouth-protusion"] += 0.1*Math.sin(t*2.1); }},
  // the instant of the crack
  startle: {w: {...wide(0.8), ...browUp(1), ...browOut(0.8), "mouth-open": 0.7, "mouth-pursing": 0.25}, prim: "startle"},
  gasp:    {w: {...wide(1), ...browUp(1), ...browOut(1), "mouth-open": 0.45, "mouth-pursing": 0.6, ...flare(0.6)}, prim: "startle"},
  wince:   {w: {...closure(1), ...slit(1), ...browDown(0.8), ...sneer(0.8), "mouth-retraction": 0.9, "mouth-elevation": 0.35}, prim: "ouch"},
  // after the x-ray
  relief:  {w: {...closure(1), ...browUp(0.2), "mouth-corner-puller": 0.7, "mouth-compression": 0.3}, prim: "relief"},
  bliss:   {w: {...closure(1), ...browUp(0.55), "mouth-open": 0.35, "mouth-corner-puller": 0.5, ...flare(0.3)}, prim: "relief",
            live: (t, w) => { const s = Math.sin(t*1.6); w["mouth-open"] += 0.12*s; w["eyebrows-left-inner-up"] += 0.1*s; w["eyebrows-right-inner-up"] += 0.1*s; }},
  dazed:   {w: {...closure(0.45), ...browUp(0.35), ...browOut(0.35), "mouth-open": 0.22}, prim: "worried",
            live: (t, w) => { const s = Math.max(0, Math.sin(t*1.1)); Object.assign(w, closure(0.45 + 0.4*s*s*s)); }},
  wow:     {w: {...wide(0.6), ...browUp(0.8), ...browOut(0.8), "mouth-protusion": 0.55, "mouth-pursing": 0.55, "mouth-open": 0.2}, prim: "startle"},
  // smiles: corners up, upper lip only lifts a little, so just the front upper teeth show (a wide pull bares
  // every tooth to the molars and reads as a snarl)
  grin:    {w: {...wide(0.25), ...browUp(0.3), ...browOut(0.4), "mouth-corner-puller": 0.6, "mouth-upward-retraction": 0.1, "mouth-compression": 0.25}, prim: "relief"},
  beam:    {w: {...closure(0.75), ...slit(0.5), ...sneer(0.15), "mouth-corner-puller": 0.7, "mouth-upward-retraction": 0.15, "mouth-compression": 0.15}, prim: "relief",
            live: (t, w) => { w["mouth-open"] += 0.05*Math.max(0, Math.sin(t*1.3)); }},
  laugh:   {w: {...closure(0.9), ...slit(0.6), ...browUp(0.3), ...sneer(0.15), "mouth-corner-puller": 0.75, "mouth-upward-retraction": 0.2, "mouth-open": 0.14}, prim: "relief",
            live: (t, w) => { w["mouth-open"] += 0.08*Math.abs(Math.sin(t*8))*Math.max(0, Math.sin(t*1.7)); }},
  teary:   {w: {...closure(0.85), ...browUp(1), "mouth-corner-puller": 0.6, "mouth-eversion": 0.3, "mouth-open": 0.1, ...flare(0.45)}, prim: "relief",
            live: (t, w) => { const s = Math.sin(t*2.6); w["mouth-eversion"] += 0.1*s; w["nose-left-dilatation"] += 0.15*s; w["nose-right-dilatation"] += 0.15*s; }}
};
export const FACE_NAMES = Object.keys(FACES);
const faceOf = f => FACES[f] || FACES.rest;
/* Faces the loop may switch on its own (the nervous patient's worry); anything else is a reaction it leaves alone. */
export const isBaseFace = f => f === "rest" || f === "worried" || f === "tense";
export const primitiveFace = f => faceOf(f).prim;
/* Open eyes blink; closed and squinting ones don't. */
export const eyesOpen = f => { const w = faceOf(f).w; return ((w["eye-left-closure"] || 0) + (w["eye-right-closure"] || 0))/2 < 0.5; };
/* Full weight set (every unit present, 0 when unused) for a face state.
   blinking closes the eyes; t (seconds) drives the face's own small motion; breathIn 0..1 flares the nostrils. */
export function expressionWeights(face, blinking = false, t = 0, breathIn = 0){
  const F = faceOf(face);
  const w = Object.fromEntries(EXPRESSION_UNITS.map(u => [u, 0]));
  Object.assign(w, F.w);
  if(F.live) F.live(t, w);
  if(breathIn > 0) Object.assign(w, flare(Math.max(w["nose-left-dilatation"], 0.55*breathIn)));
  if(blinking) Object.assign(w, closure(1));
  return w;
}
/* The faces a crack plays: jolt (at the crack), first (as the x-ray clears), then (held until the next side).
   react: the patient's pools {jolt, first, then, big}; big replaces then on a PERFECT. prev: the other side's pick,
   rerolled a few times so the two sides of a patient read differently. */
const DEFAULT_REACT = {jolt: ["startle"], first: ["bliss"], then: ["relief"], big: ["beam"]};
export function pickReaction(react = DEFAULT_REACT, perfect = false, rand = Math.random, prev = null){
  const pick = a => a[Math.min(a.length - 1, Math.floor(rand()*a.length))];
  let r;
  for(let i = 0; i < 4; i++){
    r = {jolt: pick(react.jolt), first: pick(react.first), then: pick(perfect ? react.big : react.then)};
    if(!prev || r.first !== prev.first || r.then !== prev.then) break;
  }
  return r;
}

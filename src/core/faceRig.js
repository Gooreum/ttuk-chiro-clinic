/* Face state -> blendshape weights for the realistic head (MakeHuman expression units, Asian set).
   Mirrors what the primitive face does: patients lie with eyes closed ("rest"), open them when worried or tense,
   blink while open, squeeze and open the mouth on "ouch", jolt wide-eyed on "startle" (the instant of the crack),
   then sigh with a smile on "relief". */
const BOTH = (l, r, v) => ({[l]: v, [r]: v});
const closure = v => BOTH("eye-left-closure", "eye-right-closure", v);
const slit = v => BOTH("eye-left-slit", "eye-right-slit", v);
const browUp = v => BOTH("eyebrows-left-inner-up", "eyebrows-right-inner-up", v);
const browDown = v => BOTH("eyebrows-left-down", "eyebrows-right-down", v);

export const EXPRESSION_UNITS = [
  "eye-left-closure", "eye-right-closure", "eye-left-slit", "eye-right-slit",
  "eyebrows-left-inner-up", "eyebrows-right-inner-up", "eyebrows-left-down", "eyebrows-right-down",
  "mouth-corner-puller", "mouth-open", "mouth-compression", "mouth-pursing"
];
const FACES = {
  rest:    {...closure(1)},
  worried: {...browUp(0.8)},
  tense:   {...browUp(0.5), ...browDown(0.45), ...slit(0.35), "mouth-compression": 0.7},
  ouch:    {...closure(1), ...slit(1), ...browDown(1), "mouth-open": 0.55, "mouth-pursing": 0.35},
  startle: {...browUp(1), "mouth-open": 0.7, "mouth-pursing": 0.25},
  relief:  {...closure(1), ...browUp(0.2), "mouth-corner-puller": 0.85, "mouth-open": 0.15}
};
/* Full weight set (every unit present, 0 when unused) for a face state; blinking closes the eyes. */
export function expressionWeights(face, blinking = false){
  const w = Object.fromEntries(EXPRESSION_UNITS.map(u => [u, 0]));
  Object.assign(w, FACES[face] || FACES.rest);
  if(blinking) Object.assign(w, closure(1));
  return w;
}

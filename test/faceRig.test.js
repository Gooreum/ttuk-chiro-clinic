import { describe, it, expect } from "vitest";
import { expressionWeights, decalWeights, EXPRESSION_UNITS, FACE_NAMES, eyesOpen, isBaseFace, primitiveFace, pickReaction } from "../src/core/faceRig.js";
import { ROSTER } from "../src/patient/roster.js";

describe("expressionWeights", () => {
  it("always returns every unit", () => {
    [...FACE_NAMES, "unknown"].forEach(f => {
      expect(Object.keys(expressionWeights(f)).sort()).toEqual([...EXPRESSION_UNITS].sort());
    });
  });
  it("rest keeps the eyes closed, worried opens them", () => {
    expect(expressionWeights("rest")["eye-left-closure"]).toBe(1);
    expect(expressionWeights("worried")["eye-left-closure"]).toBe(0);
    expect(expressionWeights("worried")["eyebrows-right-inner-up"]).toBeGreaterThan(0.5);
  });
  it("blinking closes open eyes", () => {
    expect(expressionWeights("tense", true)["eye-right-closure"]).toBe(1);
  });
  it("ouch squeezes and opens the mouth, relief smiles", () => {
    const o = expressionWeights("ouch");
    expect(o["eye-left-slit"]).toBe(1);
    expect(o["mouth-open"]).toBeGreaterThan(0);
    expect(expressionWeights("relief")["mouth-corner-puller"]).toBeGreaterThan(0.5);
  });
  it("startle opens the eyes wide and drops the jaw", () => {
    const s = expressionWeights("startle");
    expect(s["eye-left-closure"]).toBe(0);
    expect(s["eyebrows-left-inner-up"]).toBe(1);
    expect(s["mouth-open"]).toBeGreaterThan(0.5);
  });
  it("unknown faces fall back to rest", () => {
    expect(expressionWeights("whatever")).toEqual(expressionWeights("rest"));
  });
  it("only uses units the head exports, weights stay in 0..1.3 while a face moves", () => {
    FACE_NAMES.forEach(f => [0, 0.7, 2.3, 9.1].forEach(t => {
      const w = expressionWeights(f, false, t);
      expect(Object.keys(w)).toHaveLength(EXPRESSION_UNITS.length);
      Object.values(w).forEach(v => { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1.3); });
    }));
  });
  it("the in-breath flares the nostrils", () => {
    expect(expressionWeights("rest", false, 0, 1)["nose-left-dilatation"]).toBeGreaterThan(0.5);
    expect(expressionWeights("rest", false, 0, 0)["nose-left-dilatation"]).toBe(0);
  });
  it("eyes: open faces blink, closed and squinting ones don't", () => {
    expect(eyesOpen("worried")).toBe(true);
    expect(eyesOpen("gasp")).toBe(true);
    expect(eyesOpen("rest")).toBe(false);
    expect(eyesOpen("beam")).toBe(false);
  });
  it("only rest / worried / tense are base faces the loop may override", () => {
    expect(FACE_NAMES.filter(isBaseFace).sort()).toEqual(["rest", "tense", "worried"]);
  });
  it("every face maps to a primitive face", () => {
    FACE_NAMES.forEach(f => expect(["rest", "worried", "tense", "ouch", "startle", "relief"]).toContain(primitiveFace(f)));
  });
});

describe("decalWeights (painted faces for a head without blendshapes)", () => {
  const top = (f, blink = false, t = 0) => decalWeights(expressionWeights(f, blink, t));
  it("rest shows the closed eyes and leaves the mouth alone", () => {
    expect(top("rest")).toEqual({closed: [1, 0], smile: [0, 0], squeeze: [0, 0], open: [0, 0]});
  });
  it("worried shows the face as built (open eyes), a blink closes them", () => {
    Object.values(top("worried")).forEach(([u, l]) => { expect(u).toBe(0); expect(l).toBe(0); });
    expect(top("worried", true).closed[0]).toBe(1);
  });
  it("idle (rest on a painted face) keeps the eyes open and blinks", () => {
    Object.values(top("idle")).forEach(([u, l]) => { expect(u).toBe(0); expect(l).toBe(0); });
    expect(eyesOpen("idle")).toBe(true);
    expect(top("idle", true).closed[0]).toBe(1);
  });
  it("ouch squeezes the eyes and grimaces, relief smiles with closed eyes, startle goes wide and open-mouthed", () => {
    const o = top("ouch");
    expect(o.squeeze[0]).toBe(1); expect(o.closed[0]).toBe(0); expect(o.squeeze[1]).toBeGreaterThan(o.open[1]);
    expect(top("relief").smile).toEqual([1, 1]);
    expect(top("startle").open[0]).toBe(1); expect(top("startle").open[1]).toBe(1);
  });
  it("every face keeps each weight in 0..1 and the eye paintings from adding past 1", () => {
    FACE_NAMES.forEach(f => [0, 0.1, 1.7].forEach(t => {
      const d = top(f, false, t);
      Object.values(d).flat().forEach(v => { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); });
      expect(d.closed[0] + d.smile[0] + d.squeeze[0] + d.open[0]).toBeLessThanOrEqual(1 + 1e-9);
    }));
  });
});

describe("pickReaction", () => {
  it("every roster pool names real faces", () => {
    ROSTER.forEach(p => Object.values(p.react).flat().forEach(f => expect(FACE_NAMES).toContain(f)));
  });
  it("picks from the patient's pools, big on a PERFECT", () => {
    const react = {jolt: ["gasp"], first: ["dazed"], then: ["relief"], big: ["laugh"]};
    expect(pickReaction(react, false, () => 0)).toEqual({jolt: "gasp", first: "dazed", then: "relief"});
    expect(pickReaction(react, true, () => 0.999).then).toBe("laugh");
  });
  it("the second side rerolls to differ from the first when it can", () => {
    const react = {jolt: ["startle"], first: ["dazed", "bliss"], then: ["relief", "beam"], big: ["beam"]};
    const seq = [0, 0, 0, 0, 0, 0, 0.9, 0.9, 0.9];
    let i = 0;
    const r = pickReaction(react, false, () => seq[i++ % seq.length], {jolt: "startle", first: "dazed", then: "relief"});
    expect(r.first === "dazed" && r.then === "relief").toBe(false);
  });
  it("falls back to a default reaction without pools", () => {
    expect(pickReaction(undefined, false, () => 0).then).toBe("relief");
  });
});

describe("after-crack faces (98-video reference)", () => {
  it("sigh: pursed lips breathing out (no teeth), eyes still closed", () => {
    [0, 1.2, 3.7].forEach(t => {
      const w = expressionWeights("sigh", false, t);
      expect(w["mouth-pursing"]).toBeGreaterThan(0.2); expect(w["mouth-open"]).toBe(0); expect(w["mouth-protusion"]).toBe(0);
      expect(w["eye-left-closure"]).toBe(1);
      expect(w["eye-right-closure"]).toBe(1);
    });
  });
  it("awake: eyes open and both blink together now and then", () => {
    expect(eyesOpen("awake")).toBe(true);
    const ts = Array.from({length: 260}, (_, i) => i*0.01);
    const shut = ts.filter(t => expressionWeights("awake", false, t)["eye-left-closure"] === 1);
    expect(shut.length).toBeGreaterThan(0);
    expect(shut.length).toBeLessThan(ts.length/4);
  });
  it("calm and serene keep the eyes closed and never startle", () => {
    ["calm", "serene"].forEach(f => {
      expect(eyesOpen(f)).toBe(false);
      const w = expressionWeights(f, false, 2);
      expect(w["eye-left-opened-up"]).toBe(0);
      expect(w["mouth-open"]).toBeLessThan(0.15);
    });
  });
  it("no face winks: both eyes always match", () => {
    FACE_NAMES.forEach(f => [0, 0.1, 0.3, 1.7, 5.2].forEach(t => {
      const w = expressionWeights(f, false, t);
      expect(w["eye-left-closure"]).toBe(w["eye-right-closure"]);
      expect(w["eye-left-slit"]).toBe(w["eye-right-slit"]);
    }));
  });
  it("smiles keep the upper-lip lift small (no teeth to the molars)", () => {
    FACE_NAMES.forEach(f => expect(expressionWeights(f, false, 1)["mouth-upward-retraction"]).toBeLessThanOrEqual(0.2));
  });
  it("pickReaction adds the sigh from an ahh pool, and leaves it out without one", () => {
    const react = {jolt: ["calm"], ahh: ["sigh"], first: ["serene"], then: ["serene"], big: ["serene"]};
    expect(pickReaction(react, false, () => 0)).toEqual({jolt: "calm", ahh: "sigh", first: "serene", then: "serene"});
    expect(pickReaction({jolt: ["gasp"], first: ["dazed"], then: ["relief"], big: ["laugh"]}, false, () => 0)).not.toHaveProperty("ahh");
  });
  it("at least one roster patient is calm: no flinch, eyes closed throughout", () => {
    const calm = ROSTER.filter(p => p.react.jolt.every(f => !eyesOpen(f)) && [...p.react.first, ...p.react.then, ...p.react.big].every(f => !eyesOpen(f)));
    expect(calm.length).toBeGreaterThanOrEqual(1);
  });
  it("every patient has the after-crack lines", () => {
    ROSTER.forEach(p => ["sigh", "what", "ahh", "after", "done"].forEach(k => expect(typeof p.lines[k]).toBe("string")));
  });
});

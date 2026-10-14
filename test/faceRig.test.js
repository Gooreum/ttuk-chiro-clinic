import { describe, it, expect } from "vitest";
import { expressionWeights, EXPRESSION_UNITS, FACE_NAMES, eyesOpen, isBaseFace, primitiveFace, pickReaction } from "../src/core/faceRig.js";
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

import { describe, it, expect } from "vitest";
import { expressionWeights, EXPRESSION_UNITS } from "../src/core/faceRig.js";

describe("expressionWeights", () => {
  it("always returns every unit", () => {
    ["rest", "worried", "tense", "ouch", "startle", "relief", "unknown"].forEach(f => {
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
});

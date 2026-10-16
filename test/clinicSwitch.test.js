import { describe, it, expect } from "vitest";
import { CLINICS, clinicLinks } from "../src/ui/clinicSwitch.js";

describe("clinic switch", () => {
  it("lists the three clinics by their names, in order", () => {
    expect(CLINICS.map(c => c.label)).toEqual(["목꺾기", "목뽑기", "허리펴기"]);
  });
  it("marks only the current clinic", () => {
    const l = clinicLinks("towel");
    expect(l).toHaveLength(3);
    expect(l.filter(c => c.current).map(c => c.id)).toEqual(["towel"]);
  });
  it("links the neck modes through index.html?mode= and the back mode to back.html", () => {
    expect(CLINICS.map(c => c.href)).toEqual(["./index.html?mode=crack", "./index.html?mode=towel", "./back.html"]);
  });
  it("marks nothing for an unknown mode", () => {
    expect(clinicLinks("nope").some(c => c.current)).toBe(false);
  });
});

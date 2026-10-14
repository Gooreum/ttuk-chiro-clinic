import { describe, it, expect } from "vitest";
import { tiltAngles } from "../src/core/tilt.js";
import { DEG } from "../src/lib/math.js";

const G = 9.81;
// Device-axis gravity for a phone held with the top edge raised `pitch` degrees from flat and turned
// `steer` degrees clockwise like a steering wheel, drawn at screen angle `screen` (0/90/270).
function pose(pitch, steer, screen){
  const p = pitch*DEG, r = steer*DEG, th = screen*DEG;
  const sx = -G*Math.sin(p)*Math.sin(r), sy = G*Math.sin(p)*Math.cos(r), sz = G*Math.cos(p);
  const c = Math.cos(th), s = Math.sin(th);
  return [sx*c + sy*s, -sx*s + sy*c, sz, th];
}

describe("tiltAngles (AGENTS.md 5)", () => {
  it("45° hold, 20° clockwise steer -> lr ≈ -14", () => {
    const t = tiltAngles(...pose(45, 20, 90));
    expect(t.lr).toBeCloseTo(-14.0, 1);
  });
  it("tilting the top back 10° lowers pt by 10", () => {
    const a = tiltAngles(...pose(45, 0, 90)), b = tiltAngles(...pose(35, 0, 90));
    expect(a.pt).toBeCloseTo(45, 6);
    expect(a.pt - b.pt).toBeCloseTo(10, 6);
    expect(b.lr).toBeCloseTo(0, 6);
  });
  it.each([0, 90, 270])("same pose reads the same at screen angle %i°", screen => {
    const t = tiltAngles(...pose(45, 20, screen));
    expect(t.lr).toBeCloseTo(-14.0, 1);
    const flat = tiltAngles(...pose(45, 0, screen));
    expect(flat.pt).toBeCloseTo(45, 6);
  });
  it("counter-clockwise steer is positive", () => {
    expect(tiltAngles(...pose(45, -20, 90)).lr).toBeCloseTo(14.0, 1);
  });
  it("flipped-sign gravity corrected by gSign gives the same angles", () => {
    const [x, y, z, th] = pose(45, 20, 90), sg = -1;
    const raw = [-x, -y, -z];
    const t = tiltAngles(sg*raw[0], sg*raw[1], sg*raw[2], th);
    expect(t).toEqual(tiltAngles(x, y, z, th));
  });
  it("degenerate input stays finite", () => {
    const zero = tiltAngles(0, 0, 0, 0);
    expect(Number.isFinite(zero.lr) && Number.isFinite(zero.pt)).toBe(true);
    const big = tiltAngles(20, 0, 0, 0);
    expect(big.lr).toBeCloseTo(90, 6);
  });
});

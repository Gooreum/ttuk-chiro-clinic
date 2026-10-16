import { describe, it, expect, vi } from "vitest";
import { withVisualIds } from "../src/scene/visualBuild.js";

describe("visual resource allocation", () => {
  it("does not consume the game random stream while allocating UUIDs", () => {
    const game = vi.spyOn(Math,"random").mockReturnValue(0.25);
    try {
      const ids = withVisualIds(() => Array.from({length: 24}, () => Math.random()));
      expect(game).not.toHaveBeenCalled();
      expect(new Set(ids).size).toBe(24);
      for(const n of ids){ expect(n).toBeGreaterThanOrEqual(0); expect(n).toBeLessThan(1); }
      expect(Math.random()).toBe(0.25);
      expect(game).toHaveBeenCalledTimes(1);
    } finally { game.mockRestore(); }
  });
  it("restores the game stream even when resource construction throws", () => {
    const original = Math.random;
    expect(() => withVisualIds(() => { throw Error("asset failure"); })).toThrow("asset failure");
    expect(Math.random).toBe(original);
  });
});

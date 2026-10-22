import { describe, it, expect } from "vitest";
import { QUESTS } from "../src/core/quests.js";
import { readProgress } from "../src/core/campaign.js";
import { TALES, talesOf, readableTales, taleCounts, taleTitle } from "../src/core/tales.js";
import { DEX_PATIENTS } from "../src/core/dex.js";

const save = quests => readProgress({ cleared: 56, stars: Array(56).fill(2), quests });
const allQ = Object.fromEntries(QUESTS.map(q => [q.id, 2]));

describe("도감 뒷이야기", () => {
  it("has exactly one tale per quest and no stray ids", () => {
    expect(Object.keys(TALES).sort()).toEqual(QUESTS.map(q => q.id).sort());
  });
  it("tales are short plain lines without emoji", () => {
    Object.entries(TALES).forEach(([id, t]) => {
      expect(t.length, id).toBeGreaterThan(20);
      expect(t.length, id).toBeLessThan(110);
      expect(t, id).not.toMatch(/[\u{1F300}-\u{1FAFF}☀-➿]/u);
      expect(t.trim(), id).toBe(t);
    });
  });
  it("every quest giver is a dex patient and talesOf follows the episode order", () => {
    const names = new Set(DEX_PATIENTS.map(p => p.name));
    QUESTS.forEach(q => expect(names.has(q.who), q.id).toBe(true));
    expect(talesOf("박대리").map(t => t.ep)).toEqual([1, 2]);
    expect(talesOf("뚝할배").length).toBe(1);
    expect(talesOf("없는사람")).toEqual([]);
  });
  it("a tale shows only after its quest is cleared", () => {
    expect(readableTales(save(undefined), "박대리").map(t => t.line)).toEqual([null, null]);
    const t = readableTales(save({ "박대리1": 1 }), "박대리");
    expect(t[0].line).toBe(TALES["박대리1"]);
    expect(t[1].line).toBeNull();
    expect(readableTales(save({ "박대리2": 3 }), "박대리")[1].line).toBe(TALES["박대리2"]);
  });
  it("counts and titles", () => {
    expect(taleCounts(save(undefined))).toEqual({ read: 0, total: 48, done: 0, regulars: 32 });
    expect(taleTitle(save(undefined))).toBe("");
    const six = Object.fromEntries(QUESTS.slice(0, 6).map(q => [q.id, 1]));
    expect(taleTitle(save(six))).toBe("귀 밝은 단골");
    const half = Object.fromEntries(QUESTS.slice(0, 24).map(q => [q.id, 1]));
    expect(taleTitle(save(half))).toBe("뒷이야기 수집가");
    expect(taleCounts(save(allQ))).toEqual({ read: 48, total: 48, done: 32, regulars: 32 });
    expect(taleTitle(save(allQ))).toBe("뒷이야기 박사");
    expect(taleCounts(save({ "박대리1": 3, "박대리2": 1 })).done).toBe(1);
  });
});

import { describe, it, expect } from "vitest";
import { DEX_PATIENTS, DEX_FAILS, failId, readDex, dexMeet, dexTreat, dexFail, isNewFail, dexCounts, dexTitle, firstChapter } from "../src/core/dex.js";
import { DAYS } from "../src/core/campaign.js";
import { CAST } from "../src/patient/cast.js";
import { bodyOf } from "../src/core/body.js";
import { towelKind, TOWEL_TAG } from "../src/core/towel.js";
import { FAIL_TAG, FORCE_TAG } from "../src/core/fail.js";

const empty = () => readDex(null);

describe("dex: catalog", () => {
  it("has the 36 patients of the roster and the cast; the cast and the first five regulars are in some campaign day", () => {
    expect(DEX_PATIENTS).toHaveLength(36);
    expect(new Set(DEX_PATIENTS.map(p => p.name)).size).toBe(36);
    // the 2026-10-23 body types (patient06..10) come only in free runs (ui/dex.js hint "일반 진료에서 만나요")
    DEX_PATIENTS.filter(p => !bodyOf(p) || CAST.includes(p)).forEach(p => expect(firstChapter(p.name)).toBeGreaterThan(0));
    expect(DAYS.length).toBeGreaterThan(0);
  });
  it("names every wrong-crack kind the code has", () => {
    const ids = DEX_FAILS.map(f => f.id);
    Object.keys(FAIL_TAG).forEach(k => expect(ids).toContain(k));
    Object.values({ 1: "crack", 2: "break" }).forEach(k => expect(ids).toContain(k));
    Object.keys(FORCE_TAG).forEach(t => expect(ids).toContain(failId("clinic", "over", Number(t))));
    Object.keys(TOWEL_TAG).forEach(k => expect(ids).toContain("t-" + k));
    expect(ids).toContain("ambulance");
    expect(new Set(ids).size).toBe(ids.length);
    DEX_FAILS.forEach(f => { expect(f.name).toBeTruthy(); expect(f.desc.length).toBeGreaterThan(10); });
  });
  it("failId: a hard clinic crack is 금 / 골절 whatever its kind, towel kinds are prefixed", () => {
    expect(failId("clinic", "over", 0)).toBe("over");
    expect(failId("clinic", "dud", 0)).toBe("dud");
    expect(failId("clinic", "finger", 1)).toBe("crack");
    expect(failId("clinic", "over", 2)).toBe("break");
    expect(failId("towel", "slip", 0)).toBe("t-slip");
    expect(failId("towel", "skew", 2)).toBe("t-skew");
    expect(towelKind).toBeTypeOf("function");
  });
});

describe("dex: recording", () => {
  it("meets a patient once with the first date, then counts", () => {
    let d = dexMeet(empty(), "박대리", "2026-10-22");
    expect(d.met["박대리"]).toEqual({ first: "2026-10-22", n: 1, ok: 0 });
    d = dexMeet(d, "박대리", "2026-10-25");
    expect(d.met["박대리"]).toEqual({ first: "2026-10-22", n: 2, ok: 0 });
  });
  it("ignores unknown names and ids, and does not mutate", () => {
    const d = empty();
    expect(dexMeet(d, "아무개", "x")).toBe(d);
    expect(dexFail(d, "nope", "x")).toBe(d);
    dexMeet(d, "박대리", "x"); dexFail(d, "over", "x");
    expect(d).toEqual({ met: {}, fails: {} });
  });
  it("a treated patient counts as met", () => {
    const d = dexTreat(empty(), "뚝할배", "2026-10-22");
    expect(d.met["뚝할배"]).toEqual({ first: "2026-10-22", n: 1, ok: 1 });
    expect(dexTreat(d, "뚝할배", "z").met["뚝할배"].ok).toBe(2);
  });
  it("fails keep the first date and count", () => {
    let d = dexFail(empty(), "over", "2026-10-22");
    expect(isNewFail(d, "over")).toBe(false);
    expect(isNewFail(d, "dud")).toBe(true);
    d = dexFail(d, "over", "2026-10-23");
    expect(d.fails.over).toEqual({ first: "2026-10-22", n: 2 });
  });
  it("readDex drops bad or unknown entries and survives garbage", () => {
    expect(readDex("x")).toEqual({ met: {}, fails: {} });
    const d = readDex({ met: { 박대리: { first: "a", n: 3, ok: 1 }, 가짜: { first: "a", n: 1 }, 최교수: { n: 1 } }, fails: { over: { first: "a", n: 2 }, zzz: { first: "a", n: 1 } } });
    expect(Object.keys(d.met)).toEqual(["박대리"]);
    expect(Object.keys(d.fails)).toEqual(["over"]);
  });
});

describe("dex: counts and title", () => {
  it("counts and titles by what is collected", () => {
    let d = empty();
    expect(dexTitle(d)).toBe("");
    expect(dexCounts(d)).toEqual({ met: 0, patients: 36, fails: 0, kinds: 10 });
    DEX_PATIENTS.slice(0, 5).forEach(p => { d = dexMeet(d, p.name, "x"); });
    expect(dexTitle(d)).toBe("단골 수집가");
    DEX_PATIENTS.slice(5, 16).forEach(p => { d = dexMeet(d, p.name, "x"); });
    expect(dexTitle(d)).toBe("동네 소문통");
    DEX_PATIENTS.forEach(p => { d = dexMeet(d, p.name, "x"); });
    expect(dexTitle(d)).toBe("단골 장부 박사");
    DEX_FAILS.forEach(f => { d = dexFail(d, f.id, "x"); });
    expect(dexTitle(d)).toBe("뚝 카이로 도감 완성");
  });
  it("only the fails complete is the museum title", () => {
    let d = empty();
    DEX_FAILS.forEach(f => { d = dexFail(d, f.id, "x"); });
    expect(dexTitle(d)).toBe("실패 박물관장");
  });
});

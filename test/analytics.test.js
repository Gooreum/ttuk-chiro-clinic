import { describe, it, expect } from "vitest";
import { EV, visitInfo, entrySource, cleanParams, reviewDue, runOutcome, DAY_MS } from "../src/core/analytics.js";

describe("analytics", () => {
  it("has unique snake_case event names", () => {
    const names = Object.values(EV);
    expect(new Set(names).size).toBe(names.length);
    names.forEach(n => expect(n).toMatch(/^[a-z][a-z0-9_]{0,39}$/));
  });
  it("counts visits by day", () => {
    const t0 = new Date(2026, 9, 21, 10).getTime();
    const a = visitInfo(null, t0);
    expect(a.params).toMatchObject({ first_open: true, visit_days: 1, open_count: 1, days_since_first: 0, days_since_last: null, returning_day: false });
    const b = visitInfo(a.next, t0 + 3600000);   // same day
    expect(b.params).toMatchObject({ first_open: false, visit_days: 1, open_count: 2, returning_day: false });
    const c = visitInfo(b.next, t0 + 2 * DAY_MS);
    expect(c.params).toMatchObject({ visit_days: 2, open_count: 3, days_since_first: 2, days_since_last: 1, returning_day: true });
    expect(c.params.first_open_date).toBe("2026-10-21");
  });
  it("reads the entry source", () => {
    expect(entrySource("?utm_source=threads&utm_medium=social&utm_campaign=ttuk_1021", "", "")).toMatchObject({ utm_source: "threads", utm_medium: "social", entry_source: "threads" });
    expect(entrySource("?mode=towel", "https://gooreum.github.io/ttuk-chiro-clinic/", "").entry_source).toBe("gooreum.github.io");
    expect(entrySource("", "", "intoss://ttuk-chiro?referrer=push").entry_source).toBe("push");
    expect(entrySource("", "", "intoss://ttuk-chiro").entry_source).toBe("toss");
    expect(entrySource("", "", "").entry_source).toBe("direct");
  });
  it("cleans params", () => {
    expect(cleanParams({ a: 1.23456, b: null, c: undefined, d: "x".repeat(150), e: true, f: Infinity }))
      .toEqual({ a: 1.235, d: "x".repeat(100), e: true, f: "Infinity" });
    const many = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`k${i}`, i]));
    expect(Object.keys(cleanParams(many))).toHaveLength(25);
  });
  it("asks for a review once after a complete run", () => {
    expect(reviewDue({ asked: false, complete: true })).toBe(true);
    expect(reviewDue({ asked: true, complete: true })).toBe(false);
    expect(reviewDue({ asked: false, complete: false })).toBe(false);
  });
  it("labels the run outcome", () => {
    expect(runOutcome({ ambulance: true, pain: 1, complete: false })).toBe("ambulance");
    expect(runOutcome({ ambulance: false, pain: 3, complete: false })).toBe("pain");
    expect(runOutcome({ ambulance: false, pain: 0, complete: true })).toBe("complete");
  });
});

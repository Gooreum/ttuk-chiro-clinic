import { describe, it, expect } from "vitest";
import { EV, visitInfo, entrySource, cleanParams, reviewDue, runOutcome, DAY_MS, appPlatform, osOf, deviceClass, collectQuery, nextSession, SESSION_GAP_MS } from "../src/core/analytics.js";

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

describe("app platform", () => {
  it("tells toss, web, android and ios apart", () => {
    expect(appPlatform({ toss: true, app: false, native: null, ua: "Android" })).toBe("toss");
    expect(appPlatform({ toss: false, app: false, native: null, ua: "iPhone" })).toBe("web");
    expect(appPlatform({ toss: false, app: true, native: "android", ua: "" })).toBe("android");
    expect(appPlatform({ toss: false, app: true, native: "ios", ua: "" })).toBe("ios");
    expect(appPlatform({ toss: false, app: true, native: "web", ua: "Linux; Android 14" })).toBe("android");
    expect(appPlatform({ toss: false, app: true, native: null, ua: "iPhone OS 18" })).toBe("ios");
  });
  it("reads os and device class", () => {
    expect(osOf("Mozilla/5.0 (Linux; Android 14)")).toBe("android");
    expect(osOf("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)")).toBe("ios");
    expect(osOf("Mozilla/5.0 (Macintosh; Intel Mac OS X) Mobile/15E148")).toBe("ios");
    expect(osOf("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)")).toBe("mac");
    expect(osOf("Mozilla/5.0 (Windows NT 10.0)")).toBe("windows");
    expect(osOf("")).toBe("other");
    expect(deviceClass(1920, 1080, false)).toBe("desktop");
    expect(deviceClass(390, 844, true)).toBe("mobile");
    expect(deviceClass(820, 1180, true)).toBe("tablet");
  });
});

describe("direct GA hits", () => {
  it("keeps one client and opens a new session after 30 minutes", () => {
    const a = nextSession(null, 1_000_000, "c1");
    expect(a.first && a.fv).toBe(true);
    expect(a.ses).toMatchObject({ cid: "c1", sid: 1000, sct: 1, hit: 1 });
    const b = nextSession(a.ses, 1_010_000, "c2");
    expect(b.first || b.fv).toBe(false);
    expect(b.ses).toMatchObject({ cid: "c1", sid: 1000, sct: 1, hit: 2 });
    expect(b.et).toBe(10_000);
    const c = nextSession(b.ses, 1_010_000 + SESSION_GAP_MS + 1, "c3");
    expect(c.first).toBe(true);
    expect(c.fv).toBe(false);
    expect(c.ses).toMatchObject({ cid: "c1", sct: 2, hit: 1 });
  });
  it("builds a GA4 collect query with params and user properties", () => {
    const q = new URLSearchParams(collectQuery("G-X", "app_open",
      { app_platform: "ios", screen_w: 390, ok: true },
      { app_platform: "ios", os: "ios", none: null },
      { cid: "c1", sid: 5, sct: 1, hit: 1, first: true, fv: true, et: 0 },
      { dl: "https://app.ttukchiro/ios/index.html", sr: "390x844" }));
    expect(q.get("v")).toBe("2");
    expect(q.get("tid")).toBe("G-X");
    expect(q.get("en")).toBe("app_open");
    expect(q.get("ep.app_platform")).toBe("ios");
    expect(q.get("epn.screen_w")).toBe("390");
    expect(q.get("ep.ok")).toBe("true");
    expect(q.get("up.app_platform")).toBe("ios");
    expect(q.has("up.none")).toBe(false);
    expect(q.get("_ss")).toBe("1");
    expect(q.get("_fv")).toBe("1");
    expect(q.get("dl")).toContain("/ios/");
  });
});

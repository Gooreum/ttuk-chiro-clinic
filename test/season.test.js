import { describe, it, expect } from "vitest";
import { DAYS, readProgress, cutShift, STAR_CUTS } from "../src/core/campaign.js";
import { QUEST_GAP } from "../src/core/quests.js";
import {
  SEASON_EPS, SEASON_IDS, SEASON_NAME, SEASON_DRESS, SEASON_BONUS, SEASON_UNLOCK, RULE_NAME, seasonOf, parseSeason, seasonOpen, episodesOf,
  readSeasonRec, epStars, epOpen, afterEp, seasonCleared, seasonDone, bonusDue, payBonus, epClears, epStarsOf, seasonRoster
} from "../src/core/season.js";
import { ROSTER } from "../src/patient/roster.js";
import { CAST } from "../src/patient/cast.js";
import { readFileSync } from "node:fs";
import { EV } from "../src/core/analytics.js";

const ALL = [...ROSTER, ...CAST];
const kst = s => Date.parse(s + "+09:00");
const PROP_NAMES = [...readFileSync(new URL("../src/scene/castProps.js", import.meta.url), "utf8").matchAll(/group\("(\w+)"/g)].map(m => m[1]);   // the existing toy props (importing the scene needs a DOM)
const ch1 = new Set(DAYS.filter(d => d.ch === 1).flatMap(d => d.patients));

describe("계절 손님: the season", () => {
  it("follows the KST calendar month", () => {
    expect(seasonOf(kst("2026-03-01T00:00:00"))).toBe("spring");
    expect(seasonOf(kst("2026-05-31T23:59:59"))).toBe("spring");
    expect(seasonOf(kst("2026-06-01T00:00:00"))).toBe("summer");
    expect(seasonOf(kst("2026-08-31T12:00:00"))).toBe("summer");
    expect(seasonOf(kst("2026-09-01T00:00:00"))).toBe("autumn");
    expect(seasonOf(kst("2026-11-30T23:00:00"))).toBe("autumn");
    expect(seasonOf(kst("2026-12-01T00:00:00"))).toBe("winter");
    expect(seasonOf(kst("2027-02-28T23:59:59"))).toBe("winter");
  });
  it("uses the KST clock, not the phone's", () => {
    // 2026-05-31 20:00 UTC is already June 1st 05:00 in Korea
    expect(seasonOf(Date.parse("2026-05-31T20:00:00Z"))).toBe("summer");
  });
  it("accepts only the four ids as a forced season", () => {
    SEASON_IDS.forEach(id => expect(parseSeason(id)).toBe(id));
    expect(parseSeason("rainy")).toBeNull();
    expect(parseSeason(null)).toBeNull();
  });
  it("opens after 1장 (7 days)", () => {
    expect(SEASON_UNLOCK).toBe(7);
    expect(seasonOpen(readProgress({ cleared: 6, stars: Array(6).fill(2) }))).toBe(false);
    expect(seasonOpen(readProgress({ cleared: 7, stars: Array(7).fill(2) }))).toBe(true);
    expect(seasonOpen(null)).toBe(false);
  });
});

describe("계절 손님: the episodes", () => {
  it("has four per season with unique ids, 1장 regulars only, known patients and one constraint each", () => {
    expect(SEASON_EPS.length).toBe(16);
    expect(new Set(SEASON_EPS.map(e => e.id)).size).toBe(16);
    SEASON_IDS.forEach(id => { expect(episodesOf(id).map(e => e.no)).toEqual([1, 2, 3, 4]); expect(SEASON_NAME[id]).toBeTruthy(); });
    SEASON_EPS.forEach(e => {
      expect(["clinic", "towel"]).toContain(e.game);
      e.patients.forEach(n => { expect(ch1.has(n), `${e.id} ${n}`).toBe(true); });
      expect(e.intro.length).toBe(3);
      expect(e.outro.length).toBeGreaterThan(10);
      Object.keys(e.lines).forEach(n => expect(e.patients).toContain(n));
      expect(seasonRoster(SEASON_EPS.indexOf(e), ALL).map(p => p.name)).toEqual(e.patients);
      const c = [!!(e.mods && e.mods.tight), !!(e.mods && e.mods.noisy), e.painMax === 1, e.painMax === 2, !!e.beat, e.patients.length >= 4];
      expect(c.filter(Boolean).length, e.id).toBe(1);
      expect(c[Object.keys(RULE_NAME).indexOf(e.rule)], e.id).toBe(true);
      if(e.rule === "pain1") expect(e.patients.length).toBe(1);
      expect(JSON.stringify(e)).not.toMatch(/[\u{1F300}-\u{1FAFF}☀-➿]/u);   // no emoji
      e.intro.forEach(l => expect(l.length).toBeLessThan(60));
    });
  });
  it("ends every season on a four-patient finale and mixes both games", () => {
    SEASON_IDS.forEach(id => {
      const eps = episodesOf(id);
      expect(eps[3].rule).toBe("many");
      expect(eps.map(e => e.game)).toContain("clinic");
      expect(eps.map(e => e.game)).toContain("towel");
      expect(new Set(eps.map(e => e.rule)).size).toBe(4);
    });
  });
  it("a beat episode asks for the three-star cut minus the gap", () => {
    SEASON_EPS.filter(e => e.beat).forEach(e => expect(e.beat).toBe(Math.round(STAR_CUTS.three + cutShift(e) - QUEST_GAP)));
  });
  it("dresses the regulars in the season's existing props without touching the roster", () => {
    const before = JSON.stringify(ALL.map(p => p.look));
    SEASON_EPS.forEach((e, i) => {
      seasonRoster(i, ALL).forEach(p => {
        const d = SEASON_DRESS[e.season];
        expect(p.look.gown).toBe(d.gown); expect(p.look.realGown).toBe(true);
        d.props.forEach(n => expect(p.look.props).toContain(n));
        expect(p.lines.start).toBe(e.lines[p.name] || ALL.find(r => r.name === p.name).lines.start);
      });
    });
    expect(JSON.stringify(ALL.map(p => p.look))).toBe(before);
    Object.values(SEASON_DRESS).forEach(d => d.props.forEach(n => expect(PROP_NAMES).toContain(n)));
  });
});

describe("계절 손님: the record", () => {
  it("reads junk as empty and keeps only known ids", () => {
    expect(readSeasonRec(null)).toEqual({ eps: {}, bonus: {} });
    expect(readSeasonRec("x")).toEqual({ eps: {}, bonus: {} });
    expect(readSeasonRec({ eps: { spring1: 9, nope: 2, summer2: -1 }, bonus: { spring: 1, x: 1 } })).toEqual({ eps: { spring1: 3 }, bonus: { spring: 1 } });
  });
  it("opens episode N+1 only after N is cleared", () => {
    let r = readSeasonRec(null);
    const [a, b, c] = episodesOf("spring");
    expect(epOpen(r, a)).toBe(true); expect(epOpen(r, b)).toBe(false);
    r = afterEp(r, a, true, 2);
    expect(epOpen(r, b)).toBe(true); expect(epOpen(r, c)).toBe(false);
  });
  it("keeps the best stars, and a miss changes nothing", () => {
    const e = SEASON_EPS[0], r0 = readSeasonRec(null);
    expect(afterEp(r0, e, false, 0)).toBe(r0);
    const r1 = afterEp(r0, e, true, 3), r2 = afterEp(r1, e, true, 1);
    expect(epStars(r2, e)).toBe(3);
  });
  it("pays the all-four bonus once per season", () => {
    let r = readSeasonRec(null);
    const eps = episodesOf("winter");
    eps.slice(0, 3).forEach(e => { r = afterEp(r, e, true, 2); expect(bonusDue(r, "winter")).toBe(false); });
    r = afterEp(r, eps[3], true, 1);
    expect(seasonCleared(r, "winter")).toBe(4); expect(seasonDone(r, "winter")).toBe(true);
    expect(bonusDue(r, "winter")).toBe(true);
    r = payBonus(r, "winter");
    expect(bonusDue(r, "winter")).toBe(false);
    expect(bonusDue(r, "spring")).toBe(false);
    expect(SEASON_BONUS).toBe(80);
    // the bonus mark survives a re-read
    expect(bonusDue(readSeasonRec(JSON.parse(JSON.stringify(r))), "winter")).toBe(false);
  });
  it("clears like a 단골 의뢰: complete, and the average for a beat episode", () => {
    const plain = SEASON_EPS.find(e => !e.beat), beat = SEASON_EPS.find(e => e.beat);
    expect(epClears(plain, true, 0)).toBe(true);
    expect(epClears(plain, false, 120)).toBe(false);
    expect(epClears(beat, true, beat.beat - 1)).toBe(false);
    expect(epClears(beat, true, beat.beat)).toBe(true);
    expect([1, 2, 3]).toContain(epStarsOf(plain, 100));
  });
});

describe("계절 손님: events", () => {
  it("names the events", () => {
    expect(EV.seasonStart).toBe("season_start");
    expect(EV.seasonEnd).toBe("season_end");
  });
});

import { describe, it, expect } from "vitest";
import { DAYS, hardDay } from "../src/core/campaign.js";
import { rushPlan } from "../src/core/rush.js";
import { BOSS_RULES, bossRules, bossChips, bossTolMul, tauntTrips, timerLeft, timerPenalty, bossPts, bonusWindow, cuesQuiet, swapDue, sideSlot,
  TAUNT_ZONE, TIMER_WARN, bossCues, liveLine, timerWarn, TIMER_SEC, HARD_TIMER_SEC, TIMER_PENALTY, SWAP_AT, SHRINK_MIN, SHRINK_MS } from "../src/core/boss.js";
import { tolMul } from "../src/core/feel.js";

const bossDays = DAYS.map((d, i) => i).filter(i => DAYS[i].beat && ["clinic", "towel"].includes(DAYS[i].game));

describe("boss rules on the days", () => {
  it("gives every neck boss day a rule, a chip and a line, and the rules are known", () => {
    expect(bossDays.length).toBe(6);
    bossDays.forEach(i => {
      const d = DAYS[i];
      expect(bossRules(d).length).toBeGreaterThan(0);
      expect(d.boss.every(r => BOSS_RULES[r])).toBe(true);
      expect(bossChips(d).length).toBe(d.boss.length);
      expect(d.bossTaunt).toMatch(/^.+: /);
      expect(d.bossBy).toMatch(/^— /);                              // the live line names who speaks
      expect(d.bossTaunt).not.toMatch(/했군|흔들렸/);              // the story line is about what has not happened yet
      expect(d.lose).toMatch(/^.+: /);
    });
  });
  it("does not give the same rule set to two bosses, so each boss feels different", () => {
    const keys = bossDays.map(i => DAYS[i].boss.join("+"));
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("leaves ordinary days and the back boss alone", () => {
    DAYS.forEach((d, i) => { if(!bossDays.includes(i)) expect(bossRules(d)).toEqual([]); });
  });
  it("keeps the rules on 역경 and in the 보스 러시 plan", () => {
    bossDays.forEach(i => expect(hardDay(i).boss).toEqual(DAYS[i].boss));
    const plan = rushPlan();
    expect(plan.length).toBeGreaterThan(0);
    plan.forEach(p => { expect(p.boss).toEqual(DAYS[p.day].boss); expect(p.bossLine).toBe(DAYS[p.day].bossTaunt); expect(p.bossBy).toBe(DAYS[p.day].bossBy); });
  });
});

describe("zone rules", () => {
  it("taunt narrows only after the trip", () => {
    expect(bossTolMul(["taunt"], 0, false)).toBe(1);
    expect(bossTolMul(["taunt"], 0, true)).toBe(TAUNT_ZONE);
    expect(bossTolMul([], 5000, true)).toBe(1);
  });
  it("taunt trips on a first-side non-PERFECT only", () => {
    expect(tauntTrips(["taunt"], 0, false)).toBe(true);
    expect(tauntTrips(["taunt"], 0, true)).toBe(false);
    expect(tauntTrips(["taunt"], 1, false)).toBe(false);
    expect(tauntTrips(["timer"], 0, false)).toBe(false);
  });
  it("shrink narrows with aim time down to a floor", () => {
    expect(bossTolMul(["shrink"], 0)).toBe(1);
    expect(bossTolMul(["shrink"], SHRINK_MS / 2)).toBeCloseTo(1 - (1 - SHRINK_MIN) / 2);
    expect(bossTolMul(["shrink"], SHRINK_MS * 5)).toBe(SHRINK_MIN);
  });
  it("stacks with the day's tight zone and the nervous trait without leaving 0..1", () => {
    const m = tolMul("nervous", 30000, 0.7) * bossTolMul(["taunt", "shrink"], 30000, true);
    expect(m).toBeGreaterThan(0.2);
    expect(m).toBeLessThan(1);
  });
});

describe("timer", () => {
  it("counts down, never below 0, null without the rule", () => {
    expect(timerLeft(["timer"], 0)).toBe(TIMER_SEC);
    expect(timerLeft(["timer"], 5000)).toBe(TIMER_SEC - 5);
    expect(timerLeft(["timer"], 99000)).toBe(0);
    expect(timerLeft(["taunt"], 1000)).toBe(null);
    expect(timerLeft(["timer"], 0, true)).toBe(HARD_TIMER_SEC);
  });
  it("takes points off only after the limit, and 역경 is stricter", () => {
    expect(timerPenalty(["timer"], TIMER_SEC * 1000)).toBe(0);
    expect(timerPenalty(["timer"], TIMER_SEC * 1000 + 1)).toBe(TIMER_PENALTY);
    expect(timerPenalty(["timer"], 18000, true)).toBe(TIMER_PENALTY);
    expect(timerPenalty(["fake"], 99000)).toBe(0);
    expect(bossPts(90, 20)).toBe(70);
    expect(bossPts(10, 20)).toBe(0);
  });
});

describe("fake breath and swap", () => {
  it("moves the bonus window to the in-breath", () => {
    expect(bonusWindow([], true)).toBe(true);
    expect(bonusWindow([], false)).toBe(false);
    expect(bonusWindow(["fake"], true)).toBe(false);
    expect(bonusWindow(["fake"], false)).toBe(true);
    expect(cuesQuiet(["fake"])).toBe(true);
    expect(cuesQuiet(["timer"])).toBe(false);
  });
  it("swaps once, on the first side, after the wait", () => {
    expect(swapDue(["swap"], 0, SWAP_AT - 1, false)).toBe(false);
    expect(swapDue(["swap"], 0, SWAP_AT, false)).toBe(true);
    expect(swapDue(["swap"], 0, SWAP_AT, true)).toBe(false);
    expect(swapDue(["swap"], 1, SWAP_AT, false)).toBe(false);
    expect(swapDue(["fake"], 0, 99999, false)).toBe(false);
  });
  it("swaps the two sides' targets and never gives both sides the same one", () => {
    expect([sideSlot(0, false), sideSlot(1, false)]).toEqual([0, 1]);
    expect([sideSlot(0, true), sideSlot(1, true)]).toEqual([1, 0]);
  });
});

describe("7차 플레이테스트 additions", () => {
  it("timer is 12 s (9 s on 역경) and warns for the last 5 s", () => {
    expect(TIMER_SEC).toBe(12); expect(HARD_TIMER_SEC).toBe(9); expect(TIMER_WARN).toBe(5);
    expect(timerWarn(6)).toBe(false); expect(timerWarn(5)).toBe(true); expect(timerWarn(1)).toBe(true);
    expect(timerWarn(0)).toBe(false); expect(timerWarn(null)).toBe(false);
  });
  it("says the clock it runs: 12 s, 9 s on 역경 (chip and cue, 2026-10-23 audit)", () => {
    const i = DAYS.findIndex(d => d.boss && d.boss.includes("timer"));
    expect(bossChips(DAYS[i])).toContain("한 쪽당 12초 안에 꺾기");
    expect(bossChips(hardDay(i))).toContain("한 쪽당 9초 안에 꺾기");
    expect(bossCues(["timer"])).toEqual(["한 쪽당 12초. 넘기면 -20점이에요"]);
    expect(bossCues(["timer"], true)).toEqual(["한 쪽당 9초. 넘기면 -20점이에요"]);
    expect(bossChips(hardDay(i)).join(" ")).not.toMatch(/\{/);
  });
  it("shows the cues of a two-rule boss one at a time", () => {
    expect(bossCues(["taunt", "swap"]).length).toBe(2);
    expect(bossCues(["x"])).toEqual([]);
  });
  it("has a live line for every rule that talks, apart from the story line", () => {
    const d = DAYS.find(x => x.ch === 8 && x.boss);
    expect(liveLine(d.bossLive, "taunt")).toMatch(/\S/); expect(liveLine(d.bossLive, "swap")).toMatch(/\S/);
    expect(liveLine(d.bossLive, "swap")).not.toBe(d.bossTaunt);
    expect(liveLine({}, "swap", "x")).toBe("x");
    DAYS.filter(x => x.boss && x.boss.includes("swap")).forEach(x => expect(x.bossLive.swap).toBeTruthy());
    DAYS.filter(x => x.boss && x.boss.includes("timer")).forEach(x => expect(x.bossLive.timer).toBeTruthy());
  });
});

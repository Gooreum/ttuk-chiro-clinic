import { describe, it, expect } from "vitest";
import { DAYS, readProgress, dayStars, STAR_CUTS, cutShift } from "../src/core/campaign.js";
import { QUESTS, RULE_NAME, QUEST_GAP, questOpen, questStars, questUnlockDay, afterQuest, questClears, questStarsOf, questRoster, questOrder } from "../src/core/quests.js";
import { ROSTER } from "../src/patient/roster.js";
import { CAST } from "../src/patient/cast.js";
import { EV } from "../src/core/analytics.js";

const ALL = [...ROSTER, ...CAST];
const save = (cleared, quests) => readProgress({cleared, stars: Array(cleared).fill(2), quests});

describe("단골 의뢰", () => {
  it("has 64 quests with unique ids, known patients and one constraint each", () => {
    expect(QUESTS.length).toBe(64);
    expect(new Set(QUESTS.map(q => q.id)).size).toBe(64);
    QUESTS.forEach(q => {
      expect(["clinic", "towel"]).toContain(q.game);   // 허리 pages read their day from DAYS
      expect(q.patients).toContain(q.who);
      expect(q.intro.length).toBe(3);
      expect(q.outro.length).toBeGreaterThan(10);
      Object.keys(q.lines).forEach(n => expect(q.patients).toContain(n));
      expect(questRoster(QUESTS.indexOf(q), ALL).map(p => p.name)).toEqual(q.patients);
      // exactly one constraint, and it is the one named by rule
      const c = [!!(q.mods && q.mods.tight), !!(q.mods && q.mods.noisy), q.painMax === 1, q.painMax === 2, !!q.beat, q.patients.length >= 4];
      expect(c.filter(Boolean).length, q.id).toBe(1);
      expect(Object.keys(RULE_NAME)).toContain(q.rule);
      expect(c[Object.keys(RULE_NAME).indexOf(q.rule)], q.id).toBe(true);
      if(q.rule === "pain1") expect(q.patients.length).toBe(1);   // one pain slot only on a one-patient quest
      expect(JSON.stringify(q)).not.toMatch(/[\u{1F300}-\u{1FAFF}☀-➿]/u);   // no emoji
    });
    expect(QUESTS.filter(q => q.ep === 2).length).toBe(16);
    expect(QUESTS.filter(q => q.ep === 3).length).toBe(16);   // 2편이 있는 단골 모두 3편(완결)이 있다
    Object.keys(RULE_NAME).forEach(r => expect(QUESTS.filter(q => q.rule === r).length, r).toBeGreaterThanOrEqual(4));
  });
  it("sets beat quests under their three-star cut by the quest gap", () => {
    QUESTS.filter(q => q.beat).forEach(q => {
      expect(q.beat).toBe(Math.round(STAR_CUTS.three + cutShift(q) - QUEST_GAP));
      expect(q.beat).toBeLessThan(STAR_CUTS.three + cutShift(q));
      expect(questClears(q, true, q.beat - 1)).toBe(false);
      expect(questClears(q, true, q.beat)).toBe(true);
    });
    const q = QUESTS.find(x => !x.beat);
    expect(questClears(q, true, 1)).toBe(true);    // any played-through run clears a plain quest
    expect(questClears(q, false, 150)).toBe(false);   // a bad end does not
    expect(questStarsOf(q, 200)).toBe(3);
    expect(questStarsOf(q, 1)).toBe(1);
  });
  it("opens a quest once all its patients have appeared in cleared days", () => {
    const first = QUESTS.find(q => q.id === "박대리1");
    expect(questUnlockDay(first)).toBe(0);
    expect(questOpen(save(0), first)).toBe(false);
    expect(questOpen(save(1), first)).toBe(true);
    // 팀장 동행 needs 박팀장 (day 12) and the first episode
    const second = QUESTS.find(q => q.id === "박대리2");
    expect(questUnlockDay(second)).toBe(DAYS.findIndex(d => d.patients.includes("박팀장")));
    expect(questOpen(save(56), second)).toBe(false);   // 1편 not cleared
    expect(questOpen(save(56, {"박대리1": 1}), second)).toBe(true);
    expect(questOpen(save(5, {"박대리1": 1}), second)).toBe(false);   // 박팀장 not met yet
    QUESTS.forEach(q => expect(questUnlockDay(q)).toBeGreaterThanOrEqual(0));
    const opens = QUESTS.filter(q => questOpen(save(56, Object.fromEntries(QUESTS.map(x => [x.id, 1]))), q));
    expect(opens.length).toBe(64);
  });
 it("opens a 3편 only after the 2편 is cleared, like the 2편 after the 1편", () => {
    const third = QUESTS.find(q => q.id === "박대리3");
    const done = Object.fromEntries(QUESTS.map(x => [x.id, 1]));
    expect(questOpen(save(56, {"박대리1": 1}), third)).toBe(false);   // 2편 not cleared
    expect(questOpen(save(56, {"박대리2": 1}), third)).toBe(true);
    expect(questOpen(save(56, done), third)).toBe(true);
    // every 3편 has a 2편 by the same regular, and a harder-or-equal constraint than a plain tight/noisy quest is preferred
    QUESTS.filter(q => q.ep === 3).forEach(q => {
      expect(QUESTS.some(x => x.who === q.who && x.ep === 2), q.id).toBe(true);
      expect(q.id).toBe(`${q.who}3`);
    });
    const hard = QUESTS.filter(q => q.ep === 3 && ["pain1", "pain2", "many", "beat"].includes(q.rule)).length;
    expect(hard).toBeGreaterThanOrEqual(12);
    // the original 48 keep their numbers (analytics quest_no): 3편 are appended at the end
    expect(QUESTS.slice(0, 48).every(q => q.ep < 3)).toBe(true);
    expect(QUESTS.slice(48).every(q => q.ep === 3)).toBe(true);
  });
  it("saves stars by id and keeps the best, leaving a miss alone", () => {
    const q = QUESTS[0];
    let p = save(3);
    expect(questStars(p, q)).toBe(0);
    expect(afterQuest(p, q, false, 3)).toBe(p);
    p = afterQuest(p, q, true, 2);
    expect(questStars(p, q)).toBe(2);
    p = afterQuest(p, q, true, 1);
    expect(questStars(p, q)).toBe(2);
    p = afterQuest(p, q, true, 3);
    expect(questStars(p, q)).toBe(3);
    expect(p.cleared).toBe(3);   // quests never move the campaign
    // the object survives a round trip through readProgress; a day clear keeps it
    expect(readProgress(JSON.parse(JSON.stringify(p))).quests).toEqual({[q.id]: 3});
    expect(readProgress(null).quests).toBeUndefined();
    expect(readProgress({cleared: "x"}).quests).toBeUndefined();
    expect(questStars({cleared: 1, stars: [], quests: {[q.id]: 9}}, q)).toBe(3);   // bad values clamp
  });
  it("gives the quest's regular the start line without touching the roster", () => {
    const i = QUESTS.findIndex(q => q.id === "김사장1");
    const kim = ROSTER.find(p => p.name === "김사장"), before = kim.lines.start;
    expect(questRoster(i, ALL)[0].lines.start).toBe(QUESTS[i].lines["김사장"]);
    expect(kim.lines.start).toBe(before);
  });
  it("orders the board by when a quest opens, then episode", () => {
    const o = questOrder().map(i => QUESTS[i]);
    for(let k = 1; k < o.length; k++) expect(questUnlockDay(o[k]) >= questUnlockDay(o[k - 1])).toBe(true);
    expect(o.findIndex(q => q.id === "박대리1")).toBeLessThan(o.findIndex(q => q.id === "박대리2"));
  });
  it("keeps spoilers late: the first owner and the chain boss open after the finale", () => {
    expect(questUnlockDay(QUESTS.find(q => q.id === "뚝할배1"))).toBe(55);
    expect(questUnlockDay(QUESTS.find(q => q.id === "메가회장1"))).toBeGreaterThanOrEqual(49);
  });
  it("names its two analytics events", () => {
    expect(EV.questStart).toBe("quest_start");
    expect(EV.questEnd).toBe("quest_end");
  });
});

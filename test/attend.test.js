import { describe, it, expect } from "vitest";
import { dateNo, attendRead, cycleDay, rewardFor, attendStatus, attendMark, attendLine, attendStampLine, ATTEND_REWARD } from "../src/core/attend.js";
import { EV } from "../src/core/analytics.js";

describe("attend: the card", () => {
  it("cleans junk into an empty card", () => {
    expect(attendRead(null)).toEqual({ last: "", streak: 0, total: 0 });
    expect(attendRead({ last: "x", streak: 3 })).toEqual({ last: "", streak: 0, total: 0 });
    expect(attendRead({ last: "2026-10-22", streak: 3, total: 1 })).toEqual({ last: "2026-10-22", streak: 3, total: 3 });
  });
  it("counts days by date, month ends included", () => {
    expect(dateNo("2026-11-01") - dateNo("2026-10-31")).toBe(1);
    expect(dateNo("2027-03-01") - dateNo("2027-02-28")).toBe(1);
    expect(dateNo("nope")).toBeNaN();
  });
  it("cycles 1..7 and pays the 7th day the most", () => {
    expect([1, 2, 7, 8, 14, 15].map(cycleDay)).toEqual([1, 2, 7, 1, 7, 1]);
    expect(rewardFor(7)).toBe(Math.max(...ATTEND_REWARD));
    expect(rewardFor(8)).toBe(ATTEND_REWARD[0]);
  });
});
describe("attend: stamping", () => {
  it("the first run ever stamps day 1", () => {
    const m = attendMark(null, "2026-10-23");
    expect(m).toMatchObject({ stamped: true, streak: 1, cycle: 1, coins: ATTEND_REWARD[0] });
    expect(m.rec).toEqual({ last: "2026-10-23", streak: 1, total: 1 });
  });
  it("a second run the same day stamps nothing", () => {
    const a = attendMark(null, "2026-10-23").rec, b = attendMark(a, "2026-10-23");
    expect(b).toMatchObject({ stamped: false, coins: 0 });
    expect(b.rec).toEqual(a);
  });
  it("the next day continues the streak, a missed day starts over", () => {
    const a = attendMark(null, "2026-10-22").rec;
    expect(attendMark(a, "2026-10-23")).toMatchObject({ streak: 2, gap: 1 });
    expect(attendMark(a, "2026-10-24")).toMatchObject({ streak: 1, gap: 2 });
    expect(attendMark(a, "2026-10-24").rec.total).toBe(2);
  });
  it("a phone clock set back never stamps twice", () => {
    const a = attendMark(null, "2026-10-23").rec;
    expect(attendMark(a, "2026-10-20").stamped).toBe(false);
  });
  it("seven days in a row end on the big gift", () => {
    let rec = null, last = null;
    for(let d = 1; d <= 7; d++){ last = attendMark(rec, `2026-10-${String(d).padStart(2, "0")}`); rec = last.rec; }
    expect(last).toMatchObject({ streak: 7, cycle: 7, coins: 70 });
    expect(attendStampLine(last)).toContain("7일 만근");
  });
});
describe("attend: the title line", () => {
  it("says what to do, then how long", () => {
    expect(attendLine(null, "2026-10-23")).toBe("첫 판 끝내면 출근 도장");
    const rec = { last: "2026-10-22", streak: 3, total: 3 };
    expect(attendStatus(rec, "2026-10-23").state).toBe("alive");
    expect(attendLine(rec, "2026-10-23")).toBe("출근 3일째 · 오늘 도장 대기");
    expect(attendLine(rec, "2026-10-22")).toBe("출근 3일째");
    expect(attendLine(rec, "2026-10-25")).toBe("첫 판 끝내면 출근 도장");
  });
  it("has an event name", () => { expect(EV.attend).toBe("attend"); });
});

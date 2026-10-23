import { describe, it, expect, afterEach } from "vitest";
import { pickLang, t, _setLangForTest, LANG, EN_DICT } from "../src/i18n/index.js";
import { check } from "../scripts/i18n/extract.mjs";

afterEach(() => _setLangForTest("ko"));

describe("i18n", () => {
  it("vitest (no page) runs in Korean", () => { expect(LANG).toBe("ko"); });
  it("picks ?lang, then the saved choice, then the browser language", () => {
    expect(pickLang({ query: "en", stored: "ko", nav: "ko-KR" })).toBe("en");
    expect(pickLang({ query: "xx", stored: "ko", nav: "en-US" })).toBe("ko");
    expect(pickLang({ nav: "ko-KR" })).toBe("ko");
    expect(pickLang({ nav: "ko" })).toBe("ko");
    expect(pickLang({ nav: "en-US" })).toBe("en");
    expect(pickLang({ nav: "ja-JP" })).toBe("en");
    expect(pickLang({})).toBe("ko");
  });
  it("Toss builds are always Korean", () => {
    expect(pickLang({ query: "en", stored: "en", nav: "en-US", toss: true })).toBe("ko");
  });
  it("fills placeholders and falls back to the Korean source", () => {
    expect(t("{n}번째 환자", { n: 2 })).toBe("2번째 환자");
    _setLangForTest("en");
    expect(t("없는 문장 {n}", { n: 3 })).toBe("없는 문장 3");
    expect(t("")).toBe("");
    expect(t(undefined)).toBe(undefined);
    EN_DICT["테스트 문장"] = "Test line";
    expect(t("  테스트 문장 ")).toBe("  Test line ");
    delete EN_DICT["테스트 문장"];
  });
  it("every English line keeps the source's placeholders", () => {
    const bad = [];
    for(const [ko, en] of Object.entries(EN_DICT)){
      const ph = s => (s.match(/\{\w+\}/g) || []).sort().join(",");
      if(ph(ko) !== ph(en)) bad.push(ko);
      if(typeof en !== "string" || !en.trim()) bad.push(ko);
      if(/[가-힣]/.test(en)) bad.push(ko);
    }
    expect(bad).toEqual([]);
  });
  it("every Korean string on screen has an English line (npm run i18n:check)", () => {
    const r = check();
    expect(r.templates.map(x => `${x.file}:${x.line}`)).toEqual([]);
    expect(r.missing.map(x => `${x.file}:${x.line} ${x.s}`)).toEqual([]);
  });
});

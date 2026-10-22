/* docs/story.md 생성기: 영업 일지 전체(장·일차·규칙·환자·사연·대사)를 플레이하지 않고 읽을 수 있게 펼친다.
   원본은 src/core/campaign.js, src/patient/{roster,cast}.js 하나뿐이고 이 문서는 늘 다시 만든다.
   실행: npm run docs:story */
import { writeFileSync } from "node:fs";
import { DAYS, CHAPTERS, dayLabel, hardDay, HARD_GAMES } from "../../src/core/campaign.js";
import { ROSTER } from "../../src/patient/roster.js";
import { CAST } from "../../src/patient/cast.js";

const ALL = [...ROSTER, ...CAST];
const GAME = { clinic: "목꺾기", towel: "목뽑기", back: "허리펴기", side: "허리비틀기" };
const TRAIT = { nervous: "긴장형", stiff: "근육 뭉침", flexible: "유연함", elder: "어르신" };
const who = n => ALL.find(p => p.name === n);
const out = [];
const w = (...l) => out.push(...l);

w("# 영업 일지 스토리 전체", "",
  "`npm run docs:story`가 코드에서 만든 문서다. 손으로 고치지 않는다.", "",
  "## 한눈에", "",
  `- ${CHAPTERS.length}장, ${DAYS.length}일이다. 하루를 깨야 다음 날이 열린다.`,
  `- 보스 날은 ${DAYS.filter(d => d.beat).length}일이다. 완주하고 평균 점수가 기준 이상이어야 깬다.`,
  "- 통증 칸을 다 쓰거나 구급차가 오면 그날은 실패다. 다시 도전한다.",
  "- 별은 평균 점수 110 이상 3개, 94 이상 2개, 그 밖 1개다. 꺾기 수가 6번이 아니면 컷이 조금 옮겨진다(허리비틀기 -10, 허리펴기·목뽑기 3명 -5).",
  "- 역경: 별 3개로 깬 목꺾기·목뽑기 날은 더 빡센 규칙으로 다시 할 수 있다. 통증 칸 하나 덜(최소 2칸), 구역 안내 없음, 좁은 구역(이미 좁은 날은 더 좁게), 평균 100점 안팎(꺾기 수에 따라 조금 달라지고 보스는 기준+6). 광고 이어하기는 없다. 역경 별은 따로 남는다.",
  "- 장면을 직접 보려면 케이스 사이트: https://kangraemin.github.io/ttuk-cases/", "");

w("| 장 | 제목 | 한 줄 | 날 | 모드 | 보스 기준 |", "|---|---|---|---|---|---|");
for (const c of CHAPTERS) {
  const ds = DAYS.filter(d => d.ch === c.no);
  const modes = [...new Set(ds.map(d => GAME[d.game]))].join("·");
  const boss = ds.filter(d => d.beat).map(d => d.beat).join(", ") || "-";
  w(`| ${c.no} | ${c.title} | ${c.lead} | ${ds.length} | ${modes} | ${boss} |`);
}
w("");

for (const c of CHAPTERS) {
  w(`## ${c.no}장 ${c.title}`, "", `- ${c.lead}`, "");
  DAYS.forEach((d, i) => {
    if (d.ch !== c.no) return;
    const rules = [GAME[d.game], `통증 ${d.painMax}칸`, d.zone ? `구역 안내 ${d.zone}명` : "구역 안내 없음"];
    if (d.mods?.tight) rules.push("좁은 구역");
    if (d.mods?.noisy) rules.push("호흡 안내 없음");
    if (d.beat) rules.push(`평균 ${d.beat}점 이상`);
    w(`### ${dayLabel(i)} ${d.title}${d.beat ? " (보스)" : ""}`, "", `- 규칙: ${rules.join(" · ")}`);
    w(`- 환자: ${d.patients.map(n => { const p = who(n); return p ? `${n}(${p.age})` : n; }).join(", ")}`);
    w("- 시작 카드:"); d.intro.forEach(l => w(`  - ${l}`));
    Object.entries(d.lines || {}).forEach(([n, l]) => w(`- ${n} 첫마디: "${l}"`));
    if (d.outro) w(`- 깼을 때: ${d.outro}`);
    if(HARD_GAMES.includes(d.game)){ const h = hardDay(i); w(`- 역경: 통증 ${h.painMax}칸 · 구역 안내 없음 · 좁은 구역 · 평균 ${h.beat}점 이상`); }
    w(d.beat ? `- 평균 미달: 평균 N점. ${d.beat}점을 못 넘었어요. ${d.lose}` : `- 실패: ${dayLabel(i)}를 못 버텼어요. 다시 문 열어 봐요.`, "");
  });
}

w("## 환자 도감", "", "- 대사 키: 시작 start, 가까움 near, 교정 직후 sigh, 첫 반응 what/after, 두 번째 반응 ahh/done, 실패 fail, 중단 quit.", "");
const days = n => DAYS.map((d, i) => d.patients.includes(n) ? i + 1 : 0).filter(Boolean);
for (const p of ALL) {
  const seen = days(p.name);
  w(`### ${p.name} (${p.age})${p.base ? ` · 얼굴은 ${p.base}` : ""}`, "",
    `- 증상: ${p.cc}`,
    `- 특성: ${TRAIT[p.trait] || "없음"}`,
    `- 나오는 날(통산): ${seen.length ? seen.join(", ") + "일째" : "자유 진료만"}`);
  const L = p.lines || {};
  ["start", "sigh", "what", "ahh", "after", "done", "quit"].forEach(k => { if (L[k]) w(`- ${k}: "${L[k]}"`); });
  if (Array.isArray(L.fail) && L.fail.length) w(`- fail: ${L.fail.map(s => `"${s}"`).join(" / ")}`);
  w("");
}

writeFileSync(new URL("../../docs/story.md", import.meta.url), out.join("\n"));
console.log(`docs/story.md: ${DAYS.length}일, 환자 ${ALL.length}명, ${out.length}줄`);

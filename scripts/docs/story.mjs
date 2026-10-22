/* docs/story.md 생성기: 영업 일지 전체(장·일차·규칙·환자·사연·대사)를 플레이하지 않고 읽을 수 있게 펼친다.
   원본은 src/core/campaign.js, src/patient/{roster,cast}.js 하나뿐이고 이 문서는 늘 다시 만든다.
   실행: npm run docs:story */
import { writeFileSync } from "node:fs";
import { DAYS, CHAPTERS, dayLabel, hardDay, HARD_GAMES } from "../../src/core/campaign.js";
import { ROSTER } from "../../src/patient/roster.js";
import { CAST } from "../../src/patient/cast.js";
import { rushPlan, rushDays, RUSH_PAIN } from "../../src/core/rush.js";
import { DEX_PATIENTS, DEX_FAILS } from "../../src/core/dex.js";
import { QUESTS, RULE_NAME, questUnlockDay, QUEST_GAP } from "../../src/core/quests.js";

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

w("## 심야 진료 (엔드게임)", "",
  "- 56일을 모두 깨면 타이틀과 영업 일지 아래 `심야 진료`가 열린다. 잠겨 있으면 '56일 다 깨면 열려요'.",
  "- 목꺾기와 목뽑기 환자가 통증 칸 3개를 같이 쓰며 끝없이 온다. 통증을 다 쓰거나 구급차가 오면 끝난다. 초록 구역 안내는 없다.",
  "- 오늘 날짜(한국 시간)가 시드라 그날은 모두 같은 손님과 같은 목표 각도를 받는다. 환자는 영업 일지 31명 중에서 나오고, 같은 사람이 연달아 오지 않으며 같은 게임이 세 번 이어지지 않는다.",
  "- 5명마다 구역이 7%씩 좁아지고(최소 절반), 11번째 환자부터 치료사 호흡 안내가 꺼진다.",
  "- 기록은 그날 끝까지 진료한 환자 수(같으면 점수)이고 날짜가 바뀌면 새로 시작한다. 영업 일지 별·최고 기록에는 들어가지 않는다.",
  "- 광고 보고 통증 칸 +1로 이어하기는 한 판에 한 번(쌓인 통증은 그대로), 끝난 카드 직후 전면광고는 없다.", "");
w("## 보스 러시 (엔드게임)", "",
  "- 56일을 모두 깨면 타이틀과 영업 일지의 `보스 러시`가 열린다. 잠겨 있으면 '56일 다 깨면 열려요'.",
  `- 영업 일지 보스 날 ${rushDays().length}개를 순서대로 이어서 한다(허리펴기 보스인 3장은 따로 도는 페이지라 빠진다). 환자 ${rushPlan().length}명, 통증 ${RUSH_PAIN}칸을 전부가 같이 쓴다.`,
  "- 보스마다 그 날의 게임과 규칙(좁은 구역, 호흡 안내 없음)이 그대로 걸린다. 보스가 바뀔 때 '보스 k/N'과 사연 한 줄이 뜬다.",
  "- 보스는 그 날 환자를 모두 치료하고 평균이 보스 기준(beat) 이상이면 이긴 것이다. 기록은 이긴 보스 수, 도달 수, 점수 순이다.",
  "- 영업 일지 별·최고 기록에는 들어가지 않는다. 광고 보고 통증 칸 +1로 이어하기는 한 판에 한 번.", "");
rushPlan().filter(p => p.first).forEach(p => w(`- 보스 ${p.k + 1} · ${dayLabel(p.day)} ${p.title} (기준 ${p.beat}점, ${GAME[p.game]}): ${p.line}`));
w("");
w("## 환자 도감 (수집 기록)", "",
  `- 타이틀과 영업 일지의 \`환자 도감\` 버튼. 환자 ${DEX_PATIENTS.length}명과 실패 연출 ${DEX_FAILS.length}종을 모은다. 저장은 chiroDex.`,
  "- 환자는 진료실에 들어오면(허리 날은 영업 시작에) 적힌다. 못 만난 환자는 실루엣과 '???'이고 몇 장에서 오는지만 보인다.",
  "- 실패 연출은 처음 겪을 때 적힌다. 결과 카드에 '도감에 새로 적혔어요'가 뜬다.", "");
DEX_FAILS.forEach(f => w(`- ${f.name} (${GAME[f.game] || "공통"}): ${f.desc}`));
w("");
w("## 단골 의뢰 게시판", "",
  `- 영업 일지에서 단골을 만나면 의뢰가 올라온다. 의뢰 ${QUESTS.length}개, 의뢰마다 제약은 하나다.`,
  "- 열리는 때: 의뢰에 나오는 환자가 모두 영업 일지 깬 날에 나온 뒤. 2편은 1편을 깨야 열린다.",
  `- 평균 점수 의뢰는 별 3개 컷보다 ${QUEST_GAP}점 아래가 기준이다(꺾기 수에 따라 컷이 옮겨진다). 나머지는 완주하면 깬다.`,
  "- 별은 영업 일지 날과 같은 컷이다. 저장은 chiroCampaign.quests. 광고 이어하기와 역경은 없다.", "");
QUESTS.forEach((q, n) => {
  const rules = [GAME[q.game], `통증 ${q.painMax}칸`, "구역 안내 없음"];
  if (q.mods?.tight) rules.push("좁은 구역");
  if (q.mods?.noisy) rules.push("호흡 안내 없음");
  if (q.beat) rules.push(`평균 ${q.beat}점 이상`);
  w(`### 의뢰 ${n + 1} ${q.who} ${q.ep}편 ${q.title}`, "", `- 제약: ${RULE_NAME[q.rule]} (${rules.join(" · ")})`,
    `- 열리는 때: ${dayLabel(questUnlockDay(q))}를 깬 뒤${q.ep > 1 ? ` · ${q.who} 1편을 깬 뒤` : ""}`,
    `- 환자: ${q.patients.map(nm => { const p = who(nm); return p ? `${nm}(${p.age})` : nm; }).join(", ")}`, "- 시작 카드:");
  q.intro.forEach(l => w(`  - ${l}`));
  w(`- ${q.who} 첫마디: "${q.lines[q.who]}"`, `- 깼을 때: ${q.outro}`, "");
});

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

# 케이스

- `cases.mjs`: 케이스 정의(재현 방법·나오는 장면·조작 순서). 사이트와 녹화가 같이 쓴다.
- 실시간 재생(사이트 기본): `npm run build:cases` → `dist-cases/`를 사이트 레포(kangraemin/ttuk-cases)의 `play/`로 복사. 카드가 `play/<페이지>?case=<id>`를 iframe으로 연다. 러너는 `src/dev/caseRunner.js`.
- 재생 점검: `npx vite preview --mode cases --outDir dist-cases --port 5195 &` 후 `node scripts/cases/live-check.mjs [--only id,id]`.
- 영상 녹화(썸네일·예비): `npm run dev -- --port 5181 & npm run dev -- --mode shot --port 5182 & node scripts/cases/run.mjs --out <출력폴더> --dev http://127.0.0.1:5181 --shot http://127.0.0.1:5182`. `run.mjs` Playwright 녹화(영상+소리 mp4), `cases.json` 녹화 결과 메타(영상 파일 제외).
- 보스 러시 케이스: `night: "rush"`(심야와 같은 규칙, 일지의 보스 러시 버튼). 환자 도감 케이스: `dex: true`(환자 5명·실패 3종을 심고 도감 버튼).
- 심야 진료 케이스: `night: true`. 56일 클리어 저장을 심고 일지 → 심야 진료를 누른다. 환자 게임(목꺾기/목뽑기)은 날짜 시드라 steps에 `pos`와 `tow`를 둘 다 적고, 러너가 지금 게임에 맞는 쪽을 쓴다.
- 영업 일지 케이스: `campaign: { day, story }`. 그 날 앞까지 깬 저장(`chiroCampaign`)을 심고 일지 → 그 날 → 영업 시작을 누른다. `story: true`면 사연 카드에서 멈춘다(`steps: []`). `day`는 0부터(7 = 2장 1일차).

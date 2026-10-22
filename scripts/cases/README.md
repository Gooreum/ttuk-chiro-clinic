# 케이스

- `cases.mjs`: 케이스 정의(재현 방법·나오는 장면·조작 순서). 사이트와 녹화가 같이 쓴다.
- 실시간 재생(사이트 기본): `npm run build:cases` → `dist-cases/`를 사이트 레포(kangraemin/ttuk-cases)의 `play/`로 복사. 카드가 `play/<페이지>?case=<id>`를 iframe으로 연다. 러너는 `src/dev/caseRunner.js`.
- 재생 점검: `npx vite preview --mode cases --outDir dist-cases --port 5195 &` 후 `node scripts/cases/live-check.mjs [--only id,id]`.
- 영상 녹화(썸네일·예비): `npm run dev -- --port 5181 & npm run dev -- --mode shot --port 5182 & node scripts/cases/run.mjs --out <출력폴더> --dev http://127.0.0.1:5181 --shot http://127.0.0.1:5182`. `run.mjs` Playwright 녹화(영상+소리 mp4), `cases.json` 녹화 결과 메타(영상 파일 제외).
- 계절 손님 케이스: `campaign: {list: "season"}`(7일 클리어 저장, 겨울 고정, 일지의 계절 손님 칩 -> 목록), `campaign: {season: "winter2", story: true}`(앞 편을 깬 저장으로 그 편 사연 카드, `story` 없으면 바로 시작). 겨울 고정은 `window.__forceSeason`.
- 오늘의 도전 케이스: `night: "daily"`(저장 없이 타이틀의 오늘의 도전 알약, 연속 출근 저장만 심음).
- 주간 챌린지 케이스: `night: "weekly"`(7일 클리어 저장, 일지의 주간 챌린지 칩). 보스 러시 케이스: `night: "rush"`(심야와 같은 규칙, 일지의 보스 러시 버튼). 환자 도감 케이스: `dex: true`(환자 5명·실패 3종을 심고 도감 버튼), `dex: "tales"`(여기에 단골 의뢰 4개를 깬 저장을 더해 뒷이야기 줄을 본다).
- 심야 진료 케이스: `night: true`. 56일 클리어 저장을 심고 일지 → 심야 진료를 누른다. 환자 게임(목꺾기/목뽑기)은 날짜 시드라 steps에 `pos`와 `tow`를 둘 다 적고, 러너가 지금 게임에 맞는 쪽을 쓴다.
- 진료실 꾸미기 케이스: `shop: { coins, owned, open }`. 그 상점 저장(`chiroShop`)을 심는다. `open: true`면 타이틀의 '진료실 꾸미기' 카드에서 멈추고(`steps: []`), 아니면 저장만 심고 평소대로 시작한다.
- 영업 일지 케이스: `campaign: { day, story }`. 그 날 앞까지 깬 저장(`chiroCampaign`)을 심고 일지 → 그 날 → 영업 시작을 누른다. `story: true`면 사연 카드에서 멈춘다(`steps: []`). `day`는 0부터(7 = 2장 1일차).
- 단골 의뢰 케이스: `campaign: { list: true }`(게시판) 또는 `{ quest: "이라이더1", story: true }`(사연 카드). 의뢰 id가 `3`으로 끝나는 3편(완결)은 같은 단골의 1·2편을 깬 저장을 함께 심는다(`quest-story-finale`). 러너는 `scripts/cases/run.mjs`와 `src/dev/caseNeck.js` 두 곳이다.
- 장 막간 케이스: `campaign: { day, interlude: true }`. 막간을 안 본 저장을 심고(다른 영업 일지 케이스는 `seen`을 미리 채워 막간을 건너뛴다) 일지 → 그 장 첫날을 눌러 막간 카드에서 멈춘다.
- 보스 규칙 케이스: `campaign: { day }`에 steps의 `late: ms`(환자를 넘겨받은 뒤 그만큼 지난 다음에 꺾음. 타이머·목표 교체·구역 축소를 보이려고). `optional: true`인 step은 결과 카드가 이미 열렸으면 건너뛴다. 엔딩 카드 케이스: `ending: true`(카드를 바로 연다).
- 추가 필드(22차): `campaign.seasonName`(계절 고정: spring/summer/autumn), `campaign.season: "spring2"`(계절은 id에서 읽음), `campaign.done`(겨울 4편 클리어 목록), `campaign.cleared`(의뢰 저장의 클리어 일수, 기본 7), 의뢰 2·3편은 앞 편을 깬 저장. `weekly: "timer"`(주간 규칙 id, `night: "weekly"`와 함께. 케이스 빌드가 `Date.now`를 주 단위로 옮겨 그 규칙의 주로 만든다), `dex: "full"`(도감 전부), `menu: true`(진료 시작 후 클리닉 메뉴 열기), `query: "day=16&hard=1"`(허리 페이지 URL 쿼리. live-check가 읽는다. 사이트의 iframe 주소 만드는 코드와 녹화 `run.mjs`도 `c.query`를 붙여야 한다).

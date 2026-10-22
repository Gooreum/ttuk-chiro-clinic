# 이벤트 기록 (토스 Analytics · GA4)

이벤트 이름은 `src/core/analytics.js`의 `EV`에 모여 있다.
보내는 코드는 `src/platform/analytics.js` 하나다.
토스 빌드에서는 토스 `Analytics.log`로, 웹 페이지와 토스 웹뷰에서는 GA4(`G-91N1SBGRDE`, 속성 "뚝 카이로 클리닉")로 같은 이름·같은 파라미터를 보낸다.

- 개인정보는 넣지 않는다. 환자는 가상 인물이고 번호(`patient_no`)와 모델 id(`roster`)만 쓴다.
- localhost와 촬영 빌드(`npm run build:shot`)는 아무것도 보내지 않는다. 촬영 빌드는 `window.__events`에 쌓고 e2e가 확인한다.
- `?internal=1`로 한 번 열면 그 기기는 `traffic_type=internal`이 붙는다(`?internal=0`으로 해제). 토스 sandbox도 internal이다.
- `?debug=1`이면 GA4 DebugView로 보인다(`debug_mode`).
- 토스 Analytics는 출시 뒤 데이터만 집계한다. sandbox에서는 콘솔에만 찍힌다.

## 모든 이벤트에 붙는 값

| 파라미터 | 값 |
|---|---|
| `mode` | `crack` 목꺾기 / `towel` 목뽑기 / `back` 허리펴기 / `side` 허리비틀기 |
| `build` | `toss` / `web` |
| `traffic_type` | 내부 트래픽이면 `internal` |

## 이벤트

| 이름 | 언제 | 주요 파라미터 |
|---|---|---|
| `app_open` | 세션의 첫 페이지 | `first_open`, `first_open_date`, `visit_days`(방문한 날 수), `open_count`, `days_since_first`, `days_since_last`, `returning_day`, `entry_source`, `utm_*`, `entry_ref`, `entry_mode`, `referrer_host` |
| `page_switch` | 같은 세션에서 클리닉 메뉴로 다른 페이지 | `from_mode` |
| `screen_view` | 화면 진입(`title`/`play`/`result`) | `screen_name`, `prev_screen`, `prev_ms`(이전 화면 체류), `outcome` |
| `load_ready` | 첫 프레임이 그려짐 | `load_ms`(내비게이션부터), `dom_ms`, `first_open` |
| `asset_load` | 모델·장면 로드 끝 | `asset`(`patient_first`/`arms`/`spine`/`back_scene`/`side_scene`), `ok`, `ms`, `detail` |
| `load_fail` | 게임이 시작을 못 함(첫 프레임 전 오류, 장면 로드 실패) → 다시 시도 카드 | `reason`, `detail`, `after_ms` |
| `retry_click` | 다시 시도 버튼 | `reason` |
| `app_error` | 잡히지 않은 오류(페이지당 10개까지) | `kind`(`error`/`rejection`), `message`, `file`, `line`, `ready`, `screen_name` |
| `app_hide` | 백그라운드로 감·뒤로가기 | `reason`(`hidden`/`back`), `dwell_ms`, `screen_name`, `screen_ms` |
| `ui_click` | 버튼·링크·칩 클릭(위임) | `target`(id 또는 `data-track`), `screen_name` |
| `run_start` | 시작·다시·이어하기 | `game`(`crack`/`towel`, 심야 진료는 `night`), `how`(`start`/`again`/`continue`), `control` |
| `patient_start` | 환자(허리펴기는 구역) 시작 | `patient_no`/`zone_no`, `roster`, `trait`, `of` |
| `aim_start` | 준비가 끝나 조작 가능(목 모드) | `patient_no`, `control` |
| `attempt` | 꺾기·당기기·누르기 한 번 | `result`(`ok` 또는 실패 종류: over/dud/finger/slip/taut/skew/miss…), `tier`(0 살살/1 금/2 골절), `force`, `perfect`, `pts`, `try_no`, `aim_ms`, `side_no`/`zone_no`, `exhale`, `dist`/`tension`, `organs` |
| `first_success` | 이 기기의 첫 성공 | `game`, `aim_ms` |
| `patient_done` | 환자(또는 구역·쪽) 끝 | `label`(`done`/`quit`/`ambulance`/`miss`), `pts`, `stars`, `fails` |
| `run_end` | 결과 카드 | `game`, `day`(영업 일지일 때만, 허리펴기·허리비틀기 포함), `outcome`(`complete`/`pain`/`ambulance`/`quit`), `score`, `patients`, `pain`, `best`, `continued`, `run_ms`, `rank` |
| `quest_start` | 단골 의뢰 게시판에서 의뢰 시작을 누름 | `quest_no`(1~48), `quest`(id), `who`, `rule`(tight/noisy/pain1/pain2/beat/many), `game` |
| `quest_end` | 의뢰 한 판이 끝남(클리어 여부, `beat` 의뢰는 평균 이상이어야 클리어) | `quest_no`, `quest`, `who`, `rule`, `game`, `cleared`, `stars`, `score`, `run_ms` |
| `run_complete` | **핵심 행동**: 한 판을 끝까지(모든 환자, 구급차·통증 종료 없이) | `game`, `day`(영업 일지일 때만), `score`, `continued`, `run_ms` |
| `night_start` | 심야 진료(엔드게임 무한 모드) 시작 | `date`(KST 날짜, 일일 시드) |
| `night_end` | 심야 진료가 끝남(통증·구급차, 이어하기 뒤 다시 끝나면 한 번 더) | `date`, `count`(끝까지 진료한 환자 수), `score`, `tier`(도달한 단계, 5명마다 1), `outcome`(`pain`/`ambulance`), `continued`, `best`(오늘 기록 경신), `run_ms` |
| `dex_open` | 환자 도감을 엶 | `met`(만난 환자 수), `fails`(본 실패 연출 수), `from`(title/days) |
| `rush_start` | 보스 러시 시작 | `bosses`(6), `patients` |
| `rush_end` | 보스 러시가 끝남 | `reached`(도달한 보스), `cleared`(이긴 보스 수), `score`, `outcome`, `continued`, `best`, `run_ms` |
| `day_end` | 영업 일지 한 일차가 끝남(클리어 여부, 보스 날은 평균 `beat` 이상이어야 클리어) | `day`(1~56, 장을 넘어 이어지는 번호. 허리펴기 날은 `game: back`, 허리비틀기 날은 `game: side`), `hard`(역경이면 1), `cleared`, `stars`, `score`, `run_ms`(시작부터 이날 끝까지, 이어하기 포함. 실측 플레이타임 산정용, docs/economy.md) |
| `review_request` | 한 판 완주 직후 토스 리뷰 요청(기기당 1번, `chiroReviewAsked`) | `supported`, `error` |
| `ad_notice` | 전면광고 전 "잠시 뒤 광고가 1개 나와요"(1.6초) | `format` |
| `pain_ad` | 영업 일지 사연 카드의 "광고 보고 통증 칸 +1"(통증 2칸 이하 날, 역경 제외) | `day`, `step`(`click`/`granted`/`fail`) |
| `shop_buy` | 진료실 꾸미기에서 소품·편의 아이템을 산 순간 | `item`, `price`, `coins_left` |
| `coin_earn` | 한 판이 끝나 진료비가 지급될 때(`step=run`), 보상형 광고로 같은 만큼 더 받을 때(`step=double`) | `game`, `day`, `hard`, `coins`, `step`, `total` |
| `ad_event` | 전면·보상 광고 각 단계 | `format`(`interstitial`/`rewarded`), `step`(`request`/`loaded`/`show_requested`/`show`/`impression`/`clicked`/`reward`/`dismissed`/`error`), `stage`·`code`(실패), `earned`, `ms` |
| `iap_purchase` | 광고 제거 결제 | `step`(`start`/`success`/`fail`/`restore`/`revoke`), `code` |

공유 기능은 없다(공유 리워드 종료와 무관).

## 전환 지표 (토스 콘솔 · GA4 주요 이벤트)

- 대표: `run_complete` 한 판 완주(토스 템플릿 "게임 플레이 완료한 유저").
- 보조: `first_success` 첫 교정 성공, `ad_event`(step=`reward`) 보상형 광고 시청.

## 리뷰 요청·전면광고 규칙

- 리뷰는 `run_complete` 직후 한 번만 요청한다. 토스가 띄울지 정하고 결과는 알 수 없다.
- 리뷰를 요청한 결과 카드에서는 전면광고를 건너뛴다.
- 전면광고는 먼저 안내 문구를 띄운 뒤 불러온다.

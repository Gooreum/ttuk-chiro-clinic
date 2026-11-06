# 이벤트 목록

이벤트 이름은 `src/core/analytics.js` `EV`에만 둔다. 파라미터·전환 지표·광고 규칙은 `docs/analytics.md`.

- 기본 이벤트 47개, 자동 파생 16개, 합계 63개
- 모든 이벤트에 `mode`, `build`, `app_platform`(toss/android/ios/web), `lang`이 붙는다
- GA 사용자 속성: `app_platform`, `build`, `os`, `device_class`, `lang`
- 전송: gtag(웹·토스 웹뷰), 직접 수집(스토어 앱), 토스 `Analytics.log`(토스 빌드), 촬영 빌드는 `window.__events`만

## 기본 이벤트

| 이름 | 언제 | 코드 |
|---|---|---|
| `app_open` | first page of a session: visit counts and the entry source | src/platform/analytics.js |
| `page_switch` | a later page in the same session (the 클리닉 menu reloads the page) | src/platform/analytics.js |
| `screen_view` | title / play / result / tune / clinic_menu / chart | src/platform/analytics.js |
| `load_ready` | the first frame is on screen | src/platform/analytics.js |
| `asset_load` | a glTF / scene load finished or failed | src/back/main.js, src/platform/analytics.js, src/side/main.js |
| `load_fail` | the game could not start (boot error, scene load failure) | src/platform/analytics.js |
| `retry_click` | the 다시 시도 button on a load failure | src/ui/loadFail.js |
| `app_error` | an uncaught error or rejection | src/platform/analytics.js |
| `app_hide` | the page went to the background (the dwell so far) | src/platform/analytics.js |
| `run_start` | 시작 / 다시 / 이어하기 | src/back/main.js, src/game/flow.js, src/platform/analytics.js, src/side/main.js |
| `patient_start` | a new patient (or back zone) comes in | src/back/main.js, src/game/flow.js |
| `aim_start` | the prep ends, the player has the head | src/game/flow.js |
| `attempt` | every crack / tug / press, good or bad | src/back/main.js, src/game/flow.js, src/side/main.js |
| `patient_done` | a patient (both sides) or a back zone is finished | src/back/main.js, src/game/flow.js, src/side/main.js |
| `run_end` | the result card opens | src/back/main.js, src/game/flow.js, src/side/main.js |
| `run_complete` | conversion: a run played through to the end (every patient, no bad end) | src/back/main.js, src/game/flow.js, src/platform/analytics.js, src/side/main.js |
| `night_start` | 심야 진료: an endless night run began | src/game/night.js |
| `weekly_start` | 주간 챌린지: a run began (week, rule, try number) | src/game/weekly.js |
| `weekly_end` | 주간 챌린지: the run ended (week, rule, score, complete, best) | src/game/weekly.js |
| `daily_start` | 오늘의 도전: a run began (date, rule, game, try number) | src/game/daily.js |
| `daily_end` | 오늘의 도전: the run ended (date, rule, score, complete, best) | src/game/daily.js |
| `attend` | 출근 도장: today's first finished run stamped the card (streak, cycle day, coins) | src/ui/attend.js |
| `season_start` | 계절 손님: an episode began (season, ep, rule) | src/game/seasonFlow.js |
| `season_end` | 계절 손님: an episode ended (cleared, stars, season bonus) | src/game/seasonFlow.js |
| `dex_open` | 환자 도감 opened (met, fails, from title / days) | src/game/dex.js |
| `rush_start` | 보스 러시: a run began | src/game/rush.js |
| `rush_end` | 보스 러시: the run ended (bosses reached / cleared, score) | src/game/rush.js |
| `night_end` | 심야 진료: the run ended (count of patients treated, score, tier reached) | src/game/night.js |
| `day_end` | 영업 일지: a campaign day ended (cleared or not, stars) | src/back/main.js, src/game/flow.js, src/side/main.js |
| `quest_start` | 단골 의뢰: 의뢰 시작을 누름 | src/game/questFlow.js |
| `quest_end` | 단골 의뢰: 의뢰 한 판이 끝남(클리어 여부, 별) | src/game/questFlow.js |
| `first_success` | conversion step: the very first good crack on this device | src/platform/analytics.js |
| `ui_click` | buttons and chips: again, clinic, tune, music, chart, center | src/game/flow.js, src/platform/analytics.js, src/ui/monetize.js, src/ui/shop.js |
| `ad_event` | full-screen ads: request / loaded / show / impression / clicked / dismissed / reward / error | src/platform/admob.js, src/platform/toss.js |
| `ad_notice` | the "광고가 나와요" notice before an interstitial | src/platform/analytics.js, src/ui/monetize.js |
| `pain_ad` | 영업 일지 story card: the rewarded "통증 칸 +1" (click / granted / fail) | src/ui/monetize.js |
| `shop_buy` | 진료실 꾸미기: an item was bought (item, price, coins_left) | src/ui/shop.js |
| `coin_earn` | 진료비: a run paid out (step run) or the rewarded 2x paid the same again (step double) | src/game/daily.js, src/game/seasonFlow.js, src/game/weekly.js, src/ui/attend.js, src/ui/shop.js |
| `share` | 자랑하기 on a result card (where night/rush/day, how toss/native/copied/fail) | src/platform/share.js |
| `leaderboard_open` | Toss game-center leaderboard: 랭킹 보기 (open) and the score submit result | src/platform/share.js |
| `iap_purchase` | 광고 제거: start / success / fail / restore (not GA4's reserved ecommerce "purchase") | src/platform/iap.js |
| `review_request` | the Toss review prompt was asked for (whether it shows is up to Toss) | src/platform/analytics.js |
| `app_resume` | the page came back from the background (away_ms) | src/platform/analytics.js |
| `handled_error` | an error the game caught and recovered from (where, message) | src/platform/analytics.js |
| `iap_view` | the 광고 제거 button was shown with its price | src/ui/monetize.js |
| `tutorial_begin` | GA recommended: the first run on this device began | src/platform/analytics.js |
| `tutorial_complete` | GA recommended: the first run played through on this device | src/platform/analytics.js |

## 자동 파생 이벤트 (GA4 권장 이름)

`platform/analytics.js` `track`이 기본 이벤트를 보낸 뒤 `derivedEvents`로 한 번 더 보낸다. 호출하는 곳은 없다.

| 이름 | 원본 |
|---|---|
| `ad_request` / `ad_loaded` / `ad_show` / `ad_reward` / `ad_fail` | `ad_event` step(request/loaded/show/reward/error), `ad_fail`은 `reason`=stage:code |
| `iap_start` / `purchase` / `iap_fail` / `iap_restore` / `iap_recover_fail` | `iap_purchase` step |
| `earn_virtual_currency` | `coin_earn` (`virtual_currency_name`=coin, `value`) |
| `spend_virtual_currency` | `shop_buy` (`value`=가격, `item_name`) |
| `level_start` | `run_start` (`level_name`=game) |
| `level_complete` / `level_fail` | `run_end` outcome complete / 그 밖(`reason`) |
| `js_error` | `app_error` |
| `tutorial_begin` / `tutorial_complete` | 이 기기 첫 `run_start` / 첫 `run_complete` (기기당 1번) |

## 광고 placement (`ad_event`·`ad_*`)

| placement | 자리 |
|---|---|
| `continue_ad` | 결과 카드 광고 보고 이어하기 |
| `night_continue_ad` | 심야·러시·주간 이어하기 |
| `boss_retry_ad` | 보스 아깝게 짐, 마지막 환자 다시 |
| `pain_ad` | 사연 카드 통증 칸 +1 |
| `coin_double_ad` | 결과 카드 진료비 2배 |
| `result_interstitial` | 결과 카드 떠날 때 전면광고 |

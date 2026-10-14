# 뚝 카이로 클리닉 — 에이전트 작업 가이드

폰을 가로로 두 손에 쥐고, 누워 있는 환자의 머리맡(치료사 시점)에서 목 각도를 맞춘 뒤 손목을 툭 꺾어 "뚝!" 교정하는 3D 모바일 웹 게임.
최종 목표는 **앱인토스(토스 미니앱) 출시**. 현재는 Vite + ES 모듈 구조이며, GitHub Pages(https://gooreum.github.io/ttuk-chiro-clinic/)로 실기기 테스트 중.

이 문서의 "지켜야 할 결정" 섹션은 실기기(iPhone)에서 여러 번 실패한 끝에 정한 것들이다. 이유를 이해하지 못한 채 되돌리지 말 것.

---

## 1. 파일 구성

| 경로 | 내용 |
|---|---|
| `index.html` | 마크업만. `src/main.js`를 module로 불러온다 |
| `src/` | 게임 코드 (아래 2절) |
| `test/*.test.js` | vitest 단위 테스트 (`src/core` 순수 함수) |
| `legacy/index.html` | 모듈 분리 전 단일 파일 원본. 회귀 비교 기준이며 수정하지 않는다 |
| `scripts/shot.py` | 헤드리스 크로미움으로 타이틀·플레이·교정 순간 스크린샷 3장 |
| `scripts/compare.py` | 두 스크린샷 폴더를 [A / B / 차이] 나란히 비교 |
| `vite.config.js`, `package.json` | 빌드 설정. `dist/`(배포)와 `dist-shot/`(촬영용) |
| `.github/workflows/pages.yml` | main에 push하면 테스트 → 빌드 → GitHub Pages 배포 |
| `AGENTS.md` / `CLAUDE.md` | 이 문서 (Codex용) / 이 문서를 import (Claude Code용) |

의존성: `three@0.149.0`(npm, 정확히 고정), 개발용 `vite`, `vitest`. Google Fonts(Black Han Sans, IBM Plex Sans KR)는 외부 링크.

> three를 r149로 고정하는 이유: 모듈 분리 때 화면을 한 픽셀도 바꾸지 않기 위해서. r152부터 색 관리 기본값이 바뀌고(`outputEncoding` → `outputColorSpace`), r155부터 물리 기반 조명 단위가 기본이라 `lamp`/`rim` 밝기가 크게 달라지며, r163부터 WebGL1이 빠진다. 올릴 때는 별도 단계로, shot.py 전후 비교를 보며 조명 값을 다시 맞춘다.

---

## 2. 코드 구조 (`src/`)

`src/main.js`가 import 순서대로 모듈을 평가한다. 씬은 모듈 부수 효과로 만들어지므로 순서가 곧 씬 그래프 순서다(진료실 → 환자). 가변 게임 상태는 모두 `src/game/state.js`의 `S` 객체에 있다(`S.phase`, `S.busy`, `S.target`, `S.input`, `S.cur`, `S.viewRot` 등). 튜닝값 `T`는 같은 객체를 계속 쓰므로 재대입하지 말고 `resetT()`/`Object.assign`을 쓴다.

| 모듈 | 내용 |
|---|---|
| `tuning.js` | `DEFAULTS`, `T`(localStorage `chiroTune`), `saveT`, `resetT`. 튜닝 패널과 1:1 |
| `patient/roster.js` | `TRAITS`, `ROSTER`(5명: 이름·나이·증상 `cc`·목표 마디 `seg`·회전 방향 `side`·허용 오차 `tolR/tolB`·호흡 주기·외형 `look`·대사 `lines`), `REVIEWS`, `makePatients()`(매 판 목표 각도와 위험 한계 `limR/limB` 랜덤) |
| `core/` | **DOM·three 없는 순수 함수. 단위 테스트 대상.** `tilt.js`(`tiltAngles`), `feel.js`(`tolMul`, `distAt`, `closenessOf`, `deltaGain`, `breathState`), `motion.js`(`classifySample` 스냅/버림/사용, `aimBefore`), `scoring.js`(`scoreSuccess`, `rankTitle`) |
| `scene/renderer.js` | 렌더러·씬·카메라·조명. ACES 톤매핑, 그림자는 `sun` 하나만 |
| `scene/textures.js` | 캔버스 텍스처(나무 바닥, 러그, 경추 포스터, 자격증). 폰트 로드 후 `redraw()` |
| `scene/materials.js` | `mats`, `M`, `mesh`, `cap/box/cyl/sph` |
| `scene/room.js` | 진료실, 교정 테이블 |
| `scene/patientModel.js` | 환자 몸, `pivot`(목 회전 중심) → `head`(얼굴·헤어 변형·안경·치료사 손), 경추 X-ray(`vert`), 링/충격파/파편 |
| `scene/look.js` | `applyLook(p)` 환자별 헤어·피부·가운·안경·체형 |
| `input/orientation.js` | `resize()`, `layout()`, `physAngle()`, 셀프 회전 가로 화면(3-4) |
| `input/motion.js` | `onMotion`, `snap`, `gSign`, `aimHist`, `live`(3-1~3-3) |
| `input/pointer.js` | 드래그/스와이프/키보드 폴백, "중앙으로" 버튼 |
| `audio/audio.js` | WebAudio 합성(뚝 소리 3겹, 차임, 틱, 배경음), `vib` |
| `game/feel.js` | `core/feel.js`를 현재 환자·튜닝으로 감싼 래퍼: `distAtNow`, `distNorm`(촬영용 `__FORCE_HIT__` 훅), `closeness`, `applyDelta`, `breath` |
| `game/flow.js` | `start`(3-5) → `loadPatient` → `adjust` → `success` / `hurt` → `finish`(진료 일지, 최고 기록 localStorage `chiroBest`) |
| `ui/hud.js` | 토스트, 말풍선, 떠오르는 글씨, 차트 카드, 미니 경추, 모드 문구, `projectHead` |
| `ui/ring.js` | `#hud` 2D 캔버스에 머리 둘레 조준 링(3-6) |
| `ui/tuneSheet.js` | 튜닝 패널 |
| `game/loop.js` | `frame`: 슬로모션(`S.slow`), 줌(`S.zoom`), X-ray(`S.xray`/`S.align`), 표정, 카메라 |
| `style.css` | 전체 스타일 (원본 `<style>` 그대로) |

### 좌표계 (중요)
- 환자는 +y가 얼굴 방향(천장), 머리는 -z(카메라 쪽), 발은 +z.
- 카메라는 머리 뒤(-z) 위에서 +z를 내려다봄 → **화면 오른쪽 = 월드 -x = 환자의 오른쪽**.
- `pivot.rotation.order = "YZX"`, `rotation.z = 회전(rot)`, `rotation.y = 측굴(bend)`. `rot > 0` = 얼굴이 화면 오른쪽으로.
- 조준 상태: `input`(목표값) → `cur`(부드럽게 따라감, `k = 1 - exp(-dt*9)`).

---

## 3. 지켜야 할 결정 (실기기에서 검증된 것)

### 3-1. 기울기는 중력 벡터로 계산한다 — `rotationRate`의 축 이름을 쓰지 말 것
- iOS Safari는 `DeviceMotionEvent.rotationRate`의 alpha/beta/gamma를 표준과 다른 축에 붙여 준다. 이걸로 조준하면 위아래가 거의 안 움직였다.
- 그래서 `accelerationIncludingGravity`(x/y/z 이름이 모든 브라우저에서 동일)로 폰 자세를 구한다: `tiltAngles(x,y,z,θ)` → `lr`(좌우, 핸들 돌리기 포함), `pt`(앞뒤 젖힘).
- 일부 iOS는 중력 값 부호가 뒤집혀 나온다 → 첫 샘플의 `z` 부호로 `gSign`을 자동 결정(플레이어는 화면을 위/자기 쪽으로 들고 있으므로 z>0이 정상).
- `rotationRate`는 **크기(magnitude)만** 스냅 감지에 쓴다. 축 이름은 안 씀.
- 조준은 절대값이 아니라 **프레임 간 변화량**을 `applyDelta`로 누적한다(무거움 적용 때문).
- 조준 방향: 좌우는 `+dlr`(폰을 왼쪽으로 기울이면 고개가 왼쪽, 2026-10-14 iPhone 확인), 위아래는 `-dpt`(원본 그대로). `core/motion.js`의 `aimDelta`.

### 3-2. 흔들리는 동안의 센서 값은 버린다
- 툭 꺾을 때의 선가속도가 중력 벡터에 섞이면 조준이 크게 튄다.
- `lin = | |a| − 9.81 |`. `lin > 1.6` 또는 회전 속도 > `T.flick*0.65`이면 그 샘플은 중력 필터에도, 조준에도 넣지 않고 버린다.

### 3-3. 스냅은 "꺾기 직전 위치"로 판정한다
- `aimHist`에 최근 800ms 조준 기록을 쌓고, 스냅이 감지되면 **250ms 전 위치**로 `input/cur`를 되돌린 뒤 `adjust("snap")`.
- 스냅 조건: 회전 속도 > `T.flick`(기본 200°/s) **또는** `lin` > `T.jerk`(기본 10 m/s²). 쿨다운 900ms, 스냅 후 400ms는 조준 고정.
- 목표에서 아주 먼데(`d > 3`) 스냅되면 통증 대신 토스트로만 알림(실수 꺾기 보호).

### 3-4. 가로 화면은 게임이 스스로 돌려서 그린다
- iOS Safari는 웹에서 화면 방향 고정(`screen.orientation.lock`)이 안 된다. 세게 기울이면 OS가 세로로 돌려버렸다.
- 해법: 세로 뷰포트면 `#app`에 `.rotated`를 붙이고 `rotate(90deg)`/`rotate(-90deg)`로 게임 전체를 돌려 그린다. 플레이어는 폰의 **세로 화면 고정**을 켜고 하면 절대 안 뒤집힌다.
- `viewRot`(0/90/270)을 센서 각도(`screenAngle = physAngle + viewRot`)와 드래그 좌표 변환에 반드시 반영한다. 화면 좌표 계산은 `getBoundingClientRect` 대신 `clientWidth/clientHeight`(회전 전 레이아웃 크기)를 쓴다.
- 마지막으로 잡았던 가로 방향(`lastLandscape`)과 같은 쪽으로 돌려서, 자동 회전이 켜져 있어도 화면이 같은 물리적 모서리에 유지되게 한다.
- 안드로이드는 시작 시 전체화면 + `orientation.lock("landscape-…")`도 시도한다(실패해도 무시).

### 3-5. iOS 권한은 탭 핸들러 안에서 동기적으로 요청
- `DeviceMotionEvent.requestPermission()`과 `requestFullscreen()`을 **await 없이 먼저 호출**해 promise를 받아 두고, 그다음에 await. 순서를 바꾸면 사용자 제스처가 끊겨 권한 팝업이 안 뜬다.
- 센서는 HTTPS에서만 동작. 로컬 파일로 열면 드래그 모드가 된다.

### 3-6. 조준 UI는 환자 머리 둘레에
- 예전에는 왼쪽 아래 패드였는데 "환자를 보고 있는 느낌이 안 든다"는 피드백으로 머리 둘레 링(`drawRing`)으로 옮겼다. 카메라도 머리가 화면 중앙 약간 아래에 오도록 잡혀 있다.
- 링: 가운데 조준점(가로 = 회전 ±70°, 세로 = 측굴 ±30°), 붉은 선 = 위험 한계, 초록 점선 타원 = 목표(처음 2명만), 바깥 호 = 긴장도(closeness), 아래 작은 호 = 호흡.

---

## 4. 게임 규칙 요약

- 거리: `d = sqrt(((rot−목표rot)/(tolR·T.tol·tolMul))² + ((bend−목표bend)/(tolB·…))²)`. `d ≤ 1`이면 성공 구역.
- 점수: `100 − 40d` + 날숨 보너스 15 + 연속 성공 보너스 `(streak−1)·10`. `d < 0.35`면 PERFECT(뚝 3번).
- 위험 한계 초과 또는 구역 밖 교정 → 통증. 통증 3번이면 종료.
- 별점: PERFECT이고 첫 시도 = 3, 통증 1회 이하 = 2, 그 외 1.
- 특성: 긴장형(시간이 갈수록 허용 범위 최대 40% 축소, 호흡 빠름), 근육 뭉침(무거움 +0.25, 감도 ×0.8), 유연함(목표 회전 44–53°), 어르신(위험 한계 50°/22°, 목표 작음).

튜닝 기본값(`DEFAULTS`): 감도 1.5, 위아래 1.0, 무거움 0.6, 허용 범위 1.0, 꺾는 속도 200°/s, 툭 세기 10 m/s². 사용자가 패널에서 바꾸면 localStorage에 남으므로, 기본값을 바꿔도 기존 사용자에게는 "기본값으로"를 눌러야 반영된다.

---

## 5. 검증 방법

1. **단위 테스트** (필수, 로직 변경 후마다): `npm test`. 센서·판정·점수는 `src/core`의 순수 함수로 두고 가상 자세 값으로 테스트한다(예: 45° 들고 시계 방향 20° → `lr ≈ −14`, 위쪽을 뒤로 10° 젖힘 → `pt` 10 감소. `test/tilt.test.js`).
2. **헤드리스 스크린샷** (필수, 시각 변경 후마다):
   ```bash
   python3 -m venv .venv && .venv/bin/pip install playwright pillow && .venv/bin/python -m playwright install chromium
   npm run build:shot                                         # dist-shot/ (판정 강제 성공 빌드)
   .venv/bin/python -I scripts/shot.py dist-shot --label new  # shots/new/1-title.png, 2-play.png, 3-crack.png
   .venv/bin/python -I scripts/shot.py --legacy legacy/index.html --label legacy
   .venv/bin/python -I scripts/compare.py shots/legacy shots/new --out shots/compare
   ```
   - `3-crack.png`는 판정 강제 성공 상태의 교정 순간(X-ray, 줌, 말풍선)이다. `npm run build:shot`에서만 `__FORCE_HIT__`가 켜지고, 일반 빌드(`dist/`)에서는 코드째 빠진다. legacy 모드는 임시 사본에서 문자열을 바꿔 찍으며 원본은 건드리지 않는다.
   - `Math.random` 시드와 페이지 시계를 고정하므로 같은 빌드는 같은 프레임이 나온다. CSS 애니메이션(교정 버튼 펄스, 떠오르는 글씨)만 실제 시간으로 돌아서 조금 차이 날 수 있다.
   - 시각 변경 전후 비교는 변경 전 빌드를 `--label before`로 찍어 두고 `compare.py`로 나란히 본다. 콘솔/페이지 에러가 있으면 shot.py가 출력하고 exit 1.
3. **실기기**: main에 push하면 GitHub Actions가 테스트 → 빌드 → Pages 배포를 한다. 폰에서 https://gooreum.github.io/ttuk-chiro-clinic/ 열기(HTTPS라 센서 동작). 아이폰은 세로 화면 고정 켜기. `dist/`는 정적 파일만이라 Netlify Drop에 끌어다 놓아도 된다. module 스크립트라 `dist/index.html`을 file://로 직접 열면 안 되고, 로컬 확인은 `npm run dev` 또는 `npm run preview`.
4. 튜닝 패널의 "지금 폰 자세 · 좌우/앞뒤" 숫자와 "최근 최고 꺾는 속도/툭 세기"가 센서 디버깅용이다.

헤드리스 환경에는 센서가 없어 드래그 모드로 동작한다. 센서·손맛 변경은 헤드리스 결과만으로 완료 처리하지 말고 실기기 확인 체크리스트를 함께 남긴다.

---

## 6. 로드맵 (우선순위 순)

1. ~~**모듈 분리 + Vite 빌드**~~ (완료): `src/` 모듈, three npm 고정, vitest, GitHub Pages 배포.
2. **성능**: 저사양 폰 대비 그림자 품질 자동 하향, `devicePixelRatio` 상한 조정, 지오메트리 병합.
3. **손맛**: 환자별 목표 마디에 따라 다른 "걸림" 진동 패턴, 교정 소리 샘플 다양화.
4. **콘텐츠**: 환자 풀 확대(랜덤 일일 명단), 흉추/요추 교정 스테이지, 진료실 업그레이드(점수로 구매).
5. **메타**: 일일 챌린지, 친구 랭킹, 결과 공유 카드(앱인토스 공유 API).
6. **앱인토스 연동**: 화면 방향 고정(네이티브 설정으로 3-4 우회 불필요해질 수 있음 — 그래도 웹 폴백은 유지), 햅틱 API로 iOS 진동 지원.

## 7. 톤 & 디자인
- 코믹하지만 깔끔하게. 실제 목 교정을 따라 하라는 뉘앙스는 피한다(의료 행위 오인 방지).
- 팔레트: 밤 진료실 청록 `--room #17312c`, 종이 `--paper #f4efe4`, 산호 `--coral #ff7a59`, 민트 `--mint #8adfbf`. 폰트: 제목 Black Han Sans, 본문 IBM Plex Sans KR.
- 이모지 쓰지 말 것. UI 문구는 짧고 구어체.

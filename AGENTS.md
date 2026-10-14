# 뚝 카이로 클리닉 — 에이전트 작업 가이드

폰을 가로로 두 손에 쥐고, 누워 있는 환자의 머리맡(치료사 시점)에서 목 각도를 맞춘 뒤 손목을 툭 꺾어 "뚝!" 교정하는 3D 모바일 웹 게임.
최종 목표는 **앱인토스(토스 미니앱) 출시**. 현재는 단일 `index.html` 프로토타입이며 Netlify Drop으로 실기기 테스트 중.

이 문서의 "지켜야 할 결정" 섹션은 실기기(iPhone)에서 여러 번 실패한 끝에 정한 것들이다. 이유를 이해하지 못한 채 되돌리지 말 것.

---

## 1. 파일 구성

| 경로 | 내용 |
|---|---|
| `index.html` | 게임 전체 (HTML + CSS + JS 한 파일, three.js r149 CDN) |
| `scripts/shot.py` | 헤드리스 크로미움으로 타이틀·플레이·교정 순간 스크린샷 3장을 찍는 검증 스크립트 |
| `AGENTS.md` | 이 문서 (Codex용) |
| `CLAUDE.md` | 이 문서를 import (Claude Code용) |

외부 의존성: `https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js` (전역 `THREE`), Google Fonts(Black Han Sans, IBM Plex Sans KR). 빌드 도구 없음.

> three r149를 쓰는 이유: `CapsuleGeometry`(r139+)가 있고, `build/three.min.js` UMD 빌드가 아직 존재하는 마지막 계열. 버전을 올리면 ES module로 바꿔야 한다.

---

## 2. 코드 구조 (`index.html` 안 `<script>` 순서)

1. **tuning** — `DEFAULTS`, `T`(localStorage `chiroTune`에 저장). 튜닝 패널 슬라이더/체크박스와 1:1.
2. **patients** — `TRAITS`, `ROSTER`(5명: 이름·나이·증상 `cc`·목표 마디 `seg`·회전 방향 `side`·허용 오차 `tolR/tolB`·호흡 주기·외형 `look`·대사 `lines`), `makePatients()`가 매 판 목표 각도와 위험 한계 `limR/limB`를 랜덤 생성.
3. **renderer / scene / lights** — ACES 톤매핑, 그림자는 `sun` 하나만.
4. **canvas textures** — 나무 바닥, 러그, 경추 포스터, 자격증. 폰트 로드 후 `redraw()`.
5. **meshes** — 진료실, 교정 테이블, 환자 몸, `pivot`(목 회전 중심) → `head` 그룹(얼굴·헤어 변형·안경·치료사 손), 경추 X-ray(`vert`), 링/충격파/파편.
6. **applyLook(p)** — 환자별 헤어·피부·가운·안경·체형 적용.
7. **camera + self-rotating landscape** — `resize()`, `layout()`.
8. **audio** — WebAudio 합성(뚝 소리 3겹, 차임, 틱, 배경음). 샘플 파일 없음.
9. **feel** — `tolMul`(긴장형), `distAt`, `closeness`, `applyDelta`(무거움·근육 뭉침), `breathState`.
10. **motion input** — `tiltAngles`, `onMotion`, `snap`, 드래그/키보드 폴백.
11. **tuning sheet / UI helpers** — 토스트, 말풍선, 배너, 차트 카드, 미니 경추.
12. **flow** — `loadPatient` → `adjust` → `success` / `hurt` → `finish`(진료 일지, 최고 기록 localStorage `chiroBest`).
13. **aim ring** — `#hud` 2D 캔버스에 환자 머리 둘레 조준 링을 매 프레임 그림.
14. **frame loop** — 슬로모션(`slow`), 줌(`zoom`), X-ray(`xray`/`align`), 표정, 카메라.

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

1. **헤드리스 스크린샷** (필수, 시각 변경 후마다):
   ```bash
   pip install playwright && python -m playwright install chromium
   python scripts/shot.py            # shots/1-title.png, 2-play.png, 3-crack.png
   ```
   `3-crack.png`는 임시 사본에서 판정을 강제로 성공시켜 교정 순간(X-ray, 줌, 말풍선)을 찍는다. 원본 파일은 건드리지 않는다. 콘솔/페이지 에러가 있으면 스크립트가 출력한다.
2. **실기기**: Netlify Drop(app.netlify.com/drop)에 폴더를 끌어다 놓아 HTTPS로 배포 → 폰에서 열기. 아이폰은 세로 화면 고정 켜기.
3. 튜닝 패널의 "지금 폰 자세 · 좌우/앞뒤" 숫자와 "최근 최고 꺾는 속도/툭 세기"가 센서 디버깅용이다.

헤드리스 환경에서는 센서가 없으므로 드래그 모드로 동작한다. 센서 로직을 바꿨다면 `tiltAngles`처럼 순수 함수로 분리해 가상 자세 값으로 단위 테스트할 것(예: 45° 들고 시계 방향 20° → `lr ≈ −14`, 위쪽을 뒤로 10° 젖힘 → `pt` 10 감소).

---

## 6. 로드맵 (우선순위 순)

1. **모듈 분리 + Vite 빌드**: 동작을 바꾸지 않고 `src/`로 쪼개기(input, scene, patient, audio, ui, game). three는 npm 패키지로. 앱인토스 웹뷰 배포 준비.
2. **성능**: 저사양 폰 대비 그림자 품질 자동 하향, `devicePixelRatio` 상한 조정, 지오메트리 병합.
3. **손맛**: 환자별 목표 마디에 따라 다른 "걸림" 진동 패턴, 교정 소리 샘플 다양화.
4. **콘텐츠**: 환자 풀 확대(랜덤 일일 명단), 흉추/요추 교정 스테이지, 진료실 업그레이드(점수로 구매).
5. **메타**: 일일 챌린지, 친구 랭킹, 결과 공유 카드(앱인토스 공유 API).
6. **앱인토스 연동**: 화면 방향 고정(네이티브 설정으로 3-4 우회 불필요해질 수 있음 — 그래도 웹 폴백은 유지), 햅틱 API로 iOS 진동 지원.

## 7. 톤 & 디자인
- 코믹하지만 깔끔하게. 실제 목 교정을 따라 하라는 뉘앙스는 피한다(의료 행위 오인 방지).
- 팔레트: 밤 진료실 청록 `--room #17312c`, 종이 `--paper #f4efe4`, 산호 `--coral #ff7a59`, 민트 `--mint #8adfbf`. 폰트: 제목 Black Han Sans, 본문 IBM Plex Sans KR.
- 이모지 쓰지 말 것. UI 문구는 짧고 구어체.

# 환자 머리 에셋 다시 만들기

환자 5명의 체형·피부·머리카락·눈썹·옷은 `patients.py`(`patient01`~`patient05`, `roster.js` 순서)에 있다. 한 명을 처음부터 끝까지 만들려면:

```
blender -b --python mpfb_build_character.py -- char.blend patient02
blender -b char.blend --python mpfb_export_head.py -- patient02_raw.glb 2048 32
blender -b --python mpfb_export_body.py -- body_raw.glb 1024 16 patient02
```

그다음 아래 5단계(머리)와 "환자 몸"(몸)의 최적화를 이름만 바꿔 실행하고, 머리 로그의 `MEASURE` 값을 `src/scene/realAssets.js` `MODELS`에 적는다. `gray: True`인 환자는 머리카락·눈썹 텍스처를 회색으로 다시 칠한다(게임의 색 곱하기로는 밝게 못 만든다). 아래는 박대리(patient01) 기준 설명이다.

1. Blender 5.2 + MPFB 2.0.18 설치 (`blender --command extension install-file --repo user_default --enable add-on-mpfb-v2.0.18.zip`)
2. makehuman_system_assets_cc0.zip을 풀어 MPFB user data(`.../extensions/.user/user_default/mpfb/data`)에 복사
3. `blender -b --python mpfb_build_character.py -- park.blend` (박대리: 남성, 32세, 동양인, 짧은 머리, 치아·혀 포함)
4. `blender -b park.blend --python mpfb_export_head.py -- patient01_raw.glb 2048 48`
   - 표정 단위 26개(`mpfb_export_head.py` `UNITS`, `core/faceRig.js` `EXPRESSION_UNITS`와 같아야 함), 눈썹·속눈썹 셰이프 키, 치아·혀는 `mouth-open`만(아래 치열과 혀만 턱을 따라감), 목 중간 아래 제거
   - 피부: 남은 머리의 UV 섬을 새 맵에 다시 배치하고(같은 텍스처 크기에서 해상도 약 1.6배) Cycles로 원본 피부 × 앰비언트 오클루전을 굽는다. 입안 UV 섬은 안쪽으로 갈수록 어둡게
   - 눈: 홍채를 짙은 갈색으로, 각막 껍질을 `.cornea` 메시·재질로 분리
   - 머리카락: `short02_normal` 노멀 맵 연결
   - 2048 / 48샘플로 M 시리즈 CPU에서 약 6분. 구운 PNG는 출력 GLB 옆에 저장된다
5. 최적화 사본 (gltf-transform 4.5.1):
   ```
   G="npx --yes @gltf-transform/cli@4.5.1"
   $G resize patient01_raw.glb a.glb --width 2048 --height 2048 --pattern "patient01_skin*"
   $G resize a.glb b.glb --width 512 --height 512 --pattern "short02*"
   $G resize b.glb c.glb --width 512 --height 512 --pattern "patient01_eye*"
   $G resize c.glb d.glb --width 256 --height 256 --pattern "eye*0*"
   $G resize d.glb e.glb --width 256 --height 256 --pattern "patient01_teeth*"
   $G webp e.glb f.glb --quality 85
   $G meshopt f.glb ../../public/models/patient01/patient01.glb
   ```
   피부를 1024로 줄이면(첫 줄 `--width 1024 --height 1024`) 파일이 약 85KB 줄고 GPU 메모리는 약 17MB 줄어든다.

측정값(정수리 y 1.625, 턱 y 1.358, 뒤통수 z -0.062)은 `src/scene/realAssets.js`의 머리 맞춤에 쓰인다. 다시 만들면 4단계 로그의 `MEASURE` 줄로 확인한다.

GLB 재질 이름(끝부분): `.body`(피부), `.high-poly`(눈알), `.cornea`(각막), `.short02`(머리카락), `.eyebrow001`, `.eyelashes01`, `.teeth_base`, `.tongue01`. `realAssets.js`가 이 이름으로 재질을 고른다.

## 환자 몸

`blender -b --python mpfb_export_body.py -- body_raw.glb 1024 16` (patient01과 같은 체형, 옷 `male_casualsuit06`, 두 손을 배 위에 올린 자세, 머리 GLB가 가져간 목 중간 위를 뺀 나머지, 피부×AO 굽기, 2본 스킨 `body`/`neck`, 모양 키 `breath`) 후

자세: 위팔은 옆구리를 따라 내리고 팔꿈치를 굽혀 두 손을 배꼽 높이에 왼손이 오른손 위로 겹치게 올린다. 실제 교정 영상 98개에서 바로 누운 환자는 거의 언제나 손을 배 위에 모으고 있다(2026-10-15). 손목 위치(`X_HAND`, `T_HAND`)와 손 방향(`D_HAND`, 셔츠 앞면을 따라 기울임)을 정하고 2본 IK로 팔꿈치를 놓은 뒤, 손이 셔츠(위 손은 아래 손)에서 2mm 떨어지도록 손목 깊이 `GAP`을, 팔뚝이 옆구리 셔츠를 뚫지 않도록 팔꿈치 방향 `POLE`을 반복해서 푼다. 로그의 `HANDS solved ...`가 그 결과다(`NOT SOLVED`면 값을 다시 본다). 엄지는 손바닥 면에 눕힌다(그대로 두면 배를 찌른다). `breath`는 자세를 적용한 뒤 같은 변위장으로 계산되므로 배 위의 손·팔뚝도 셔츠와 함께 1.5cm쯤 오르내리고 서로 파고들지 않는다.

```
$G resize body_raw.glb a.glb --width 1024 --height 1024
$G webp a.glb b.glb --quality 85
$G meshopt b.glb ../../public/models/patient01/body.glb
```

로그의 `TOP`이 머리 스크립트의 `TOP`(1.6254)과 같아야 목 이음매가 맞는다. 재질 이름 끝은 `.skin`, `.shirt`, `.pants`.

## 치료사 팔

`blender -b --python mpfb_export_arms.py -- arms_raw.glb 1024 16` (중년 남성 + `male_casualsuit06` 티셔츠, `game_engine` 리그, 어깨 관절에서 위팔 12% 지점을 자른 팔 전체와 티셔츠 소매, 피부×AO를 1024 맵에 굽기 — 소매가 팔에 그늘을 드리운다) 후
```
G="npx --yes @gltf-transform/cli@4.5.1"
$G webp arms_raw.glb a.glb --quality 85
$G meshopt a.glb ../../public/models/hands/arms.glb
```
한쪽마다 뼈대 `therapist_arm_<l|r>`(upperarm → lowerarm → hand → 손가락 01-03), 메시 `arm_skin_<l|r>`(재질 `therapist.skin`)와 `arm_sleeve_<l|r>`(재질 `therapist.sleeve` + 소매 끝 2.2 cm 밴드 `therapist.hem`; 둘 다 티셔츠 AO가 베이스 색이라 게임이 색을 곱해 칠한다). 소매는 티셔츠의 소매 패턴 조각(UV 섬)이고, 그 아래 피부는 MPFB 삭제 그룹 + 소매 입구에서 3.5 cm보다 깊은 부분을 지워 비집고 나오지 않는다. 뼈 이름은 `<bone>_<l|r>`(이름이 겹치면 GLTFLoader가 뼈 이름을 바꿔 버린다). 로그의 `LEN`(위팔·아래팔 길이)과 `PALM_DEPTH`(손바닥 피부까지 거리)를 `realAssets.js`에서 쓰고, `PALM_DEPTH`는 손이 피부에 살짝 파묻히도록 그보다 작게 잡는다.

## 치료사 상체

수건 견인 모드의 3인칭 화면용 치료사 몸(팔 제외). `arms.glb`와 같은 피부(`middleage_asian_male`)·티셔츠(`male_casualsuit06`)를 입은 30대 초반 남성이고, 머리카락은 검은 `short04`, 눈 `low-poly`(홍채 진한 갈색), 눈썹 `eyebrow001`, 속눈썹 `eyelashes01`, 신발은 흰 운동화 `shoes05`다.

```
blender -b --python therapist_build.py -- therapist_raw.glb 1024 16
G="npx --yes @gltf-transform/cli@4.5.1"
$G resize therapist_raw.glb a.glb --width 512 --height 512 --pattern "short04*"
$G resize a.glb b.glb --width 512 --height 512 --pattern "male_casualsuit06_normal*"
$G resize b.glb c.glb --width 256 --height 256 --pattern "shoes05*"
$G resize c.glb d.glb --width 256 --height 256 --pattern "therapist_eye*"
$G resize d.glb e.glb --width 256 --height 256 --pattern "eye[bl]*"
$G webp e.glb f.glb --quality 85
$G meshopt f.glb ../../public/models/therapist/therapist.glb
```
(bake 크기를 `0`으로 주면 굽기 없이 자세만 빨리 확인한다. M 시리즈 CPU에서 1024 / 16샘플로 약 1분 반.)

자세: 침대 머리맡에 서서 무릎을 조금 굽히고(엉덩이 3cm 내려감), 골반·척추를 앞으로 42도 숙이고, 목·머리를 22도 숙여 환자 얼굴을 내려다본다(얼굴 방향은 시선보다 18도 위). 스크립트가 무릎 굽힘·쇄골 길이(×1.09)·머리 숙임을 반복해서 풀어 두 어깨 관절(위팔 뼈 머리)이 `realAssets.js`의 팔 IK 고정점(`camBase` (0, 1.55, -0.24) + (±0.19, -0.33, -0.03) = (±0.19, 1.22, -0.27))에 오고 신발 밑창이 바닥(y 0)에 닿게 한다. 로그의 `MEASURE` 줄이 결과다. 눈은 (0, 1.27, -0.03)으로 `camBase`보다 35cm 낮고 앞이다: 그 어깨 높이에서 앞으로 숙이면 눈이 어깨 위 33cm에 올 수 없다(1인칭 카메라는 이 몸과 따로 논다).

팔은 어깨부터 뺐다: 팔 뼈 가중치 0.5 이상인 피부와, 위팔 18% 지점 평면 너머(축에서 14cm 안)를 지운다. 티셔츠는 소매 패턴 조각(UV 섬)만 그 평면에서 잘라 소매 머리를 남기고 잘린 입구를 살짝 볼록한 뚜껑으로 막는다. `arms.glb` 소매가 위팔 12%에서 시작하니 6% 겹친다. 위팔은 턱 쪽(three.js 방향 (0.45, -0.72, 0.5))으로 돌린 채 잘라서 어깨 모양이 그 방향 기준이다. 숙이면 티셔츠 밑단이 청바지 허리띠(AO 맵에서 늘 셔츠 밑이라 까만 부분)에 파묻혀 뚫고 나오므로, 허리 근처의 청바지를 셔츠 안쪽 6mm로 당겨 넣고, 옷 AO는 0.55~1로 올려 쓴다.

GLB는 정적 메시(뼈 없음)이고 three.js 월드 좌표 그대로다: 회전·이동 없이 `scene.add`하면 치료사가 +z(환자 발 쪽)를 보고 선다. 빈 노드 `mark_shoulder_l`/`mark_shoulder_r`/`mark_eyes`가 잰 위치를 담고 있다. 재질 이름: `therapist.skin`(피부×AO 구움), `therapist.shirt`/`therapist.pants`(옷 AO×장면 AO 1024 맵 하나를 같이 씀, 색은 base color factor: 셔츠 `mats.coat` 0xf4f1ea, 바지 남색 0x2a3345 — 게임이 팔 소매처럼 색을 바꿀 수 있다), `therapist.shoes`, `therapist.short04`·`therapist.eyebrow001`·`therapist.eyelashes01`(알파), `therapist.eyes`. 약 2만 삼각형, 약 380KB.

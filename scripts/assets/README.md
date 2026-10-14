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
   - 표정 단위 12개, 눈썹·속눈썹 셰이프 키, 치아·혀는 `mouth-open`만(아래 치열과 혀만 턱을 따라감), 목 중간 아래 제거
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

`blender -b --python mpfb_export_body.py -- body_raw.glb 1024 16` (patient01과 같은 체형, 옷 `male_casualsuit06`, 팔을 내린 자세, 머리 GLB가 가져간 목 중간 위를 뺀 나머지, 피부×AO 굽기, 2본 스킨 `body`/`neck`, 모양 키 `breath`) 후

```
$G resize body_raw.glb a.glb --width 1024 --height 1024
$G webp a.glb b.glb --quality 85
$G meshopt b.glb ../../public/models/patient01/body.glb
```

로그의 `TOP`이 머리 스크립트의 `TOP`(1.6254)과 같아야 목 이음매가 맞는다. 재질 이름 끝은 `.skin`, `.shirt`, `.pants`.

## 치료사 손

`blender -b --python mpfb_export_hands.py -- hands_raw.glb 1024 16` (중년 남성, `game_engine` 리그, 손과 팔뚝 손목 쪽 58%만 남김, 피부×AO를 1024 맵에 굽기) 후
```
G="npx --yes @gltf-transform/cli@4.5.1"
$G webp hands_raw.glb a.glb --quality 85
$G meshopt a.glb ../../public/models/hands/hands.glb
```
뼈 이름은 `<bone>_<l|r>`, 메시는 `hand_mesh_<l|r>`(이름이 겹치면 GLTFLoader가 뼈 이름을 바꿔 버린다). 로그의 `CUT_T`는 `realAssets.js`의 `CUT_T`와 같아야 한다. `PALM_DEPTH`(로그는 손바닥 피부까지 거리)는 손이 피부에 살짝 파묻히도록 그보다 작게 잡는다.

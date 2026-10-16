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

자세(2026-10-15 바꿈, 사용자: "치료자가 환자 얼굴이랑 너무 가까움… 뒤로 당긴다는 느낌이 잘 안살아남"): 침대 머리맡에서 진료용 스툴(좌석 위 y 0.663, 지름 36cm, 5발 받침·캐스터, Blender로 모델링한 `stool` 메시, 재질 `stool.seat`/`stool.black`/`stool.chrome`)에 앉아 몸통을 세우고 약 8도 뒤로 기댄다(`LEAN=-16`, 원래 척추가 앞으로 숙어 있어 잰 몸통선 기준 8.3도). 머리만 숙여 환자 얼굴을 본다(`EYES_DOWN=14`; 예전 코드는 부호가 반대라 머리가 70도쯤 숙었다). 다리는 앉은 자세 두 뼈 IK(`ANKLE_FWD`, `ANKLE_X`, `KNEE_OUT`). 두 어깨는 여전히 팔 IK 고정점 (±0.19, 1.22, -0.27)에 오차 0으로 맞춘다. 눈은 (0, 1.392, -0.145)로 환자 얼굴에서 0.39m(예전 42도 숙임은 0.21m). `ARM_DIR=(0.12, -0.68, 0.72)`. 마커 `mark_hip`(엉덩이 관절 중점, 당길 때 런타임이 이 축으로 뒤로 젖힌다)과 `mark_fall`(뒤쪽 캐스터 바퀴 뒤 끝 바닥점, 과하게 당기면 이 축으로 80도 넘어진다)을 더했다. 앉은 배·무릎이 테이블 머리 받침 상자와 겹쳐서 견인 모드에서는 받침을 숨긴다(`room.js` `headRest`). 넷째 인자로 폴더를 주면 미리보기 PNG를 그린다.

팔은 어깨부터 뺐다: 팔 뼈 가중치 0.5 이상인 피부와, 위팔 18% 지점 평면 너머(축에서 14cm 안)를 지운다. 티셔츠는 소매 패턴 조각(UV 섬)만 그 평면에서 잘라 소매 머리를 남기고 잘린 입구를 살짝 볼록한 뚜껑으로 막는다. `arms.glb` 소매가 위팔 12%에서 시작하니 6% 겹친다. 위팔은 턱 쪽(three.js 방향 (0.45, -0.72, 0.5))으로 돌린 채 잘라서 어깨 모양이 그 방향 기준이다. 숙이면 티셔츠 밑단이 청바지 허리띠(AO 맵에서 늘 셔츠 밑이라 까만 부분)에 파묻혀 뚫고 나오므로, 허리 근처의 청바지를 셔츠 안쪽 6mm로 당겨 넣고, 옷 AO는 0.55~1로 올려 쓴다.

GLB는 정적 메시(뼈 없음)이고 three.js 월드 좌표 그대로다: 회전·이동 없이 `scene.add`하면 치료사가 +z(환자 발 쪽)를 보고 선다. 빈 노드 `mark_shoulder_l`/`mark_shoulder_r`/`mark_eyes`/`mark_hip`/`mark_fall`이 잰 위치를 담고 있다. 재질 이름: `therapist.skin`(피부×AO 구움), `therapist.shirt`/`therapist.pants`(옷 AO×장면 AO 1024 맵 하나를 같이 씀, 색은 base color factor: 셔츠 `mats.coat` 0xf4f1ea, 바지 남색 0x2a3345 — 게임이 팔 소매처럼 색을 바꿀 수 있다), `therapist.shoes`, `therapist.short04`·`therapist.eyebrow001`·`therapist.eyelashes01`(알파), `therapist.eyes`. 약 2만 삼각형(스툴 1,420), 약 393KB.

## 수건

`blender -b --python towel_build.py -- towel_raw.glb 1024 [preview_dir]` (원본 에셋 없이 빈 씬에서 만든다. M 시리즈 CPU에서 미리보기 렌더까지 약 4분 반) 후
```
G="npx --yes @gltf-transform/cli@4.5.1"
$G webp towel_raw.glb a.glb --quality 85
$G meshopt a.glb ../../public/models/towel/towel.glb
```
흰 테리 목욕 수건을 길이로 세 겹 접은 띠(길이 0.95 m, 폭 평균 0.11 m, 천 두께 3 mm). 단면은 Z자라 긴 양옆에 눌린 접힌 자리와 위·아래 겹의 끝단이 층층이 보인다. 깁스처럼 보인다는 지적(2026-10-15)으로 규칙적인 곳을 없앴다: 폭이 길이를 따라 ±8% 달라지고, 가장자리가 물결치며, 접힌 자리는 살짝 납작하고 양쪽이 따로 움직이고, 겹 끝단이 몇 mm씩 들락거리며(접힌 자리를 넘기도 한다) 군데군데 겹이 살짝 벌어진다. 모든 변화는 주기 없는 값 노이즈와 무작위 위치에서 나온다. 지오메트리에 긴 휨·옆 휨·비틀림, 폭 방향 볼록/기울기, 띠를 비스듬히 가로지르는 부드러운 눌림 22개가 있다. 양 끝 15 cm는 접힘이 풀려 겹이 벌어지고 서로 어긋나며, 느슨한 골이 지고 모서리와 끝이 처지며 끝단이 고르지 않다(뻣뻣한 부채꼴 없음). 끝은 1 cm 헴. 노멀 맵: 테리 루프(3.2 mm 간격, 6 mm 덩어리로 눌리거나 선 결)와 굽은 잔주름 280개, 도비 띠(끝에서 6 cm, 폭 3 cm)·헴 박음질. 베이스 색은 #f4f1ea에 아주 옅은 따뜻한/차가운 얼룩, 루프 명암, 주름 골의 부드러운 그늘 × Cycles로 구운 AO(겹 사이·눌림이 그늘진다), 도비 띠만 살짝 회색. 줄무늬·노이즈 무늬는 넣지 않는다(이전 수건이 "징그럽다"는 지적). 삼각형 약 11.7k, 압축 후 약 350 KB. 재질 `towel.cloth`(거칠기 1, sheen). 미리보기 경로를 주면 펼친 모습, 끝 근접, 지름 13 cm 원통에 U자로 건 모습(옆·정면), 두 주먹에 쥐고 끝자락이 늘어진 모습(전체·근접)을 렌더한다.

뼈대 `towel_rig`(항등 변환) → `towel_root`(원점) → `towel_00`..`towel_24`가 모두 root의 직접 자식(사슬 아님). glTF에서 길이는 +X(`towel_00`이 x = −0.475, `towel_24`가 +0.475, 간격 0.0396 m), 폭은 Z, 두께는 Y(윗면 +Y). 모든 뼈의 쉼 회전은 항등이고 이동만 (x, 0, 0)이다. 정점 가중치는 길이 위치로 가까운 두 뼈를 선형 보간. 런타임은 뼈를 곡선 위에 놓고 뼈의 X축을 곡선 접선에 맞춰 돌린다.

## 수건 (천 시뮬레이션)

`public/models/towel/towel_sim.glb`: 환자 5명 각각의 목에 X자로 감긴 흰 테리 목욕 수건. 절차적으로 조각한 띠(`towel.glb`)가 "깁스 같다"는 지적(2026-10-15)을 받아, 실제 3D 수건 모델처럼 천 시뮬레이션 + 사진 기반 테리 텍스처로 다시 만들었다.

텍스처: Poly Haven "Terry Cloth"(CC0, https://polyhaven.com/a/terry_cloth, 사진 colormass, 처리 Rico Cilliers) 2k PNG 세 장을 한 폴더에 받는다.
```
for m in diff nor_gl ao; do curl -O https://dl.polyhaven.org/file/ph-assets/Textures/png/2k/terry_cloth/terry_cloth_${m}_2k.png; done
blender -b --python towel_sim.py -- towel_sim_raw.glb <텍스처 폴더> [미리보기 폴더] [patient01,patient04]
G="npx --yes @gltf-transform/cli@4.5.1"
$G webp towel_sim_raw.glb a.glb --quality 85
$G meshopt a.glb ../../public/models/towel/towel_sim.glb
```
(zsh는 `$G`를 나누지 않으니 bash에서 돌리거나 명령을 풀어 쓴다. 다섯 명 시뮬레이션은 M 시리즈 CPU에서 한 명당 약 25초, 미리보기 렌더(Cycles 48샘플, 환자 둘 × 3시점 × 2상태)까지 약 10분. 네 번째 인자로 환자를 고르면 그 환자만 GLB에 들어간다.)

만드는 법:
- 환자 머리·몸 GLB를 불러 `realAssets.js` `glbRoot(MODELS[id])`와 같은 변환으로 three.js `head` 그룹의 로컬 좌표(+y 얼굴, -z 정수리·치료사, +z 발, +x 치료사 왼손)에 놓는다. 그래서 GLB를 변환 없이 `head`의 자식으로 붙이면 맞는다(meshopt 양자화가 메시 노드마다 넣는 이동·배율은 그대로 둔다).
- 머리·목 피부에 광선을 쏴 턱 밑 경계와 목 둘레를 재고, 수건 길을 두 번 깐다. 가운데는 뒤통수 아래 목 뒤, 왼손으로 가는 끝은 목 오른쪽을 돌아 턱 밑에서 다른 끝 위로 X자로 겹친 뒤 왼쪽 턱선을 따라 왼손 주먹(`TOWEL_GRIP` (0.118, 0.03, 0.035))으로, 오른손 끝은 거울. 주먹 안 3.5 cm는 좁게 모여 고정되고 나머지 끝자락은 주먹 밖으로 늘어진다. 당긴 상태(taut)는 주먹이 `TOWEL_PULL` 0.06 m만큼 -z로 가고 고리가 뒤통수·턱 쪽으로 조여진다.
- Blender 천 시뮬레이션: 그 두 모양을 목표로 부드러운 목표 스프링(주먹은 단단히, 감긴 부분은 약하게, 끝자락은 없음)으로 걸고 중력·머리/목/셔츠 충돌·머리 받침·게임의 베개와 테이블 윗면 위에서 가라앉힌 뒤, 목표를 느슨함 → 당김으로 바꿔 다시 가라앉힌다. 처짐·접힘·끝자락이 늘어지는 모양은 시뮬레이션에서 나온다. Blender 천은 센티미터 크기에서 불안정해서 10배로 키워 돌리고, 자기 충돌은 이 크기에서 떨리기만 해서 끄고, 시뮬레이션 뒤 위 끝을 아래 끝 위로 들어 올려 겹을 정리하고 피부에서 띄운다.
- 두 상태 모두 같은 위상으로 두께 7 mm(테리 세 겹) 닫힌 띠로 만든다(위·아래 면, 둥근 접힌 가장자리, 막힌 끝). 메시 `towel_patient01`~`05`, 쉼 = 느슨함, 모프 타깃 `taut` 하나. 각 약 7k 삼각형, 루트 노드 `towel_sim`.
- 재질 `towel.cloth`: 사진 테리 텍스처의 밝기로 만든 미색(#f2efe8) 알베도 + 노멀 맵(1024, 실제 크기로 반복: 한 장 = 0.367 m), 거칠기 0.95, sheen. 끝에서 5.5~9 cm에 조금 회색인 도비 띠와 끝단 헴을 정점 색(COLOR_0)으로 넣었다.
- 로그: `LANDMARKS`(턱 밑 경계·목 둘레), `PATH`(목 뒤 → 주먹 길이와 남는 끝자락), `CLEAR`(피부까지 거리, 음수는 파묻힘), `END`(끝자락 끝 위치). 당긴 상태에서 주먹 옆 끝자락 몇 정점이 귀 근처에 파묻힌다(`INSIDE`, 주먹·손에 가려지는 자리).
- 수건 길이 1.30 m, 띠 폭 7 cm(목 앞·턱선에서는 모여 3.5 cm). 이 환자 모델들은 턱 밑에서 어깨까지 목이 4~6 cm라 더 넓은 띠는 목을 다 덮어 X가 안 보인다. 짧은 수건은 X로 감고 나면 주먹 밖으로 남는 끝이 없다.


## 척추 X-ray (`public/models/spine/cervical.glb`)

C1–T8 뼈, 디스크 C2/3–T7/8, 척수·신경근 관, C5–C7 골극(`Spur_C5..7`). 2026-10-15 다시 만들었다(사용자: "목뼈 척추뼈 둘다 나오게", "메탈 시계줄 이어져 있는것 같아"). 예전 빌드는 위치는 원본과 정확히 같았지만 BodyParts3D 4.0 obj_99(99% 축소, 뼈당 약 2k 삼각형)를 그대로 써서 거칠었다. 이제 뼈 모양은 3.0 obj_95(5배 촘촘)에서 가져와 4.0 뼈에 ICP로 맞춰(RMS 0.35–0.9mm) 4.0 해부 위치를 유지한다. C1–C7·경추 디스크 원점은 이동 0. 부위마다 빈 노드(4.0 bbox 중심) 아래 `<이름>_geo` 메시라 meshopt 양자화가 원점을 옮기지 않는다. AO·cavity를 Cycles로 구워 COLOR_0(RGB 같음)에 넣었다. 골극 원점은 그 척추 원점과 같아 런타임이 척추 그룹에 그대로 붙인다. 약 10만 삼각형, 642KB.

```bash
S=<작업 폴더>; B=/Applications/Blender.app/Contents/MacOS/Blender; cd scripts/assets
$B -b --factory-startup --python spine_build.py -- $S/src_obj $S/bp3d30_obj $S/build/bones.blend 5000 1500
$B -b $S/build/bones.blend --python spine_cord.py  -- $S/build/cord.blend
$B -b $S/build/cord.blend  --python spine_spurs.py -- $S/build/spurs.blend
$B -b $S/build/spurs.blend --python spine_bake.py  -- $S/build/baked.blend $S/build/raw.glb
npx --yes @gltf-transform/cli@4.5.1 meshopt $S/build/raw.glb ../../public/models/spine/cervical.glb
$B -b $S/build/baked.blend --python spine_preview.py -- $S spine   # 미리보기
```
`src_obj`는 4.0 FJ 파일, `bp3d30_obj`는 3.0 FMA 파일(필요한 28개만 HTTP range로 받음). 번호는 `spine_build.py` 머리말과 `CREDITS.md`.


## 수건 모드 전용 아트 세트 (`public/models/towel-stage/`)

2026-10-16: 사용자 "환자, 치료자, 침대, 수건, 공간 디자인 다 갈아 엎어" / "수건 모드만". 기존 MPFB CC0 사람 메시를 파생해 실사 피부와 의상을 새로 제작했다. 새 사람을 통째로 재생성하지 않아 목 절단선·뼈·표정·호흡·그립 호환성을 보존한다. 원본 `public/models/patient*`, `hands`, `therapist`, `towel`, `spine` 파일은 덮어쓰지 않는다.

- 박대리: 종이색 세로 조직 셔츠, 단추 앞단, 피곤한 눈 밑, 부드러운 옆가르마.
- 최교수: 회색 머리와 실물 테 안경, 낮은 대비 체크 직물/아이보리 앞판.
- 이라이더: 산호색 스포츠 패널, 진한 청록 어깨·소매, 흐트러진 머리.
- 정작가: 민트 저지, 짙은 목 바인딩, 산호색 머리핀, 기존 보브 헤어.
- 김사장: 흰 골프 폴로의 청록 가슴 띠·민트 가장자리, 기존 대머리·노년 체형.
- 치료사: 새 얼굴·윗머리 조형, 안경, 청록 스크럽의 실제 V넥/포켓/명찰/봉제, 일치하는 팔 소매·손 피부; 산호색 스툴·발걸이.
- 수건: 원래 사진 테리·천 시뮬레이션의 X자 감김과 `taut` 모프에 실제 봉제 가장자리를 더했다. 봉제도 같은 모프를 따른다.
- 공간/테이블: 테라조 타일·플루트 벽·리브 문·린넨장·트레이·펌프 병·라디에이터, 분할 가죽 쿠션·파이핑·레일·볼트·조절 레버. 벽과 부착 가구는 원래 넘어짐 궤적 밖으로 물렸다. 원래 테이블 지지면 y=.842m 유지.
- 척추: BodyParts3D GLB의 102,347 triangles는 그대로다. `xray.js`의 수건 전용 복제 재질에 피질골 미세 음영·섬유륜·관절면 가장자리만 더한다. 모드가 끝나면 원본 재질 객체를 복원한다.

### 재생성

기존 빌드 도구 glTF-Transform 4.5.1과 system `python3`의 numpy/Pillow가 필요하다. 런타임 npm 의존성은 추가하지 않는다. 이 실행 환경에서는 Blender 5.2.2가 Python 실행 전 Metal 장치 초기화에서 종료되므로, 압축 해제한 glTF 버퍼를 직접 가공했다. 아래 스크립트가 실제 사용한 재현 가능한 파이프라인이다.

`GLTF_MODULES`는 기존 glTF-Transform 도구의 `node_modules` 폴더, `G`는 같은 도구의 CLI 실행 파일 경로로 지정한다. 저장소 루트에서:

```bash
export GLTF_MODULES=/path/to/existing/gltf-toolchain/node_modules
G="$GLTF_MODULES/.bin/gltf-transform"
W=/private/tmp/ttuk-towel-stage
mkdir -p "$W" public/models/towel-stage/therapist public/models/towel-stage/towel
node scripts/assets/towel_stage_characters.mjs "$W/characters"

"$G" copy public/models/therapist/therapist.glb "$W/therapist-dec.glb"
"$G" copy public/models/towel/towel_sim.glb "$W/towel-dec.glb"
python3 scripts/assets/towel_stage_props.py therapist "$W/therapist-dec.glb" "$W/therapist-raw.glb"
python3 scripts/assets/towel_stage_props.py towel "$W/towel-dec.glb" "$W/towel-raw.glb"
"$G" weld "$W/therapist-raw.glb" "$W/therapist-weld.glb"
"$G" meshopt "$W/therapist-weld.glb" public/models/towel-stage/therapist/therapist.glb
"$G" weld "$W/towel-raw.glb" "$W/towel-weld.glb"
"$G" meshopt "$W/towel-weld.glb" public/models/towel-stage/towel/towel_sim.glb

node scripts/assets/towel_stage_room.mjs "$W/room-raw.glb"
"$G" weld "$W/room-raw.glb" "$W/room-weld.glb"
"$G" meshopt "$W/room-weld.glb" public/models/towel-stage/room.glb
python3 scripts/assets/towel_stage_metrics.py
```

`copy`는 meshopt를 해제한다. Python 판독기는 남아 있는 Int16 normalized 위치·인덱스와 노드 변환을 처리한다. 재압축 시 불필요한 버퍼를 제거한다. `towel_stage_characters.mjs`는 피부·직물을 `towel_stage_textures.py`로 만들고 직접 헤어/얼굴/안경/봉제 형상을 작성한 뒤 압축한다. 도구 경로를 가져오는 과정에서 새 npm 패키지를 프로젝트에 설치하지 않는다.

### 런타임 격리와 고정점

`realAssets.js`는 원본과 수건 전용 환자/팔 캐시를 분리한다. 수건 모드 진입 후에만 전용 모델을 로드하며, 실패하거나 늦게 들어오면 기존 에셋이 폴백한다. 환자 배치는 저장된 정지 자세 안에서 동기적으로 수행하고 현재 머리/피벗 자세를 복원하므로, 당기는 중 로드되어도 이음매 기준이 변하지 않는다. 새 팔은 준비될 때까지 숨겨 두어 모드를 떠난 뒤 늦게 로드돼도 T자 포즈가 나오지 않는다.

`room.js`는 원본 생성 순서를 바꾸지 않고 메시 참조만 내보낸다. `towelStage.js`는 전용 공간이 준비되면 원본 공간을 숨기고 조명/배경/안개를 저장·복원한다. geometry/material 생성은 동기 `withVisualIds` 범위로 격리한다. `src/game/loop.js`, 카메라, `drawTowel`, core/input/flow/state/roster/back 코드는 변경하지 않는다.

### 파일 크기·삼각형 수 (전 → 후)

파일 크기는 decimal KB, 삼각형 수는 GLB accessor 기준(수건은 환자 5개 메시 합계)이다. `towel_stage_metrics.py`로 다시 확인할 수 있다.

| 모델 | KB 전 → 후 | triangles 전 → 후 |
|---|---:|---:|
| `hands/arms.glb` | 495.4 → 527.8 | 9,130 → 9,130 |
| `patient01/body.glb` | 280.9 → 336.8 | 20,248 → 21,784 |
| `patient01/patient01.glb` | 630.3 → 641.6 | 22,216 → 22,216 |
| `patient02/body.glb` | 283.0 → 335.3 | 20,256 → 21,792 |
| `patient02/patient02.glb` | 624.0 → 630.8 | 20,798 → 23,048 |
| `patient03/body.glb` | 280.9 → 334.7 | 20,248 → 21,784 |
| `patient03/patient03.glb` | 585.5 → 590.5 | 19,922 → 19,922 |
| `patient04/body.glb` | 238.1 → 292.1 | 16,832 → 17,648 |
| `patient04/patient04.glb` | 659.4 → 676.8 | 27,510 → 27,600 |
| `patient05/body.glb` | 283.2 → 336.5 | 20,248 → 21,784 |
| `patient05/patient05.glb` | 567.2 → 561.6 | 18,896 → 18,896 |
| `room.glb` | GLB 없음 → 122.7 | 1,944 → 11,954 |
| `therapist/therapist.glb` | 393.1 → 433.9 | 21,847 → 24,343 |
| `towel/towel_sim.glb` | 893.4 → 972.2 | 34,860 → 43,500 |

환자·팔·치료사·수건 각 모델의 파일/삼각형 증가는 모두 30% 이하다. 공간/침대는 예외: 원래 49개 런타임 도형 1,944 triangles에서 11,954 triangles(+515%)로 늘었고, 새 파일 122.7KB다. 첫 제작본 44,514 triangles에서 줄였으며 7개 재질 메시(+표지판 1개)로 합쳐 드로콜은 기존 49개보다 줄었다. 실물 형태의 가구·문·하드웨어를 추가한 비용으로 보고한다. 박대리 한 명의 머리/몸·팔·치료사·해당 수건·공간을 합친 에셋 예산은 약 82,357 → 98,129 triangles(+19.2%)이며, 기존 공통 효과와 X-ray는 이 합계에서 제외했다. 실기기 iPhone의 최종 GPU/메모리 성능은 별도 확인 대상이다.

# 환자 머리 에셋 다시 만들기

환자 10명의 체형·피부·머리카락·눈썹·옷은 `patients.py`(`patient01`~`patient10`, `roster.js` 순서)에 있다. 한 명을 처음부터 끝까지 만들려면:

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

## 새 환자 다섯 명 (patient06–10, 2026-10-24)

| id | 이름 | 나이(MPFB age) | 체형 | 피부 / 머리 / 옷 |
|---|---|---|---|---|
| patient06 | 조멸치 | 28 (0.523) | muscle 0.3, weight 0.0 (아주 마름) | `young_asian_male` / `short01` / `male_casualsuit06` |
| patient07 | 한미모 | 26 (0.508) | muscle 0.45, weight 0.4, proportions 1.0, cupsize 0.7 | `young_asian_female` / `long01` / `female_casualsuit01` |
| patient08 | 마동철 | 38 (0.6) | muscle 1.0, weight 1.0 (레슬러) | `middleage_asian_male` / `short04` / `male_casualsuit06` |
| patient09 | 복순할매 | 79 (0.915) | muscle 0.3, weight 0.6 | `middleage_asian_female` / `short02`(회색 파마) / `female_casualsuit02` |
| patient10 | 정꼬마 | 11 (0.1875) | 기본 | `young_asian_male` / `short01` / `male_casualsuit04` |

명령은 위와 같다(`mpfb_build_character.py` → `mpfb_export_head.py ... 2048 32` → `mpfb_export_body.py ... 1024 16 patientNN`). 16GB 맥에서 머리 내보내기를 다섯 개 동시에 돌리면 메모리 부족으로 조용히 죽는다. 두 개씩 돌린다(한 쌍에 약 10분). 최적화는 위 5단계와 같고 패턴만 바꾼다: 머리카락 `short01*`/`long01*`/`short04*`/`short02*`, 회색 머리는 `patientNN_hair*`, 회색 눈썹 `patientNN_brow*`.

- `patients.py` `human_info()`의 `proportions`·`height`·`cupsize`는 프리셋에 있으면 그 값을, 없으면 0.5를 쓴다(patient07만 proportions 1.0·cupsize 0.7).
- 머리카락 고르기(2026-10-24 검토): 바로 누운 게임 카메라에서 한미모의 `ponytail01`은 베개 속으로 들어가 정수리만 보여 남자처럼 읽혔다. `long01`·`braid01`·`bob01`을 정면과 게임 카메라로 비교해(`opts` 미리보기) 얼굴 양옆으로 머리가 흘러내리는 `long01`을 골랐다(`braid01`·`bob01`은 옆 앞머리가 한쪽 눈을 덮는다). 마동철의 `short03`은 한쪽 눈을 덮는 분홍빛 바가지 머리라 짧고 짙은 `short04`로, 할머니의 `bob02`(한쪽 눈을 덮음, `bob01`도 같음)는 회색으로 칠한 `short02`(짧은 파마처럼 보임)로 바꿨다. 한미모의 수건 얼굴은 볼 홍조를 0.06으로 올리고 입술(정수리 아래 0.1607 m)에 장밋빛을 30% 섞는다(`towel_stage_textures.py`).
- `fit`: 내보내기 스크립트의 절대 길이(목 절단 `top-0.30`, 승모근 절단 `top-0.225`·`|x|>0.072`, 입안 어둡게, `MEASURE`의 턱 조건, 손목 위치 `X_HAND`·`GAP`, 셔츠 앞면 탐색 거리, 목 뼈 페이드 `NECK_FADE`, 호흡 모양 키 범위)에 곱하는 배율. 기본 1.0이라 patient01–05 출력은 그대로다(1.0을 곱해도 부동소수점 값이 같다). `fit="auto"`면 정수리 − 턱끝(MakeHuman 기본 메시 정점 783) 높이를 patient01의 0.2266m로 나눈다. 아이(patient10)만 auto이고 0.8534다. `T_HAND`는 골반→쇄골 비율이고 `Z_PELVIS` 등은 뼈에서 재므로 원래 체형을 따른다.
- `tuck`(m): 근육·살이 많은 체형은 피부가 티셔츠 어깨·승모근을 뚫고 나온다. 몸 스크립트가 셔츠 안쪽 면(밑단·목둘레·소매 끝 면 제외)에서 3cm 안, 같은 방향을 보는 피부 정점을 셔츠 안 3mm로 당겨 넣는다. patient07(49정점)·08(37)·09(106)만 켰다.
- 옷 타협: `female_elegantsuit01`(블라우스+치마)과 `male_casualsuit01`·`02`(긴소매)는 소매가 손목을 덮어 배 위 손 풀이가 수렴하지 않는다(`HANDS NOT SOLVED`, 손이 몸 앞 40cm까지 밀려남). 그래서 patient07은 `female_casualsuit01`, patient10은 `male_casualsuit04` 티셔츠를 입었다. 할머니는 `female_casualsuit02`(티셔츠+반바지) 그대로다.
- 할머니 피부: `old_asian_female`은 주름이 더 있지만 김사장 때와 같이 주황빛이 돌아 `middleage_asian_female`을 쓴다.

로그(모두 머리 `TOP` = 몸 `TOP`):

| id | TOP | CUT | FIT | MEASURE crown / chin / back | HANDS |
|---|---:|---:|---:|---|---|
| patient06 | 1.6273 | 1.3273 | 1.0 | 1.6273 / 1.3909 / -0.0612 | solved it 2 |
| patient07 | 1.5043 | 1.2043 | 1.0 | 1.5043 / 1.2129 / -0.0539 | solved it 2 (cupsize 0.7) |
| patient08 | 1.6227 | 1.3227 | 1.0 | 1.6227 / 1.3231 / -0.1139 | solved it 4 |
| patient09 | 1.4897 | 1.1897 | 1.0 | 1.4897 / 1.1960 / -0.0375 | solved it 3 |
| patient10 | 1.3196 | 1.0636 | 0.8534 | 1.3196 / 1.0637 / -0.0471 | solved it 4 |

`realAssets.js` `MODELS`(와 `towel_sim.py` 사본)에는 MEASURE 값을 그대로 적되, patient06·08의 chin만 1.3669·1.3551로 바꿨다. 게임은 crown−chin으로 머리(와 몸)를 기본 도형 머리 크기에 맞추는데, 이 측정의 "턱"은 가운데 선에서 y −0.07 앞의 가장 낮은 점이라 아주 가는 목(06)은 턱 밑면, 아주 굵은 목(08)은 목 앞 살에 걸려 06은 17% 커지고 08은 8% 작아진다. 두 사람은 patient01 비율(crown−chin 0.267 = 턱끝 높이 0.2266 × 1.178)로 정했다. 아이는 측정값 그대로라 1.08배(키 약 1.42m)로 그려진다. 마동철의 `back`(−0.114)은 굵은 목덜미가 뒤통수보다 뒤로 나와서다.

파일 크기(바이트):

| id | 머리 | 몸 | 수건 머리 | 수건 몸 |
|---|---:|---:|---:|---:|
| patient06 | 658,488 | 281,700 | 695,908 | 463,244 |
| patient07 | 615,856 | 238,024 | 650,012 | 406,008 |
| patient08 | 632,056 | 286,952 | 732,932 | 464,072 |
| patient09 | 624,524 | 254,912 | 756,748 | 448,196 |
| patient10 | 662,112 | 233,204 | 705,664 | 404,064 |

수건(`towel_sim.py`)은 열 명을 한 번에 다시 굽는다. 시뮬레이션은 결정적이라 patient01–05 메시는 이전 GLB와 정점 위치 차이 0이다(meshopt 해제 후 비교). 미리보기 대상은 `TOWEL_PREVIEW_IDS=patient06,...`로 고른다. 아이는 입술 단차가 턱보다 가팔라 턱 밑 경계 탐색이 입(z 0.030)에 걸려 X가 입을 가로질렀다. `CHIN_EDGE = {"patient10": 0.074}`로 고정했다. 마동철은 목이 굵어 X로 감고 나면 주먹 밖 끝자락이 없다(`PATH` loose ends −0.06/−0.01 m, 주먹 속에서 끝남). 결과: `towel/towel_sim.glb` 893,380 → 1,261,816 B, `towel-stage/towel/towel_sim.glb` 1,099,104 → 1,665,080 B(87,000 삼각형). 수건 사본은 위 재생성 절의 `towel_stage_props.py towel` → weld → meshopt 뒤 `DETAIL_FILES=towel_sim node scripts/assets/towel_therapist_detail.mjs <새 작업 폴더>`로 거칠기 맵만 다시 얹는다(`DETAIL_FILES` 없이 돌리면 이미 디테일이 들어간 팔·치료사·공간까지 한 번 더 조형하니 주의).

수건 모드 사본(`towel-stage/patientNN/`)은 아래 "수건 모드 전용 아트 세트"부터의 체인을 새 환자만 골라 돌린다. 기존 patient01–05 파일은 다시 만들지 않았다. 각 단계의 작업 폴더 `source/`에 첫 입력이 남으므로 다시 돌릴 때는 그 환자의 `source/.../patientNN`을 지운다.

```bash
export GLTF_MODULES=/path/to/gltf-transform-4.5.1/node_modules
W=/private/tmp/ttuk-new-patients; IDS=06,07,08,09,10
ASSET_IDS=patient06,patient07,patient08,patient09,patient10 node scripts/assets/towel_stage_characters.mjs $W/chars
git show 024a09850ef23f13651876f7da03fc7f6541edde:public/models/hands/arms.glb > $W/hand-template.glb   # 조형 전 CC0 팔
ASSET_IDS=$IDS HAND_TEMPLATE=$W/hand-template.glb node scripts/assets/hand_anatomy.mjs $W/anat           # 팔 GLB 둘은 건드리지 않음
ASSET_IDS=$IDS HAND_SOURCE=$W/hand-template.glb node scripts/assets/patient_rest_hands.mjs $W/rest
python3 scripts/assets/patient_hand_collision.py $W/rest
ASSET_IDS=$IDS node scripts/assets/patient_detail.mjs $W/detail
ASSET_IDS=$IDS VERIFY_ONLY=1 node scripts/assets/patient_detail.mjs $W/detail
python3 scripts/assets/patient_hand_collision.py $W/detail
```

결과: 다섯 명 × 호흡 0/0.5/1 × 세 표면 쌍 삼각형 교차 0, 최종 수직 여유 최솟값 손/손 1.63 mm(09), 아래 손/셔츠 1.40 mm(08), VERIFY_ONLY 원본 버퍼 변경 0. 두 자리 번호를 위해 바꾼 곳: `towel_stage_textures.py`(`int(pid[-2:])`, 셔츠 색 10개, 06 브르타뉴 줄무늬·07 블러시 저지와 핀턱·08 싱글렛 옆판·09 물방울 블라우스·10 럭비 줄무늬를 부드러운 경계로, 회색 머리 은빛 처리 02·09, 주름 02·05·09), `towel_stage_characters.mjs`(`pid.slice(-2)`, 머리카락 이름에 ponytail/long/braid/afro), `hand_anatomy.mjs`(`ASSET_IDS`·`HAND_TEMPLATE`), `patient_hand_collision.py`(`patient[0-9][0-9]*`), `patient_detail_maps.py`(나이 06:28·07:26·08:38·09:79·10:11, 수염은 남자 어른 06·08만, 젊은 얼굴 노멀 512), `patient_detail.mjs`(봉제 가장자리 색).

## 이미지 기반 환자 (patient11 최필라, 2026-10-24)

MPFB가 아니라 이미지에서 만든 몸이다(사용자: "체형별로 특이성이 존나 있어야돼" → 시안을 3D로 "백프로 동일하게"). 목꺾기 전용이고 towel-stage 사본은 없다(`realAssets.js` `NO_STAGE`).

1. Codex(이미지 생성)로 같은 캐릭터 4방향 턴어라운드(정면·왼쪽·뒤·오른쪽, A포즈, 1024x1536)를 그린다. 시안 한 장만 3D로 바꾸면 뒤통수·옆모습을 추측한다.
2. Higgsfield `tripo_h3_1_multiview_to_3d`(texture/geometry detailed, 12크레딧) → 62 MB, 삼각형 195만 개.
3. 줄이기: `gltf-transform simplify --ratio 0.045 --error 0.002` → `resize 2048`. Blender Decimate는 UV 이음매를 뭉개 흰 선이 생기고(텍스처 패딩으로도 안 없어짐), Meshy remesh는 62 MB 입력에서 실패했다.
4. `blender -b -t 4 --python image3d_patient.py -- s2.glb patient11.glb body.glb patient11`: 1.65 m로 맞추고, 얼굴을 -y로 돌리고(이 메시는 +x를 봤다), 뒤로 3.8° 기운 몸을 세운 뒤, z 1.40(목 중간)에서 bisect로 머리와 몸을 나눈다. 몸에는 2본 스킨(`body`/`neck`, 가중치는 게임의 `neckColumn`이 다시 계산)과 `breath` 모양 키(가슴 2.2 cm·배 1.2 cm 앞으로, 어깨 2 cm)를 단다. 출력의 MEASURE는 crown·chin tip·back.
5. 머리 `resize 2048` → `webp` → `meshopt`(550 KB), 몸 `resize 1024` → `webp` → `meshopt`(640 KB).

`MODELS.patient11`: crown은 머리카락 꼭대기(1.6484), chin은 06/08처럼 patient01 비율(crown − 1.178 × (crown − 턱끝 1.427) = 1.3876), back은 머리카락 뒤(-0.083)가 아니라 -0.045다. 머리카락 부피만큼 머리가 베개 위로 떠서 몸 전체가 테이블 위 4 cm에 떠 있었다.

표정(사용자: "표정이 시체 같음", 2026-10-24): 머리 메시에 블렌드셰이프가 없고 눈은 뜬 채로 텍스처에 그려져 있다. 그래서 얼굴 정면을 그린 그림을 겹친다.
1. `blender -b -t 4 -P image3d_face.py -- out/patient11.glb front.png`: 조명 없는 정사영 정면(GLB x 0, y 1.51 중심, 0.22 m 정사각형, `MODELS.patient11.face`)을 찍는다.
2. Codex가 같은 캔버스에 눈썹·눈·입만 바꾼 `expr_closed`(편히 감음), `expr_squeeze`(아파서 질끈), `expr_smile`(감고 미소), `expr_open`(놀라서 크게 뜸, "오" 입)을 그린다.
3. `python3 image3d_expr.py <폴더> public/models/patient11`: 원본과 달라진 부분만 남긴 마스크(가장자리 페더)로 512 px RGBA webp를 만든다.

게임(`realAssets.js` `faceDecals`)은 피부 메시에서 그 정사각형 안의 앞을 보는 삼각형을 복사하고, 같은 투영으로 UV를 준다. 이를 눈 쪽과 입 쪽으로 나눠 표정 가중치(`faceRig.js` `decalWeights`)만큼 페이드한다. 깜빡임도 같은 경로로 처리된다.

손: 머리카락이 피부와 한 메시라서, 손 자세 측정이 귀 대신 12 cm 바깥의 머리카락을 잡아 손이 벌어지고 손목이 꺾였다. `MODELS.patient11.ear`는 피부색 정점에서 찾은 진짜 귀다. 목꺾기 손 자세는 patient07(같은 관리형 체형)의 값을 귀 기준으로 옮겨 쓰고(`borrowedPoses`), 손가락 접촉 보정이 머리카락 표면까지 손을 밀어낸다.

한계: 표정이 그림 4장 사이의 페이드라서 중간 표정은 겹쳐 보일 수 있다. 목 아래로 늘어진 머리카락은 몸 쪽에 남아 목을 돌리면 끊겨 보인다. 팔은 A포즈 그대로다(Meshy 자동 리깅은 팔 뼈가 엉덩이에 붙어 팔을 돌리면 골반이 찌그러졌다).

## 이미지 기반 환자 2: 마동철 (patient12, 2026-10-24)

사용자: "마동철도 만들어보자. 코덱스한테 시안 가져오라해. 앞뒤좌우 3d 모델에 필요한 시안들 말이야." 최필라와 같은 절차를 따른다. 기준 시안은 체형 다양화 때 만든 마동철 정면이고, 4방향을 Tripo에 넣었다. 목꺾기에서 마동철 본인만 이 몸을 쓴다(`look.clinicModel`). 목뽑기와, 이 체형을 빌린 손님 근육왕·메가회장은 MPFB patient08을 그대로 쓴다. 손님은 `CAST_LOOK`이 MPFB의 머리카락·셔츠 재질을 칠하기 때문이다.

목이 승모근에 묻혀 있어서 평면으로 자르면 안 된다. 1.40에서 자르면 머리 쪽에 승모근이 딸려 와서, 목을 돌리면 같이 휘두르고 가슴까지 늘어진다. 그래서 이렇게 한다.

```
blender -b -t 4 --python image3d_patient.py -- s2.glb patient12.glb body.glb patient12 1.65 1.45 0.12 0.14
```

- 1.45(턱선)에서 평면으로 자른다.
- 그 위로는 세운 타원 벽(가로 0.12, 앞뒤 0.14, 수직 평면 32장, CUT+0.05까지) 안쪽만 머리가 된다. 턱 옆 승모근은 몸에 남는다.
- 면을 통째로 나누기 때문에 두 조각의 테두리가 정확히 맞는다. 면 중심만 보고 나누면 큰 삼각형 때문에 테두리가 타원 밖 2배까지 들쭉날쭉해지고, 목을 돌릴 때 구멍이 생겨 베개가 보였다.

게임 쪽 `MODELS.patient12.seam`(`{y: 1.45, rx: 0.12, rz: 0.14, len: 0.06}`)은 같은 자름을 가리킨다.
- `neckColumn`은 몸의 꼭대기(승모근)가 아니라 이 자름을 기준으로 가중치를 준다. 타원 벽은 가중치 1이고, 비틀림은 턱 아래 6 cm 안에서 끝난다.
- meshopt 양자화된 위치는 `body` 뼈 역바인드로 미터로 되돌린다(뼈 머리 y 0.95).

치수와 표정:
- crown 1.6466, chin 1.4150(patient01 비율, 턱끝 1.45), back -0.13(뒤통수)
- 표정 사각형 `image3d_face.py -- head.glb front.png 0 1.54 0.24`, split 0.31(코와 입 사이)
- 머리 360 KB, 몸 720 KB, 표정 webp 4장 약 65 KB

## 이미지 기반 환자 3: 복순할매 (patient13, 2026-10-24)

사용자: "이제 할머니도 해보자." 마동철과 같은 절차다. 기준 시안은 체형 다양화 때 만든 복순할매 정면이고, 입은 다물고 눈은 자연스럽게 뜨게 다시 그렸다(표정은 그림으로 덧입힌다). 목꺾기에서 복순할매 본인만 이 몸을 쓴다(`look.clinicModel`). 목뽑기와 이 체형을 빌린 손님 강해녀·사모님은 MPFB patient09 그대로다.

등이 굽어 얼굴이 목보다 한참 앞에 있고 턱이 가슴에 거의 닿는다. 그래서 이렇게 한다.

```
blender -b -t 4 --python image3d_patient.py -- s2.glb patient13.glb body.glb patient13 1.49 1.21 0.10 0.12 -0.03
```

- 1.21(턱 밑)에서 평면으로 자른다. 키가 작아 목 뼈 시작은 CUT − 0.10이다(전에는 1.30 고정).
- 타원 벽(가로 0.10, 앞뒤 0.12)을 얼굴 쪽으로 3 cm 옮긴다(9번째 인자 `cy`, Blender y). 가운데에 두면 턱과 입이 몸 쪽으로 잘려 나갔다.
- 게임 쪽 `MODELS.patient13.seam`(`{y: 1.21, rx: 0.10, rz: 0.12, cz: 0.03, len: 0.05}`)의 `cz`가 같은 이동이다(GLB z, 얼굴 쪽 +).

치수와 표정:
- crown 1.4910, chin 1.1600(patient01 비율, 턱끝 1.21), back -0.20(굽은 윗등이 테이블에 닿는다. 뒤통수는 -0.16)
- 표정 사각형 `image3d_face.py -- head.glb front.png 0 1.31 0.22`, split 0.28(코와 입 사이)
- 표정 그림은 1024 px(`image3d_expr.py` `SIZE`, 2026-10-24 512에서 올림). 게임은 노멀 방향이 아니라 앞 표면 깊이로 면을 고른다(`realAssets.js` `FRONT_DEPTH`): 눈두덩 면이 빠지면 뜬 눈이 비쳤다.
- 뽀글이 머리·꽃무늬 때문에 텍스처가 무겁다. 노멀·ORM 1024(몸 512), webp 72로 머리 약 900 KB, 몸 약 700 KB

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

`public/models/towel/towel_sim.glb`: 환자 10명 각각의 목에 X자로 감긴 흰 테리 목욕 수건. 절차적으로 조각한 띠(`towel.glb`)가 "깁스 같다"는 지적(2026-10-15)을 받아, 실제 3D 수건 모델처럼 천 시뮬레이션 + 사진 기반 테리 텍스처로 다시 만들었다.

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
- 두 상태 모두 같은 위상으로 두께 7 mm(테리 세 겹) 닫힌 띠로 만든다(위·아래 면, 둥근 접힌 가장자리, 막힌 끝). 메시 `towel_patient01`~`10`, 쉼 = 느슨함, 모프 타깃 `taut` 하나. 각 약 7k 삼각형, 루트 노드 `towel_sim`.
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

## 손–손목–전완 해부 형태 보정 (2026-10-16)

사용자: "고질적인 이슈. 손부터 손목 팔까지 이어지는 부분이 너무 어색해. 좆같아 진짜. 다시 그려."

`hand_anatomy.mjs`는 기존 MakeHuman CC0 피부의 UV·텍스처·손가락 뼈·소매를 보존하면서, 치료사 양팔의 전완 근복과 손목 방향 테이퍼, 납작한 손목 타원 단면, 요골/척골 끝의 작은 돌출, 손등의 중수골/힘줄과 손가락 관절을 직접 조형한다. 환자는 수건 전용 `patient01`–`05/body.glb`의 손·손목·전완에만 적용한다. 정지 포즈로 구워진 환자 손과 치료사 손의 같은 1,817정점 위상을 5회 이웃 시그니처로 대응시켜 실제 손가락 뼈 위치를 환자의 중수골 머리와 손가락 관절로 옮긴다. 손목 UV 절단선의 중복 정점은 같은 위치장으로 변형하고 각도 가중 법선을 공유하여 피부 이음매를 줄인다. 피부의 색·UV·소매 단 형상은 바꾸지 않는다.

이번 작업은 진료 모드의 `public/models/hands/arms.glb`에도 적용한다. 위 수건 전용 아트 세트의 "원본 hands를 덮어쓰지 않는다"는 설명에서 이 손·팔 보정만 예외이며, 진료 모드 환자·공간과 등 모드 에셋은 그대로다. 치료사 손목 굴곡 제한·전완 비틀림 보조 뼈/가중치의 런타임 분배는 `realAssets.js`가 담당한다. GLB의 원래 뼈·가중치·그립 원점은 유지한다.

재생성(저장소 루트):

```bash
export GLTF_MODULES=/path/to/existing/gltf-toolchain/node_modules
node scripts/assets/hand_anatomy.mjs /private/tmp/ttuk-hand-anatomy
```

첫 실행에 작업 폴더 `source/public/models/...`로 입력 GLB를 저장한다. 반복 실행은 항상 이 원본에서 시작하여 조형이 누적되지 않는다. 배포 원본에서 재생성할 때는 **이 보정 이전** GLB를 `source` 아래에 넣거나 깨끗한 이전 리비전에서 처음 실행한다. `metrics.json`에 파일별 바이트·삼각형·수정 정점 수와 최대 변위를 기록한다. 새 패키지 설치나 Blender 실행 없이 기존 glTF-Transform 4.5.1/meshoptimizer 도구를 사용한다.

| 파일 | bytes 전 → 후 | triangles 전 → 후 |
|---|---:|---:|
| `hands/arms.glb` (진료) | 495,396 → 516,652 | 9,130 → 9,130 |
| `towel-stage/hands/arms.glb` | 527,832 → 528,160 | 9,130 → 9,130 |
| `towel-stage/patient01/body.glb` | 336,772 → 338,304 | 21,784 → 21,784 |
| `towel-stage/patient02/body.glb` | 335,268 → 336,868 | 21,792 → 21,792 |
| `towel-stage/patient03/body.glb` | 334,668 → 335,844 | 21,784 → 21,784 |
| `towel-stage/patient04/body.glb` | 292,076 → 293,668 | 17,648 → 17,648 |
| `towel-stage/patient05/body.glb` | 336,536 → 338,000 | 21,784 → 21,784 |

삼각형 증가는 없고, 가장 큰 크기 증가는 진료 팔의 4.29%다. 환자 몸의 목 위쪽 10 cm(68–167정점)를 원본과 대조했을 때 위치·스킨 가중치·호흡 모프의 최대 차이는 모두 정확히 0이다. 목 피부 이음매·목 늘어남은 이 조형의 수정 대상이 아니다.

### 수건 환자의 편안한 손 포즈와 단순한 피부 면 (2차 수정)

`patient_rest_hands.mjs`와 `patient_hand_atlas.py`는 위 손 조형 다음에 실행한다. 수건 환자 다섯 명의 구워진 손 포즈를 다시 만들며 진료 환자·등 모드 에셋은 수정하지 않는다. 같은 CC0 MPFB 손의 왼손/오른손을 각각 대응시키고, 8회 이웃 시그니처 뒤 이미 대응한 변의 이웃을 추적하여 손마다 1,817정점 중 1,816–1,817개를 대응시킨다. 손가락은 벌어짐을 줄이고 누적 3°/9°/16°로 완만하게 굽힌다. 엄지는 3°/8°/13°다. 두 손은 배 위에 느슨하게 포개며 아래 손은 약간 돌아간 받침 자세를 유지한다. 양손을 완전히 손바닥 아래로 뒤집은 포즈라고 주장하지 않는다.

전완의 중심선을 유지하는 작은 회전과 손목의 중복 정점 공유, 팔 전체의 각도 가중 법선으로 손목 연결을 보존한다. 피부 사진에 남아 있던 손바닥 주름·손 그림자는 손 UV 영역에서만 조용한 피부 색으로 정리한다. 실제 중수골 머리와 PIP/DIP 위치의 1–1.8 mm 조형, 말단 손가락 뼈 `*_03`의 피부 가중치와 위쪽 표면에 놓은 얕은 손톱 영역이 형태를 설명한다. 기존 팔/손 색의 경계는 32 mm에 걸쳐 섞는다. 외부 사진·해부학 모델을 추가하지 않았다.

아래 손/셔츠, 위 손/아래 손의 실제 삼각형 표면을 이용하여 정지 자세에서 2.2 mm의 여유를 둔다. 손과 손목 가까운 전완만 옮기고 원래의 배 방향 호흡 이동량은 그대로 둔다. 목·상체 위치, 2본 스킨 가중치, 호흡 모프는 변경하지 않는다. `patient_hand_collision.py`는 생성된 월드 좌표와 실제 호흡 델타로 호흡 0/0.5/1에서 손/손·각 손/셔츠의 삼각형 교차와 표면 수직 여유를 검사한다. 가장 가까운 정점 간 거리는 별도 참고값이며 실제 표면 간 최단거리라고 표현하지 않는다.

재생성은 이 포즈 수정 **이전** 환자 몸 GLB(위 `hand_anatomy.mjs` 실행 결과)에서 시작한다. 첫 실행은 작업 폴더 `source/public/models/towel-stage/...`에 입력을 보관하며 반복 실행은 그 입력을 사용한다. 최종 GLB에 다시 조형을 누적하지 않는다. 기본 손 템플릿은 저장소의 `public/models/hands/arms.glb`이며 `HAND_SOURCE`로 명시적으로 교체할 수 있다. 이번 결과의 정확한 템플릿은 아래 리비전의 기존 CC0 팔이다. SHA-256은 `ed2cbd78355486248a8289571ed9123603ef2f39552dbd9c6dcec99c10a725c1`이다. 스크래치패드의 암묵적 파일 경로에 의존하지 않는다.

```bash
export GLTF_MODULES=/path/to/existing/gltf-toolchain/node_modules
export REST_WORK=/private/tmp/ttuk-patient-rest-hands
mkdir -p "$REST_WORK"
git show 024a09850ef23f13651876f7da03fc7f6541edde:public/models/hands/arms.glb > "$REST_WORK/hand-template.glb"
HAND_SOURCE="$REST_WORK/hand-template.glb" node scripts/assets/patient_rest_hands.mjs "$REST_WORK"
python3 scripts/assets/patient_hand_collision.py "$REST_WORK"
```

기존 glTF-Transform/meshoptimizer와 기존 에셋용 Python(numpy/Pillow)을 쓴다. 새 npm 의존성은 없다. `ASSET_PYTHON`으로 해당 Python을 지정할 수 있고 `ASSET_IDS=01,04`로 환자를 선택할 수 있다. `patient-rest-metrics.json`, 환자별 `*-collision.json`, `patient-collision-report.json`이 검증 자료다.

| 수건 환자 몸 | 1차 손 수정 → 2차 bytes | triangles |
|---|---:|---:|
| patient01 | 338,304 → 350,032 | 21,784 유지 |
| patient02 | 336,868 → 348,928 | 21,792 유지 |
| patient03 | 335,844 → 347,256 | 21,784 유지 |
| patient04 | 293,668 → 303,544 | 17,648 유지 |
| patient05 | 338,000 → 349,280 | 21,784 유지 |

환자 몸 합계는 1,642,684 → 1,699,040 bytes(+3.43%), 104,792 triangles 유지다. 치료사 팔 두 파일을 포함한 최초 손 수정 전 → 최종 합계는 2,658,548 → 2,743,852 bytes(+3.21%), 123,052 triangles 유지다. 30%를 넘는 증가는 없다.

최종 다섯 환자 × 호흡 0/0.5/1 × 세 표면 쌍의 45개 검사에서 삼각형 교차는 모두 0이다. 수직 표면 여유의 최솟값은 손/손 1.5081 mm, 아래 손/셔츠 1.7272 mm이며 정지 자세에서는 각각 2.2000 mm다. 재압축한 GLB를 다시 읽어 UV로 대응한 목·상체 132–182정점의 스킨 가중치와 호흡 모프 차이는 정확히 0이다. 해당 위치의 최대 차이는 meshopt 위치 재양자화에서 생긴 0.04804 mm이며, 의도적으로 목·상체 정점을 옮기지 않았다. 실제 목 이음매 1 mm·승모근 변형 0 조건은 별도 런타임 목 프로브로 확인한다.


### 수건 캐릭터의 자세·재질·조명 (2차 수정)

치료사의 수건 그립은 MCP/PIP/DIP 세 관절을 모두 굽히는 주먹이며 엄지가 접힌 손가락 위로 대립한다. `TOWEL_GRIP`, `TOWEL_PULL`, `towelGrips()` 접점은 유지한다. 수건의 팔꿈치 비용은 아래·옆구리 방향을 먼저 정하고 손바닥 프레임과 전완 롤이 손목 각도를 맞춘다. 팔꿈치를 들어 손목을 펴는 보상은 사용하지 않는다. 넘어질 때 기존 수건 놓기와 어깨/엉덩이/넘어짐 마커를 따른다.

소유자 정정: "단색의 옷을 입히는게 중요한게 아니야. 디테일을 보라고 디테일을". `scene/towelCharacterLook.js`는 수건 전용 복제 재질에서 원본 색·노멀·AO·거칠기 맵을 보존한다. 텍스처 흐림과 단색화는 적용하지 않는다. 형태에 맞춘 주름·봉제·직물·피부 결을 읽게 하며 원래의 얼굴·의상 정체성은 남긴다. 치료사 정적 셔츠의 잘린 소매를 막던 UV 퇴화 캡 71삼각형만 런타임에서 빼고, 실제 움직이는 소매와 중복되는 어깨 검은 쐐기를 제거한다. 원본 GLB의 위치·마커·파일 크기는 바뀌지 않는다. 정상적인 굽힘 주름은 유지하며 UV 중복 정점의 법선과 피부 가중치를 맞춘다.

`towelStage.js`는 기존 그림자 주광 1개와 필 3개를 그대로 쓰며, 주광 1.24 / 반구 0.43 / 앞 필 0.19 / 민트 림 0.16으로 조정한다. 새 조명·렌더 패스·런타임 의존성을 추가하지 않는다. 진료 모드로 돌아가면 기존 조명·재질을 복원한다. 새 geometry/material/texture UUID는 `withVisualIds` 안에서 생성하여 판정용 난수 시퀀스에 영향을 주지 않는다. 카메라, 머리/몸 이동량과 목 기둥 변형, 수건 천 모프, 과당김 넘어짐 시간과 이동량은 수정하지 않았다.


### 옷의 구조와 필요한 곳의 디테일 (소유자 정정 후)

소유자: "단색의 옷을 입히는게 중요한게 아니야. 디테일을 보라고 디테일을". Half Sword의 참고 캡처는 시각 검토에만 사용한다. 게임 텍스처를 그 캡처에서 추출하지 않는다. 원래 팔레트와 의상 아이디어를 유지하면서 주름의 위치·옷의 두께·봉제·피부 구조를 보강한다.

`towel_therapist_detail.mjs`와 `towel_surface_detail.py`는 기존 수건 전용 팔·치료사·공간·수건 GLB의 보관 입력에서 재생성한다. 치료사 소매는 팔꿈치를 덮고 전완 중간에서 끝나는 여유 있는 옷으로, 실제 안쪽 면과 접힌 커프가 있다. 같은 위팔/전완 뼈와 전완 롤을 사용하며 피부·손가락·그립 원점은 조형하지 않는다. 팔꿈치의 불규칙한 압축 주름, 허리·겨드랑이 당김 주름, 봉제·상침·직물 결, 손등 힘줄·얕은 관절 주름·붉은 관절, 얼굴 결을 UV의 실제 물리 크기로 굽는다. 실루엣에는 옷 형상, 작은 요철에는 tangent-space normal을 쓴다.

주요 옷/피부 color·normal은 1024, 작은 커프 color·normal은 512, 커프 ORM은 256, 나머지 ORM은 512다. ORM은 R=AO/G=roughness/B=metalness이며 기존 WEBP와 meshopt를 쓴다. 공간 파일에서는 `suite.leather`에만 면 방향 UV와 가죽 결·거칠기·미세한 마모를 더한다. 테이블 높이·형상·파이핑과 다른 방 물체는 유지한다. 수건은 기존 Poly Haven 테리 사진·노멀, X자 감김·주먹 압축·`taut` 모프와 봉제 가장자리를 보존하고 거칠기 변화만 더한다.

```bash
export GLTF_MODULES=/path/to/existing/gltf-toolchain/node_modules
node scripts/assets/towel_therapist_detail.mjs /private/tmp/ttuk-therapist-detail
```

첫 실행은 작업 폴더의 `source/public/models/towel-stage/...`에 입력을 보관한다. 입력은 이 디테일 작업 이전의 2차 손/포즈 수정본을 사용한다. 반복 실행은 같은 보관 입력에서 시작한다. `therapist-detail-metrics.json`에 파일별 바이트·삼각형 수를 기록한다. `prune({keepLeaves:true})`로 `mark_eyes`, `mark_hip`, `mark_fall`, `mark_shoulder_l/r`를 보존하며 출력 전 원래 월드 행렬과 최대 차이 1e-7 이하인지 검사한다. 최종 출력 GLB를 다시 읽은 다섯 마커의 차이는 정확히 0이다. 마커 제거는 어깨 접합과 넘어짐을 깨뜨리므로 기본 `prune()`로 바꾸지 않는다.

환자 5명의 머리·몸 디테일은 `patient_detail.mjs`와 `patient_detail_maps.py`로 재생성한다. 입력은 위 2차 손 자세가 적용된 몸과 기존 수건 머리 GLB 10개다. 첫 실행에 `source/public/models/towel-stage/patientNN/`에 보관하며 반복 실행은 이 입력에서 시작한다. 이 단계는 양자화/역양자화 변환을 실행하지 않는다. 기존 위치·법선·UV·스킨 가중치·인덱스·26개 표정·호흡 타깃의 typed array를 보존하고 새 커프·옷깃 메시만 추가한다.

```bash
export GLTF_MODULES=/path/to/existing/gltf-toolchain/node_modules
export DETAIL_WORK=/private/tmp/ttuk-patient-detail
node scripts/assets/patient_detail.mjs "$DETAIL_WORK"
VERIFY_ONLY=1 node scripts/assets/patient_detail.mjs "$DETAIL_WORK"
python3 scripts/assets/patient_hand_collision.py "$DETAIL_WORK"
```

기존 Python의 numpy/Pillow와 glTF 도구를 사용하며 의존성을 추가하지 않는다. `ASSET_PYTHON`과 `ASSET_IDS=02,05`로 실행 환경과 환자를 선택한다. `patient-detail-metrics.json`에 파일별 전후 바이트·삼각형과 텍스처 해상도를 기록한다. `VERIFY_ONLY`는 배포 GLB를 다시 읽어 원본 버퍼의 SHA-256을 비교한 `patient-detail-invariants.json`을 쓰고, 실제 커프·옷깃을 포함한 최종 셔츠/손 충돌 표면을 내보낸다. 충돌 검사는 호흡 0/0.5/1에서 수행한다.

환자 옷에는 겨드랑이·허리·배의 압축/당김 주름, 암홀·옆선·밑단 봉제, 상침, 단추·지퍼를 실제 미터 크기로 굽는다. 옷깃과 소매 끝에는 원래 스킨·호흡을 따르는 1.5/1.8 mm 두께의 접힌 면을 더하며 원래 옷 위치와 배 위의 손 자세는 유지한다. 피부에는 얕은 모공·관절 홍조를, 54/63세 얼굴에는 눈 밑·눈꼬리·팔자·이마의 넓은 나이별 구조를 더한다. 젊은 얼굴에 동일한 노화 주름을 덮지 않는다. UV의 물리 길이와 비직교 기저를 반영한 tangent-space normal, AO와 거칠기를 사용한다. 색·AO가 얼굴 구조를 보조하며 얼굴 위치와 표정 모프는 바꾸지 않는다.

환자 몸 color는 512, 피부·상의 normal은 1024, 바지 normal은 512, 얼굴 color는 1024다. 젊은 세 얼굴 normal은 512, 54/63세 얼굴 normal은 1024, ORM은 모두 512다. 기존 첫 환자의 2048 머리카락 normal은 같은 카드의 512 색/투명도 해상도에 맞춰 512로 줄인다. 오프라인 Lanczos 리샘플링이며 런타임 텍스처 흐림은 없다. 원래 피부색·의상 패널·프린트·헤어·환자 정체성을 보존한다.

환자 10개 파일의 2차 손 자세 완료본 → 최종 디테일본(실제 바이트/삼각형):

| 파일 | 이전 B | 이후 B | 용량 변화 | 이전 삼각형 | 이후 삼각형 |
|---|---:|---:|---:|---:|---:|
| patient01/body.glb | 350,032 | 458,012 | +30.85% | 21,784 | 22,504 |
| patient01/patient01.glb | 641,584 | 619,428 | -3.45% | 22,216 | 22,216 |
| patient02/body.glb | 348,928 | 460,540 | +31.99% | 21,792 | 22,512 |
| patient02/patient02.glb | 630,800 | 747,460 | +18.49% | 23,048 | 23,048 |
| patient03/body.glb | 347,256 | 456,748 | +31.53% | 21,784 | 22,504 |
| patient03/patient03.glb | 590,488 | 621,320 | +5.22% | 19,922 | 19,922 |
| patient04/body.glb | 303,544 | 420,016 | +38.37% | 17,648 | 18,020 |
| patient04/patient04.glb | 676,824 | 707,844 | +4.58% | 27,600 | 27,600 |
| patient05/body.glb | 349,280 | 460,844 | +31.94% | 21,784 | 22,504 |
| patient05/patient05.glb | 561,584 | 675,380 | +20.26% | 18,896 | 18,896 |
| 합계 | 4,800,320 | 5,627,592 | +17.23% | 216,474 | 219,726 |

몸 파일은 새 맵과 커프·옷깃으로 각각 30%를 넘어 증가한다. 전체 환자 머리·몸은 827,272 B 증가하며 삼각형은 커프·옷깃 3,252개(+1.50%)만 추가된다. 기존 얼굴·손·몸 메시를 세분화하지 않았다. 최종 머리카락 normal 축소는 첫 환자의 텍스처 RGBA+mipmap 추정 메모리를 약 20 MiB 줄이며, 이는 실제 기기 FPS 측정값이 아니다.

최종 직렬화 GLB를 다시 읽은 검증: 원래 속성·모프 버퍼 1,103개와 노드/역바인드 리그 항목 98개의 차이는 모두 0이다. 새 커프·옷깃을 포함한 셔츠와 양손의 호흡 0/0.5/1, 45개 삼각형 교차 검사는 모두 0이며 수직 표면 여유 최솟값은 손/손 1.4751 mm, 아래 손/셔츠 1.7513 mm다. 위 2차 자세 절의 1.5081/1.7272 mm는 재압축 전 생성 좌표이며, 이 최종 직렬화 측정값을 최종 검증에 사용한다.


### 최초 손 수정 전(PR #52 에셋) → 최종 수건 전체 예산

| 수건 에셋 | bytes 전 → 후 | triangles 전 → 후 |
|---|---:|---:|
| `hands/arms.glb` | 527,832 → 689,116 (+30.56%) | 9,130 → 10,684 |
| `patient01/body.glb` | 336,772 → 458,012 (+36.00%) | 21,784 → 22,504 |
| `patient01/patient01.glb` | 641,584 → 619,428 (-3.45%) | 22,216 → 22,216 |
| `patient02/body.glb` | 335,268 → 460,540 (+37.36%) | 21,792 → 22,512 |
| `patient02/patient02.glb` | 630,800 → 747,460 (+18.49%) | 23,048 → 23,048 |
| `patient03/body.glb` | 334,668 → 456,748 (+36.48%) | 21,784 → 22,504 |
| `patient03/patient03.glb` | 590,488 → 621,320 (+5.22%) | 19,922 → 19,922 |
| `patient04/body.glb` | 292,076 → 420,016 (+43.80%) | 17,648 → 18,020 |
| `patient04/patient04.glb` | 676,824 → 707,844 (+4.58%) | 27,600 → 27,600 |
| `patient05/body.glb` | 336,536 → 460,844 (+36.94%) | 21,784 → 22,504 |
| `patient05/patient05.glb` | 561,584 → 675,380 (+20.26%) | 18,896 → 18,896 |
| `room.glb` | 122,728 → 197,544 (+60.96%) | 11,954 → 11,954 |
| `therapist/therapist.glb` | 433,920 → 571,740 (+31.76%) | 24,343 → 24,343 |
| `towel/towel_sim.glb` | 972,220 → 1,099,104 (+13.05%) | 43,500 → 43,500 |
| **합계** | **6,793,300 → 8,185,096 (+20.49%)** | **305,401 → 310,207** |

수건 스테이지 다운로드는 **1,391,796 B(+1.39 MB)** 증가하여 추가 8 MB 목표 안이다. 삼각형은 전체 캐시 에셋 합계로 4,806개(+1.57%) 늘며 다섯 환자와 다섯 수건을 한 프레임에 모두 그리는 수치가 아니다. 30% 이상 커진 팔·환자 몸·치료사·공간 파일의 전후 수치는 위에 명시했다. 공간 증가는 침대 가죽 맵이며 방/침대 형상·삼각형 수는 유지한다.

별도 진료 팔은 495,396 → 516,652 B(+4.29%), 9,130 triangles 유지다. 새 의상·표면 디테일은 수건 복사본에만 적용한다. 임베디드 텍스처의 RGBA8+전체 mip 체인 추정 합계는 약 214.67 → 247.00 MiB이며 환경 맵·렌더 타깃·드라이버 비용은 제외한다. 디코딩·캐시 상한을 비교한 값으로 실기기 FPS 측정값은 아니다. 새 렌더 패스나 그림자 광원은 없으며 기존 주광 1개만 그림자를 만든다.

## 허리 누르기 전용 캐릭터 디테일 (2026-10-16)

`back_detail.mjs`는 `back_patient.py`의 엎드린 patient01과 `back_therapist.py`의 선 채 두 손을 겹친 치료사에 수건과 같은 직접 제작 디테일을 적용한다. 기존 MakeHuman CC0 피부·옷·헤어/MPFB 출력만 사용한다. 추가 외부 에셋은 없다. `patient_detail_maps.py`/`towel_surface_detail.py`를 공유해 직물 접힘·봉제·피부·손 관절의 color/normal/AO/roughness를 굽고, 치료사의 같은 얼굴 조형·옆가르마·안경·V넥·포켓·명찰과 손목/전완의 해부 형태를 더한다. 목/수건 원본 GLB는 수정하지 않는다.

저장소 루트에서 실행한다. 이 환경에서 확인한 실제 도구 경로의 예:

```sh
export GLTF_MODULES=/private/tmp/codex-npm/_npx/39bd747c6932aaf5/node_modules
export ASSET_PYTHON=python3  # numpy/Pillow 필요. 이 머신의 .venv에는 numpy가 없다.
node scripts/assets/back_detail.mjs /private/tmp/back-detail-work /path/to/original-back-assets
```

원본 폴더는 `patient.glb`, `therapist.glb`, `back_surface.json`을 포함한다. 세 번째 인수를 생략하면 현재 `public/models/back`이 입력이다. **최초 실행 시 `<작업폴더>/source`에 입력을 보존하며, 같은 작업폴더의 재실행은 항상 그 입력을 사용한다. 최종 디테일 GLB를 새 작업폴더의 원본으로 다시 넣으면 조형이 누적되므로 피한다.** 전체 재생성은 위 환경 변수를 설정하고 `bash scripts/assets/back_optimize.sh <새 작업폴더> 1024 16`을 실행하면 Blender 원본/최적화 뒤 디테일까지 적용한다.

이번 샌드박스에서는 Blender 5.2.2가 스크립트 평가 전 시작 단계에서 크래시했다. 따라서 기존에 올바르게 구운 자세/리그 GLB를 보존 입력으로 쓰는 glTF 경로로 완료했다. 표면은 완성 메시에서 다시 레이캐스트하여 69×149, 1cm 간격의 `back_surface.json`으로 저장한다. 조준 영역(x ±5cm, z -5..55cm)의 표면 변화 최댓값은 1.2mm이며 기존 치료사 뼈/마커 54개의 월드 행렬 차이는 정확히 0이다. 원래 리그와 누르기·점프 동작 계약은 유지한다.

| 허리 전용 에셋 | 이전 B → 이후 B | 이전 삼각형 → 이후 삼각형 |
|---|---:|---:|
| `back/patient.glb` | 358,772 → 566,044 | 32,296 → 33,736 |
| `back/therapist.glb` | 526,920 → 810,960 | 29,270 → 32,814 |

Meshopt와 WebP를 사용한다. 환자/옷 color·ORM은 512, 피부/상의 normal은 1024, 바지 normal은 512다. 치료사 피부 color/normal/ORM은 1024다. `metrics.json`에는 최종 용량/삼각형 수가 기록된다.

## 허리 X-ray 장기 레이어 (2026-10-16)

`organs_build.py`는 [BodyParts3D](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html) (© DBCLS, CC BY 4.0)의 실제 분할 OBJ를 감축해 `public/models/back/organs.glb`를 만든다. 장기 외곽을 직접 그리지 않는다. 원본 ZIP 전체를 받지 않고 HTTP Range로 중앙 디렉터리와 필요한 OBJ 엔트리만 받는다. 다운로드·중간 GLB·가상환경은 저장소 밖 작업 폴더에 둔다.

형상은 `20110915/BodyParts3D_3.0_obj_95.zip`, 복합 장기 정의는 같은 폴더의 `composite_parts.txt`/`parts_list_e.txt`다. 4.0 `partof_element_parts.txt`에는 폐와 심장의 내부 혈관까지 여러 FJ 부품으로 나뉘어 있어, 이번에는 3.0의 실제 폐엽·심장 외벽과 장 표면을 사용했다.

| 출력 노드 | 개념 / 실제 OBJ 파일 ID | 최종 삼각형 |
|---|---|---:|
| `lungL` | FMA7310 / FMA7370, FMA7371 | 2,999 |
| `lungR` | FMA7309 / FMA7333, FMA7337, FMA7383 | 2,999 |
| `heart` | FMA7088 / FMA7274 (심장벽) | 3,340 |
| `liver` | FMA7197 | 2,999 |
| `stomach` | FMA7148 | 3,000 |
| `spleen` | FMA7196 | 2,999 |
| `kidneyL` | FMA7205 | 3,000 |
| `kidneyR` | FMA7204 | 3,000 |
| `bowel` | FMA7200+FMA7201 / FMA7206, FMA7207, FMA7208, FMA14543nsn | 2,999 |
| **합계** | 9개 메시 + 기준 마커 2개 | **27,335** |

좌표는 `spine_build.py`와 동일하다. mm→m, 4.0 C1–C7 합친 경계 상자의 x/y 중심과 C7 최하단을 원점으로 쓴다. 기준 OBJ는 FJ3176/3177/3161/3164/3167/3170/3172이며 원점 이동량(m)은 `(-0.00056695, -0.05646870, 1.36471000)`이다. Blender +Z 머리·-Y 앞·+X 환자 왼쪽 → glTF +y 머리·+z 앞·+x 환자 왼쪽이다. `ref_T1`(FMA9165), `ref_L5`(FMA13076)는 장기와 같은 3.0 등록 좌표를 보존한다. 런타임은 두 마커 높이를 position 0..1, 월드 z -0.05..0.55에 선형 대응하고 폭은 척추와 같은 1.5배로 그린다. 엎드린 후면 투영의 환자 왼쪽은 +x이며 깊이는 얕게 눌러 방사선 필름처럼 겹친다. 해부 메시를 반사한 뒤 면 순서와 법선을 다시 맞춘다.

저장소 루트에서 재생성:

```sh
ORG_WORK=/private/tmp/back-organ-build
python3 scripts/assets/organs_build.py --fetch "$ORG_WORK/raw"
/opt/homebrew/bin/blender -b --factory-startup --python scripts/assets/organs_build.py -- "$ORG_WORK/raw" "$ORG_WORK/raw.glb" 3000
npm_config_cache=/private/tmp/codex-npm npx --yes @gltf-transform/cli@4.5.1 meshopt "$ORG_WORK/raw.glb" public/models/back/organs.glb
```

이 샌드박스의 Blender 5.2.2는 Python 실행 전 Metal 장치 탐색에서 충돌했다. 최종 에셋은 동일 스크립트의 CPU 경로로 생성했다. 실제 OBJ·좌표·감축 목표는 같으며, 심장벽 감축 후 남은 16면 미만의 고립 조각만 제거한다. smooth normal은 면적 가중 평균으로 계산한다. CPU 경로의 재생성 명령:

```sh
python3 -m venv "$ORG_WORK/env"
"$ORG_WORK/env/bin/pip" install numpy trimesh fast-simplification
"$ORG_WORK/env/bin/python" scripts/assets/organs_build.py --cpu "$ORG_WORK/raw" "$ORG_WORK/raw.glb" 3000
npm_config_cache=/private/tmp/codex-npm npx --yes @gltf-transform/cli@4.5.1 meshopt "$ORG_WORK/raw.glb" public/models/back/organs.glb
```

최종 Meshopt GLB는 **150,596 B (150.6 KB)**다. 두 생성 경로의 감축 알고리즘은 다르므로 위 삼각형 수는 CPU 경로의 실제 결과다. 기존 척추 GLB는 변경하지 않는다. 밀도 레퍼런스는 [Radiology Assistant의 실제 PA 흉부 필름](https://radiologyassistant.nl/chest/chest-x-ray/basic-interpretation)이며, 원본 사진을 에셋으로 복제하지 않는다. 폐는 어두운 공기 공간과 약한 윤곽, 고형 장기는 중간 밀도의 반투명 조직, 장은 희미한 가스 얼룩으로 표시한다. 파열 목록이 있을 때만 장기 레이어를 표시하며, 기존 골절 시점(`xrayDelay + .45 + .35초`)에 coral 균열·번짐·맥동을 시작한다.


## 허리비틀기 옆누운 자세 — Round 2 스크립트 (2026-10-19)

`side_patient.py`, `side_therapist.py`, `lumbar_build.py`의 단일 진입점은 아래 명령이다.
**Blender 실행은 Claude의 샌드박스 밖 호스트에서만 한다. Codex 샌드박스에서는 실행하지 않는다.**

```sh
bash scripts/assets/side_optimize.sh /private/tmp/side-lumbar-build /path/to/preview-out
```

기존 MPFB 부트스트랩이 필요한 호스트에서는 `SIDE_BOOTSTRAP=/private/tmp/side-lumbar-build/bootstrap.py`를 지정한다.
Blender 경로는 `BLENDER`, MPFB 패키지는 `SIDE_MPFB_PACKAGE`로 바꿀 수 있다. 새 Blender/bpy 설치는 필요 없다.
빌드 중간물과 `.blend`는 작업 폴더에, 최적화 결과는 `public/models/side/`에 쓴다.
게임 코드와 기존 모드 에셋은 변경하지 않는다.

좌표는 three.js 미터, +y 위, 머리 -z다. 패드 윗면 0.82, 프리뷰 폭 0.62·길이 1.90m(z -0.30..1.60)다.
`lieL`은 왼쪽이 아래이며 +x를 바라보고 치료사는 +x에 선다. `lieR`은 오른쪽이 아래이며 -x를 바라본다.
Blender pose copy/paste flipped와 양의 루트 회전으로 반전하며 음수 스케일을 쓰지 않는다.
환자와 치료사 모두 MPFB `game_engine` 리그, `shoes05` 신발을 유지한다.

환자 클립은 `lieL`, `lieR`(각 1초), `rollLR`, `rollRL`(각 1.6초)이다.
치료사 클립은 `setupL`, `setupR`(각 1초), `walkLR`, `walkRL`(각 1.6초)이다.
모든 액션에 fake user를 두며 저장된 `.blend`를 다시 열고, 원본 GLB를 재임포트해 클립과 접지를 검사한다.
`patient_marks.json`의 `clips.lieL/lieR`에는 `mark_l4_L/R`, `mark_shoulder_L/R`, `mark_hip_L/R`,
`top_knee`, 실측 바지 표면 `top_knee_surface`, `facing`이 있다. 이름이 `mark_`로 시작하는 여섯 지점은 GLB empty로도 보존한다.
`pelvisRollAxesLocal`은 `pelvis`, `spine_01..03`, `thigh_l/r` 각각의 현재 본 로컬 축이다.
이 축으로 양의 각도를 본 쿼터니언에 후곱하면 해당 자세에서 골반이 치료사 쪽으로 구른다.
치료사 thrust는 루트의 월드 y를 약 0.04m 낮추고 spine을 굽히는 방식으로 더한다.

`PATIENT_SUPPORT`는 피부 최저 y와 위·아래 다리 각도를, `THERAPIST_SUPPORT`/`contact_metrics.json`은
각 신발 최저 y, 몸통 실측 각도, 고정된 손바닥 피부 정점의 좌표·접촉 오차와 허벅지/환자 무릎 표면 거리를 기록한다.
손바닥 정점 ID는 IK 전에 고르며 타깃 좌표로 대체하지 않는다.
`SAVED_BLEND_ACTIONS`, `GLTF_ANIMATIONS`, `REIMPORT_ANIMATIONS`, `REIMPORT_SUPPORT`, `FINAL_GLB`가 보존·내보내기 검증이다.
최종 캐릭터 각 1,000,000B 이하, 요추 900,000B 이하를 검사한다.
Round 2의 Blender 실행 결과·렌더는 아직 확인하지 않았다. 실제 수치는 다음 호스트 실행 로그로 판단한다.

캐릭터 소스는 기존 MakeHuman/MPFB CC0 시스템 에셋(피부·머리·의상·shoes05)이다.
요추는 `organs_build.py`와 같은 HTTP Range 방식으로 받는 BodyParts3D 3.0 obj_95의 실제 L1–L5·천골·디스크이며
© DBCLS, CC BY 4.0이다. `lumbar.json`에 출처, 원점, 본체 중심과 관절 표면 추정점을 기록한다.
참고 영상/시트는 자세 검토용이며 텍스처나 메시로 복제하지 않는다.

요추 재생성만 실행: `SIDE_ONLY=lumbar bash scripts/assets/side_optimize.sh /private/tmp/side-lumbar-build`.
`lumbar_build.py --fetch RAW`는 공식 BP3D 영문 목록에서 T11/T12 및 해당 디스크 ID를 해결해
`RAW/lumbar_parts.json`에 기록한다. L1–S1 디스크 5개는 실제 중심 높이 순으로 배정하고 각 마디 사이인지 검사한다.
T11–L5·Sacrum은 경추와 같은 Blender +Z 위/-Y 앞/+X 환자 왼쪽 좌표이며, 메타데이터도 이 좌표를 쓴다.
`lumbar_cord.py`로 척추관을 측정해 conus/cauda equina와 Root_0..6을 추가한 뒤,
수정하지 않은 `spine_bake.py`(64 samples)의 AO COLOR_0·안정된 부모 노드 규약으로 내보낸다.
Cord/Root는 AO 음영 대신 중립 흰 COLOR_0를 보존한다. 최종 검사에서 모든 메시 COLOR_0와 노드를 검사한다.
Blender 실행과 최종 용량/형태 검토는 샌드박스 밖 호스트에서 수행한다.

# Credits

## Towel-stage redesign (2026-10-16)

The following derivatives are shared by the clinic, towel and back modes. The original source assets are retained separately.

| 파일 | 출처·변경 | 라이선스 |
|---|---|---|
| `public/models/towel-stage/patient01`–`patient10/*.glb` | 기존 환자들과 동일한 MakeHuman 시스템 CC0 에셋/MPFB 출력에서 파생. 목 절단선·2본 스킨·호흡·26개 표정 타깃을 보존하고 얼굴 면/헤어 실루엣을 조정. 기존 피부 사진에 직접 작성한 미세 피부/연령/직물 맵, 환자별 의상 아틀라스, 실제 봉제 가장자리, 교수 안경·작가 머리핀을 더함 (`towel_stage_characters.mjs`, `towel_stage_textures.py`) | 원본 MakeHuman 에셋 CC0 ([시스템 에셋](https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html)). 추가 모델링·맵은 직접 제작, 외부 소스 없음 |
| `public/models/towel-stage/hands/arms.glb` | 기존 CC0 MPFB 팔·손·손가락 리그 보존, 피부/손 미세 법선과 청록색 스크럽 트윌·민트 소매 끝단 | 원본 MakeHuman 에셋 CC0. 추가 맵 직접 제작 |
| `public/models/towel-stage/therapist/therapist.glb` | 기존 CC0 MPFB 치료사를 바탕으로 얼굴·짧은 옆가르마·안경, V넥 봉제/포켓/명찰, 산호색 스툴/테두리/발걸이 제작. 어깨·눈·엉덩이·넘어짐 마커와 앉은 자세 유지 (`towel_stage_props.py`) | 원본 MakeHuman 에셋 CC0. 추가 형상·맵 직접 제작 |
| `public/models/towel-stage/towel/towel_sim.glb` | 기존 천 시뮬레이션의 X자 감김과 `taut` 모프 보존, 같은 모프를 따르는 실제 봉제 가장자리 추가. 사진 텍스처는 기존 Poly Haven "Terry Cloth", 사진 colormass / 처리 Rico Cilliers | 텍스처 CC0 ([Terry Cloth](https://polyhaven.com/a/terry_cloth), [라이선스](https://polyhaven.com/license)). 천·봉제 형상 직접 제작 |
| `public/models/towel-stage/room.glb` | 직접 제작한 테라조 타일/광물 조각, 플루트 벽, 반투명 리브 문, 수납장·린넨·펌프 병·이동식 트레이·라디에이터, 분할 가죽 테이블·봉제선·레일·육각 볼트·조절 레버 (`towel_stage_room.mjs`). 새 외부 에셋/사진 없음 | 직접 제작. 게임의 `LICENSE` 적용 |

손 자세·해부 형태 보정(`hand_anatomy.mjs`, `patient_rest_hands.mjs`)과 후속 수건 캐릭터의 소매/커프·옷 주름·봉제·피부 결·AO/거칠기 맵(`patient_detail.mjs`, `patient_detail_maps.py`, `towel_therapist_detail.mjs`, `towel_surface_detail.py`)도 기존 CC0 메시/피부 아틀라스에서 직접 제작한 파생 작업이다. 테이블 가죽의 결·마모 맵은 직접 작성했고, 수건은 기존 Poly Haven 사진과 천 모프를 유지한다. 새 외부 에셋은 추가하지 않았다.

새로 작성한 형상과 텍스처에는 별도 표시가 없는 한 게임의 `LICENSE`가 적용된다. 원본 CC0 소스의 권리는 바뀌지 않는다. 척추는 아래 BodyParts3D 파일을 그대로 사용하며, 수건 모드에만 피질골 미세 음영·추간판 섬유륜·관절면 재질을 더한다. 새 해부학 소스를 추가하지 않았다.

허리 누르기의 `public/models/back/patient.glb`와 `therapist.glb`도 위와 동일한 MakeHuman 시스템 CC0 에셋/MPFB 출력의 patient01·치료사를 엎드린/선 자세로 만든 파생본이다(`back_patient.py`, `back_therapist.py`). `back_detail.mjs`가 같은 직접 제작 얼굴/손 조형·안경·유니폼 봉제/포켓/명찰과 공유 피부·직물 맵을 적용한다. 원래 누르기 리그는 유지하며 새 외부 소스나 라이선스는 추가하지 않았다.

## Sounds

| 파일 | 출처 | 라이선스 |
|---|---|---|
| `public/audio/crack.wav` | "neck_crack_pure.aif" by Halleck, https://freesound.org/s/21915/ | **CC BY 4.0** (https://creativecommons.org/licenses/by/4.0/). 수정: 모노 44.1kHz 16bit로 변환, 앞뒤 무음 자르기, 음량 정규화 |
| `public/audio/crack-hard.wav` | "Breaking Bones.mp3" by MonkeyFacebook532, https://freesound.org/s/265351/ | CC0. 같은 방식으로 변환 |
| `public/audio/break.wav` | "genickbruch.wav" by huluvu42, https://freesound.org/s/87570/ | CC0. 같은 방식으로 변환 |
| `public/audio/bgm.m4a` | "Spacious Stillness" — 사용자 제공(2026-10-15). 2026-10-21 직접 작곡 칩튠(`scripts/audio/`)과 비교해 사용자가 이 곡을 골랐다 | 출처·라이선스 미확인. 앱인토스 출시 전 상업 이용 가능 여부 확인 필요. AAC 96kbps로 다시 인코딩 |

사이렌·차임·틱·고무줄·손가락 소리와 녹음 로드 전 폴백 뚝 소리는 WebAudio 합성(`src/audio/audio.js`)이다. 차임·뾰잉·뚜륵·손가락·쭈욱·쿵·휙의 만화 소리 층은 ZzFX v1.4.0(Frank Force, MIT, https://github.com/KilledByAPixel/ZzFX)의 샘플 생성 함수(`src/audio/zzfx.js`, 라이선스 전문 포함)로 만든다.

## 3D assets

| 파일 | 출처 | 라이선스 |
|---|---|---|
| `public/models/hands/arms.glb` | MakeHuman 시스템 에셋으로 MPFB 2.0.18(Blender 5.2.2)에서 생성: 중년 남성 기본 메시의 팔 전체(어깨 아래~손끝)와 `male_casualsuit06` 티셔츠 소매, `game_engine` 리그(위팔·아래팔·손·손가락 뼈), 피부 `middleage_asian_male` | 에셋 CC0. UV를 다시 펴서 AO와 함께 구웠다(`scripts/assets/mpfb_export_arms.py`) |
| `public/models/towel/towel.glb` | 직접 제작: Blender 5.2.2 스크립트(`scripts/assets/towel_build.py`)로 만든 접힌 흰 목욕 타월(주름, 끝단 보더, 타월 결 노멀·AO를 Cycles로 구움). 외부 에셋 없음 | 게임과 같은 라이선스(`LICENSE`) |
| `public/models/towel/towel_sim.glb` | 직접 제작: Blender 5.2.2 천 시뮬레이션(`scripts/assets/towel_sim.py`)으로 환자 10명 각각의 목에 X자로 감은 접힌 목욕 수건(느슨함/당김 모프). 텍스처: Poly Haven "Terry Cloth" (https://polyhaven.com/a/terry_cloth, 사진 colormass, 처리 Rico Cilliers)의 diffuse·normal(OpenGL)·AO 2k를 미색으로 바꿔 1024로 줄임 | 텍스처 CC0 (Poly Haven, https://polyhaven.com/license). 메시는 게임과 같은 라이선스(`LICENSE`) |
| `public/models/therapist/therapist.glb` | MakeHuman 시스템 에셋으로 MPFB 2.0.18(Blender 5.2.2)에서 생성: 30대 남성 기본 메시(팔 제외), 피부 `middleage_asian_male`, 눈 `low-poly` + `brown`, 눈썹 `eyebrow001`, 속눈썹 `eyelashes01`, 머리카락 `short04`, 옷 `male_casualsuit06`, 신발 `shoes05`, `game_engine` 리그로 자세를 잡은 뒤 적용. 진료용 스툴은 Blender로 직접 모델링 | 에셋 CC0. 스툴에 앉은 자세를 적용하고, 피부는 UV를 다시 펴서 AO와 함께, 옷은 AO 맵에 장면 AO를 곱해 구웠다. 홍채는 진한 갈색으로 다시 칠했다(`scripts/assets/therapist_build.py`) |
| `public/models/patient02`~`patient05/*.glb` | patient01과 같은 방식으로 생성(`scripts/assets/patients.py` 프리셋): 피부 `middleage_asian_male`·`young_asian_male`·`young_asian_female`, 머리카락 `short03`·`short04`·`bob01`, 눈썹 `eyebrow002`·`eyebrow003`·`eyebrow009`, 속눈썹 `eyelashes02`, 옷 `female_casualsuit01` | 에셋 CC0. 회색 머리는 텍스처를 회색으로 다시 칠했다 |
| `public/models/patient06`~`patient10/*.glb` | patient01과 같은 방식으로 생성(`scripts/assets/patients.py` 프리셋, 2026-10-24): 피부 `young_asian_male`·`young_asian_female`·`middleage_asian_male`·`middleage_asian_female`, 머리카락 `short01`·`long01`·`short04`·`short02`, 눈썹 `eyebrow001`·`eyebrow002`·`eyebrow003`·`eyebrow009`, 속눈썹 `eyelashes01`·`eyelashes02`, 옷 `male_casualsuit06`·`female_casualsuit01`·`female_casualsuit02`·`male_casualsuit04` | 에셋 CC0. 회색 머리(patient09)는 텍스처를 회색으로 다시 칠했다 |
| `public/models/patient11/*` | 최필라(2026-10-24). Codex(이미지 생성)로 그린 4방향 시안을 Higgsfield의 Tripo H3.1 Multiview to 3D로 메시·텍스처화, gltf-transform으로 줄이고 `scripts/assets/image3d_patient.py`로 목에서 머리·몸을 나눔. 표정 텍스처 `expr_*.webp`는 정면 렌더 위에 Codex가 그린 것 | 직접 생성한 AI 결과물(시안·메시 모두 이 프로젝트용으로 생성). 외부 원본 에셋 없음. 출시 전 각 서비스 약관의 상업 이용 조건 확인 필요 |
| `public/models/patient01/body.glb` | MakeHuman 시스템 에셋으로 MPFB 2.0.18(Blender 5.2.2)에서 생성: patient01과 같은 체형의 기본 메시(목 중간 아래), 옷 `male_casualsuit06`(AO·노멀 맵만), 피부 `young_asian_male` | 에셋 CC0. 팔을 내린 자세를 적용하고, 피부는 UV를 다시 펴서 AO와 함께 구웠다. 목 뼈와 호흡 모양 키는 직접 만들었다(`scripts/assets/mpfb_export_body.py`) |
| `public/models/patient01/patient01.glb` | MakeHuman 시스템 에셋으로 MPFB 2.0.18(Blender 5.2.2)에서 생성: 기본 메시·표정 단위 타깃(MPFB 동봉), 피부 `young_asian_male`, 눈 `high-poly` + `brown`, 눈썹 `eyebrow001`, 속눈썹 `eyelashes01`, 머리카락 `short02`(노멀맵 포함), 치아 `teeth_base`, 혀 `tongue01` (makehuman_system_assets_cc0.zip, https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html) | 에셋 CC0. 피부는 UV를 다시 펴서 AO와 함께 구웠고, 홍채는 진한 갈색으로 다시 칠했다(`scripts/assets/mpfb_export_head.py`). MPFB 자체는 GPL-3.0-or-later 도구이며 게임에 포함되지 않음 |
| `public/models/spine/cervical.glb` | BodyParts3D (DBCLS). 위치: BodyParts3D 4.0 (https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/partof_BP3D_4.0_obj_99.zip): C1–C7(FJ3176, FJ3177, FJ3161, FJ3164, FJ3167, FJ3170, FJ3172), T1–T8(FJ3158, FJ3160, FJ3163, FJ3166, FJ3169, FJ3171, FJ3173, FJ3174), 추간판 C2/3–C7/T1(FJ3202, FJ3213, FJ3218, FJ3219, FJ3220, FJ3221), T1/2–T7/8(FJ3222, FJ3223, FJ3224, FJ3203, FJ3204, FJ3205, FJ3206). 모양: 같은 뼈·추간판의 BodyParts3D 3.0 고해상도판(https://dbarchive.biosciencedbc.jp/data/bodyparts3d/20110915/BodyParts3D_3.0_obj_95.zip, 폴리곤 5배): FMA12519, FMA12520, FMA12521, FMA12522, FMA12523, FMA12524, FMA12525, FMA9165, FMA9187, FMA9209, FMA9248, FMA9922, FMA9945, FMA9968, FMA9991, FMA25058, FMA13896–FMA13900, FMA10458, FMA13495, FMA13500–FMA13504. 수정: 3.0 뼈를 4.0 뼈 위치에 강체 정합(ICP), 축 변환, mm→m, 뼈당 약 5천·추간판 1.5천 삼각형으로 줄임, 노멀 정리, Cycles로 구운 AO·오목 음영 정점 색(COLOR_0), 척수·신경근 관 추가(척추관 중심 측정, `scripts/assets/spine_cord.py`), C5–C7 골극(`Spur_C5`–`Spur_C7`) 직접 모델링(`scripts/assets/spine_spurs.py`), meshopt 압축. 만드는 법은 `scripts/assets/spine_build.py` 머리말 | "BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International" (README_e.html, 2025-02-25). 원본 OBJ 헤더 표기: "BodyParts3D, (c) The Database Center for Life Science licensed under CC Attribution-Share Alike 2.1 Japan"(3.0판 README도 CC BY-SA 2.1 JP). 척수·신경근·골극은 데이터에 없어 직접 만든 것이다 |
| `public/models/side/lumbar.glb` | BodyParts3D 3.0 (DBCLS, https://dbarchive.biosciencedbc.jp/data/bodyparts3d/20110915/BodyParts3D_3.0_obj_95.zip): T11(FMA10059), T12(FMA10081), L1–L5(FMA13072–FMA13076), 천골(FMA16202), 추간판 T11/12(FMA13508), L1/2–L5/S1(FMA16033–FMA16037). 수정: 축 변환, mm→m, 뼈당 최대 1.2만(천골 1.4만)·추간판 1.5천 삼각형으로 줄임, 노멀 정리, Cycles로 구운 AO·오목 음영 정점 색(COLOR_0), 척수·말총·신경근 관 추가(척추관 중심 측정, `scripts/assets/lumbar_cord.py`), 데이터에 없는 T12/L1 추간판은 L1/2 추간판을 틈에 맞춰 복제, meshopt 압축. 만드는 법은 `scripts/assets/lumbar_build.py`, `scripts/assets/side_optimize.sh` | "BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International". 척수·말총·신경근과 T12/L1 추간판 배치는 직접 만든 것이다 |

손가락 자세와 손목 꺾임은 실행 중 코드(`src/scene/realAssets.js`)가 뼈를 돌려 만든다.
환자 머리는 `scripts/assets/`의 Blender 스크립트로 다시 만들 수 있다. 원본 내보내기(약 9MB, 2048² PNG)는 저장소에 넣지 않고, 텍스처를 줄이고(피부 1024², 머리카락·눈썹 512², 눈 256², WebP) meshopt로 압축한 사본만 넣었다.

앱인토스 콘솔 아이콘 `toss/icon-600.png`(600×600)은 직접 만든 것이다. 글자는 Black Han Sans(SIL OFL 1.1)로, 헤드리스 크로미움에서 HTML을 렌더해 캡처했다.

# Credits

## 3D assets

| 파일 | 출처 | 라이선스 |
|---|---|---|
| `public/models/hands/hands.glb` | MakeHuman 시스템 에셋으로 MPFB 2.0.18(Blender 5.2.2)에서 생성: 기본 메시의 손과 팔뚝 손목 쪽 절반, `game_engine` 리그(손가락 뼈), 피부 `middleage_asian_male` | 에셋 CC0. UV를 다시 펴서 AO와 함께 구웠다(`scripts/assets/mpfb_export_hands.py`) |
| `public/models/patient01/patient01.glb` | MakeHuman 시스템 에셋으로 MPFB 2.0.18(Blender 5.2.2)에서 생성: 기본 메시·표정 단위 타깃(MPFB 동봉), 피부 `young_asian_male`, 눈 `high-poly` + `brown`, 눈썹 `eyebrow001`, 속눈썹 `eyelashes01`, 머리카락 `short02`(노멀맵 포함), 치아 `teeth_base`, 혀 `tongue01` (makehuman_system_assets_cc0.zip, https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html) | 에셋 CC0. 피부는 UV를 다시 펴서 AO와 함께 구웠고, 홍채는 진한 갈색으로 다시 칠했다(`scripts/assets/mpfb_export_head.py`). MPFB 자체는 GPL-3.0-or-later 도구이며 게임에 포함되지 않음 |
| `public/models/spine/cervical.glb` | BodyParts3D 4.0 (https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/partof_BP3D_4.0_obj_99.zip): C1–C7(FJ3176, FJ3177, FJ3161, FJ3164, FJ3167, FJ3170, FJ3172), 추간판 C2/3–C7/T1(FJ3202, FJ3213, FJ3218, FJ3219, FJ3220, FJ3221). 수정: 축 변환, mm→m, 척수·신경근 관 추가(척추관 중심 측정, `scripts/assets/spine_cord.py`), meshopt 압축 | "BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International" (README_e.html, 2025-02-25). 원본 OBJ 헤더 표기: "BodyParts3D, (c) The Database Center for Life Science licensed under CC Attribution-Share Alike 2.1 Japan". 척수와 신경근은 데이터에 없어 직접 만든 관이다 |

손가락 자세와 손목 꺾임은 실행 중 코드(`src/scene/realAssets.js`)가 뼈를 돌려 만든다.
환자 머리는 `scripts/assets/`의 Blender 스크립트로 다시 만들 수 있다. 원본 내보내기(약 9MB, 2048² PNG)는 저장소에 넣지 않고, 텍스처를 줄이고(피부 1024², 머리카락·눈썹 512², 눈 256², WebP) meshopt로 압축한 사본만 넣었다.

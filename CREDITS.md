# Credits

## 3D assets

| 파일 | 출처 | 라이선스 |
|---|---|---|
| `public/models/hands/left.glb`, `right.glb` | WebXR Input Profiles, `@webxr-input-profiles/assets@1.0.20` `dist/profiles/generic-hand/` (https://github.com/immersive-web/webxr-input-profiles) | MIT, Copyright (c) 2019 Amazon. 전문: `public/models/hands/LICENSE.md` |
| `public/models/patient01/patient01.glb` | MakeHuman 시스템 에셋으로 MPFB 2.0.18(Blender 5.2.2)에서 생성: 기본 메시·표정 단위 타깃(MPFB 동봉), 피부 `young_asian_male`, 눈 `high-poly` + `brown`, 눈썹 `eyebrow001`, 속눈썹 `eyelashes01`, 머리카락 `short02` (makehuman_system_assets_cc0.zip, https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html) | 에셋 CC0. MPFB 자체는 GPL-3.0-or-later 도구이며 게임에 포함되지 않음 |

손 GLB는 원본 그대로이며 손가락 자세와 재질은 실행 중 코드(`src/scene/realAssets.js`)로 바꾼다.
환자 머리는 `scripts/assets/`의 Blender 스크립트로 다시 만들 수 있다. 원본 내보내기(약 9MB, 2048² PNG)는 저장소에 넣지 않고, 텍스처를 줄이고(피부 1024², 머리카락·눈썹 512², 눈 256², WebP) meshopt로 압축한 사본만 넣었다.

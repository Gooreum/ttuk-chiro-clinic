# 환자 머리 에셋 다시 만들기

1. Blender 5.2 + MPFB 2.0.18 설치 (`blender --command extension install-file --repo user_default --enable add-on-mpfb-v2.0.18.zip`)
2. makehuman_system_assets_cc0.zip을 풀어 MPFB user data(`.../extensions/.user/user_default/mpfb/data`)에 복사
3. `blender -b --python mpfb_build_character.py -- park.blend` (박대리: 남성, 32세, 동양인, 짧은 머리)
4. `blender -b park.blend --python mpfb_export_head.py -- patient01_raw.glb` (표정 단위 12개, 눈썹·속눈썹 셰이프 키, 목 중간 아래 제거)
5. 최적화 사본 (gltf-transform 4.5.1):
   ```
   gltf-transform resize patient01_raw.glb s1.glb --width 1024 --height 1024
   gltf-transform resize s1.glb s1b.glb --width 512 --height 512 --pattern "short02*"
   gltf-transform resize s1b.glb s1c.glb --width 256 --height 256 --pattern "brown_eye*"
   gltf-transform webp s1c.glb s2.glb --quality 85
   gltf-transform meshopt s2.glb ../../public/models/patient01/patient01.glb
   ```
측정값(정수리 y 1.625, 턱 y 1.358, 뒤통수 z -0.062)은 `src/scene/realAssets.js`의 머리 맞춤에 쓰인다. 다시 만들면 이 값을 다시 재야 한다.

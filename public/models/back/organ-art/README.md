# Posterior neon-film organ holograms

27 transparent WebP textures: nine organs × `calm` / `strain` / `dead`.
Repainted with the built-in ImageGen tool on 2026-10-18 from the user's selected
**C · neon film hologram** concept (`scratchpad/codex16/concept-C.png`).
No downloaded art. No faces, text, blood, flesh, stickers or stars.

## View and anatomy

All sprites retain the **posterior view**, superior end at the top. In the prone
overhead shot, patient right is image right / world +x. The runtime does not
mirror the textures.

- `lungL`: medial indentation faces image right; `lungR`: image left.
- `heart`: simplified atrial/vessel forms, apex toward image left.
- `liver`: large right lobe on image right; small tapered left lobe on image left.
- `stomach`: fundus/greater curvature on image left, pyloric outlet on image right.
- `spleen`: left-side capsule with a medial indentation toward image right.
- `kidneyL`, `kidneyR`: external bean-shaped capsules, medial concavities and
  short ureters toward the midline; no cross-sections.
- `bowel`: segmented colon surrounding small-bowel coils; ascending colon on
  image right and descending colon on image left.

## States and generation

Each calm organ was generated separately using concept C as the style reference.
Two separate image edits then used that organ's calm PNG and concept C, preserving
its orientation, silhouette, composition and placement:

- `calm`: translucent dark teal/mint volume, luminous mint-white rim, sparse
  triangular facets and fine horizontal film scanlines.
- `strain`: intact, slightly fuller coral warning hologram with amber-white rim
  glow. The existing runtime still supplies the large animated inflation.
- `dead`: separated mint crystal remnants with wide transparent gaps and a trace
  of coral along broken edges, plus small light fragments. No intact organ behind
  the chunks and no tissue wound.

Shared calm prompt: “One standalone calm game organ sprite, posterior view,
patient right = image right. Neon film hologram: smooth translucent dark teal
volume, luminous mint/ivory silhouette rim, sparse triangular facets and delicate
horizontal scanlines. Entire organ centered, superior end at top, true transparent
background and clear padding. No flesh colours, body, other organs, platform,
text, labels, faces, blood, stars or stickers.” Organ-specific anatomy is listed
above. Strain edits replace mint with coral warning light and preserve the intact
shape. Dead edits remove about 45% of the volume into transparent gaps, leaving
5–7 separated angular mint chunks and a few small fragments within the original
framing. The full prompt set and generated PNG sources are kept in
`scratchpad/codex18/` alongside the contact sheet.

Alpha cropping, registration, resampling and WebP encoding preserve the generated
art rather than repainting it procedurally. Final canvases retain their original
dimensions (560 px high, 346–1010 px wide), WebP quality 90 and transparent alpha.
Each triplet uses the same centered footprint to avoid a size jump at map swaps.

## Runtime and performance

`src/back/xray.js` retains the GLB landmarks, explicit posterior side signs and
existing labels. Non-hit organs use a faded pale mint tint. Rupture emits 18
instanced, faceted coral/mint light shards and needle sparks per organ with
additive blending; no particle textures or extra lights are used. The two
shockwaves are coral and mint.

All 27 maps are uploaded with `renderer.initTexture` during loading. Existing
effect/tag textures are also initialized before the shot. Instance colours and
geometry attributes are populated before the existing loading-time render warmup
in `src/back/scene.js`, so no new shader variant or texture is introduced by a
burst. A browser performance probe is still required to measure this on-device.

`ORGAN_BEAT`, inflation, hit stop, flash, both shockwave timings, particle lifetime,
shake, camera, fracture marker and hit logic are unchanged. The shared
`src/scene/xray.js` is untouched.

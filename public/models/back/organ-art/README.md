# Posterior anatomical organ art

27 transparent WebP textures: nine organs × `calm` / `strain` / `dead`.
Repainted with the built-in ImageGen tool on 2026-10-18. No downloaded art.
The former character faces, cream shells, mint interiors and painted fragments
are replaced by volumetric, realistic medical illustrations in natural, slightly
cooled and desaturated tissue colours for the dark teal X-ray film (`#0f231f`).

## View and anatomy

All images show the **posterior aspect**, superior end at the top. In the prone
overhead shot, patient right is screen right / world +x. The textures themselves
are drawn in that orientation; the runtime does not mirror the pictures.

- `lungL`, `lungR`: posterior pleura, oblique fissures, lobes, fine vessels and a
  partly visible medial hilum; the left lung's medial edge faces image right.
- `heart`: posterior atrial base, pulmonary vein entries, coronary sinus and
  posterior interventricular vessels, apex toward image left.
- `liver`: large right lobe on image right, smaller left lobe on image left,
  posterior caval groove and caudate region.
- `stomach`: external posterior serosa, fundus/greater curvature on image left,
  lesser curvature and pyloric outlet on image right; no internal cutaway.
- `spleen`: rounded plum capsule, notched superior margin and medial hilar vessels.
- `kidneyL`, `kidneyR`: convex posterior capsules, medial concavities, short hilar
  vessels and ureters; no renal cross-sections.
- `bowel`: colon frame with haustra/taeniae and irregular small-bowel coils,
  ascending colon on image right and descending colon on image left.

## States and generation

Each healthy organ was generated separately. Two image edits used that organ's
healthy PNG as the reference, locking its posterior view, anatomy, composition,
lighting, silhouette and placement:

- `calm`: healthy tissue, subtle moist highlights and real surface detail.
- `strain`: congested darker/duskier tissue, fuller tense surfaces and slightly
  stronger gloss. The game supplies the large animated inflation.
- `dead`: one localized irregular laceration with parted tissue edges and a small
  dark-red blood trace confined to the tear. The organ stays in one piece: no
  splatter, blood pools, intestinal contents or flying tissue.

Shared generation prompt: “Scientific-educational transparent medical game
texture, realistic three-dimensional anatomy-atlas illustration, posterior view,
entire organ centered, natural slightly cooled/desaturated organ colours, soft
neutral lighting, fine anatomical surface detail, genuine transparent background.
No face, eyes, mouth, sweat, text, symbols, sticker outline, glow or cartoon
elements.” Organ-specific anatomy is listed above. The state edits preserve the
reference and change only the condition described above.

Generated RGBA silhouettes are cropped by alpha, registered to the healthy organ's
footprint and placed on the same padded canvas for all three states. Final WebP
canvases are 560 px high, encoded at quality 90 with alpha preserved. Canvas and
visible footprint dimensions match within each triplet, preventing size jumps
when maps switch. Cropping/resampling/encoding do not repaint the generated art.

## Runtime

`src/back/xray.js` uses the existing anatomical GLB landmarks with explicit
posterior side signs and matching side labels. All 27 maps are uploaded during
loading with `renderer.initTexture`, before the shot. Non-hit organs remain faded.
The existing `ORGAN_BEAT` controls strain → inflation → staggered rupture, followed
by the dead map, a brief cream flash, one coral ring and the existing screen shake.
The former word sprite, coral star and shell fragments are removed. The shared
spine X-ray engine, fracture marker, timing, camera flow and hit logic are retained.

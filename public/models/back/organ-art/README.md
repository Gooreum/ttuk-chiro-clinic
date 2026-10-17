# Painted organ X-ray art

27 transparent WebP textures (converted from PNG, quality 88): nine organs × calm / strain / dead. Generated with the built-in image generation tool on 2026-10-18 using the owner's approved `organs_sheet.png` and `pop_sequence.png` references. No external downloaded art. Left popped lung mirrors the right single-lung painting.

Runtime: `src/back/xray.js` uses anatomical GLB landmarks and camera-facing sprites. The faces, translucent mint anatomy, and thick broken cream shell are painted into each organ. There are no visible clipping-plane pieces. PNGs share a consistent canvas per organ to avoid aspect changes across moods; height 560 pixels. Uploaded to the GPU at load (`renderer.initTexture`).

Prompt set (three atlas variants, cropped to individual organ textures):

- Shared: transparent 3×3 texture atlas; row 1 left lung / right lung / anatomical heart; row 2 liver / stomach / spleen; row 3 left kidney / right kidney / bowel. Match the approved softly rounded painted 3D style, thick ivory cream #f4efe4 shell, luminous translucent mint #7fd1b9 internal branches, subtle coral #ff7a59 edge lighting, a small natural dark teal face. Orthographic front view, complete isolated silhouettes. No labels, text, blood, stickers, or opaque background.
- Calm: intact anatomical organs, two glossy dot eyes and a gentle smile.
- Strain: plump intact organs, squeezed >< eyes, squiggly mouth, two dimensional mint sweat drops, like reference sequence panel 2.
- Dead: like reference sequence panel 3, two or three thick curved shell caps crack apart slightly to expose intact mint internal anatomy; bevelled fracture edges, X X eyes, squiggly mouth, a few nearby small cream fragments. No flat radial wedges and no large painted explosion.

The small animated coral star, ring, extra cream fragments, and Korean `팡!` are rendered separately so their extent and duration stay controlled. The shared spine engine, `ORGAN_BEAT`, and `organZoom` timing are unchanged.

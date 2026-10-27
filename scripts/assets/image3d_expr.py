"""Expression decals for an image-to-3D head (patient11): the head has no blendshapes, so each face is a painted copy
of its front view, shown over the eyes / mouth (src/scene/realAssets.js faceDecals).

  1. blender -b -t 4 -P scripts/assets/image3d_face.py -- <head.glb> front.png     unlit orthographic front view
  2. Codex paints expr_closed / expr_squeeze / expr_smile / expr_open.png over it, same canvas, only brows, eyes, mouth
  3. python3 scripts/assets/image3d_expr.py <dir with the five PNGs> public/models/patient11

Each output keeps only what the painting changed (a feathered mask, so the original face shows through everywhere
else): 1024 px RGBA webp, mapped onto the face by the same projection (MODELS.patient11.face).
"""
import os, sys
import numpy as np
from PIL import Image
from scipy import ndimage

src, out = sys.argv[1], sys.argv[2]
SIZE = 1024   # 512 blurred the eyelids next to the 2048 skin texture
front = np.asarray(Image.open(f"{src}/front.png").convert("RGBA")).astype(np.float32)
# expr_fix.png (optional, patient14): the front view with the scan's flaws painted out, shown all the time under the rest
for name in [n for n in ("fix", "closed", "squeeze", "smile", "open") if os.path.exists(f"{src}/expr_{n}.png")]:
    img = np.asarray(Image.open(f"{src}/expr_{name}.png").convert("RGBA")).astype(np.float32)
    diff = np.abs(img[..., :3] - front[..., :3]).max(axis=2) > 18
    diff = ndimage.binary_opening(diff, iterations=2)                   # drop speckle from the re-encode
    mask = ndimage.binary_dilation(diff, iterations=14)
    mask = ndimage.binary_fill_holes(mask)
    alpha = ndimage.gaussian_filter(mask.astype(np.float32), 7)       # feathered edge
    alpha = np.clip(alpha*1.6, 0, 1)*(front[..., 3]/255)
    rgba = np.dstack([img[..., :3], alpha*255]).clip(0, 255).astype(np.uint8)
    Image.fromarray(rgba, "RGBA").resize((SIZE, SIZE), Image.LANCZOS).save(f"{out}/expr_{name}.webp", quality=88, method=6)
    ys, xs = np.nonzero(mask)
    print(name, "changed px", int(diff.sum()), "box", xs.min(), ys.min(), xs.max(), ys.max())

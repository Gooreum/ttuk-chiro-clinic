# blender -b --factory-startup --python spine_build.py -- BP3D40_DIR BP3D30_DIR OUT_work.blend [BONE_TRIS] [DISC_TRIS]
#
# Builds the bones and discs of the x-ray spine (C1-T8 + discs C2/3-T7/8) into a .blend that spine_cord.py,
# spine_spurs.py and spine_bake.py continue. Whole rebuild of public/models/spine/cervical.glb:
#   B=blender  (5.2)   G="npx --yes @gltf-transform/cli@4.5.1"
#   $B -b --factory-startup --python spine_build.py -- BP3D40_DIR BP3D30_DIR bones.blend 5000 1500
#   $B -b bones.blend  --python spine_cord.py  -- cord.blend
#   $B -b cord.blend   --python spine_spurs.py -- spurs.blend
#   $B -b spurs.blend  --python spine_bake.py  -- baked.blend raw.glb
#   $G meshopt raw.glb ../../public/models/spine/cervical.glb
#   $B -b baked.blend  --python spine_preview.py -- PREVIEW_DIR spine      (optional check renders)
# BP3D40_DIR: the FJ*.obj listed in PARTS from partof_BP3D_4.0_obj_99.zip (dbarchive.biosciencedbc.jp/data/bodyparts3d/
# LATEST/). BP3D30_DIR: the FMA*.obj from BodyParts3D_3.0_obj_95.zip (.../bodyparts3d/20110915/, 520 MB; HTTP range
# requests on the zip's central directory fetch just these 28 files).
#
# Shapes and placement:
#   - placement comes from BodyParts3D 4.0 (partof_BP3D_4.0_obj_99, FJ ids). That release is only 2k tris a bone
#     (99% polygon reduction) and read like "a metal watch strap" on screen.
#   - shape comes from BodyParts3D 3.0 (BodyParts3D_3.0_obj_95, files named by FMA id): 5x the polygons. The 3.0
#     bones sit 9-20 mm higher and the 4.0 cervicals were re-posed (each rotated 1-7 deg), so every 3.0 bone is
#     rigidly registered (ICP, no scale) onto its 4.0 counterpart and ends up exactly where the 4.0 bone was.
#   - model frame identical to the first build: mm -> m, x/y recentred on the bbox centre of the 4.0 C1-C7 meshes,
#     z = 0 at the bottom of the 4.0 C7. Blender frame: +Z skull, -Y anterior, +X patient left. The glTF export
#     (+Y up) turns that into +y skull, +z anterior.
#   - decimated to BONE_TRIS / DISC_TRIS (collapse), smooth shading with sharp edges kept by angle + weighted normals.
import bpy, sys, math
import numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

argv = sys.argv[sys.argv.index("--") + 1:]
dir40, dir30, out_blend = argv[0], argv[1], argv[2]
BONE_TRIS = int(argv[3]) if len(argv) > 3 else 4200
DISC_TRIS = int(argv[4]) if len(argv) > 4 else 1300

# name, BodyParts3D 4.0 element file (placement), BodyParts3D 3.0 FMA file (shape)
PARTS = [
    ("C1", "FJ3176", "FMA12519"), ("C2", "FJ3177", "FMA12520"), ("C3", "FJ3161", "FMA12521"),
    ("C4", "FJ3164", "FMA12522"), ("C5", "FJ3167", "FMA12523"), ("C6", "FJ3170", "FMA12524"),
    ("C7", "FJ3172", "FMA12525"),
    ("T1", "FJ3158", "FMA9165"), ("T2", "FJ3160", "FMA9187"), ("T3", "FJ3163", "FMA9209"),
    ("T4", "FJ3166", "FMA9248"), ("T5", "FJ3169", "FMA9922"), ("T6", "FJ3171", "FMA9945"),
    ("T7", "FJ3173", "FMA9968"), ("T8", "FJ3174", "FMA9991"),
    ("Disc_C2_C3", "FJ3202", "FMA25058"), ("Disc_C3_C4", "FJ3213", "FMA13896"), ("Disc_C4_C5", "FJ3218", "FMA13897"),
    ("Disc_C5_C6", "FJ3219", "FMA13898"), ("Disc_C6_C7", "FJ3220", "FMA13899"), ("Disc_C7_T1", "FJ3221", "FMA13900"),
    ("Disc_T1_T2", "FJ3222", "FMA10458"), ("Disc_T2_T3", "FJ3223", "FMA13495"), ("Disc_T3_T4", "FJ3224", "FMA13500"),
    ("Disc_T4_T5", "FJ3203", "FMA13501"), ("Disc_T5_T6", "FJ3204", "FMA13502"), ("Disc_T6_T7", "FJ3205", "FMA13503"),
    ("Disc_T7_T8", "FJ3206", "FMA13504"),
]
CERV = ["C1", "C2", "C3", "C4", "C5", "C6", "C7"]

bpy.ops.wm.read_factory_settings(use_empty=True)

def load(path, name):
    bpy.ops.wm.obj_import(filepath=path, forward_axis='Y', up_axis='Z')
    sel = bpy.context.selected_objects
    bpy.context.view_layer.objects.active = sel[0]
    if len(sel) > 1: bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    o.name = name; o.data.name = name
    o.data.transform(Matrix.Scale(0.001, 4))          # mm -> m
    return o

def verts(o):
    a = np.empty(len(o.data.vertices)*3); o.data.vertices.foreach_get("co", a); return a.reshape(-1, 3)

ref = {n: load(f"{dir40}/{fj}.obj", n + "_ref") for n, fj, _ in PARTS}

# model frame (identical to the first build, which used these same 4.0 meshes)
allv = np.concatenate([verts(ref[n]) for n in CERV])
cx = (allv[:, 0].min() + allv[:, 0].max())/2
cy = (allv[:, 1].min() + allv[:, 1].max())/2
cz = verts(ref["C7"])[:, 2].min()
print("OFFSET_m %.6f %.6f %.6f" % (cx, cy, cz))
for o in ref.values(): o.data.transform(Matrix.Translation((-cx, -cy, -cz)))

def bbox_c(v): return (v.min(0) + v.max(0))/2

def icp(src, tree, it=50):
    """rigid src->surface. returns 4x4 numpy and residual stats (m)."""
    T = np.eye(4)
    P = src.copy()
    for k in range(it):
        Q = np.array([tree.find_nearest(p)[0] for p in P])
        mp, mq = P.mean(0), Q.mean(0)
        U, S, Vt = np.linalg.svd((P - mp).T @ (Q - mq))
        D = np.eye(3); D[2, 2] = np.sign(np.linalg.det(Vt.T @ U.T))
        R = Vt.T @ D @ U.T
        step = np.eye(4); step[:3, :3] = R; step[:3, 3] = mq - R @ mp
        T = step @ T; P = P @ R.T + step[:3, 3]
        if np.abs(step[:3, 3]).max() < 1e-7 and abs(np.trace(R) - 3) < 1e-9: break
    d = np.array([np.linalg.norm(np.array(tree.find_nearest(p)[0]) - p) for p in P])
    return T, d

objs = {}
for name, fj, fma in PARTS:
    r = ref[name]
    try:
        o = load(f"{dir30}/{fma}.obj", name)
    except Exception as ex:                               # no 3.0 file: fall back to the coarse 4.0 shape
        print("NO30", name, ex)
        o = r.copy(); o.data = r.data.copy(); bpy.context.collection.objects.link(o); o.name = name; o.data.name = name
        objs[name] = o; continue
    tree = BVHTree.FromObject(r, bpy.context.evaluated_depsgraph_get())
    v = verts(o)
    v0 = v + (bbox_c(verts(r)) - bbox_c(v))                # start: bbox centres on top of each other
    T, d = icp(v0[::2], tree)
    M = T.copy(); M[:3, 3] += T[:3, :3] @ (bbox_c(verts(r)) - bbox_c(v))
    o.data.transform(Matrix([list(row) for row in M]))
    ang = math.degrees(math.acos(max(-1, min(1, (np.trace(M[:3, :3]) - 1)/2))))
    print("REG %-11s rot %.2f deg  rms %.2f mm  p95 %.2f mm  max %.2f mm" % (name, ang, 1000*np.sqrt((d**2).mean()),
          1000*np.percentile(d, 95), 1000*d.max()))
    objs[name] = o

def tris(o): return sum(len(p.vertices) - 2 for p in o.data.polygons)

for name, o in objs.items():
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.remove_doubles(threshold=0.00002)
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    target = DISC_TRIS if name.startswith("Disc") else BONE_TRIS
    t0 = tris(o)
    if t0 > target:
        m = o.modifiers.new("dec", 'DECIMATE'); m.ratio = target/t0; m.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier="dec")
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(50 if name.startswith("Disc") else 42))
    wn = o.modifiers.new("wn", 'WEIGHTED_NORMAL'); wn.keep_sharp = True; wn.weight = 50
    bpy.ops.object.modifier_apply(modifier="wn")
    print("TRIS %-11s %6d -> %5d" % (name, t0, tris(o)))

# placement check: new bbox centre vs the 4.0 bone's (the first build's node origins), glTF frame (x, z, -y)
for name in objs:
    a, b = bbox_c(verts(ref[name])), bbox_c(verts(objs[name]))
    g = lambda p: (p[0], p[2], -p[1])
    print("ORIGIN %-11s ref(gltf) %s  new %s  drift %.2f mm" % (name, np.round(g(a), 5), np.round(g(b), 5),
          1000*np.linalg.norm(a - b)))

# node origin = bbox centre of the 4.0 bone (the first build's origins, so C1_Y etc. stay valid). The finer 3.0
# shape's own bbox centre is up to ~1.5 mm off (longer process tips); spine_bake.py exports every part as an empty
# at this origin with the mesh as a child, so meshopt quantization cannot move it.
for name, o in objs.items():
    c = Vector(bbox_c(verts(ref[name])))
    o.data.transform(Matrix.Translation(-c)); o.location = c
    o["origin"] = list(c)
for o in ref.values(): bpy.data.objects.remove(o)
bpy.ops.wm.save_as_mainfile(filepath=out_blend)

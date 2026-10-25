"""Rig a whole image-to-3D patient (image3d_norm.py output) with the MPFB game_engine skeleton, so the side / prone
exporters can pose it like the MPFB patients (bone names, hierarchy and rolls are MPFB's).

The MPFB armature of the closest preset is scaled to the patient's height, then its joints are moved onto the mesh:
the spine onto the torso's cross-sections, knees and ankles onto the legs' centres, and each arm onto its centreline
(cross-sections of the A-pose arm, shoulder to fingertip, split at MPFB's arm proportions). Bones with no target of
their own (fingers, toes, clavicle heads, Root) follow their parent rigidly. Weights: Blender's bone heat on a voxel
remesh of the mesh (the scan's own surface is not manifold, heat fails on it), copied back to the scan by nearest
face, at most 4 bones per vertex.

  blender -b -t 4 --python image3d_rig.py -- <full.glb> <out.blend> <pid> [sheet.png]   (scripts/assets/README.md)
"""
import bpy, importlib, math, sys
from pathlib import Path
import numpy as np
from mathutils import Vector, Matrix

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
A = sys.argv[sys.argv.index("--")+1:]; SRC, OUT, PID = A[:3]; SHEET = A[3] if len(A) > 3 else None
PRESET = {"patient11": "patient07", "patient12": "patient08", "patient13": "patient09", "patient14": "patient06"}[PID]
VOXEL = 0.012
def update(): bpy.context.view_layer.update()

for o in list(bpy.data.objects): bpy.data.objects.remove(o)
bpy.ops.import_scene.gltf(filepath=SRC)
scan = next(o for o in bpy.data.objects if o.type == "MESH"); scan.name = PID
V = np.array([v.co[:] for v in scan.data.vertices])
TALL = V[:, 2].max()

# ---- MPFB armature of the closest preset ----
P = "bl_ext.user_default.mpfb"
HS = importlib.import_module(P+".services.humanservice").HumanService
TS = importlib.import_module(P+".services.targetservice").TargetService
from patients import human_info
st = HS.get_default_deserialization_settings(); st.update(subdiv_levels=0, load_clothes=False)
human = HS.deserialize_from_dict(human_info(PRESET, rig="game_engine", face=False), st)
TS.bake_targets(human); update()
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE"); arm.name = PID+"_rig"
hz = [(human.matrix_world @ v.co).z for v in human.data.vertices]
mz0, mz1 = min(hz), max(hz)
for o in list(bpy.data.objects):
    if o.type == "MESH" and o != scan: bpy.data.objects.remove(o)
arm.parent = None; update()
bpy.context.view_layer.objects.active = arm
for o in bpy.context.selected_objects: o.select_set(False)
arm.select_set(True); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# ---- landmarks on the scan ----
def slab(z, h=0.008): return V[np.abs(V[:, 2]-z) < h]
def runs(P, gap=0.025):
    if not len(P): return []
    P = P[np.argsort(P[:, 0])]; cut = np.where(np.diff(P[:, 0]) > gap)[0]+1
    return np.split(P, cut)
def torso(z):
    """the cross-section run that spans x 0 (the trunk); None below the crotch"""
    r = [c for c in runs(slab(z)) if c[:, 0].min() < 0 < c[:, 0].max()]
    return r[0] if r else None
def spine_at(z, back=0.62):
    """the spine at height z: on the midline (the scan is centred on its neck and symmetric; a trunk section's own centre
       drifts toward whichever arm it merges with), `back` of the way from the front (-y) of the middle strip to its back"""
    c = slab(z); c = c[np.abs(c[:, 0]) < 0.06]
    return Vector((0.0, float(c[:, 1].min()+back*(c[:, 1].max()-c[:, 1].min())), z))
def leg_at(z, s):
    """centre of the leg on side s (+1 = the patient's left = +x) at height z: the innermost run on that side"""
    r = [c for c in runs(slab(z)) if np.median(c[:, 0])*s > 0 and not (c[:, 0].min() < 0 < c[:, 0].max())]
    if r: c = min(r, key=lambda c: abs(np.median(c[:, 0])))
    else: c = slab(z); c = c[(c[:, 0]*s > 0.02) & (c[:, 0]*s < 0.2)]   # wide trousers touch at the knee: that side's half
    return Vector((float(c[:, 0].mean()), float(c[:, 1].mean()), z))
def arm_line(s, z_top):
    """centreline of the A-pose arm on side s, from the first height it hangs free of the trunk down to the fingertips
       (a few centimetres where a section merges with the trunk are skipped)"""
    found = []; z = z_top
    while z > 0.35:
        r = runs(slab(z))
        trunk = [c for c in r if c[:, 0].min() < 0 < c[:, 0].max()]
        side = sorted([c for c in r if np.median(c[:, 0])*s > 0 and not (c[:, 0].min() < 0 < c[:, 0].max())], key=lambda c: -abs(np.median(c[:, 0])))
        if side and (trunk or len(side) >= 2) and len(side[0]) > 4:
            found.append(Vector((float(side[0][:, 0].mean()), float(side[0][:, 1].mean()), z)))
        z -= 0.01
    # the longest run of sections that follow each other (gaps up to 5 cm, sideways steps under 5 cm): the arm, not specks
    best, cur = [], []
    for p in found:
        if cur and (cur[-1].z-p.z > 0.055 or abs(cur[-1].x-p.x) > 0.05): cur = []
        cur.append(p)
        if len(cur) > len(best): best = list(cur)
    return best
def along(poly, d):
    for a, b in zip(poly, poly[1:]):
        l = (b-a).length
        if d <= l: return a.lerp(b, d/l)
        d -= l
    return poly[-1]

# ---- fit ----
k = TALL/(mz1-mz0)
bpy.ops.object.mode_set(mode="EDIT")
eb = arm.data.edit_bones
for b in eb:
    b.head = (b.head-Vector((0, 0, mz0)))*k; b.tail = (b.tail-Vector((0, 0, mz0)))*k
old = {b.name: (b.head.copy(), b.tail.copy(), b.z_axis.copy()) for b in eb}
H = lambda n: old[n][0]; Tl = lambda n: old[n][1]
T = {}
# spine: pelvis .. head on the trunk's sections (the neck and head centred, the trunk toward the back)
sp = [spine_at(H(n).z) for n in ("pelvis", "spine_01", "spine_02", "spine_03")]
nk = spine_at(H("neck_01").z, 0.5); hd = spine_at(H("head").z, 0.5)
chain = [*sp, nk, hd]
for n, a, b in zip(("pelvis", "spine_01", "spine_02", "spine_03", "neck_01"), chain, chain[1:]): T[n] = (a, b)
T["head"] = (hd, hd+Vector((0, 0, (Tl("head")-H("head")).length)))
lines, shoulders = {}, {}
for s, x in ((1, "l"), (-1, "r")):
    knee = leg_at(H("calf_"+x).z, s); ankle = leg_at(H("foot_"+x).z, s)
    T["thigh_"+x] = (None, knee); T["calf_"+x] = (knee, ankle)
    T["foot_"+x] = (ankle, ankle+(Tl("foot_"+x)-H("foot_"+x)))
    sh = H("upperarm_"+x)
    line = lines[x] = arm_line(s, sh.z-0.06)
    assert len(line) > 20, ("arm not found", x, len(line))
    top = np.array([p[:] for p in line[:15]]); fx = np.polyfit(top[:, 2], top[:, 0], 1); fy = np.polyfit(top[:, 2], top[:, 1], 1)
    shoulders[x] = Vector((float(np.polyval(fx, sh.z)), float(np.polyval(fy, sh.z)), sh.z))   # the upper arm's line carried up to the MPFB shoulder height
# the first free sections near the armpit are partial, so one side's line can tip inward or back: both shoulders take
# the mean width
half = np.abs(torso(H("upperarm_l").z)[:, 0]).max()   # the joint stays 5 cm inside the shoulder's skin (patient12's arms hang wide)
sx = min((abs(shoulders["l"].x)+abs(shoulders["r"].x))/2, half-0.05); sy = spine_at(H("upperarm_l").z, 0.5).y   # and sit mid-depth in the trunk
for s, x in ((1, "l"), (-1, "r")):
    sh = H("upperarm_"+x); line = lines[x]
    shoulder = Vector((s*sx, sy, sh.z))
    poly = [shoulder, *line]
    L = sum((b-a).length for a, b in zip(poly, poly[1:]))+0.01
    la = (Tl("upperarm_"+x)-sh).length; lb = (Tl("lowerarm_"+x)-H("lowerarm_"+x)).length
    lc = (Tl("middle_03_"+x)-H("hand_"+x)).length
    elbow = along(poly, L*la/(la+lb+lc)); wrist = along(poly, L*(la+lb)/(la+lb+lc))
    hand_end = along(poly, L*(la+lb+(Tl("hand_"+x)-H("hand_"+x)).length)/(la+lb+lc))
    T["clavicle_"+x] = (None, shoulder); T["upperarm_"+x] = (shoulder, elbow)
    T["lowerarm_"+x] = (elbow, wrist); T["hand_"+x] = (wrist, hand_end)
    print("ARM", x, "len %.3f" % L, "shoulder", tuple(round(c, 3) for c in shoulder), "wrist", tuple(round(c, 3) for c in wrist))
maps = {}
def mapper(h0, nh, R, s): return lambda p: nh+R@((p-h0)*s)
ident = lambda p: p.copy()
order = []
def visit(b): order.append(b); [visit(c) for c in b.children]
for b in eb:
    if not b.parent: visit(b)
for b in order:
    h0, t0, z0 = old[b.name]
    pm = maps.get(b.parent.name, ident) if b.parent else ident
    if b.name in T:
        # no head of its own (thighs, clavicles): it moves with its parent's head, not swung by the parent's turn (the
        # pelvis bone turns a long way onto the spine and swung the hips up to the waist)
        nh, nt = T[b.name]; nh = h0+(b.parent.head-old[b.parent.name][0]) if nh is None else nh
        d0 = t0-h0; d1 = nt-nh
        R = d0.rotation_difference(d1).to_matrix(); maps[b.name] = mapper(h0, nh, R, d1.length/d0.length)
        rz = R@z0
    else:
        maps[b.name] = pm; rz = (pm(h0+z0)-pm(h0)).normalized()
    m = maps[b.name]; b.use_connect = False
    b.head = m(h0); b.tail = m(t0); b.align_roll(rz)
for b in eb: b.use_deform = b.name != "Root"
bpy.ops.object.mode_set(mode="OBJECT")

# ---- weights: bone heat on a voxel proxy, copied to the scan ----
proxy = scan.copy(); proxy.data = scan.data.copy(); proxy.name = "proxy"; bpy.context.scene.collection.objects.link(proxy)
proxy.data.materials.clear()
r = proxy.modifiers.new("vox", "REMESH"); r.mode = "VOXEL"; r.voxel_size = VOXEL
bpy.context.view_layer.objects.active = proxy; bpy.ops.object.modifier_apply(modifier="vox")
print("PROXY", len(proxy.data.vertices))
for o in bpy.context.selected_objects: o.select_set(False)
proxy.select_set(True); arm.select_set(True); bpy.context.view_layer.objects.active = arm
bpy.ops.object.parent_set(type="ARMATURE_AUTO")
empty = sum(1 for v in proxy.data.vertices if not v.groups)
print("PROXY unweighted", empty)
dt = scan.modifiers.new("dt", "DATA_TRANSFER"); dt.object = proxy
dt.use_vert_data = True; dt.data_types_verts = {"VGROUP_WEIGHTS"}; dt.vert_mapping = "POLYINTERP_NEAREST"
dt.layers_vgroup_select_src = "ALL"; dt.layers_vgroup_select_dst = "NAME"
for o in bpy.context.selected_objects: o.select_set(False)
scan.select_set(True); bpy.context.view_layer.objects.active = scan
bpy.ops.object.datalayout_transfer(modifier="dt"); bpy.ops.object.modifier_apply(modifier="dt")
bpy.data.objects.remove(proxy)
# a side's limb bones never move the other half: thighs that touch (patient12) fuse in the voxel proxy, and bending one
# leg then pulled the other's inner thigh along as a sheet
# (faded out across 3 cm either side of the midline: a hard cut there tore the crotch open)
names = {g.index: g.name for g in scan.vertex_groups}
for v in scan.data.vertices:
    for g in v.groups:
        s = 1 if names[g.group].endswith("_l") else -1 if names[g.group].endswith("_r") else 0
        if s: g.weight *= min(1, max(0, (v.co.x*s+0.03)/0.06))
# heat on the fused proxy also hands far bones to a body part (patient12: the back of the upper arm went to the thigh,
# a resting hand to the hip): a weight stays only when its bone runs within 12 cm of the vertex's nearest bone
from mathutils.geometry import intersect_point_line
segs = {b.name: (b.head_local, b.tail_local) for b in arm.data.bones if b.use_deform}
def dist(p, n):
    a, b = segs[n]; q, t = intersect_point_line(p, a, b); return (p-(a if t < 0 else b if t > 1 else q)).length
for v in scan.data.vertices:
    near = min(dist(v.co, n) for n in segs)
    for g in list(v.groups):
        n = names[g.group]
        if n in segs and dist(v.co, n) > near+0.12: scan.vertex_groups[n].remove([v.index])
# scan vertices whose nearest proxy face had no weights (specks the remesh dropped): copy the nearest weighted vertex
from mathutils.kdtree import KDTree
vs = scan.data.vertices; has = lambda v: sum(g.weight for g in v.groups) > 1e-4
done = [v for v in vs if has(v)]; kd = KDTree(len(done))
for i, v in enumerate(done): kd.insert(v.co, i)
kd.balance()
for v in vs:
    if not has(v):
        src = done[kd.find(v.co)[1]]
        for g in src.groups: scan.vertex_groups[g.group].add([v.index], g.weight, "REPLACE")
bpy.ops.object.mode_set(mode="WEIGHT_PAINT")
bpy.ops.object.vertex_group_smooth(group_select_mode="ALL", factor=0.5, repeat=3)   # soften the cuts above
bpy.ops.object.vertex_group_limit_total(group_select_mode="ALL", limit=4)
bpy.ops.object.vertex_group_normalize_all(group_select_mode="ALL", lock_active=False)
bpy.ops.object.mode_set(mode="OBJECT")
print("SCAN unweighted", sum(1 for v in vs if not has(v)))
scan.parent = arm
m = scan.modifiers.new("arm", "ARMATURE"); m.object = arm
bpy.ops.wm.save_as_mainfile(filepath=OUT)
print("SAVED", OUT)

# ---- test sheet: rest, arms down + hips and knees bent + trunk twisted (the side-posture extremes) ----
if SHEET:
    pb = arm.pose.bones
    def rot(name, axis, deg):
        update(); b = pb[name]; h = b.head.copy()
        b.matrix = Matrix.Translation(h)@Matrix.Rotation(math.radians(deg), 4, axis)@Matrix.Translation(-h)@b.matrix
    def down(x, s):
        update(); b = pb["upperarm_"+x]; d = (b.tail-b.head).normalized()
        R = d.rotation_difference(Vector((0.12*s, 0, -1)).normalized()).to_matrix().to_4x4(); h = b.head.copy()
        b.matrix = Matrix.Translation(h)@R@Matrix.Translation(-h)@b.matrix
    sc = bpy.context.scene; sc.render.engine = "BLENDER_WORKBENCH"
    sc.display.shading.light = "STUDIO"; sc.display.shading.color_type = "TEXTURE"
    sc.render.resolution_x, sc.render.resolution_y = 600, 900; sc.render.film_transparent = False
    cam = bpy.data.cameras.new("c"); cam.type = "ORTHO"; cam.ortho_scale = 2.0
    co = bpy.data.objects.new("c", cam); sc.collection.objects.link(co); sc.camera = co
    shots = []
    def shoot(tag):
        for view, loc, rotv in (("front", (0, -3, 0.9), (math.pi/2, 0, 0)), ("side", (3, 0, 0.9), (math.pi/2, 0, math.pi/2))):
            co.location = loc; co.rotation_euler = rotv
            p = str(Path(SHEET).with_suffix(""))+f"_{tag}_{view}.png"; sc.render.filepath = p
            bpy.ops.render.render(write_still=True); shots.append(p)
    shoot("rest")
    down("l", 1); down("r", -1)
    rot("thigh_l", "X", -65); rot("calf_l", "X", 90); rot("thigh_r", "X", -40); rot("calf_r", "X", 60)
    rot("spine_01", "Z", 20); rot("spine_02", "Z", 25)
    shoot("pose")
    print("SHOTS", *shots)

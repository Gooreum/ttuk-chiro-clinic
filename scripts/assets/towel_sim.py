"""Cloth-simulated white terry towel wrapped round each patient's neck in an X (towel traction mode).

   usage: blender -b --python towel_sim.py -- out_raw.glb tex_dir [preview_dir] [patient01,patient04]
     tex_dir: Poly Haven "Terry Cloth" (CC0, https://polyhaven.com/a/terry_cloth) 2k PNGs:
              terry_cloth_diff_2k.png, terry_cloth_nor_gl_2k.png, terry_cloth_ao_2k.png
     preview_dir: renders (game third-person camera + close-up of the X) for patient01 and patient04, slack and taut
     the optional 4th argument limits the run to those patients (quick look; the GLB then holds only them)

   For every patient (public/models/patientNN/patientNN.glb + body.glb):
   - the head and body are imported and placed in the towel's space = the three.js `head` group's local space
     (realAssets.js glbRoot(MODELS[id])): +y face/ceiling, -z crown/therapist, +z feet, x sides (+x = the therapist's
     left hand). Blender works z-up, so a head-local point (x, y, z) sits at Blender (x, -z, y) and gravity (-y
     head-local) is Blender -Z. The exported GLB (+Y up) is then head-local as is: add each mesh under `head`, no transform.
   - a bath towel folded lengthwise into a band (LENGTH x BAND_W, simulated as one sheet, thickened to CLOTH_T after)
     goes round the neck: its middle under the back of the neck below the occiput, each end round one side of the neck,
     the two crossing under the chin in an X (the end that goes to the LEFT fist comes round the RIGHT side and lies
     over the other), then up along the opposite jaw to the therapist's fist beside it (TOWEL_GRIP). A 3.5 cm stretch
     of each end is gathered narrow and pinned in the fist; the rest hangs out of the fist toward the therapist.
   - the wrap is laid out on each patient's measured neck and jaw (ray casts: chin edge, neck ring) twice, slack and
     taut (fists TOWEL_PULL toward -z, the loop drawn snug toward the occiput and the chin). Blender cloth then hangs the
     band on those goal shapes with soft goal springs (hard in the fists, soft on the wrap, none in the loose ends) and
     settles it under gravity against head + neck + shirt colliders, a support under the head and the game's pillow /
     table tops; the goal morphs from slack to taut half way and it settles again. Everything is simulated 10x bigger
     (Blender cloth is unstable at centimetre scale) and without self collision (at this scale it only jitters): after
     the sim a light smoothing, then the upper end is lifted over the lower one wherever they touch and the sheet is
     kept off the skin.
     Knobs for experiments (environment): TOWEL_FRAMES, TOWEL_QUALITY, TOWEL_K, TOWEL_W, TOWEL_SAMPLES, TOWEL_NOSIM
     (goal shapes only), TOWEL_TOP (extra top view), TOWEL_DEBUG (workbench snapshots at frames), TOWEL_DUMP (npz).
   - both states are thickened into a closed band with rounded folded edges (same topology): mesh towel_patientNN,
     rest = slack, morph target `taut`.
   - material towel.cloth: off-white albedo made from the photo terry texture's luminance, its normal map, tiling at
     real scale (one tile = 0.367 m), roughness 0.95, sheen; a greyer flat woven (dobby) band near each end and a hem
     line as vertex colour.
   All the patients' meshes go under one empty `towel_sim` (identity) in out_raw.glb."""
import bpy, sys, os, math
import numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

ARGS = sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else []
OUT = os.path.abspath(ARGS[0] if ARGS else "towel_sim_raw.glb")
TEXSRC = os.path.abspath(ARGS[1]) if len(ARGS) > 1 else ""
PREVIEW = os.path.abspath(ARGS[2]) if len(ARGS) > 2 and ARGS[2] else ""
ONLY = ARGS[3].split(",") if len(ARGS) > 3 else None
OUTDIR = os.path.dirname(OUT)
REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
MODELDIR = os.path.join(REPO, "public", "models")

# realAssets.js
MODELS = {
    "patient01": (1.625, 1.358, -0.062),
    "patient02": (1.6154, 1.3592, -0.0647),
    "patient03": (1.6278, 1.3606, -0.0611),
    "patient04": (1.495, 1.2016, -0.0559),
    "patient05": (1.6113, 1.3546, -0.0749),
    "patient06": (1.6273, 1.3669, -0.0612),
    "patient07": (1.5043, 1.2129, -0.0539),
    "patient08": (1.6227, 1.3551, -0.1139),
    "patient09": (1.4897, 1.1960, -0.0375),
    "patient10": (1.3196, 1.0637, -0.0471),
}
PRIM = (-0.134, 0.142, -0.110)          # crown z, chin z, back y (head-local)
GRIP = (0.118, 0.03, 0.035)             # TOWEL_GRIP, s = +1 (x mirrored for the right fist)
PULL = 0.06                             # TOWEL_PULL toward -z

LENGTH = 1.30       # towel band length (m): a bath towel folded lengthwise keeps its ~1.25 m
BAND_W = float(os.environ.get("TOWEL_W", "0.07"))   # folded band width
CLOTH_T = 0.007     # folded band thickness (three ~2.3 mm terry layers)
STEP = 0.006        # simulation grid spacing
FIST = 0.035        # gathered, pinned length in each fist
GATHER = 0.35       # width left in the fist
GAP = 0.016         # loose start distance of the band's mid-surface from the skin
OVER = 0.012        # extra start distance of the upper end (A) where it lies over the other
TILE = (0.367, 0.3632)   # Poly Haven terry_cloth real size (m)
BASE = np.array([0.949, 0.937, 0.910])   # #f2efe8 (sRGB)
F_SLACK, F_PULL0, F_PULL1, F_TAUT = (int(x) for x in os.environ.get("TOWEL_FRAMES", "80,84,104,150").split(","))
QUALITY = int(os.environ.get("TOWEL_QUALITY", "10"))
SIM_K = float(os.environ.get("TOWEL_K", "10"))


def H(x, y, z):
    """head-local (three.js) -> Blender"""
    return Vector((x, -z, y))


def HL(v):
    """Blender -> head-local"""
    return np.array((v[0], v[2], -v[1]))


def to_bl(a):
    """(n,3) head-local -> Blender"""
    return np.stack([a[:, 0], -a[:, 2], a[:, 1]], 1)


def to_hl(a):
    return np.stack([a[:, 0], a[:, 2], -a[:, 1]], 1)


def head_matrix(pid):
    crown, chin, back = MODELS[pid]
    s = (PRIM[1]-PRIM[0])/(crown-chin)
    P = (0.0, PRIM[2]-back*s, PRIM[0]+crown*s)
    # glTF importer: Blender = (x, -z_g, y_g); three.js glbRoot: rotation.x -pi/2, scale s, position P
    return Matrix.Translation(H(*P)) @ Matrix.Rotation(-math.pi/2, 4, "X") @ Matrix.Scale(s, 4)


def norm(v):
    return v/np.maximum(np.linalg.norm(v, axis=-1, keepdims=True), 1e-12)


def smooth(e0, e1, x):
    t = np.clip((x-e0)/(e1-e0), 0.0, 1.0)
    return t*t*(3-2*t)


# ------------------------------------------------------------------ textures
def make_textures():
    """off-white terry albedo + normal map (1024) from the Poly Haven photo set"""
    def load(name):
        img = bpy.data.images.load(os.path.join(TEXSRC, name))
        img.colorspace_settings.name = "Non-Color"
        img.scale(1024, 1024)
        a = np.empty(1024*1024*4, np.float32)
        img.pixels.foreach_get(a)
        bpy.data.images.remove(img)
        return a.reshape(1024, 1024, 4)
    diff = load("terry_cloth_diff_2k.png")
    ao = load("terry_cloth_ao_2k.png")[..., 0]
    nor = load("terry_cloth_nor_gl_2k.png")
    # the source is blue: its blue channel carries the loop light/shadow; normalise and lay it on an off-white base
    lum = diff[..., 2]*0.75 + diff[..., 1]*0.25
    lum = lum/np.mean(lum)
    shade = np.clip(0.80 + 0.20*lum, 0.55, 1.08)*(0.82 + 0.18*ao/np.mean(ao))
    rgb = np.clip(BASE[None, None, :]*shade[..., None], 0, 1)
    out = {}
    for name, px in (("towel_terry_albedo", np.dstack([rgb, np.ones((1024, 1024))])), ("towel_terry_normal", nor)):
        img = bpy.data.images.new(name, 1024, 1024, alpha=False)
        if name.endswith("normal"):
            img.colorspace_settings.name = "Non-Color"
        img.pixels.foreach_set(px.astype(np.float32).ravel())
        img.filepath_raw = os.path.join(OUTDIR, name + ".png")
        img.file_format = "PNG"
        img.save()
        out[name] = img.filepath_raw
    print("TEXTURES", out)
    return out


def make_material(tex):
    m = bpy.data.materials.get("towel.cloth")
    if m:
        return m
    m = bpy.data.materials.new("towel.cloth")
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    alb = nt.nodes.new("ShaderNodeTexImage")
    alb.image = bpy.data.images.load(tex["towel_terry_albedo"], check_existing=True)
    nimg = nt.nodes.new("ShaderNodeTexImage")
    nimg.image = bpy.data.images.load(tex["towel_terry_normal"], check_existing=True)
    nimg.image.colorspace_settings.name = "Non-Color"
    nmap = nt.nodes.new("ShaderNodeNormalMap")
    vcol = nt.nodes.new("ShaderNodeVertexColor")
    vcol.layer_name = "Col"
    mul = nt.nodes.new("ShaderNodeMix")
    mul.data_type = "RGBA"
    mul.blend_type = "MULTIPLY"
    mul.inputs["Factor"].default_value = 1.0
    nt.links.new(alb.outputs["Color"], mul.inputs["A"])
    nt.links.new(vcol.outputs["Color"], mul.inputs["B"])
    nt.links.new(mul.outputs["Result"], bsdf.inputs["Base Color"])
    nt.links.new(nimg.outputs["Color"], nmap.inputs["Color"])
    nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    bsdf.inputs["Roughness"].default_value = 0.95
    bsdf.inputs["Sheen Weight"].default_value = 1.0
    bsdf.inputs["Sheen Roughness"].default_value = 0.5
    bsdf.inputs["Sheen Tint"].default_value = (0.9, 0.89, 0.86, 1)
    bsdf.inputs["Specular IOR Level"].default_value = 0.3
    return m


# ------------------------------------------------------------------ patient
def load_patient(pid):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    M = head_matrix(pid)
    for f in (f"{pid}/{pid}.glb", f"{pid}/body.glb"):
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=os.path.join(MODELDIR, f))
        for o in bpy.data.objects:
            if o not in before and o.parent is None:
                o.matrix_world = M @ o.matrix_world
    bpy.context.view_layer.update()
    for o in list(bpy.data.objects):          # the importer's bone shape helper
        if o.type == "MESH" and not o.data.materials:
            bpy.data.objects.remove(o)


def world_mesh(pred):
    dg = bpy.context.evaluated_depsgraph_get()
    verts, polys = [], []
    for o in bpy.context.scene.objects:
        if o.type != "MESH" or not o.data.materials or not o.data.materials[0]:
            continue
        if not pred(o.data.materials[0].name):
            continue
        ev = o.evaluated_get(dg)
        me = ev.to_mesh()
        W = [o.matrix_world @ v.co for v in me.vertices]
        keep = {}
        for p in me.polygons:
            # only what the towel can reach: the head end of the body (the rest only slows the collisions)
            if all(-0.30 < -W[i].y < 0.34 and abs(W[i].x) < 0.30 for i in p.vertices):
                polys.append([keep.setdefault(i, len(verts) + len(keep)) for i in p.vertices])
        inv = sorted(keep, key=keep.get)
        verts += [W[i] for i in inv]
        ev.to_mesh_clear()
    return verts, polys


def add_object(name, verts, polys, coll=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], polys)
    me.update()
    ob = bpy.data.objects.new(name, me)
    (coll or bpy.context.scene.collection).objects.link(ob)
    return ob


def colliders():
    skin = lambda n: n.endswith((".body", ".skin"))
    sv, sp = world_mesh(skin)
    cv, cp = world_mesh(lambda n: skin(n) or n.endswith(".shirt"))
    col = add_object("collider", cv, cp)
    # the head rests on something (in the game a pillow a few cm lower): a support under the head and neck, and the
    # pillow/table level under the hanging ends
    def slab(name, x0, x1, y, z0, z1):
        b = 0.03
        pts = [H(x, yy, z) for yy in (y - b, y) for z in (z0, z1) for x in (x0, x1)]
        return add_object(name, pts, [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]])
    sup = slab("support", -0.09, 0.09, -0.113, -0.2, 0.13)
    # the game's pillow (top y -0.16 up to z -0.15) and the table top (y -0.20) under the hanging ends
    pil = slab("pillow", -0.5, 0.5, -0.16, -0.7, -0.15)
    tab = slab("table", -0.5, 0.5, -0.20, -0.15, 0.7)
    for o in (col, sup, pil, tab):
        o.modifiers.new("Collision", "COLLISION")
        o.collision.thickness_outer = 0.001*SIM_K
        o.collision.cloth_friction = 8.0
        o.collision.damping = 0.5
        o.hide_render = True
    return BVHTree.FromPolygons(sv, sp), BVHTree.FromPolygons(cv, cp)


# ------------------------------------------------------------------ the wrap
def catmull(P, n=24):
    """centripetal Catmull-Rom through P (k,3)"""
    P = np.asarray(P, float)
    ext = np.vstack([2*P[0]-P[1], P, 2*P[-1]-P[-2]])
    out = []
    for i in range(len(P)-1):
        p0, p1, p2, p3 = ext[i:i+4]
        t0 = 0.0
        t1 = t0 + max(np.linalg.norm(p1-p0), 1e-6)**0.5
        t2 = t1 + max(np.linalg.norm(p2-p1), 1e-6)**0.5
        t3 = t2 + max(np.linalg.norm(p3-p2), 1e-6)**0.5
        for t in np.linspace(t1, t2, n, endpoint=False):
            a1 = (t1-t)/(t1-t0)*p0 + (t-t0)/(t1-t0)*p1
            a2 = (t2-t)/(t2-t1)*p1 + (t-t1)/(t2-t1)*p2
            a3 = (t3-t)/(t3-t2)*p2 + (t-t2)/(t3-t2)*p3
            b1 = (t2-t)/(t2-t0)*a1 + (t-t0)/(t2-t0)*a2
            b2 = (t3-t)/(t3-t1)*a2 + (t-t1)/(t3-t1)*a3
            out.append((t2-t)/(t2-t1)*b1 + (t-t1)/(t2-t1)*b2)
    out.append(P[-1])
    return np.array(out)


# chin edge override (head-local z): the child's lips make a sharper step in the front profile than his small chin, so
# the steepest-drop search lands on the mouth (z 0.030) and the X would cross his lips
CHIN_EDGE = {"patient10": 0.074}


def landmarks(bvh, pid=None):
    def ray(o, d):
        hit = bvh.ray_cast(H(*o), H(*d))[0]
        return HL(hit) if hit is not None else None
    zs = np.arange(0.02, 0.13, 0.002)
    front = []
    for z in zs:
        h = ray((0, 0.3, z), (0, -1, 0))
        front.append(h[1] if h is not None else np.nan)
    front = np.array(front)
    drop = np.nan_to_num(front[:-4]-front[4:], nan=-1.0)    # the chin's underside: the front profile falls away
    zc = CHIN_EDGE.get(pid, float(zs[int(np.argmax(drop))+2]))
    zn = zc + 0.022
    f = ray((0, 0.3, zn), (0, -1, 0))
    b = ray((0, -0.3, zn), (0, 1, 0))
    yc = 0.5*(f[1]+b[1])
    print(f"LANDMARKS chin edge z {zc:.3f}  neck ring z {zn:.3f}  front y {f[1]:.3f} back y {b[1]:.3f}")
    return zc, zn, yc, ray


def build_start(pid, bvh_skin, bvh_all):
    """The wrap, laid out twice on the same (u along, v across) grid: slack (fists at TOWEL_GRIP) and taut (fists
    TOWEL_PULL toward -z, the loop drawn up snug under the occiput and into the chin). These are the cloth's goal
    shapes: the sim hangs the band on them with soft goal springs (stiff in the fists, none in the loose ends), so
    gravity, the body and the cloth's own stiffness make the sag, folds and the hang of the ends."""
    zc, zn, yc, ray = landmarks(bvh_skin, pid)

    def surf(theta, z, gap):
        """the skin round the neck axis at (angle, z): from the axis outward on the neck (the first skin it meets), from
        outside inward on the jaw (the axis is inside the head there)"""
        d = np.array((math.sin(math.radians(theta)), math.cos(math.radians(theta)), 0.0))
        ax = np.array((0.0, yc, z))
        hit = ray(ax, d) if abs(theta) < 50 or abs(theta) > 85 or z > zc else None
        if hit is None or np.linalg.norm(hit - ax) > 0.11:
            hit = ray(ax + 0.35*d, -d)
        if hit is None:
            hit = ax + 0.06*d
        return hit + d*gap

    NU = int(round(LENGTH/STEP))+1
    NV = 2*int(round(BAND_W/STEP/2))+1       # odd: the export keeps every other column
    u = np.linspace(-LENGTH/2, LENGTH/2, NU)
    v = np.linspace(-BAND_W/2, BAND_W/2, NV)

    def layout(taut):
        # the end that goes round the RIGHT side of the neck (-x), over the other under the chin, up the LEFT jaw (+x)
        # to the LEFT fist (s = +1): (angle round the neck from the front, z, gap, over-layer share)
        dz = -0.014 if taut else 0.0         # drawn toward the crown
        g = 0.0 if taut else 0.003           # slack: a little off the skin (gravity adds the sag)
        WAY = [(180, zn-0.010+dz, 0.0045+g*2, 0.0), (-135, zn+0.004+dz, 0.0045+g*2, 0.0),
               (-95, zn+0.006+dz, 0.0045+g*1.5, 0.5), (-62, zn+0.014+dz, 0.0045+g, 1.0),
               (-30, zc+0.036+dz*0.3, 0.0045+g, 1.0), (0, zc+0.024+dz*0.15, 0.0045+g*0.5, 1.0),
               (30, zc+0.012+dz*0.1, 0.0045, 1.0), (58, zc-0.016+dz*0.3, 0.0045, 1.0), (80, zc-0.040, 0.0045, 1.0)]
        F = lambda s: np.array((s*GRIP[0], GRIP[1], GRIP[2] - (PULL if taut else 0.0)))
        def half(s, over):
            pts = [surf(th if s > 0 else -th, z, gap + (CLOTH_T + 0.0015)*k*over) for th, z, gap, k in WAY]
            df = norm(np.array((s*0.45, 0.05, -0.9)))
            dt = norm(np.array((s*0.45, -0.8, -0.4)))
            G = F(s) + df*FIST/2
            return pts + [F(s) - df*FIST/2, F(s), G, G + dt*0.05, G + dt*0.4]
        A, B = half(+1, 1.0), half(-1, 0.0)
        if os.environ.get("TOWEL_VERBOSE"):
            for k, q in enumerate(A):
                print(f"   A{k} {np.round(q, 3)}")
        ctrl = B[::-1] + A[1:]
        mid_i = len(B)-1
        poly = catmull(ctrl, 30)
        sarc = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(poly, axis=0), axis=1))])
        cs = [sarc[int(np.argmin(np.linalg.norm(poly-c, axis=1)))] for c in ctrl]
        s_mid, s_FB, s_FA = cs[mid_i], cs[mid_i-len(WAY)-1], cs[mid_i+len(WAY)+1]
        print(f"PATH {'taut ' if taut else 'slack'} back->left fist {s_FA-s_mid:.3f} m, back->right fist {s_mid-s_FB:.3f} m, "
              f"loose ends {LENGTH/2-(s_FA-s_mid)-FIST/2:.3f} / {LENGTH/2-(s_mid-s_FB)-FIST/2:.3f} m")
        sa = s_mid + u
        C = np.stack([np.interp(sa, sarc, poly[:, k]) for k in range(3)], 1)
        T = norm(np.gradient(C, axis=0))
        n0 = norm(np.stack([C[:, 0], C[:, 1]-yc, np.zeros(NU)], 1))
        # the band's face: radial (lying on the neck) where the path runs round the neck; where it runs outward
        # (jaw -> fist -> loose end) the radial direction degenerates, so the previous face is carried along
        N = np.zeros_like(C)
        i0 = int(np.argmin(np.abs(u)))
        N[i0] = norm(n0[i0] - np.dot(n0[i0], T[i0])*T[i0])
        for rng in (range(i0+1, NU), range(i0-1, -1, -1)):
            prev = i0
            for i in rng:
                tr = N[prev] - np.dot(N[prev], T[i])*T[i]
                r = n0[i] - np.dot(n0[i], T[i])*T[i]
                a = 0.35*max(0.0, 1.0 - abs(np.dot(n0[i], T[i]))/0.6)**2
                if np.dot(r, tr) < 0:
                    a = 0.0
                N[i] = norm((1-a)*norm(tr) + a*norm(r))
                prev = i
        W = norm(np.cross(T, N))
        # distance along the band from each fist centre (signed: + toward the loose end)
        dA, dB = sa - s_FA, s_FB - sa
        dF = np.where(u > 0, dA, dB)
        # width: flat and full under the neck, bunched where it crosses the throat and runs up the jaw, gathered in
        # the fist, opening again in the loose end; the lost width goes into soft lengthwise folds
        front = smooth(0.05, 0.14, np.abs(u))
        fist = 1 - smooth(FIST/2, FIST/2 + 0.03, np.abs(dF))
        tail = smooth(FIST/2, FIST/2 + 0.08, dF)
        wscale = 1.0 - 0.5*front
        wscale = wscale*(1-fist) + GATHER*fist
        wscale = np.where(dF > 0, GATHER + (0.8 - GATHER)*tail, wscale)
        fold_amp = np.clip((1.0 - wscale)*0.006, 0, 0.0025)
        k = np.linspace(-1, 1, NV)
        nfolds = 1.5
        fold = np.sin((k + 1)*math.pi*nfolds + 0.7)      # across the band
        P = C[:, None, :] + W[:, None, :]*(v[None, :, None]*wscale[:, None, None]) \
            + N[:, None, :]*(fold[None, :, None]*fold_amp[:, None, None])
        # everything at least the gap off the body: radially from the neck axis where the body faces outward (neighbours
        # move together), then along the surface normal (the chin's underside, the shoulders) a few small steps
        want = 0.0045 + np.where(u > 0, (CLOTH_T + 0.0015)*smooth(0.04, 0.12, u), 0.0)
        for i in range(NU):
            for j in range(NV):
                p = P[i, j]
                d = np.array((p[0], p[1]-yc, 0.0))
                r = np.linalg.norm(d)
                if r < 1e-6:
                    continue
                d /= r
                ax = np.array((0.0, yc, p[2]))
                loc, nor, _, _ = bvh_all.ray_cast(H(*(ax + 0.35*d)), H(*(-d)))
                if loc is None or np.dot(HL(nor), d) < 0.6:
                    continue
                rs = np.linalg.norm((HL(loc) - ax)[:2])
                if r < rs + want[i] < r + 0.012:      # deeper: a shoulder, left to the normal push
                    P[i, j] = ax + d*(rs + want[i])
        P0 = P.copy()
        for it in range(5):
            for i in range(NU):
                for j in range(NV):
                    loc, nor, _, _ = bvh_all.find_nearest(H(*P[i, j]), 0.05)
                    if loc is None:
                        continue
                    l, nn = HL(loc), HL(nor)
                    g = np.dot(P[i, j] - l, nn)
                    if g < want[i]:
                        P[i, j] += nn*(want[i] - g)*(0.7 if it < 4 else 1.0)
            # no spikes: at most 12 mm per vertex, and the push field smoothed over the grid
            D = P - P0
            m = np.linalg.norm(D, axis=2, keepdims=True)
            D = D*np.minimum(1.0, 0.012/np.maximum(m, 1e-9))
            for _ in range(2):
                D[1:-1] = 0.5*D[1:-1] + 0.25*(D[:-2] + D[2:])
                D[:, 1:-1] = 0.5*D[:, 1:-1] + 0.25*(D[:, :-2] + D[:, 2:])
            P = P0 + D
        # goal (pin) weights: hard in the fists, soft on the wrap (looser at the back and sides), none in the ends
        wgoal = np.where(np.abs(u) < 0.10, 0.25, 0.35)
        wgoal = np.maximum(wgoal, 0.5*front*(dF < 0))
        wgoal = np.where(np.abs(dF) <= FIST/2 + 1e-6, 1.0, wgoal)
        wgoal = np.where(dF > FIST/2 + 1e-6, 0.0, wgoal)
        return P, wgoal, np.abs(dF) <= FIST/2 + 1e-6

    Ps, wg, fist = layout(False)
    Pt, _, _ = layout(True)
    e1 = np.linalg.norm(np.diff(Ps, axis=0), axis=2).min()
    print(f"GRID {NU} x {NV}, shortest edge {e1*1000:.2f} mm", flush=True)
    return Ps, Pt, np.repeat(wg, NV), np.repeat(fist, NV), u, v, yc


def simulate(P, Pt, wgoal, NU, NV):
    verts = to_bl(P.reshape(-1, 3))
    idx = lambda i, j: i*NV + j
    faces = [[idx(i, j), idx(i+1, j), idx(i+1, j+1), idx(i, j+1)] for i in range(NU-1) for j in range(NV-1)]
    ob = add_object("towel_sim_cloth", verts, faces)
    ob.hide_render = True
    vg = ob.vertex_groups.new(name="pin")
    for i in np.nonzero(wgoal > 0)[0]:
        vg.add([int(i)], float(wgoal[i]), "REPLACE")
    # stiffer where it is wrapped (folded band under tension), soft and floppy in the loose ends
    vb = ob.vertex_groups.new(name="bend")
    for i in np.nonzero(wgoal > 0)[0]:
        vb.add([int(i)], 1.0, "REPLACE")
    ob.shape_key_add(name="Basis")
    kp = ob.shape_key_add(name="pull")
    kp.data.foreach_set("co", to_bl(Pt.reshape(-1, 3)).astype(np.float32).ravel())
    kp.value = 0.0
    kp.keyframe_insert("value", frame=F_PULL0)
    kp.value = 1.0
    kp.keyframe_insert("value", frame=F_PULL1)
    # Blender cloth is unstable at centimetre scale: simulate everything SIM_K times bigger (gravity too)
    for o in (ob, bpy.data.objects["collider"], bpy.data.objects["support"], bpy.data.objects["pillow"], bpy.data.objects["table"]):
        o.scale = (SIM_K, SIM_K, SIM_K)
    bpy.context.scene.gravity = (0, 0, -9.81*SIM_K)
    mod = ob.modifiers.new("Cloth", "CLOTH")
    cs = mod.settings
    cs.quality = QUALITY
    cs.mass = 0.12
    cs.air_damping = 3.0
    cs.tension_stiffness = 40
    cs.compression_stiffness = 40
    cs.shear_stiffness = 15
    cs.bending_stiffness = 0.5
    cs.bending_stiffness_max = 3.0      # a band of folded terry: soft but not limp
    cs.vertex_group_bending = "bend"
    cs.tension_damping = 5
    cs.compression_damping = 5
    cs.shear_damping = 5
    cs.bending_damping = 0.5
    cs.vertex_group_mass = "pin"
    cs.pin_stiffness = 1.0
    cc = mod.collision_settings
    cc.collision_quality = 4
    cc.use_collision = not os.environ.get("TOWEL_NOCOL")
    cc.distance_min = 0.0045*SIM_K
    cc.use_self_collision = bool(os.environ.get("TOWEL_SELF"))   # jitters at this scale: layers are sorted after
    cc.self_distance_min = 0.003*SIM_K
    cc.self_friction = 2
    cc.friction = 8
    sc = bpy.context.scene
    sc.frame_start, sc.frame_end = 1, F_TAUT
    mod.point_cache.frame_start, mod.point_cache.frame_end = 1, F_TAUT
    states = {}
    import time
    t0 = time.time()
    for f in range(1, F_TAUT+1):
        sc.frame_set(f)
        if DEBUG and f in DEBUG:
            debug_shot(ob, f)
        if f % 10 == 0 or f < 4:
            ev = ob.evaluated_get(bpy.context.evaluated_depsgraph_get())
            me = ev.to_mesh()
            a = np.empty(len(me.vertices)*3, np.float32)
            me.vertices.foreach_get("co", a)
            ev.to_mesh_clear()
            moved = np.linalg.norm(a.reshape(-1, 3) - np.array(verts), axis=1)
            print(f"  frame {f} {time.time()-t0:.0f} s, moved mean {moved.mean()*1000:.1f} max {moved.max()*1000:.1f} mm", flush=True)
        if f in (F_SLACK, F_TAUT):
            dg = bpy.context.evaluated_depsgraph_get()
            ev = ob.evaluated_get(dg)
            me = ev.to_mesh()
            a = np.empty(len(me.vertices)*3, np.float32)
            me.vertices.foreach_get("co", a)
            ev.to_mesh_clear()
            states["slack" if f == F_SLACK else "taut"] = to_hl(a.reshape(-1, 3).astype(float)).reshape(NU, NV, 3)
    print(f"SIM {F_TAUT} frames in {time.time()-t0:.0f} s")
    return states


DEBUG = [int(x) for x in os.environ.get("TOWEL_DEBUG", "").split(",") if x]


def debug_shot(ob, f):
    sc = bpy.context.scene
    ev = ob.evaluated_get(bpy.context.evaluated_depsgraph_get())
    tmp = bpy.data.objects.new("dbg", bpy.data.meshes.new_from_object(ev))
    tmp.scale = ob.scale
    tmp.color = (1, 0.5, 0.2, 1)
    sc.collection.objects.link(tmp)
    col = bpy.data.objects["collider"]
    col.hide_render = False
    sc.render.engine = "BLENDER_WORKBENCH"
    sc.display.shading.color_type = "OBJECT"
    sc.render.resolution_x, sc.render.resolution_y = 800, 500
    cam = bpy.data.objects.get("dbgcam") or bpy.data.objects.new("dbgcam", bpy.data.cameras.new("dbgcam"))
    if cam.name not in sc.collection.objects:
        sc.collection.objects.link(cam)
    sc.camera = cam
    for tag, pos, look in (("chin", (0.05, 0.30, 0.42), (0, 0, 0.06)), ("side", (-0.5, 0.15, 0.05), (0, -0.02, 0.06))):
        cam.location = H(*pos)*SIM_K
        cam.rotation_euler = (H(*look) - H(*pos)).to_track_quat("-Z", "Y").to_euler()
        cam.data.angle = math.radians(40)
        cam.data.clip_end = 100
        sc.render.filepath = os.path.join(OUTDIR, f"dbg_{tag}_{f:03d}.png")
        bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(tmp)


def relax(S, pinned, n=3):
    """light Laplacian smoothing of the simulated sheet (grid-scale crinkles and jagged edges), fists kept"""
    S = S.copy()
    for _ in range(n):
        L = S.copy()
        L[1:-1] = 0.5*S[1:-1] + 0.25*(S[:-2] + S[2:])
        L[:, 1:-1] = 0.5*L[:, 1:-1] + 0.25*(L[:, :-2] + L[:, 2:])
        L[pinned] = S[pinned]
        S = 0.5*S + 0.5*L
    return S


def settle_layers(S, u, yc, bvh_body, pinned):
    """The sim runs without self collision (at this scale it only makes the cloth jitter), so the layers are sorted
    here: wherever the end that goes to the left fist (A, u > 0) lies over or close to the other end (B), it is lifted
    off B radially (from the neck's long axis) by the cloth thickness; then every free vertex is kept half a thickness
    plus a margin off the body. Lifts spread smoothly to the neighbours (never lowered)."""
    S = S.copy()
    NU, NV = S.shape[:2]
    def radial(p):
        d = np.array((p[0], p[1]-yc, 0.0))
        return d/max(np.linalg.norm(d), 1e-9)
    for it in range(3):
        bi = np.nonzero(u < -0.04)[0]
        sub = S[bi]
        verts = [Vector(p) for p in sub.reshape(-1, 3)]
        polys = [[a*NV+b, (a+1)*NV+b, (a+1)*NV+b+1, a*NV+b+1] for a in range(len(bi)-1) for b in range(NV-1)]
        bvhB = BVHTree.FromPolygons(verts, polys)
        lift = np.zeros((NU, NV))
        need = CLOTH_T + 0.0012
        for i in np.nonzero(u > 0.04)[0]:
            for j in range(NV):
                if pinned[i, j]:
                    continue
                p = S[i, j]
                d = radial(p)
                hit = bvhB.ray_cast(Vector(p), Vector(d), 0.02)
                if hit[0] is not None:                       # A is under B: over it
                    lift[i, j] = max(lift[i, j], hit[3] + need)
                    continue
                loc, nor, _, dist = bvhB.find_nearest(Vector(p), need)
                if loc is not None:
                    q = np.array(loc)
                    gap = np.dot(p - q, d)
                    if gap < need:
                        lift[i, j] = max(lift[i, j], need - gap)
        for _ in range(10):
            sm = lift.copy()
            sm[1:-1, :] = np.maximum(lift[1:-1, :], 0.6*np.maximum(lift[:-2, :], lift[2:, :]))
            sm[:, 1:-1] = np.maximum(sm[:, 1:-1], 0.6*np.maximum(sm[:, :-2], sm[:, 2:]))
            lift = sm
        lift[u <= 0.0] = 0.0
        lift[pinned] = 0.0
        moved = int((lift > 1e-4).sum())
        for i in range(NU):
            for j in range(NV):
                if lift[i, j] > 0:
                    S[i, j] += radial(S[i, j])*lift[i, j]
        if moved == 0:
            break
        print(f"LAYERS pass {it}: lifted {moved} verts, max {lift.max()*1000:.1f} mm")
    # off the body: half the thickness + 1 mm
    keep = CLOTH_T/2 + 0.001
    for i in range(NU):
        for j in range(NV):
            if pinned[i, j]:
                continue
            loc, nor, _, dist = bvh_body.find_nearest(H(*S[i, j]), 0.05)
            if loc is None:
                continue
            l, nn = HL(loc), HL(nor)
            g = np.dot(S[i, j] - l, nn)
            if g < keep:
                S[i, j] += nn*(keep - g)
    return S


# ------------------------------------------------------------------ thick band
def thicken(S, step=2):
    """sim grid (NU, NV, 3) -> closed band: top, bottom, rounded edges, capped ends. Every `step`-th column across."""
    S = S[:, ::step, :]
    NU, NV, _ = S.shape
    du = np.gradient(S, axis=0)
    dv = np.gradient(S, axis=1)
    n = norm(np.cross(du, dv))
    h = CLOTH_T/2
    top = S + n*h
    bot = S - n*h
    e0 = S[:, 0, :] - norm(dv[:, 0, :])*h*1.15
    e1 = S[:, -1, :] + norm(dv[:, -1, :])*h*1.15
    V = np.concatenate([top.reshape(-1, 3), bot.reshape(-1, 3), e0, e1])
    return V, (NU, NV)


def band_topology(NU, NV, u, v):
    T0, B0, E0, E1 = 0, NU*NV, 2*NU*NV, 2*NU*NV + NU
    t = lambda i, j: T0 + i*NV + j
    b = lambda i, j: B0 + i*NV + j
    faces = []
    for i in range(NU-1):
        for j in range(NV-1):
            faces.append([t(i, j), t(i+1, j), t(i+1, j+1), t(i, j+1)])
            faces.append([b(i, j), b(i, j+1), b(i+1, j+1), b(i+1, j)])
        # rounded edges: top edge -> rim -> bottom edge
        faces.append([t(i, 0), E0 + i, E0 + i + 1, t(i+1, 0)])
        faces.append([E0 + i, b(i, 0), b(i+1, 0), E0 + i + 1])
        faces.append([t(i+1, NV-1), E1 + i + 1, E1 + i, t(i, NV-1)])
        faces.append([E1 + i + 1, b(i+1, NV-1), b(i, NV-1), E1 + i])
    # end caps
    for i in (0, NU-1):
        faces.append([E0 + i] + [t(i, j) for j in range(NV)] + [E1 + i] + [b(i, j) for j in range(NV-1, -1, -1)])
    # uv (real scale) and vertex colour (dobby bands, hems)
    uu = np.concatenate([np.repeat(u, NV), np.repeat(u, NV), u, u])
    vv = np.concatenate([np.tile(v, NU), np.tile(v, NU), np.full(NU, v[0]-CLOTH_T*0.6), np.full(NU, v[-1]+CLOTH_T*0.6)])
    from_end = LENGTH/2 - np.abs(uu)
    dobby = smooth(0.055, 0.058, from_end)*(1-smooth(0.087, 0.090, from_end))
    hem = 1-smooth(0.010, 0.012, from_end)
    shade = 1.0 - 0.07*dobby - 0.04*hem
    return faces, np.stack([uu/TILE[0], vv/TILE[1]], 1), shade


def make_band(name, slack, taut, u, v, mat):
    Vs, (NU, NV) = thicken(slack)
    Vt, _ = thicken(taut)
    vv = v[::2]
    faces, uv, shade = band_topology(NU, NV, u, vv)
    # winding: the grid's faces are consistent by construction (top along du x dv = +n, bottom reversed); only each
    # group's overall sense is checked (majority vote against the mid-surface), never face by face
    mid = slack[:, ::2, :]
    midf = mid.reshape(-1, 3)
    groups = {}
    for f in faces:
        groups.setdefault(len(f) > 4 or (min(f) >= 2*NU*NV) or any(x >= 2*NU*NV for x in f), []).append(f)
    def outward(f):
        p = Vs[f]
        nrm = np.zeros(3)
        for k in range(len(f)):
            nrm += np.cross(p[k], p[(k+1) % len(f)])
        c = p.mean(0)
        if len(f) > 4:
            end = 0 if np.linalg.norm(c - mid[0].mean(0)) < np.linalg.norm(c - mid[-1].mean(0)) else -1
            out = mid[end].mean(0) - mid[1 if end == 0 else -2].mean(0)
        else:
            out = c - midf[int(np.argmin(np.linalg.norm(midf - c, axis=1)))]
        return np.dot(nrm, out)
    fixed = []
    tb = [f for f in faces if len(f) == 4 and all(x < 2*NU*NV for x in f)]
    tops = [f for f in tb if f[0] < NU*NV]
    bots = [f for f in tb if f[0] >= NU*NV]
    rims = [f for f in faces if len(f) == 4 and any(x >= 2*NU*NV for x in f)]
    caps = [f for f in faces if len(f) > 4]
    for grp in (tops, bots, rims):
        votes = np.array([outward(f) for f in grp[::7]])
        flip = (votes < 0).sum() > (votes > 0).sum()
        print(f"  winding group of {len(grp)}: {int((votes > 0).sum())} out / {int((votes < 0).sum())} in{' -> flipped' if flip else ''}")
        fixed += [f[::-1] for f in grp] if flip else grp
    fixed += [f if outward(f) > 0 else f[::-1] for f in caps]
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(p) for p in to_bl(Vs)], [], fixed)
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    uvl = me.uv_layers.new(name="UVMap")
    loops_v = np.empty(len(me.loops), np.int32)
    me.loops.foreach_get("vertex_index", loops_v)
    uvl.data.foreach_set("uv", uv[loops_v].astype(np.float32).ravel())
    col = me.color_attributes.new("Col", "BYTE_COLOR", "POINT")
    c = np.stack([shade, shade, shade*0.995, np.ones_like(shade)], 1)
    col.data.foreach_set("color", c.astype(np.float32).ravel())
    me.shade_smooth()
    me.materials.append(mat)
    ob.shape_key_add(name="Basis")
    k = ob.shape_key_add(name="taut")
    k.data.foreach_set("co", to_bl(Vt).astype(np.float32).ravel())
    k.value = 0.0
    print(f"MESH {name}: {len(me.vertices)} verts, {sum(len(p.vertices)-2 for p in me.polygons)} triangles")
    return ob


def clearance(name, V, bvh_skin):
    """signed distance of the towel's surface verts to the skin (negative = inside)"""
    d = []
    for p in V:
        loc, nor, _, dist = bvh_skin.find_nearest(H(*p))
        if loc is None:
            continue
        d.append(np.dot(p - HL(loc), HL(nor)))
    d = np.array(d)
    print(f"CLEAR {name}: min {d.min()*1000:.1f} mm, inside {int((d < 0).sum())} of {len(d)} verts, < 1 mm {int((d < 0.001).sum())}")


# ------------------------------------------------------------------ preview
def preview(pid, ob):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = int(os.environ.get("TOWEL_SAMPLES", "48"))
    sc.cycles.use_denoising = True
    sc.render.resolution_x, sc.render.resolution_y = 1200, 600
    sc.view_settings.view_transform = "AgX" if "AgX" in [i.identifier for i in sc.view_settings.bl_rna.properties["view_transform"].enum_items] else "Filmic"
    world = bpy.data.worlds.new("w")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.42, 0.45, 0.47, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.7
    sc.world = world
    def light(name, kind, loc, energy, size=0.5):
        L = bpy.data.lights.new(name, kind)
        L.energy = energy
        if kind == "AREA":
            L.size = size
        o = bpy.data.objects.new(name, L)
        sc.collection.objects.link(o)
        o.location = loc
        o.rotation_euler = (Vector((0, 0, 0)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
        return o
    light("key", "AREA", H(-0.4, 1.0, 0.5), 120, 0.8)
    light("fill", "AREA", H(0.6, 0.5, -0.3), 35, 1.0)
    # a dark table top under the head so the white towel reads against something
    # the game's pillow and table top (the colliders), dark so the white towel reads against them
    tm = bpy.data.materials.new("table")
    tm.use_nodes = True
    tm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.05, 0.12, 0.11, 1)
    for nm in ("pillow", "table"):
        o = bpy.data.objects[nm]
        o.scale = (1, 1, 1)
        o.hide_render = False
        o.data.materials.append(tm)
    if "towel_sim_cloth" in bpy.data.objects:
        bpy.data.objects["towel_sim_cloth"].hide_render = True
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    sc.collection.objects.link(cam)
    sc.camera = cam
    cam.data.sensor_fit = "VERTICAL"
    os.makedirs(PREVIEW, exist_ok=True)
    def shoot(pos, look, fov, tag):
        cam.location = H(*pos)
        cam.rotation_euler = (H(*look) - H(*pos)).to_track_quat("-Z", "Y").to_euler()
        cam.data.angle = math.radians(fov)
        for st in ("slack", "taut"):
            ob.data.shape_keys.key_blocks["taut"].value = 1.0 if st == "taut" else 0.0
            sc.render.filepath = os.path.join(PREVIEW, f"{pid}_{tag}_{st}.png")
            bpy.ops.render.render(write_still=True)
    # game third-person camera: world (-0.34, 1.62, 0.74) -> (0, 1.06, -0.1); head-local origin at world (0, 1.04, 0.1)
    shoot((-0.34, 0.58, 0.64), (0.0, 0.02, -0.2), 50, "game")
    # close-up of the X under the chin, from the chest looking up at it
    shoot((0.05, 0.22, 0.40), (0.0, 0.0, 0.08), 32, "chin")
    # from the side (right fist side), to see the end in the fist and the hanging tail
    shoot((-0.45, 0.18, 0.05), (0.0, -0.02, 0.06), 34, "side")
    if os.environ.get("TOWEL_TOP"):
        shoot((0.0, 0.45, 0.13), (0.0, 0.0, 0.09), 36, "top")


# ------------------------------------------------------------------ main
def main():
    pids = [p for p in MODELS if not ONLY or p in ONLY]
    os.makedirs(OUTDIR, exist_ok=True)
    tex = None
    results = {}
    for pid in pids:
        print("=====", pid)
        load_patient(pid)
        if tex is None:
            tex = make_textures()
        bvh_skin, bvh_all = colliders()
        P, Pt, wgoal, pin, u, v, yc = build_start(pid, bvh_skin, bvh_all)
        NU, NV = P.shape[:2]
        st = simulate(P, Pt, wgoal, NU, NV) if not os.environ.get("TOWEL_NOSIM") else {"slack": P, "taut": Pt}
        if os.environ.get("TOWEL_DUMP"):
            np.savez(os.path.join(OUTDIR, f"{pid}_raw.npz"), u=u, **st, goal_slack=P, goal_taut=Pt)
        st = {k: settle_layers(relax(S, pin.reshape(NU, NV)), u, yc, bvh_all, pin.reshape(NU, NV)) for k, S in st.items()}
        if os.environ.get("TOWEL_DUMP"):
            np.savez(os.path.join(OUTDIR, f"{pid}_settled.npz"), u=u, **st)
        results[pid] = (st["slack"], st["taut"], u, v)
        mat = make_material(tex)
        ob = make_band(f"towel_{pid}", st["slack"], st["taut"], u, v, mat)
        Vs, _ = thicken(st["slack"])
        Vt, _ = thicken(st["taut"])
        clearance(f"{pid} slack", Vs, bvh_skin)
        clearance(f"{pid} taut", Vt, bvh_skin)
        for nm, S in st.items():
            bad = []
            for i in range(NU):
                for j in range(NV):
                    loc, nor, _, _ = bvh_skin.find_nearest(H(*S[i, j]), 0.05)
                    if loc is not None and np.dot(S[i, j] - HL(loc), HL(nor)) < 0:
                        bad.append((round(float(u[i]), 2), j))
            if bad:
                print(f"INSIDE {pid} {nm} mid-surface: {len(bad)} verts at u {sorted(set(b[0] for b in bad))[:12]}")
        for nm, S in st.items():
            for s, lab in ((1, "left"), (-1, "right")):
                i = np.argmin(np.abs(u - s*(LENGTH/2)))
                print(f"END {pid} {nm} {lab} tail tip head-local {np.round(S[i, NV//2], 3)}")
        if PREVIEW and pid in os.environ.get("TOWEL_PREVIEW_IDS", "patient01,patient04").split(","):
            if "towel_sim_cloth" in bpy.data.objects:
                bpy.data.objects["towel_sim_cloth"].hide_viewport = True
            preview(pid, ob)
    # export: a fresh scene with the five meshes under one empty
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mat = make_material(tex)
    root = bpy.data.objects.new("towel_sim", None)
    bpy.context.scene.collection.objects.link(root)
    for pid, (slack, taut, u, v) in results.items():
        ob = make_band(f"towel_{pid}", slack, taut, u, v, mat)
        ob.parent = root
    bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_yup=True, export_apply=False,
                              export_morph=True, export_morph_normal=True, export_animations=False,
                              export_vertex_color="ACTIVE", export_image_format="AUTO")
    print("WROTE", OUT)


if not os.environ.get("TOWEL_NOMAIN"):
    main()

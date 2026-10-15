"""White bath towel GLB for the towel-traction mode, built from an empty scene (no source assets).
   - a bath towel folded lengthwise in thirds (letter fold) into a band: LENGTH x BAND_W, three ~5 mm cloth layers whose
     cross-section is a Z: bottom layer -> fold on one long edge -> middle layer -> fold on the other edge -> top layer.
     The free edges of the bottom/top layers sit a few mm inside the folds, so each long side shows a soft rounded fold
     with a layer edge stacked on it (not a tube). Over the last FLARE m at each end the fold loosens and the layers fan
     out to ~END_W wide (the outer flaps fall short of the folds so the layers show, the corners droop, fan pleats), ending
     in a 1 cm hem.
   - wrinkles: gentle long folds (bend, bow, twist along the length), soft dents across the band and puffy layers in the
     geometry; fine creases + terry loops + dobby border + hem in a baked tangent-space normal map
   - colour: near-white base (#f6f3ec), greyish dobby band DOBBY_W wide DOBBY_AT from each end, hem, all x ambient
     occlusion baked with Cycles (layers shade each other in the folds). Principled, roughness 1, sheen
   - rig: armature `towel` at the origin (identity), root bone `towel_root` + `towel_00`..`towel_24` evenly along the
     length, all direct children of the root. Every bone points up (+Z in Blender = glTF +Y) with its X axis along the
     length, so in glTF every joint has identity rest rotation and only a translation (x, 0, 0)
   - weights: linear blend between the two nearest bones by the vertex position along the length
   - axes (glTF, Y-up): length along +X (towel_00 at x=-LENGTH/2), width along Z, thickness along Y (top face +Y)
   usage: blender -b --python towel_build.py -- out.glb [bake_size=1024] [preview_dir]
   (the preview renders: rest towel and the towel posed as a U sling around a 13 cm cylinder)"""
import bpy, bmesh, sys, os, math, random
import numpy as np
from mathutils import Vector, Matrix

ARGS = sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else []
OUT = os.path.abspath(ARGS[0] if ARGS else "towel_raw.glb")
BAKE = int(ARGS[1]) if len(ARGS) > 1 else 1024
PREVIEW = ARGS[2] if len(ARGS) > 2 else ""
OUTDIR = os.path.dirname(OUT)

LENGTH = 0.95       # m along the length (glTF +X)
BAND_W = 0.11       # folded band width
END_W = 0.20        # width the ends fan out to
FLARE = 0.12        # m at each end where the fold opens
CLOTH_T = 0.005     # terry cloth thickness
DOBBY_T = 0.0042    # the woven border band is thinner (no loops)
HEM_T = 0.0062      # the turned hem is thicker
HEM = 0.010
DOBBY_AT, DOBBY_W = 0.06, 0.03
R0 = 0.0028         # fold radius = half the spacing between layer centrelines (folded)
R1 = 0.0062         # ... at the open ends
DROOP = 0.012       # m the outer corners sag at the very ends
PLEAT = 0.0045      # fan pleat amplitude at the very ends
PLEAT_PH = {-1: 0.4, 0: 2.3, 1: 4.4}
N_BONES = 25
N_SEG = 72          # rings along the length
NS = 5              # intervals per layer across the width
NA = 4              # intervals per fold arc
AO_MIX = 0.55
BASE = (0.965, 0.953, 0.925)     # #f6f3ec
rng = random.Random(11)

bpy.ops.wm.read_factory_settings(use_empty=True)
HALF = LENGTH/2

def smooth(e0, e1, x):
    t = min(1.0, max(0.0, (x-e0)/(e1-e0)))
    return t*t*t*(t*(t*6-15)+10)

# ---- low-frequency shape along the length (shared by all layers so they wrinkle together) ----
def waves(n, amp, lmin, lmax):
    return [(amp*rng.uniform(0.5, 1.0), 2*math.pi/rng.uniform(lmin, lmax), rng.uniform(0, 2*math.pi)) for _ in range(n)]
W_Z = waves(3, 0.0032, 0.22, 0.55)     # long folds, up/down
W_Y = waves(2, 0.0030, 0.30, 0.70)     # sideways bow
W_TW = waves(3, 0.075, 0.18, 0.45)     # twist (radians)
W_E1 = waves(2, 0.0018, 0.08, 0.20)    # free edge waviness
W_E2 = waves(2, 0.0018, 0.08, 0.20)
W_PUFF = waves(3, 0.0007, 0.06, 0.16)
def ev(ws, x): return sum(a*math.sin(k*x+p) for a, k, p in ws)
# soft dents across the band (angled), depth in m, width in m
DENTS = [(rng.uniform(-0.40, 0.40), rng.uniform(0.0012, 0.0030), rng.uniform(0.008, 0.016), rng.uniform(-0.5, 0.5))
         for _ in range(11)]

def open_at(x):
    t = min(1.0, max(0.0, (FLARE-(HALF-abs(x)))/(FLARE-0.012)))
    return t**1.25*(1.6-0.6*t)          # close to linear: the end fans out like a wedge, no bulb

def thick_at(x):
    d = HALF-abs(x)
    t = CLOTH_T
    t += (DOBBY_T-CLOTH_T)*smooth(DOBBY_AT+DOBBY_W+0.004, DOBBY_AT+DOBBY_W, d)*smooth(DOBBY_AT-0.004, DOBBY_AT, d)
    t += (HEM_T-t)*smooth(HEM+0.003, HEM, d)
    return t

def profile(x):
    """centreline of the Z-folded cloth across the band at x: list of (y, z, ty, tz, layer), layer -1/0/+1"""
    o = open_at(x)
    r = R0+(R1-R0)*o
    w = (BAND_W-2*r-CLOTH_T)+(END_W-(BAND_W-2*r-CLOTH_T))*o
    e1 = 0.0042+ev(W_E1, x)+0.022*o
    e2 = 0.0042+ev(W_E2, x)+0.030*o
    sag = 0.003*o
    pl = PLEAT*o**1.3
    pts = []
    def straight(y0, y1, z, layer, first):
        ph = PLEAT_PH[layer]+18*x
        for j in range(0 if first else 1, NS+1):
            f = j/NS; y = y0+(y1-y0)*f
            # opened flaps bow away from the middle layer; fan pleats (flutes along the length) grow toward the end
            zz = z+layer*sag*math.sin(math.pi*f)+pl*math.sin(2*math.pi*1.25*f+ph)*math.sin(math.pi*f)**0.5
            dz = (layer*sag*math.pi*math.cos(math.pi*f)+pl*2*math.pi*1.25*math.cos(2*math.pi*1.25*f+ph))/(y1-y0)
            d = 1 if y1 > y0 else -1
            n = math.hypot(1, dz)
            pts.append((y, zz, d/n, dz*d/n, layer))
    def arc(cy, cz, side):
        for j in range(1, NA+1):
            ph = -math.pi/2+math.pi*j/NA
            y = cy+side*r*math.cos(ph); z = cz+r*math.sin(ph)
            ty = -side*r*math.sin(ph); tz = r*math.cos(ph); n = math.hypot(ty, tz)
            pts.append((y, z, ty/n, tz/n, 0))
    straight(-w/2+e1, w/2, -2*r, -1, True)
    arc(w/2, -r, 1)
    straight(w/2, -w/2, 0.0, 0, False)
    arc(-w/2, r, -1)
    straight(-w/2, w/2-e2, 2*r, 1, False)
    # toward the ends the loose cloth droops at its outer corners (soft fabric, not a stiff paddle)
    dr = DROOP*o**2
    for i, (y, z, ty, tz, l) in enumerate(pts):
        q = 2*y/w
        pts[i] = (y, z-dr*q*q, ty, tz-dr*2*q*2/w*ty, l)
    return pts, w

K = 3*NS+2*NA+1                 # centreline samples
RING = 2*K+2                    # side A (K), cap at the top layer's free edge, side B reversed (K), cap at the bottom's

def ring(x):
    pts, w = profile(x)
    t = thick_at(x)
    A = []; B = []
    puff = 0.0018+ev(W_PUFF, x)
    for y, z, ty, tz, layer in pts:
        ny, nz = -tz, ty
        # layers puff a little away from the middle across their width
        bulge = layer*puff*max(0.0, 1-(2*y/max(w, 1e-6))**2)
        A.append((y+ny*t/2, z+nz*t/2+bulge)); B.append((y-ny*t/2, z-nz*t/2+bulge))
    y, z, ty, tz, _ = pts[-1]; capE = (y+ty*t*0.55, z+tz*t*0.55)
    y, z, ty, tz, _ = pts[0];  capS = (y-ty*t*0.55, z-tz*t*0.55)
    loop = A+[capE]+B[::-1]+[capS]
    # global wrinkles: twist, bow, long folds, dents
    a = ev(W_TW, x)*(1-0.6*open_at(x))
    ca, sa = math.cos(a), math.sin(a)
    dy = ev(W_Y, x); dz = ev(W_Z, x)
    out = []
    for y, z in loop:
        y2 = y*ca-z*sa; z2 = y*sa+z*ca
        for x0, depth, width, ang in DENTS:
            q = (x-x0-y2*math.tan(ang))/width
            z2 -= depth*math.exp(-q*q)*(1-open_at(x0))
        out.append((x, y2+dy, z2+dz))
    return out

# ring positions: uniform, plus rings at the hem edge so the hem step stays crisp
xs = [-HALF+LENGTH*i/N_SEG for i in range(N_SEG+1)]
for s in (-1, 1):
    xs += [s*(HALF-HEM+0.0015), s*(HALF-HEM-0.0015)]
xs = sorted(xs)
rings = [ring(x) for x in xs]

# ---- UVs: u along the length, v = arc length around the ring (same metric everywhere), caps in thin strips at u edges ----
def perim(rg):
    d = [0.0]
    for i in range(1, RING+1):
        p, q = rg[i-1], rg[i % RING]
        d.append(d[-1]+math.dist(p[1:], q[1:]))
    return d
arcs = [perim(rg) for rg in rings]
PS = np.array([a[-1] for a in arcs]); XS = np.array(xs)
U0, U1, V0, V1 = 0.012, 0.988, 0.006, 0.994
def u_of(x): return U0+(U1-U0)*(x+HALF)/LENGTH
def v_of(arc, P): return V0+(V1-V0)*arc/P            # every ring fills the v range (the ends stretch ~1.6x)

bm = bmesh.new()
uvl = bm.loops.layers.uv.new("UVMap")
V = [[bm.verts.new(p) for p in rg] for rg in rings]
bm.verts.ensure_lookup_table()
def face(vs, uvs):
    f = bm.faces.new(vs)
    for lp, uv in zip(f.loops, uvs): lp[uvl].uv = uv
    return f
for k in range(len(rings)-1):
    u0, u1 = u_of(xs[k]), u_of(xs[k+1])
    a0, a1 = arcs[k], arcs[k+1]
    for i in range(RING):
        j = (i+1) % RING
        face([V[k][i], V[k+1][i], V[k+1][j], V[k][j]],
             [(u0, v_of(a0[i], a0[-1])), (u1, v_of(a1[i], a1[-1])), (u1, v_of(a1[i+1], a1[-1])), (u0, v_of(a0[i+1], a0[-1]))])
# end caps: bridge side A to side B across the cloth thickness (the cut hem edge)
for k, uA, uB in ((0, 0.001, 0.009), (len(rings)-1, 0.999, 0.991)):
    a = arcs[k]; vv = lambda i: v_of(a[i], a[-1])
    for i in range(K-1):
        bi, bj = 2*K-i, 2*K-i-1
        face([V[k][i], V[k][i+1], V[k][bj], V[k][bi]], [(uA, vv(i)), (uA, vv(i+1)), (uB, vv(i+1)), (uB, vv(i))])
    face([V[k][K-1], V[k][K], V[k][K+1]], [(uA, vv(K-1)), ((uA+uB)/2, vv(K)), (uB, vv(K-1))])
    face([V[k][0], V[k][2*K], V[k][2*K+1]], [(uA, vv(0)), (uB, vv(0)), ((uA+uB)/2, vv(0)+0.002)])
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
me = bpy.data.meshes.new("towel")
bm.to_mesh(me); bm.free()
for p in me.polygons: p.use_smooth = True
towel = bpy.data.objects.new("towel", me)
bpy.context.scene.collection.objects.link(towel)
print("TRIS", sum(len(p.vertices)-2 for p in me.polygons), "VERTS", len(me.vertices))

# ================= textures (numpy) =================
N = BAKE
def uv_grid(n):
    c = (np.arange(n)+0.5)/n
    return np.meshgrid(c, c)        # (u, v), arrays indexed [v row, u col]
def x_of_u(u): return (u-U0)/(U1-U0)*LENGTH-HALF
def P_of_u(u): return np.interp(x_of_u(u), XS, PS)
def c_of_v(v, u): return ((v-V0)/(V1-V0)-0.5)*P_of_u(u)     # metres around the ring, 0 at its middle

def hash2(i, j, s):
    h = np.sin(i*127.1+j*311.7+s*74.7)*43758.5453
    return h-np.floor(h)

def terry(x, c):
    """rows of soft loops (pitch 3.4 mm, alternate rows offset), jittered heights; metres"""
    P = 0.0034
    gx = x/P; gc = c/P
    out = np.zeros_like(x)
    for di in (-1, 0, 1):
        for dj in (-1, 0, 1):
            j = np.floor(gc)+dj
            i = np.floor(gx-0.5*(j % 2))+di
            cx = (i+0.5*(j % 2)+0.5+0.5*(hash2(i, j, 1)-0.5))*P
            cc = (j+0.5+0.5*(hash2(i, j, 2)-0.5))*P
            hgt = 0.55+0.9*hash2(i, j, 3)
            rad = 0.0010+0.0005*hash2(i, j, 4)
            d2 = ((x-cx)**2+(c-cc)**2)/(rad**2)
            out = np.maximum(out, hgt*np.exp(-d2))
    return out*0.00027

def blur(a, s):
    if s <= 0: return a
    r = int(math.ceil(s*3)); k = np.exp(-0.5*(np.arange(-r, r+1)/s)**2); k /= k.sum()
    a = np.apply_along_axis(lambda m: np.convolve(np.pad(m, r, mode="wrap"), k, "valid"), 1, a)
    return np.apply_along_axis(lambda m: np.convolve(np.pad(m, r, mode="edge"), k, "valid"), 0, a)

CREASES = []
for _ in range(170):
    CREASES.append((rng.uniform(-0.47, 0.47), rng.uniform(-0.5, 0.5)*0.75,
                    rng.gauss(0, 0.5), rng.uniform(0.02, 0.10), rng.uniform(0.002, 0.005), rng.uniform(0.00015, 0.0006)))

def height_and_color(n):
    uu, vv = uv_grid(n)
    x = x_of_u(uu); c = c_of_v(vv, uu)
    d = HALF-np.abs(x)
    in_dobby = ((d > DOBBY_AT) & (d < DOBBY_AT+DOBBY_W)).astype(float)
    in_hem = (d < HEM).astype(float)
    loops = 1-np.clip(in_dobby+in_hem, 0, 1)
    # terry supersampled 2x then averaged, so the loops never alias into speckle
    ss = 2; uu2, vv2 = uv_grid(n*ss)
    t2 = terry(x_of_u(uu2), c_of_v(vv2, uu2)).reshape(n, ss, n, ss).mean(axis=(1, 3))
    h = t2*loops
    # dobby: flat woven band with small raised blocks and raised selvedge ribs at its two borders
    blk = (np.sin(x/0.0016*math.pi)*np.sin(c/0.0022*math.pi) > 0).astype(float)
    h += in_dobby*(0.00005*blk)
    for e in (DOBBY_AT, DOBBY_AT+DOBBY_W):
        h += 0.00022*np.exp(-((d-e)/0.0011)**2)
    # hem: rolled edge, a stitch groove at its inner edge
    h += in_hem*0.00025*np.sin(np.clip(d/HEM, 0, 1)*math.pi)**0.5
    h -= 0.00012*np.exp(-((d-HEM+0.0012)/0.0005)**2)
    # creases: valley with soft shoulders, tapered along their length
    for x0, c0, a, L, wd, dep in CREASES:
        da, dc = math.sin(a), math.cos(a)        # mostly across the band (along c)
        px = x-x0; pc = c-c0
        along = px*da+pc*dc; perp = px*dc-pc*da
        win = np.clip(1-(2*along/L)**2, 0, 1)**2
        q = (perp/wd)**2
        h -= dep*win*(1-0.9*q)*np.exp(-q)
    # broad soft lumps
    for _ in range(8):
        k1 = rng.uniform(40, 120); k2 = rng.uniform(40, 120); p = rng.uniform(0, 6.3)
        h += 0.00006*np.sin(k1*x+k2*c*rng.choice((-1, 1))+p)
    h = blur(h, 0.6)
    # base colour (sRGB): white terry, greyish dobby band with a faint woven check, hem + stitch line
    col = np.ones((n, n, 3))*np.array(BASE)
    tone = 1+0.03*(t2/0.00027-0.4)*loops
    tone *= 1-in_dobby*(0.085+0.03*blk)
    for e in (DOBBY_AT, DOBBY_AT+DOBBY_W):
        tone *= 1-0.06*np.exp(-((d-e-np.sign(DOBBY_AT+DOBBY_W/2-e)*0.0025)/0.0007)**2)
    tone *= 1-0.04*in_hem
    tone *= 1-0.14*np.exp(-((d-HEM+0.0012)/0.0005)**2)
    col *= tone[..., None]
    col[..., 2] *= 1+0.012*in_dobby       # the dobby band reads a touch cooler
    return h, np.clip(col, 0, 1)

def to_image(name, rgb, noncolor):
    img = bpy.data.images.new(name, rgb.shape[1], rgb.shape[0], alpha=False)
    if noncolor: img.colorspace_settings.name = "Non-Color"
    px = np.ones((rgb.shape[0], rgb.shape[1], 4), np.float32); px[..., :3] = rgb
    img.pixels.foreach_set(px.ravel())
    return img

h, col = height_and_color(N)
# tangent-space normal from the height field: u -> +x (tangent), v -> +arc (bitangent), both in metres
du = LENGTH/(U1-U0)/N
dv = P_of_u(uv_grid(N)[0])/(V1-V0)/N
gy, gx = np.gradient(h, axis=(0, 1)); gx = gx/du; gy = gy/dv
nrm = np.stack([-gx, -gy, np.ones_like(h)], -1)
nrm /= np.linalg.norm(nrm, axis=-1, keepdims=True)
nimg = to_image("towel_normal", nrm*0.5+0.5, True)
nimg.filepath_raw = os.path.join(OUTDIR, "towel_normal.png"); nimg.file_format = "PNG"; nimg.save()
cimg = to_image("towel_pattern", col, False)
print("HEIGHT range mm", round(float(h.min())*1000, 3), round(float(h.max())*1000, 3))

# ---- bake colour x AO (Cycles): the layers shade each other inside the folds ----
sc = bpy.context.scene
sc.render.engine = "CYCLES"; sc.cycles.device = "CPU"; sc.cycles.samples = 64
sc.render.bake.margin = 8; sc.render.bake.use_selected_to_active = False
bimg = bpy.data.images.new("towel_base", N, N, alpha=False)
m = bpy.data.materials.new("bk"); m.use_nodes = True; t = m.node_tree; t.nodes.clear()
tx = t.nodes.new("ShaderNodeTexImage"); tx.image = cimg
ao = t.nodes.new("ShaderNodeAmbientOcclusion"); ao.samples = 32; ao.inputs["Distance"].default_value = 0.012
f = t.nodes.new("ShaderNodeMix"); f.data_type = "FLOAT"; f.inputs["Factor"].default_value = AO_MIX
f.inputs["A"].default_value = 1.0; t.links.new(ao.outputs["AO"], f.inputs["B"])
mul = t.nodes.new("ShaderNodeMix"); mul.data_type = "RGBA"; mul.blend_type = "MULTIPLY"; mul.inputs["Factor"].default_value = 1.0
t.links.new(tx.outputs["Color"], mul.inputs["A"]); t.links.new(f.outputs["Result"], mul.inputs["B"])
em = t.nodes.new("ShaderNodeEmission"); t.links.new(mul.outputs["Result"], em.inputs["Color"])
out = t.nodes.new("ShaderNodeOutputMaterial"); t.links.new(em.outputs[0], out.inputs["Surface"])
tg = t.nodes.new("ShaderNodeTexImage"); tg.image = bimg; t.nodes.active = tg; tg.select = True
me.materials.append(m)
bpy.ops.object.select_all(action="DESELECT"); towel.select_set(True); bpy.context.view_layer.objects.active = towel
bpy.ops.object.bake(type="EMIT")
bimg.filepath_raw = os.path.join(OUTDIR, "towel_base.png"); bimg.file_format = "PNG"; bimg.save()

# ---- final material ----
fm = bpy.data.materials.new("towel.cloth"); fm.use_nodes = True
nt = fm.node_tree
b = [n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"][0]
ti = nt.nodes.new("ShaderNodeTexImage"); ti.image = bimg; nt.links.new(ti.outputs["Color"], b.inputs["Base Color"])
tn = nt.nodes.new("ShaderNodeTexImage"); tn.image = nimg
nm = nt.nodes.new("ShaderNodeNormalMap"); nm.space = "TANGENT"; nm.inputs["Strength"].default_value = 1.0
nt.links.new(tn.outputs["Color"], nm.inputs["Color"]); nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
b.inputs["Roughness"].default_value = 1.0
b.inputs["Specular IOR Level"].default_value = 0.3
b.inputs["Sheen Weight"].default_value = 0.6
b.inputs["Sheen Roughness"].default_value = 0.5
b.inputs["Sheen Tint"].default_value = (1, 1, 1, 1)
me.materials.clear(); me.materials.append(fm)

# ================= rig =================
arm_data = bpy.data.armatures.new("towel")
arm = bpy.data.objects.new("towel_rig", arm_data)
sc.collection.objects.link(arm)
bpy.ops.object.select_all(action="DESELECT"); arm.select_set(True); bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode="EDIT")
eb = arm_data.edit_bones
BL = 0.03
root = eb.new("towel_root"); root.head = (0, 0, 0); root.tail = (0, 0, BL); root.align_roll((0, -1, 0))
BX = [-HALF+LENGTH*i/(N_BONES-1) for i in range(N_BONES)]
for i, x in enumerate(BX):
    bn = eb.new("towel_%02d" % i); bn.head = (x, 0, 0); bn.tail = (x, 0, BL); bn.align_roll((0, -1, 0))
    bn.parent = root; bn.use_connect = False
bpy.ops.object.mode_set(mode="OBJECT")
for bn in arm_data.bones:
    M = bn.matrix_local
    print("BONE_AXES", bn.name, tuple(round(v, 3) for v in M.col[0][:3]), tuple(round(v, 3) for v in M.col[1][:3]))
    break

for i in range(N_BONES): towel.vertex_groups.new(name="towel_%02d" % i)
step = LENGTH/(N_BONES-1)
for v in me.vertices:
    f = min(max((v.co.x+HALF)/step, 0.0), N_BONES-1-1e-6)
    i = int(f); a = f-i
    towel.vertex_groups[i].add([v.index], 1-a, "REPLACE")
    if a > 1e-6: towel.vertex_groups[i+1].add([v.index], a, "REPLACE")
towel.parent = arm
mod = towel.modifiers.new("Armature", "ARMATURE"); mod.object = arm

bb = [towel.matrix_world@Vector(c) for c in towel.bound_box]
print("BBOX blender min", tuple(round(min(p[k] for p in bb), 4) for k in range(3)),
      "max", tuple(round(max(p[k] for p in bb), 4) for k in range(3)))

bpy.ops.object.select_all(action="DESELECT"); arm.select_set(True); towel.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True, export_skins=True, export_animations=False,
    export_morph=False, export_apply=False, export_yup=True, export_texcoords=True, export_normals=True,
    export_materials="EXPORT", export_image_format="AUTO", export_extras=False, export_def_bones=False)
print("WROTE", OUT, os.path.getsize(OUT))

# ================= previews =================
if PREVIEW:
    os.makedirs(PREVIEW, exist_ok=True)
    sc.cycles.samples = 48; sc.cycles.use_denoising = True
    sc.render.resolution_x, sc.render.resolution_y = 1200, 800
    world = bpy.data.worlds.new("w"); sc.world = world; world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.32, 0.36, 0.38, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.35
    def light(name, kind, loc, energy, size=0.5):
        ld = bpy.data.lights.new(name, kind); ld.energy = energy
        if kind == "AREA": ld.size = size
        lo = bpy.data.objects.new(name, ld); lo.location = loc; sc.collection.objects.link(lo)
        lo.rotation_euler = (Vector((0, 0, 0))-Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    light("key", "AREA", (1.0, -0.7, 0.55), 45, 0.5)
    light("fill", "AREA", (-0.9, 0.5, 0.7), 10, 1.2)
    cd = bpy.data.cameras.new("cam"); cd.lens = 50
    cam = bpy.data.objects.new("cam", cd); sc.collection.objects.link(cam); sc.camera = cam
    def shoot(loc, look, path):
        cam.location = loc
        cam.rotation_euler = (Vector(look)-Vector(loc)).to_track_quat("-Z", "Y").to_euler()
        sc.render.filepath = path; bpy.ops.render.render(write_still=True)
    shoot((0.55, -0.85, 0.70), (0, 0, 0), os.path.join(PREVIEW, "towel_rest.png"))
    shoot((0.12, -0.30, 0.16), (0.30, 0, 0), os.path.join(PREVIEW, "towel_rest_close.png"))
    # U sling around a 13 cm cylinder whose axis runs along the towel width (Blender Y)
    RC = 0.065; R = RC+0.011
    cyl_m = bpy.data.meshes.new("cyl"); cbm = bmesh.new()
    bmesh.ops.create_cone(cbm, cap_ends=True, segments=48, radius1=RC, radius2=RC, depth=0.3)
    cbm.to_mesh(cyl_m); cbm.free()
    cyl = bpy.data.objects.new("cyl", cyl_m); sc.collection.objects.link(cyl)
    cyl.rotation_euler = (math.pi/2, 0, 0); cyl.location = (0, 0, R)
    for p in cyl_m.polygons: p.use_smooth = True
    sk = bpy.data.materials.new("skin"); sk.use_nodes = True
    [n for n in sk.node_tree.nodes if n.type == "BSDF_PRINCIPLED"][0].inputs["Base Color"].default_value = (0.55, 0.36, 0.27, 1)
    cyl_m.materials.append(sk)
    bpy.ops.object.select_all(action="DESELECT"); arm.select_set(True); bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="POSE")
    for i, x in enumerate(BX):
        pb = arm.pose.bones["towel_%02d" % i]
        q = math.pi*R/2
        if abs(x) <= q:
            ph = x/R; pos = Vector((R*math.sin(ph), 0, R-R*math.cos(ph)))
        else:
            s = 1 if x > 0 else -1; ph = s*math.pi/2; pos = Vector((s*R, 0, R+abs(x)-q))
        rest = arm_data.bones[pb.name].matrix_local.to_3x3().to_4x4()
        pb.matrix = Matrix.Translation(pos)@Matrix.Rotation(-ph, 4, "Y")@rest
        bpy.context.view_layer.update()
    bpy.ops.object.mode_set(mode="OBJECT")
    shoot((0.75, -1.05, 0.55), (0, 0, 0.2), os.path.join(PREVIEW, "towel_sling.png"))
    shoot((0.0, -1.1, 0.2), (0, 0, 0.2), os.path.join(PREVIEW, "towel_sling_front.png"))

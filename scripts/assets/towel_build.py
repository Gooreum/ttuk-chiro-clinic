"""White bath towel GLB for the towel-traction mode, built from an empty scene (no source assets).
   - a terry bath towel folded lengthwise in thirds (letter fold) into a soft, rumpled band: LENGTH x ~BAND_W, three ~3 mm
     cloth layers whose cross-section is a Z: bottom layer -> fold on one long edge -> middle layer -> fold on the other
     edge -> top layer. Nothing is regular: the width wanders +-8 %, the band's edges wave along the length, the folds are
     pressed flat-ish and each wanders on its own, the free edges of the top/bottom layers drift a few mm in and out
     (sometimes past the fold), and here and there the layers part a little. Over the last FLARE m at each end the fold
     comes open: the layers separate, fall short of each other and go soft and floppy (loose flutes, drooping corners,
     an uneven cut edge), ending in a 1 cm hem.
   - wrinkles in the geometry: long bends, bow, twist, cushion-like crown/tilt across the band, soft buckles across it
     (none periodic: smooth value noise and random placements); fine creases + terry pile (loops, matted clumps) + dobby
     border + hem in a baked tangent-space normal map
   - colour: near-white base (#f4f1ea) with very faint warm/cool blotches, pile tone, darker crease valleys, greyish
     dobby band DOBBY_W wide DOBBY_AT from each end, hem, all x ambient occlusion baked with Cycles (layers shade each
     other in the folds and buckles). Principled, roughness 1, sheen
   - rig: armature `towel` at the origin (identity), root bone `towel_root` + `towel_00`..`towel_24` evenly along the
     length, all direct children of the root. Every bone points up (+Z in Blender = glTF +Y) with its X axis along the
     length, so in glTF every joint has identity rest rotation and only a translation (x, 0, 0)
   - weights: linear blend between the two nearest bones by the vertex position along the length
   - axes (glTF, Y-up): length along +X (towel_00 at x=-LENGTH/2), width along Z, thickness along Y (top face +Y)
   usage: blender -b --python towel_build.py -- out.glb [bake_size=1024] [preview_dir]
   (the preview renders: rest towel, a close-up of an end, the towel as a U sling around a 13 cm cylinder, and the
   sling gripped in two fists with the loose ends hanging out of them)"""
import bpy, bmesh, sys, os, math, random
import numpy as np
from mathutils import Vector, Matrix

ARGS = sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else []
OUT = os.path.abspath(ARGS[0] if ARGS else "towel_raw.glb")
BAKE = int(ARGS[1]) if len(ARGS) > 1 else 1024
PREVIEW = ARGS[2] if len(ARGS) > 2 else ""
OUTDIR = os.path.dirname(OUT)

LENGTH = 0.95       # m along the length (glTF +X)
BAND_W = 0.11       # folded band width (mean; it wanders +-WIDTH_VAR)
WIDTH_VAR = 0.08
END_W = 0.135       # width the loose ends spread to
FLARE = 0.15        # m at each end where the fold comes open
CLOTH_T = 0.003     # terry cloth thickness
DOBBY_T = 0.0025    # the woven border band is thinner (no loops)
HEM_T = 0.0037      # the turned hem is thicker
HEM = 0.010
DOBBY_AT, DOBBY_W = 0.06, 0.03
OPEN_S = 0.007      # extra spacing between the layers at the very ends
N_BONES = 25
N_SEG = 108         # rings along the length
NS = 6              # intervals per layer across the width
NA = 3              # intervals per fold arc
AO_MIX = 0.5
BASE = (0.957, 0.945, 0.918)     # #f4f1ea
rng = random.Random(23)

bpy.ops.wm.read_factory_settings(use_empty=True)
HALF = LENGTH/2

def smooth(e0, e1, x):
    t = min(1.0, max(0.0, (x-e0)/(e1-e0)))
    return t*t*t*(t*(t*6-15)+10)
def clamp1(v): return max(-1.0, min(1.0, v))

class Noise1:
    """smooth, non-periodic 1-D value noise along the length (Catmull-Rom through random knots, 2 octaves), ~unit std"""
    def __init__(self, scale, octaves=2):
        self.sc = scale
        self.k = [[rng.uniform(-1, 1) for _ in range(int((LENGTH+0.4)/(scale/2**o))+6)] for o in range(octaves)]
        self.norm = 1.0
        xs = [-HALF+LENGTH*i/1999 for i in range(2000)]
        sd = math.sqrt(sum(self(x)**2 for x in xs)/len(xs))
        self.norm = 1.0/max(sd, 1e-6)
    def __call__(self, x):
        v = 0.0; a = 1.0; tot = 0.0
        for o, k in enumerate(self.k):
            t = (x+HALF+0.2)/(self.sc/2**o); i = int(math.floor(t)); f = t-i
            p0, p1, p2, p3 = (k[min(max(i+d, 0), len(k)-1)] for d in (-1, 0, 1, 2))
            v += a*0.5*((2*p1)+(-p0+p2)*f+(2*p0-5*p1+4*p2-p3)*f*f+(-p0+3*p1-3*p2+p3)*f*f*f)
            tot += a; a *= 0.45
        return v/tot*self.norm

# ---- low-frequency shape along the length (shared by all layers so they wrinkle together) ----
nW, nC, nR, nL = Noise1(0.16), Noise1(0.14), Noise1(0.10, 1), Noise1(0.10, 1)          # width, centre, each fold's wander
nP1, nP2 = Noise1(0.09), Noise1(0.09)                                            # layers parting
nE1, nE2 = Noise1(0.08, 1), Noise1(0.07, 1)                                            # free edges drifting
nF1, nF2 = Noise1(0.08), Noise1(0.08)                                            # fold flatness
nCr, nTi = Noise1(0.10), Noise1(0.09)                                            # crown / tilt across the band
nPu1, nPu2 = Noise1(0.07), Noise1(0.07)                                          # top/bottom layer puff
nO1, nO2, nPh, nK = Noise1(0.05), Noise1(0.05), Noise1(0.06), Noise1(0.08)      # ends: opening, flute phase/count
nZ, nY, nTw = Noise1(0.30), Noise1(0.35), Noise1(0.22)                           # long bends, bow, twist
nCut = Noise1(0.05)

# soft buckles across the band: a ridge with a shallower valley beside it, angled, over part of the width
BUCKLES = []
for _ in range(22):
    BUCKLES.append((rng.uniform(-0.45, 0.45), rng.uniform(-0.75, 0.75), rng.choice((-1, 1))*rng.uniform(0.0015, 0.0048),
                    rng.uniform(0.014, 0.028), rng.uniform(-0.035, 0.035), rng.uniform(0.025, 0.08)))

def open_at(x):
    t = min(1.0, max(0.0, (FLARE-(HALF-abs(x)))/(FLARE-0.01)))
    return t*t*(3-2*t)

def thick_at(x):
    d = HALF-abs(x)
    t = CLOTH_T
    t += (DOBBY_T-CLOTH_T)*smooth(DOBBY_AT+DOBBY_W+0.004, DOBBY_AT+DOBBY_W, d)*smooth(DOBBY_AT-0.004, DOBBY_AT, d)
    t += (HEM_T-t)*smooth(HEM+0.003, HEM, d)
    return t

def profile(x):
    """centreline of the Z-folded cloth across the band at x: list of (y, z, layer), layer -1/0/+1; plus the band's
       centre and half width (for the shared fields)"""
    o = open_at(x); t = thick_at(x)
    w = (BAND_W*(1+WIDTH_VAR*clamp1(0.9*nW(x)))-t)*(1-o)+END_W*o
    cy = 0.0025*nC(x)
    yR = cy+w/2+0.0016*nR(x); yL = cy-w/2+0.0016*nL(x)
    s1 = t*1.06+0.0035*max(0.0, nP1(x)-0.45)+OPEN_S*o*(0.8+0.3*nO1(x))
    s2 = t*1.06+0.0035*max(0.0, nP2(x)-0.45)+OPEN_S*o*(0.8+0.3*nO2(x))
    e1 = 0.004+0.0032*nE1(x)+0.022*o
    e2 = 0.004+0.0035*nE2(x)+0.03*o
    f1 = 0.8+0.15*clamp1(nF1(x)); f2 = 0.8+0.15*clamp1(nF2(x))
    pts = []
    def straight(y0, y1, z, layer, first):
        for j in range(0 if first else 1, NS+1):
            pts.append((y0+(y1-y0)*j/NS, z, layer))
    def arc(cy_, cz, rz, ry, side):
        for j in range(1, NA+1):
            ph = -math.pi/2+math.pi*j/NA
            pts.append((cy_+side*ry*math.cos(ph), cz+rz*math.sin(ph), 0))
    straight(yL+e1, yR, -s1, -1, True)
    arc(yR, -s1/2, s1/2, s1/2*f1, 1)
    straight(yR, yL, 0.0, 0, False)
    arc(yL, s2/2, s2/2, s2/2*f2, -1)
    straight(yL, yR-e2, s2, 1, False)
    # shared fields across the width: cushion crown/tilt, layer puff, and toward the ends loose flutes + drooping corners
    hw = max(w/2, 1e-6)
    crown = 0.0022*nCr(x); tilt = 0.0022*nTi(x)
    pu = {-1: -(0.0004+0.0012*max(0.0, nPu1(x))), 0: 0.0, 1: 0.0004+0.0014*max(0.0, nPu2(x))}
    fa = 0.007*o**1.4; fk = 1.15+0.3*clamp1(nK(x)); fph = 2.2*nPh(x)+9*x
    out = []
    for y, z, layer in pts:
        q = max(-1.2, min(1.2, (y-cy)/hw)); b = max(0.0, 1-q*q)
        z += crown*b+tilt*q*b+pu[layer]*b
        z += fa*math.sin(math.pi*fk*(q+1)+fph)*(0.35+0.65*min(1.0, abs(q)+0.2))
        z += layer*0.0012*o*math.sin(2.3*q+3*x)                 # the loose layers don't quite follow each other
        z -= 0.016*o*o*q*q+0.006*o*o                           # corners and the whole end sag
        out.append((y, z, layer))
    return out, cy, hw

K = 3*NS+2*NA+1                 # centreline samples
RING = 2*K+2                    # side A (K), cap at the top layer's free edge, side B reversed (K), cap at the bottom's

def ring(x):
    pts, cy, hw = profile(x)
    t = thick_at(x)
    P = [(y, z) for y, z, _ in pts]
    A = []; B = []; T = []
    for i in range(K):
        a, b = P[max(i-1, 0)], P[min(i+1, K-1)]
        ty, tz = b[0]-a[0], b[1]-a[1]; n = math.hypot(ty, tz) or 1.0
        ty /= n; tz /= n; T.append((ty, tz))
        ny, nz = -tz, ty
        A.append((P[i][0]+ny*t/2, P[i][1]+nz*t/2)); B.append((P[i][0]-ny*t/2, P[i][1]-nz*t/2))
    (y, z), (ty, tz) = P[-1], T[-1]; capE = (y+ty*t*0.55, z+tz*t*0.55)
    (y, z), (ty, tz) = P[0], T[0];   capS = (y-ty*t*0.55, z-tz*t*0.55)
    loop = A+[capE]+B[::-1]+[capS]
    # global wrinkles: soft buckles across the band, twist, bow, long bends; the cut end is uneven
    o = open_at(x)
    a = 0.12*nTw(x)*(1-0.5*o)
    ca, sa = math.cos(a), math.sin(a)
    dy = 0.006*nY(x); dz = 0.0065*nZ(x)
    d_end = HALF-abs(x); cut = smooth(0.035, 0.0, d_end)
    out = []
    for y, z in loop:
        for x0, ang, amp, wd, yc, ye in BUCKLES:
            qq = (x-x0-(y-yc)*math.tan(ang))/wd
            z += amp*(math.exp(-qq*qq)-0.45*math.exp(-1.6*(qq-1.3)**2))*math.exp(-((y-yc)/ye)**2)
        y2 = y*ca-z*sa; z2 = y*sa+z*ca
        q = (y-cy)/hw
        xx = x-math.copysign(cut*(0.009*q*q+0.003*max(0.0, nCut(y*3+x))), x)
        out.append((xx, y2+dy, z2+dz))
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
def v_of(arc, P): return V0+(V1-V0)*arc/P            # every ring fills the v range (the ends stretch a little)

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
    """rows of soft loops (pitch 3.2 mm, alternate rows offset), jittered heights and sizes; 0..~1.4"""
    P = 0.0032
    gx = x/P; gc = c/P
    out = np.zeros_like(x)
    for di in (-1, 0, 1):
        for dj in (-1, 0, 1):
            j = np.floor(gc)+dj
            i = np.floor(gx-0.5*(j % 2))+di
            cx = (i+0.5*(j % 2)+0.5+0.6*(hash2(i, j, 1)-0.5))*P
            cc = (j+0.5+0.6*(hash2(i, j, 2)-0.5))*P
            hgt = 0.5+0.9*hash2(i, j, 3)
            rad = 0.0011+0.0006*hash2(i, j, 4)
            d2 = ((x-cx)**2+(c-cc)**2)/(rad**2)
            out = np.maximum(out, hgt*np.exp(-d2))
    return out

def blur(a, s):
    if s <= 0: return a
    r = int(math.ceil(s*3)); k = np.exp(-0.5*(np.arange(-r, r+1)/s)**2); k /= k.sum()
    a = np.apply_along_axis(lambda m: np.convolve(np.pad(m, r, mode="wrap"), k, "valid"), 1, a)
    return np.apply_along_axis(lambda m: np.convolve(np.pad(m, r, mode="edge"), k, "valid"), 0, a)

def field(n, sigma, seed):
    """smooth random field in texture space, unit std"""
    f = blur(np.random.default_rng(seed).standard_normal((n, n)), sigma)
    return f/max(f.std(), 1e-9)

CREASES = []
for _ in range(280):
    CREASES.append((rng.uniform(-0.47, 0.47), rng.uniform(-0.5, 0.5)*0.75, rng.gauss(0, 0.6), rng.uniform(0.02, 0.10),
                    rng.uniform(0.0025, 0.007), rng.uniform(0.0003, 0.0011), rng.gauss(0, 12)))

def height_and_color(n):
    uu, vv = uv_grid(n)
    x = x_of_u(uu); c = c_of_v(vv, uu)
    d = HALF-np.abs(x)
    in_dobby = ((d > DOBBY_AT) & (d < DOBBY_AT+DOBBY_W)).astype(float)
    in_hem = (d < HEM).astype(float)
    loops = 1-np.clip(in_dobby+in_hem, 0, 1)
    # terry supersampled 2x then averaged, so the loops never alias into speckle; the pile is matted in soft clumps
    ss = 2; uu2, vv2 = uv_grid(n*ss)
    t2 = terry(x_of_u(uu2), c_of_v(vv2, uu2)).reshape(n, ss, n, ss).mean(axis=(1, 3))
    clump = field(n, n/170, 5)                  # ~6 mm patches where the loops stand taller or lie flatter
    lay = field(n, n/110, 6)                    # ~9 mm: the pile leans one way or another
    pile = t2*(0.75+0.25*np.clip(clump, -2, 2))
    h = (0.00068*pile+0.00014*lay)*loops
    # dobby: flat woven band with small raised blocks and raised selvedge ribs at its two borders
    blk = (np.sin(x/0.0016*math.pi)*np.sin(c/0.0022*math.pi) > 0).astype(float)
    h += in_dobby*(0.00005*blk)
    for e in (DOBBY_AT, DOBBY_AT+DOBBY_W):
        h += 0.00022*np.exp(-((d-e)/0.0011)**2)
    # hem: rolled edge, a stitch groove at its inner edge
    h += in_hem*0.00025*np.sin(np.clip(d/HEM, 0, 1)*math.pi)**0.5
    h -= 0.00012*np.exp(-((d-HEM+0.0012)/0.0005)**2)
    # creases: curved valleys with soft shoulders, tapered along their length
    cr = np.zeros_like(h)
    for x0, c0, a, L, wd, dep, bend in CREASES:
        da, dc = math.sin(a), math.cos(a)        # mostly across the band (along c)
        px = x-x0; pc = c-c0
        along = px*da+pc*dc; perp = px*dc-pc*da-bend*along*along
        win = np.clip(1-(2*along/L)**2, 0, 1)**2
        q = (perp/wd)**2
        cr -= dep*win*(1-0.9*q)*np.exp(-q)
    h += cr
    h = blur(h, 0.5)
    # base colour (sRGB): white terry with faint warm/cool blotches, darker crease valleys and pile shadows,
    # greyish dobby band with a faint woven check, hem + stitch line
    col = np.ones((n, n, 3))*np.array(BASE)
    tone = 1+0.045*(pile-0.55)*loops+0.012*np.clip(clump, -2, 2)*loops
    cav = blur(np.clip(blur(cr, 3)*0.4-cr, 0, None), 2.5)       # soft shade in the crease valleys, no hard lines
    tone *= 1-np.clip(cav/0.0009, 0, 1)*0.05
    tone *= 1+0.018*field(n, n/22, 7)            # ~4 cm soft blotches
    tone *= 1-in_dobby*(0.085+0.03*blk)
    for e in (DOBBY_AT, DOBBY_AT+DOBBY_W):
        tone *= 1-0.06*np.exp(-((d-e-np.sign(DOBBY_AT+DOBBY_W/2-e)*0.0025)/0.0007)**2)
    tone *= 1-0.04*in_hem
    tone *= 1-0.14*np.exp(-((d-HEM+0.0012)/0.0005)**2)
    col *= tone[..., None]
    warm = field(n, n/16, 8)                     # very faint warm (cream) / cool (blue-grey) drift
    col *= (1+np.stack([0.008*warm, 0.002*warm, -0.010*warm], -1))
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
ao = t.nodes.new("ShaderNodeAmbientOcclusion"); ao.samples = 32; ao.inputs["Distance"].default_value = 0.018
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
    shoot((0.20, -0.26, 0.15), (0.36, 0, 0), os.path.join(PREVIEW, "towel_rest_close.png"))
    # poses: the towel follows a path in the XZ plane (width along Blender Y) built from arcs and straights, from the
    # middle outward, mirrored for x < 0; its top face (glTF +Y) turned away from the cylinder like on the chin
    def path(segs, step=0.001):
        P = [(0.0, 0.0)]; th = 0.0
        for L, kap in segs:
            for _ in range(int(round(L/step))):
                th += kap*step/2
                P.append((P[-1][0]+math.cos(th)*step, P[-1][1]+math.sin(th)*step))
                th += kap*step/2
        def at(d):
            f = min(d/step, len(P)-1.001); i = int(f); a = f-i
            return (P[i][0]*(1-a)+P[i+1][0]*a, P[i][1]*(1-a)+P[i+1][1]*a)
        return at
    def pose(at):
        bpy.ops.object.select_all(action="DESELECT"); arm.select_set(True); bpy.context.view_layer.objects.active = arm
        bpy.ops.object.mode_set(mode="POSE")
        def p3(x):
            px, pz = at(abs(x))
            return Vector((math.copysign(px, x) if x != 0 else 0.0, 0, pz))
        for i, x in enumerate(BX):
            pb = arm.pose.bones["towel_%02d" % i]
            tg = (p3(x+0.004)-p3(x-0.004)).normalized()
            th = math.atan2(-tg.z, tg.x)
            rest = arm_data.bones[pb.name].matrix_local.to_3x3().to_4x4()
            pb.matrix = Matrix.Translation(p3(x))@Matrix.Rotation(th, 4, "Y")@Matrix.Rotation(math.pi, 4, "X")@rest
            bpy.context.view_layer.update()
        bpy.ops.object.mode_set(mode="OBJECT")
    RC = 0.065; R = RC+0.0075
    cyl_m = bpy.data.meshes.new("cyl"); cbm = bmesh.new()
    bmesh.ops.create_cone(cbm, cap_ends=True, segments=48, radius1=RC, radius2=RC, depth=0.3)
    cbm.to_mesh(cyl_m); cbm.free()
    cyl = bpy.data.objects.new("cyl", cyl_m); sc.collection.objects.link(cyl)
    cyl.rotation_euler = (math.pi/2, 0, 0); cyl.location = (0, 0, R)
    for p in cyl_m.polygons: p.use_smooth = True
    sk = bpy.data.materials.new("skin"); sk.use_nodes = True
    [n for n in sk.node_tree.nodes if n.type == "BSDF_PRINCIPLED"][0].inputs["Base Color"].default_value = (0.55, 0.36, 0.27, 1)
    cyl_m.materials.append(sk)
    q = math.pi*R/2
    # U sling: round the cylinder, then straight up
    pose(path([(q, 1/R), (0.5, 0.0)]))
    shoot((0.75, -1.05, 0.55), (0, 0, 0.2), os.path.join(PREVIEW, "towel_sling.png"))
    shoot((0.0, -1.1, 0.2), (0, 0, 0.2), os.path.join(PREVIEW, "towel_sling_front.png"))
    # gripped: up the sides to two fists, where the towel bunches and turns out, the loose ends hanging out and down
    pose(path([(q, 1/R), (0.085, 0.0), (0.05, -1/0.026), (0.07, -1/0.075), (0.3, 0.0)]))
    at = path([(q, 1/R), (0.085, 0.0), (0.04, -1/0.026)])
    fx, fz = at(q+0.085+0.015)
    for s in (-1, 1):
        fm_ = bpy.data.meshes.new("fist"); fbm = bmesh.new()
        bmesh.ops.create_uvsphere(fbm, u_segments=32, v_segments=16, radius=0.042)
        fbm.to_mesh(fm_); fbm.free()
        for p in fm_.polygons: p.use_smooth = True
        fo = bpy.data.objects.new("fist", fm_); sc.collection.objects.link(fo)
        fo.location = (s*(fx+0.006), 0, fz+0.004); fo.scale = (0.9, 1.25, 0.85); fm_.materials.append(sk)
    shoot((0.55, -0.95, 0.45), (0, 0, 0.13), os.path.join(PREVIEW, "towel_grip.png"))
    shoot((0.22, -0.42, 0.30), (0.10, 0, 0.12), os.path.join(PREVIEW, "towel_grip_close.png"))

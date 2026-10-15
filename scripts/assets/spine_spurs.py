# blender -b cord.blend --python spine_spurs.py -- OUT.blend [seed]
# Bone spurs (osteophytes) for the degenerative (elderly) patient: beak-like bony lips on the anterior-superior and
# anterior-inferior margins of the C5, C6 and C7 bodies, the typical spondylosis spots. One mesh per vertebra,
# Spur_C5 / Spur_C6 / Spur_C7, both lips in it, made in the same model frame as the bones.
#
# Origin: each Spur_Cn object sits at exactly the origin of its vertebra Cn (object location and the "origin"
# property copied from Cn), so at runtime the spur can be parented to the vertebra group with zero offset.
#
# How a lip is made: the anterior rim of the endplate is traced across the front of the body (9 samples, the corner
# point furthest along anterior +/- the vertebra's axis), and a lofted beak profile is swept along it: rooted in the
# corner, bulging forward and curling toward the disc, tapering to nothing at both ends, with per-ring length
# jitter, a couple of nodules and random lumps so it reads as an organic bony lip, not a tube.
import bpy, sys, math, random, bmesh
from mathutils import Vector, Matrix, noise
argv = sys.argv[sys.argv.index("--") + 1:]
out = argv[0]; random.seed(int(argv[1]) if len(argv) > 1 else 7)

def wverts(n):
    o = bpy.data.objects[n]; return [o.matrix_world @ v.co for v in o.data.vertices]
def centre(n):
    vs = wverts(n); return sum(vs, Vector())/len(vs)

# (vertebra, disc above, disc below, half width of the traced rim m, superior lip length m, inferior lip length m)
SPEC = [("C5", "Disc_C4_C5", "Disc_C5_C6", 0.0075, 0.0034, 0.0048),
        ("C6", "Disc_C5_C6", "Disc_C6_C7", 0.0080, 0.0044, 0.0058),
        ("C7", "Disc_C6_C7", "Disc_C7_T1", 0.0082, 0.0040, 0.0036)]

# beak cross-section in the (anterior a, toward-disc v) plane, unit length; a<0 / v<0 is inside the bone
PROFILE = [(-0.36, -0.18), (0.02, -0.50), (0.32, -0.20), (0.52, 0.22), (0.54, 0.66), (0.36, 1.00),
           (0.20, 0.70), (0.04, 0.28), (-0.30, 0.05)]

def lip(vs, axis, sgn, half_w, L, rough):
    """vs: vertebra verts, axis: unit up along the spine, sgn +1 superior / -1 inferior. returns (verts, faces)."""
    up = axis*sgn
    front = Vector((0, -1, 0)); front = (front - axis*front.dot(axis)).normalized()
    side = axis.cross(front).normalized()                   # ~ +-x
    c = sum(vs, Vector())/len(vs)
    mid = [p for p in vs if abs((p - c).dot(side)) < 0.005]
    yfront = max((p - c).dot(front) for p in mid)          # anterior surface of the body on the midline
    body = [p for p in vs if (p - c).dot(front) > yfront - 0.008 and abs((p - c).dot(side)) < half_w + 0.003]
    k = (front + up).normalized()
    N = 9
    rim = []
    for i in range(N):
        s = -half_w + 2*half_w*i/(N - 1)
        band = [p for p in body if abs((p - c).dot(side) - s) < 0.0013]
        rim.append(max(band, key=lambda p: p.dot(k)))
    for _ in range(2):                                     # smooth the traced rim
        rim = [rim[0]] + [(rim[i-1] + 2*rim[i] + rim[i+1])/4 for i in range(1, N-1)] + [rim[-1]]
    V, F = [], []
    K = len(PROFILE)
    for i, r in enumerate(rim):
        t = i/(N - 1)
        tan = (rim[min(i+1, N-1)] - rim[max(i-1, 0)]).normalized()
        a = (front - tan*front.dot(tan)).normalized(); v = (up - tan*up.dot(tan) - a*up.dot(a)).normalized()
        l = L*max(0.08, math.sin(math.pi*t))**0.6*(1 + rough*random.uniform(-0.35, 0.35))
        base = r - k*0.0003
        for j, (pa, pv) in enumerate(PROFILE):
            w = 0.75 if pa < 0.3 and pv < 0.3 else 1.0       # the root stays chunky, the beak tapers
            p = base + a*(pa*l*w) + v*(pv*l)
            p += tan*(pv*l*0.15*math.sin(6.0*t + j))        # slight twist so the lip edge is uneven
            V.append(p)
    for i in range(N - 1):
        for j in range(K):
            F.append((i*K + j, i*K + (j+1) % K, (i+1)*K + (j+1) % K, (i+1)*K + j))
    F.append(tuple(range(K))[::-1]); F.append(tuple((N-1)*K + j for j in range(K)))
    return V, F

mat = bpy.data.materials.get("Bone") or bpy.data.materials.new("Bone")
for vn, dup, ddn, half_w, Ls, Li in SPEC:
    vs = wverts(vn)
    axis = (centre(dup) - centre(ddn)).normalized()
    allV, allF = [], []
    for sgn, L in ((1, Ls), (-1, Li)):
        V, F = lip(vs, axis, sgn, half_w, L, 1.0)
        off = len(allV); allV += V; allF += [tuple(i + off for i in f) for f in F]
    me = bpy.data.meshes.new("Spur_" + vn); me.from_pydata([tuple(p) for p in allV], [], allF)
    o = bpy.data.objects.new("Spur_" + vn, me); bpy.context.collection.objects.link(o)
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    bmesh.ops.subdivide_edges(bm, edges=[e for e in bm.edges if e.calc_length() > 0.0028], cuts=1, use_grid_fill=True)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    bm.normal_update()
    # lumps: low-frequency noise along the normal + 2 nodules per lip
    seed = Vector((random.uniform(0, 50), random.uniform(0, 50), random.uniform(0, 50)))
    bm.verts.ensure_lookup_table()
    nod = [random.choice(bm.verts).co.copy() for _ in range(4)]
    for v in bm.verts:
        d = noise.noise(v.co*900 + seed)*0.00035
        for q in nod:
            dist = (v.co - q).length
            if dist < 0.0012: d += 0.0004*(1 - dist/0.0012)**2
        v.co += v.normal*d
    bmesh.ops.smooth_vert(bm, verts=bm.verts, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    me.materials.append(mat)
    # origin = the vertebra's origin
    vo = bpy.data.objects[vn]
    o.location = vo.location.copy(); me.transform(Matrix.Translation(-vo.location)); o["origin"] = list(vo.location)
    print("SPUR %s tris %d origin(blender) %s = %s origin" % (o.name, sum(len(p.vertices)-2 for p in me.polygons),
          tuple(round(x, 5) for x in o.location), vn))
bpy.ops.wm.save_as_mainfile(filepath=out)

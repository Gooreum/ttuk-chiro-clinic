# blender -b bones.blend --python spine_cord.py -- OUT.blend
# Measures the vertebral canal of every vertebra in the blend (C1..T8, from spine_build.py) and adds the spinal cord
# tube along the canal centres (Cord) plus a pair of nerve roots under each cervical vertebra (Root_<i>_<L|R>, i = 0
# for under C1 .. 6 for C7/T1), as before. Blender frame: +Z up (skull), -Y anterior, +X patient left.
#
# Canal centre: in the midsagittal plane (x = 0) of each vertebra, every grid point whose 12 horizontal rays all hit
# the outside of the bone within 30 mm is inside the vertebral foramen (a hit from inside = in the solid body); the centre is the mean of the points with the largest
# clearance (distance to the nearest bone) - the middle of the biggest circle that fits in the canal. The atlas is
# measured together with the dens of C2, so the cord passes behind the dens, not through the middle of the ring.
import bpy, sys, math
from mathutils import Vector
from mathutils.bvhtree import BVHTree
out = sys.argv[sys.argv.index("--") + 1]
V = [n for n in ("C1","C2","C3","C4","C5","C6","C7","T1","T2","T3","T4","T5","T6","T7","T8") if n in bpy.data.objects]
dg = bpy.context.evaluated_depsgraph_get()

def world_tree(names):
    vs, fs = [], []
    for n in names:
        o = bpy.data.objects[n]; base = len(vs)
        vs += [o.matrix_world @ v.co for v in o.data.vertices]
        fs += [[base + i for i in p.vertices] for p in o.data.polygons]
    return BVHTree.FromPolygons(vs, fs), vs

DIRS = [Vector((math.cos(a), math.sin(a), 0)) for a in (k*math.pi/6 for k in range(12))]
centres = []
for n in V:
    tree, vs = world_tree(["C1", "C2"] if n == "C1" else [n])
    own = [bpy.data.objects[n].matrix_world @ v.co for v in bpy.data.objects[n].data.vertices]
    y0, y1 = min(p.y for p in own), max(p.y for p in own)
    z0, z1 = min(p.z for p in own), max(p.z for p in own)
    pts = []
    step = 0.0005
    y = y0
    while y < y1:
        z = z0
        while z < z1:
            p = Vector((0, y, z))
            if all((h := tree.ray_cast(p, d, 0.03))[0] is not None and h[1].dot(d) < 0 for d in DIRS):
                pts.append((tree.find_nearest(p)[3], p))
            z += step
        y += step
    pts.sort(key=lambda t: -t[0])
    best = pts[0][0]
    top = [p for c, p in pts if c > best - 0.0004]
    c = sum(top, Vector()) / len(top)
    print("CANAL %-3s clearance %.1f mm  centre y %.4f z %.4f  (%d pts)" % (n, best*1000, c.y, c.z, len(top)))
    centres.append(Vector((0, c.y, c.z)))

# cord: from 20 mm above C1 to 15 mm below the last vertebra; a little thinner in the thoracic canal
top = centres[0] + (centres[0] - centres[1]).normalized()*0.02
bot = centres[-1] + (centres[-1] - centres[-2]).normalized()*0.015
pts = [top] + centres + [bot]
rad = [1.0] + [1.0 if n.startswith("C") else 0.85 for n in V] + [0.8]

def tube(name, points, r, res=12, mat=None, radii=None):
    cu = bpy.data.curves.new(name, 'CURVE'); cu.dimensions = '3D'
    sp = cu.splines.new('BEZIER'); sp.bezier_points.add(len(points)-1)
    for i, (bp, p) in enumerate(zip(sp.bezier_points, points)):
        bp.co = p; bp.handle_left_type = bp.handle_right_type = 'AUTO'
        if radii: bp.radius = radii[i]
    cu.bevel_depth = r; cu.bevel_resolution = 3; cu.resolution_u = res; cu.use_fill_caps = True
    ob = bpy.data.objects.new(name, cu); bpy.context.collection.objects.link(ob)
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
    bpy.ops.object.convert(target='MESH'); bpy.ops.object.shade_smooth()
    if mat: ob.data.materials.append(mat)
    return ob
def mat(name, rgb):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name); m.diffuse_color = (*rgb, 1); return m
mc, mr = mat("Cord", (0.95, 0.85, 0.6)), mat("Root", (0.95, 0.85, 0.6))
cord = tube("Cord", pts, 0.0042, 8, mc, rad)
# nerve roots: one pair below each cervical vertebra (C1..C7), out through the side gap, forward and down
for i in range(7):
    a, b = centres[i], centres[i+1]
    m = (a + b)/2
    for s, tag in ((1, "L"), (-1, "R")):
        p = [m + Vector((s*0.004, 0, 0)), m + Vector((s*0.012, -0.004, -0.002)),
             m + Vector((s*0.022, -0.009, -0.008)), m + Vector((s*0.033, -0.012, -0.02))]
        tube(f"Root_{i}_{tag}", p, 0.0014, 6, mr)
for o in bpy.data.objects:                                    # origin at the bbox centre, like the bones
    if o.type == 'MESH' and (o.name == "Cord" or o.name.startswith("Root_")):
        ws = [o.matrix_world @ Vector(c) for c in o.bound_box]
        c = sum(ws, Vector())/8
        o.data.transform(__import__("mathutils").Matrix.Translation(-c)); o.location = c; o["origin"] = list(c)
print("CORD tris", sum(len(p.vertices)-2 for p in cord.data.polygons), "y(gltf) %.4f..%.4f" % (bot.z, top.z))
bpy.ops.wm.save_as_mainfile(filepath=out)

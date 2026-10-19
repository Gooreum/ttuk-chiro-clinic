# Blender +Z superior, -Y anterior, +X patient left.
# blender -b IN.blend --python lumbar_cord.py -- OUT.blend
import bpy, sys, math
from mathutils import Vector
from mathutils.bvhtree import BVHTree
out = sys.argv[sys.argv.index("--") + 1]
V = ['T11','T12','L1','L2','L3','L4','L5','Sacrum']
for name in V:
    if name not in bpy.data.objects: raise RuntimeError('Missing canal bone '+name)
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
    tree, vs = world_tree([n])
    own = [bpy.data.objects[n].matrix_world @ v.co for v in bpy.data.objects[n].data.vertices]
    y0, y1 = min(p.y for p in own), max(p.y for p in own)
    z0, z1 = min(p.z for p in own), max(p.z for p in own)
    # The sacrum is fused: measure its upper canal only, below the L5/S1 gap.
    if n == 'Sacrum': z0 = z1 - 0.025
    pts = []
    step = 0.0005
    y = y0
    while y < y1:
        z = z0
        while z < z1:
            p = Vector((0, y, z))
            if all((h := tree.ray_cast(p, d, 0.05))[0] is not None and h[1].dot(d) < 0 for d in DIRS):
                pts.append((tree.find_nearest(p)[3], p))
            z += step
        y += step
    pts.sort(key=lambda t: -t[0])
    if not pts: raise RuntimeError('No enclosed canal found for '+n)
    best = pts[0][0]
    top = [p for c, p in pts if c > best - 0.0004]
    c = sum(top, Vector()) / len(top)
    print("CANAL %-3s clearance %.1f mm  centre y %.4f z %.4f  (%d pts)" % (n, best*1000, c.y, c.z, len(top)))
    centres.append(Vector((0, c.y, c.z)))

# Full cord above T11, conus at L1/L2, narrow cauda-equina bundle into sacrum.
top = centres[0] + (centres[0] - centres[1]).normalized()*0.02
bot = centres[-1] + (centres[-1] - centres[-2]).normalized()*0.015
conus = (centres[2]+centres[3])/2
pts = [top] + centres[:3] + [conus] + centres[3:] + [bot]
rad = [1.0, 1.0, .95, .7, .28, .28, .27, .26, .25, .24, .2]

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
    # Neural tubes do not receive AO (identical cervical shading), but export
    # neutral COLOR_0 so every lumbar primitive has the same attribute contract.
    attr = ob.data.color_attributes.new('AO', 'FLOAT_COLOR', 'POINT')
    attr.data.foreach_set('color', [1.0] * (len(attr.data)*4))
    ob.data.color_attributes.active_color = attr
    ob.data.attributes.default_color_name = attr.name
    ob.data.attributes.active_color_name = attr.name
    return ob
def mat(name, rgb):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name); m.diffuse_color = (*rgb, 1); return m
mc, mr = mat("Cord", (0.95, 0.85, 0.6)), mat("Root", (0.95, 0.85, 0.6))
cord = tube("Cord", pts, 0.0042, 8, mc, rad)
# Roots exit below T11, T12, L1..L5 through each intervertebral gap.
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

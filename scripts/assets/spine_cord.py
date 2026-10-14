# blender -b raw_work.blend --python cord.py -- OUT.glb
# Measures the vertebral canal of each cervical vertebra (BodyParts3D meshes) and adds a spinal cord tube along the
# canal centres plus nerve roots leaving at each disc level. Blender frame: +Z up (skull), -Y anterior, +X patient left.
import bpy, sys
from mathutils import Vector
out = sys.argv[sys.argv.index("--") + 1]
V = ["C1","C2","C3","C4","C5","C6","C7"]
centres = []
for n in V:
    o = bpy.data.objects[n]
    ws = [o.matrix_world @ v.co for v in o.data.vertices]
    zs = sorted(p.z for p in ws); z0, z1 = zs[0], zs[-1]
    best = None
    for frac in (0.5, 0.45, 0.55, 0.4, 0.6, 0.35, 0.65):
        zc = z0 + (z1 - z0)*frac
        ys = sorted(p.y for p in ws if abs(p.x) < 0.003 and abs(p.z - zc) < 0.003)
        gaps = [(ys[i+1]-ys[i], (ys[i+1]+ys[i])/2) for i in range(len(ys)-1)]
        if gaps:
            g = max(gaps)
            if g[0] > 0.006 and (best is None or g[0] > best[0]): best = (g[0], g[1], zc)
    print("CANAL", n, "width %.4f y %.4f z %.4f" % best)
    centres.append(Vector((0, best[1], best[2])))
# cord: extend above C1 and below C7
top = centres[0] + (centres[0] - centres[1]).normalized()*0.02
bot = centres[-1] + (centres[-1] - centres[-2]).normalized()*0.025
pts = [top] + centres + [bot]
def tube(name, points, r, res=12, mat=None):
    cu = bpy.data.curves.new(name, 'CURVE'); cu.dimensions = '3D'
    sp = cu.splines.new('BEZIER'); sp.bezier_points.add(len(points)-1)
    for bp, p in zip(sp.bezier_points, points):
        bp.co = p; bp.handle_left_type = bp.handle_right_type = 'AUTO'
    cu.bevel_depth = r; cu.bevel_resolution = 3; cu.resolution_u = res; cu.use_fill_caps = True
    ob = bpy.data.objects.new(name, cu); bpy.context.collection.objects.link(ob)
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
    bpy.ops.object.convert(target='MESH'); bpy.ops.object.shade_smooth()
    if mat: ob.data.materials.append(mat)
    return ob
def mat(name, rgb):
    m = bpy.data.materials.new(name); m.diffuse_color = (*rgb, 1); return m
mc, mr = mat("Cord", (0.95, 0.85, 0.6)), mat("Root", (0.95, 0.85, 0.6))
cord = tube("Cord", pts, 0.0042, 10, mc)
# nerve roots: one pair below each vertebra (C1..C7), out through the side gap, forward and down
for i in range(7):
    a = centres[i]; b = centres[i+1] if i < 6 else bot
    m = (a + b)/2 if i < 6 else a + (bot - a)*0.55
    for s, tag in ((1, "L"), (-1, "R")):
        p = [m + Vector((s*0.004, 0, 0)), m + Vector((s*0.012, -0.004, -0.002)),
             m + Vector((s*0.022, -0.009, -0.008)), m + Vector((s*0.033, -0.012, -0.02))]
        tube(f"Root_{i}_{tag}", p, 0.0014, 6, mr)
tris = sum(len(p.vertices)-2 for o in bpy.data.objects if o.type=='MESH' for p in o.data.polygons)
print("TRIS_TOTAL", tris)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_yup=True, export_apply=True, export_normals=True,
                          export_texcoords=False, export_materials='EXPORT', export_cameras=False, export_lights=False)

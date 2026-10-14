import bpy, sys, bmesh
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index("--") + 1:]
src_dir, out_glb, ratio_bone, ratio_disc, ratio_cord = argv[0], argv[1], float(argv[2]), float(argv[3]), float(argv[4])

parts = [
    ("C1", "FJ3176"), ("C2", "FJ3177"), ("C3", "FJ3161"), ("C4", "FJ3164"),
    ("C5", "FJ3167"), ("C6", "FJ3170"), ("C7", "FJ3172"),
    ("Disc_C2_C3", "FJ3202"), ("Disc_C3_C4", "FJ3213"), ("Disc_C4_C5", "FJ3218"),
    ("Disc_C5_C6", "FJ3219"), ("Disc_C6_C7", "FJ3220"), ("Disc_C7_T1", "FJ3221"),
]

bpy.ops.wm.read_factory_settings(use_empty=True)
objs = {}
for name, fj in parts:
    bpy.ops.wm.obj_import(filepath=f"{src_dir}/{fj}.obj", forward_axis='Y', up_axis='Z')
    sel = bpy.context.selected_objects
    if len(sel) > 1:
        bpy.context.view_layer.objects.active = sel[0]
        bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active or sel[0]
    o.name = name; o.data.name = name
    objs[name] = o

# mm -> m (applied to mesh data)
for o in objs.values():
    o.data.transform([[0.001,0,0,0],[0,0.001,0,0],[0,0,0.001,0],[0,0,0,1]])

def zr(o):
    zs = [v.co.z for v in o.data.vertices]
    return min(zs), max(zs)

for n, o in objs.items():
    print("RAW", n, len(o.data.polygons), "z %.4f..%.4f" % zr(o))

# Recenter: x,y (lateral/AP) about C1-C7 bbox centre; z=0 at bottom of C7
allv = [v.co for n in ("C1","C2","C3","C4","C5","C6","C7") for v in objs[n].data.vertices]
cx = (min(v.x for v in allv) + max(v.x for v in allv)) / 2
cy = (min(v.y for v in allv) + max(v.y for v in allv)) / 2
cz = zr(objs["C7"])[0]
print("OFFSET_m", cx, cy, cz)
for o in objs.values():
    o.data.transform(Matrix.Translation((-cx, -cy, -cz)))

# Decimate
for n, o in objs.items():
    r = ratio_cord if n == "SpinalCord" else (ratio_disc if n.startswith("Disc") else ratio_bone)
    m = o.modifiers.new("dec", 'DECIMATE'); m.ratio = r
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True)
    bpy.ops.object.modifier_apply(modifier="dec")
    bpy.ops.object.shade_smooth()

# Materials
def mat(name, rgb):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (*rgb, 1); b.inputs["Roughness"].default_value = 0.6
    m.diffuse_color = (*rgb, 1)
    return m
mb, md, mc = mat("Bone", (0.89, 0.85, 0.76)), mat("Disc", (0.55, 0.70, 0.85)), mat("Cord", (0.95, 0.80, 0.30))
for n, o in objs.items():
    o.data.materials.clear()
    o.data.materials.append(mc if n == "SpinalCord" else (md if n.startswith("Disc") else mb))

tot = 0
for n, o in objs.items():
    t = sum(len(p.vertices) - 2 for p in o.data.polygons); tot += t
    print("TRIS", n, t)
print("TRIS_TOTAL", tot)

bpy.ops.export_scene.gltf(filepath=out_glb, export_format='GLB', export_yup=True,
                          export_apply=True, export_normals=True, export_texcoords=False,
                          export_materials='EXPORT', export_cameras=False, export_lights=False)
bpy.ops.wm.save_as_mainfile(filepath=out_glb.replace(".glb", "_work.blend"))

"""Delete the thin shells an image-to-3D scan leaves floating just in front of the face (patient14: bangs whose flaps
carry baked skin). A face counts when a ray from it into the head (+y in Blender, the face looks toward -y) hits the
skin within gap metres; only faces inside the box (z0 < z < z1, |x| < xmax, front half) are tested.

The flaps were part of the hairline, so it opens there: the game draws such a head double-sided (MODELS.<id>.twoSided)
and the hair behind shows instead of the table (capping the holes stretched the texture into streaks).

  blender -b -t 4 -P scripts/assets/image3d_flaps.py -- <head.glb> <out.glb> <z0> <z1> <xmax> <gap>
"""
import bpy, sys, bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree
A = sys.argv[sys.argv.index("--")+1:]
src, out = A[0], A[1]; Z0, Z1, XM, GAP = map(float, A[2:6])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
o = [o for o in bpy.data.objects if o.type == "MESH"][0]
M = o.matrix_world; Mi = M.inverted()
bm = bmesh.new(); bm.from_mesh(o.data); bm.transform(M)
bvh = BVHTree.FromBMesh(bm)
bm.faces.ensure_lookup_table()
kill = []
back = Vector((0, 1, 0))     # into the head (the face looks toward -y)
for f in bm.faces:
    c = f.calc_center_median()
    if not (Z0 < c.z < Z1 and abs(c.x) < XM and c.y < -0.03): continue
    hit = bvh.ray_cast(c + back*0.0005, back, GAP)
    if hit[0] is not None and hit[2] != f.index: kill.append(f)
print("FLAPS", len(kill))
bmesh.ops.delete(bm, geom=kill, context="FACES")
bm.transform(Mi); bm.to_mesh(o.data); o.data.update()
bpy.ops.object.select_all(action="DESELECT"); o.select_set(True)
for c in o.children_recursive: c.select_set(True)
bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", use_selection=False, export_image_format="AUTO")

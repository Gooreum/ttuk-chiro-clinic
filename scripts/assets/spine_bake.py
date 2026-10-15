# blender -b spurs.blend --python spine_bake.py -- OUT_baked.blend OUT_raw.glb [samples]
# Ambient occlusion + cavity per part, baked in Cycles into a vertex colour (COLOR_0 in the glTF: one value copied
# to R, G and B, 0..1; about 0.35 deep in the foramina and canal, 1 on open bone). Bones and spurs: AO distance 12 mm (AO^1.8);
# each bone is baked alone (the bones move separately at runtime), a spur together with its vertebra so it darkens
# where it grows out of the body. Discs: 6 mm and half the darkening. Cord and roots: no colour.
#
# Export: every part becomes an empty node named like the part (C1, Disc_C2_C3, Spur_C5, Cord, Root_0_L, ...) sitting
# on the part's origin (the "origin" property set by spine_build.py / spine_cord.py / spine_spurs.py), with the mesh
# as a child "<name>_geo". meshopt quantization rewrites the mesh node's transform but never the empty, so the
# runtime's "node origin = part centre" stays exactly where the build put it.
import bpy, sys
import numpy as np
from mathutils import Vector
argv = sys.argv[sys.argv.index("--") + 1:]
out_blend, out_glb = argv[0], argv[1]
SAMPLES = int(argv[2]) if len(argv) > 2 else 96

sc = bpy.context.scene
sc.render.engine = 'CYCLES'
sc.cycles.device = 'CPU'
sc.cycles.samples = SAMPLES
sc.world = sc.world or bpy.data.worlds.new("World")

def mat(name, rgb, rough):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (*rgb, 1); b.inputs["Roughness"].default_value = rough
    m.diffuse_color = (*rgb, 1)
    return m
M = {"Bone": mat("Bone", (0.89, 0.85, 0.76), 0.6), "Disc": mat("Disc", (0.55, 0.70, 0.85), 0.4),
     "Cord": mat("Cord", (0.95, 0.85, 0.6), 0.5), "Root": mat("Root", (0.95, 0.85, 0.6), 0.5)}
meshes = [o for o in sc.objects if o.type == 'MESH']
for o in meshes:
    kind = "Disc" if o.name.startswith("Disc") else "Cord" if o.name == "Cord" else "Root" if o.name.startswith("Root") \
        else "Bone"
    o.data.materials.clear(); o.data.materials.append(M[kind])

def cavity(me):
    """per-vertex concavity from the edge neighbours, 1 = flat/convex, lower in creases."""
    n = len(me.vertices)
    co = np.empty(n*3); me.vertices.foreach_get("co", co); co = co.reshape(-1, 3)
    nv = np.empty(n*3); me.vertices.foreach_get("normal", nv); nv = nv.reshape(-1, 3)
    e = np.empty(len(me.edges)*2, dtype=np.int64); me.edges.foreach_get("vertices", e); e = e.reshape(-1, 2)
    d = co[e[:, 1]] - co[e[:, 0]]; L = np.linalg.norm(d, axis=1) + 1e-9
    c = np.zeros(n); k = np.zeros(n)
    np.add.at(c, e[:, 0], (nv[e[:, 0]]*d).sum(1)/L); np.add.at(k, e[:, 0], 1)
    np.add.at(c, e[:, 1], -(nv[e[:, 1]]*d).sum(1)/L); np.add.at(k, e[:, 1], 1)
    c /= np.maximum(k, 1)
    for _ in range(3):                                   # smooth over the neighbours
        s = np.zeros(n); np.add.at(s, e[:, 0], c[e[:, 1]]); np.add.at(s, e[:, 1], c[e[:, 0]])
        c = 0.5*c + 0.5*s/np.maximum(k, 1)
    return np.clip(1 - 1.6*np.clip(c, 0, None), 0.55, 1)

def bake(o, partners, dist):
    for x in meshes: x.hide_render = x not in [o] + partners
    sc.world.light_settings.distance = dist
    me = o.data
    attr = me.color_attributes.get("AO") or me.color_attributes.new("AO", 'FLOAT_COLOR', 'POINT')
    me.color_attributes.active_color = attr; me.attributes.default_color_name = attr.name
    me.attributes.active_color_name = attr.name
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.object.bake(type='AO', target='VERTEX_COLORS', use_clear=True, margin=0)
    a = np.empty(len(attr.data)*4); attr.data.foreach_get("color", a); ao = a.reshape(-1, 4)[:, 0]
    return ao

for o in meshes:
    if o.name == "Cord" or o.name.startswith("Root"): continue
    disc = o.name.startswith("Disc")
    partners = [bpy.data.objects[o.name[5:]]] if o.name.startswith("Spur_") else []
    ao = bake(o, partners, 0.006 if disc else 0.012)
    v = (0.30 + 0.70*np.clip(ao, 0, 1)**1.8) * cavity(o.data)
    v = np.clip(v, 0.30, 1.0)
    if disc: v = 1 - 0.5*(1 - v)
    attr = o.data.color_attributes["AO"]
    rgba = np.repeat(v, 4).reshape(-1, 4); rgba[:, 3] = 1
    attr.data.foreach_set("color", rgba.ravel())
    print("AO %-11s verts %5d  min %.2f  p5 %.2f  median %.2f" % (o.name, len(v), v.min(), np.percentile(v, 5),
          np.median(v)))
for x in meshes: x.hide_render = False
bpy.ops.wm.save_as_mainfile(filepath=out_blend)

# wrap each part in an empty at its origin
for o in meshes:
    name = o.name
    org = Vector(o.get("origin", o.location))
    e = bpy.data.objects.new(name + "_tmp", None); sc.collection.objects.link(e)
    e.location = org
    o.name = name + "_geo"; e.name = name
    bpy.context.view_layer.update()
    mw = o.matrix_world.copy()
    o.parent = e; o.matrix_parent_inverse.identity(); o.matrix_world = mw
    bpy.context.view_layer.update()
    assert (o.matrix_world.translation - mw.translation).length < 1e-9

tot = 0
for o in meshes:
    t = sum(len(p.vertices) - 2 for p in o.data.polygons); tot += t
    print("TRIS %-14s %d" % (o.name, t))
print("TRIS_TOTAL", tot)
bpy.ops.export_scene.gltf(filepath=out_glb, export_format='GLB', export_yup=True, export_apply=True,
                          export_normals=True, export_texcoords=False, export_materials='EXPORT',
                          export_vertex_color='ACTIVE', export_active_vertex_color_when_no_material=True,
                          export_cameras=False, export_lights=False)

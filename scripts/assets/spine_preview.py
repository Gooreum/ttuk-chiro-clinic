# blender -b IN.blend --python spine_preview.py -- OUT_DIR [tag]
# Cycles previews of the x-ray spine (AP, lateral, oblique and a C4-C7 close-up of the spurs), orthographic, colours times the baked AO.
import bpy, sys, os, math
from mathutils import Vector
argv = sys.argv[sys.argv.index("--") + 1:]
out = argv[0]; tag = argv[1] if len(argv) > 1 else "spine"
os.makedirs(out, exist_ok=True)
sc = bpy.context.scene
# Cycles, 3-point-ish light: bone ivory, discs blue, cord yellow, each multiplied by the baked "AO" vertex colour
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 48; sc.cycles.use_denoising = True
sc.render.resolution_x, sc.render.resolution_y = 900, 1500
sc.world = sc.world or bpy.data.worlds.new("W"); sc.world.use_nodes = True
bg = sc.world.node_tree.nodes["Background"]; bg.inputs[0].default_value = (0.06, 0.075, 0.08, 1); bg.inputs[1].default_value = 1
sc.view_settings.view_transform = 'Standard'
def pmat(name, rgb):
    m = bpy.data.materials.new(name + "_prev"); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes["Principled BSDF"]; b.inputs["Roughness"].default_value = 0.55
    at = nt.nodes.new("ShaderNodeAttribute"); at.attribute_name = "AO"
    mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'
    mix.inputs[0].default_value = 1; mix.inputs[6].default_value = (*rgb, 1)
    nt.links.new(at.outputs["Color"], mix.inputs[7]); nt.links.new(mix.outputs[2], b.inputs["Base Color"])
    return m
PM = {"bone": pmat("bone", (0.85, 0.8, 0.7)), "disc": pmat("disc", (0.45, 0.65, 0.85)),
      "cord": pmat("cord", (0.95, 0.78, 0.35)), "spur": pmat("spur", (0.95, 0.62, 0.45))}
for o in sc.objects:
    if o.type != 'MESH': continue
    n = o.name
    k = "disc" if n.startswith("Disc") else "cord" if n.startswith(("Cord", "Root")) else "spur" if n.startswith("Spur") \
        else "bone"
    if k == "cord" and "AO" not in o.data.color_attributes:
        a = o.data.color_attributes.new("AO", 'FLOAT_COLOR', 'POINT')
        for d in a.data: d.color = (1, 1, 1, 1)
    o.data.materials.clear(); o.data.materials.append(PM[k])
for nm, rot, e in (("key", (0.9, 0.3, -0.6), 3.5), ("fill", (1.2, -0.2, 2.4), 1.2), ("rim", (-1.0, 0.0, 3.0), 1.5)):
    l = bpy.data.lights.new(nm, 'SUN'); l.energy = e; l.angle = 0.3
    lo_ = bpy.data.objects.new(nm, l); lo_.rotation_euler = rot; sc.collection.objects.link(lo_)
pts = [o.matrix_world @ Vector(c) for o in sc.objects if o.type == 'MESH' for c in o.bound_box]
lo = Vector([min(p[i] for p in pts) for i in range(3)]); hi = Vector([max(p[i] for p in pts) for i in range(3)])
c = (lo + hi)/2
cam = bpy.data.cameras.new("cam"); cam.type = 'ORTHO'; cam.ortho_scale = (hi.z - lo.z)*1.08
co = bpy.data.objects.new("cam", cam); sc.collection.objects.link(co); sc.camera = co
views = {"front": (Vector((0, -1, 0)), (math.radians(90), 0, 0)),
         "lateral": (Vector((1, 0, 0)), (math.radians(90), 0, math.radians(90))),
         "oblique": (Vector((0.7, -0.7, 0.15)).normalized(), None)}
def shoot(k, d, centre):
    co.location = centre + d*0.6
    co.rotation_euler = (d*-1).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = os.path.join(out, f"{tag}_{k}.png")
    bpy.ops.render.render(write_still=True)
    print("WROTE", sc.render.filepath)
for k, (d, rot) in views.items(): shoot(k, d, c)
# close-up of the spondylosis levels (C4-T1) with the spurs
near = [o for o in sc.objects if o.type == 'MESH' and o.name.split("_")[0] in ("C4", "C5", "C6", "C7", "Spur")]
if any(o.name.startswith("Spur") for o in near):
    pts = [o.matrix_world @ Vector(q) for o in near for q in o.bound_box]
    zc = (min(p.z for p in pts) + max(p.z for p in pts))/2
    cam.ortho_scale = 0.075; sc.render.resolution_x, sc.render.resolution_y = 1100, 1100
    cc = Vector((0, min(p.y for p in pts) + 0.012, zc))
    shoot("spurs_lateral", Vector((1, 0, 0)), cc)
    shoot("spurs_oblique", Vector((0.6, -0.8, 0.1)).normalized(), cc)

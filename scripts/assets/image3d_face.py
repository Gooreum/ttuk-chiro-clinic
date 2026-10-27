"""Unlit orthographic front view of an image-to-3D head, the canvas its expression paintings go on
(scripts/assets/image3d_expr.py). The square must match MODELS.<id>.face in src/scene/realAssets.js.

  blender -b -t 4 -P scripts/assets/image3d_face.py -- <head.glb> <front.png> [x y size]   (default: patient11's square)
"""
import bpy, sys
argv = sys.argv[sys.argv.index("--")+1:]
src, out = argv[0], argv[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
sc = bpy.context.scene
# GLB (x, y, z) -> Blender (x, -z, y): the face (+Z) looks toward Blender -Y
X0, Y0, SIZE = map(float, argv[2:5]) if len(argv) > 4 else (0.0, 1.51, 0.22)   # GLB centre x, centre y, square side (m)
cam = bpy.data.cameras.new("c"); cam.type = "ORTHO"; cam.ortho_scale = SIZE
co = bpy.data.objects.new("c", cam); sc.collection.objects.link(co); sc.camera = co
co.location = (X0, -1.0, Y0); co.rotation_euler = (1.5707963, 0, 0)
sc.render.engine = "BLENDER_WORKBENCH"
sc.display.shading.light = "FLAT"; sc.display.shading.color_type = "TEXTURE"
sc.view_settings.view_transform = "Standard"
sc.render.resolution_x = sc.render.resolution_y = 1024
sc.render.film_transparent = True
sc.render.filepath = out
bpy.ops.render.render(write_still=True)

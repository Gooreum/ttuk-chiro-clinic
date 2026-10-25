# The standing image-to-3D mesh in the game's GLB space, whole (no neck cut): the same scale, turn, tilt and centring as
# image3d_patient.py, so a rigged copy (image3d_rig.py) lines up with the clinic head / body GLBs.
# usage: blender -b -t 4 --python image3d_norm.py -- <src.glb> <out.glb> [tall m] [cut z]   (scripts/assets/README.md)
import bpy, sys, math
from mathutils import Vector, Matrix
A=sys.argv[sys.argv.index("--")+1:]; SRC,OUT=A[:2]
TALL=float(A[2]) if len(A)>2 else 1.65; CUT=float(A[3]) if len(A)>3 else 1.40
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
src=[o for o in bpy.data.objects if o.type=="MESH"][0]
bpy.context.view_layer.objects.active=src; src.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
for o in list(bpy.data.objects):
    if o!=src: bpy.data.objects.remove(o)
me=src.data
zs=[v.co.z for v in me.vertices]; bot=min(zs); s=TALL/(max(zs)-bot)
R=Matrix.Rotation(-math.pi/2,3,'Z')   # the model faces +x; GLB +z (face) is blender -y
for v in me.vertices: v.co=R@((v.co-Vector((0,0,bot)))*s)
nk=[v.co for v in me.vertices if CUT<v.co.z<CUT+0.03]; an=[v.co for v in me.vertices if v.co.z<0.10]
ny=sum(p.y for p in nk)/len(nk); ay=sum(p.y for p in an)/len(an)
T=Matrix.Rotation(math.atan2(ny-ay, CUT),3,'X')
for v in me.vertices: v.co=T@v.co
neck=[v.co for v in me.vertices if CUT<v.co.z<CUT+0.03 and abs(v.co.x)<0.06]
cx=sum(p.x for p in neck)/len(neck); cy=sum(p.y for p in neck)/len(neck)
for v in me.vertices: v.co.x-=cx; v.co.y-=cy
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_image_format="AUTO")
print("DONE", len(me.polygons))

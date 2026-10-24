# image-to-3D patient (patient11, 2026-10-24): a static standing mesh (Tripo multi-view, simplified with gltf-transform) -> head GLB
# (static, cut at mid-neck) + body GLB (2-bone skin "body"/"neck" and a "breath" key) in the MPFB exports' GLB space.
# usage: blender -b -t 4 --python image3d_patient.py -- <src.glb> <head.glb> <body.glb> <pid> [tall m] [cut z] [rx ry]   (scripts/assets/README.md)
# tall/cut default to patient11 (1.65, 1.40 mid-neck, a flat cut). rx ry (patient12 마동철, neck buried in the traps, cut at the jaw
# line): above the cut the head is only what lies inside an upright elliptic wall (rx across, ry front-back; 32 vertical planes) up
# to CUT2, so the traps beside the jaw stay on the body. The game's MODELS.<pid>.seam names the same cut and ellipse.
import bpy, bmesh, sys, math
from mathutils import Vector
A=sys.argv[sys.argv.index("--")+1:]; SRC,HEAD,BODY,PID=A[:4]
TALL=float(A[4]) if len(A)>4 else 1.65; CUT=float(A[5]) if len(A)>5 else 1.40
RX,RY=(float(A[6]),float(A[7])) if len(A)>7 else (0,0); CUT2=CUT+0.05
WALL=[(Vector((RX*math.cos(t),RY*math.sin(t),0)),Vector((math.cos(t)/RX,math.sin(t)/RY,0)).normalized()) for t in [k*math.pi/16 for k in range(32)]] if RX else []
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
src=[o for o in bpy.data.objects if o.type=="MESH"][0]
bpy.context.view_layer.objects.active=src; src.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
for o in list(bpy.data.objects):
    if o!=src: bpy.data.objects.remove(o)
me=src.data
zs=[v.co.z for v in me.vertices]; top=max(zs); bot=min(zs)
H=top-bot
# put feet on z 0 at TALL, body centred in x/y at the neck
s=TALL/H
from mathutils import Matrix
R=Matrix.Rotation(-math.pi/2,3,'Z')   # the model faces +x; GLB +z (face) is blender -y
for v in me.vertices: v.co=R@((v.co-Vector((0,0,bot)))*s)
# the standing mesh leans back: tilt it about x so the neck sits straight over the ankles (else it lies head-down, feet up)
nk=[v.co for v in me.vertices if CUT<v.co.z<CUT+0.03]; an=[v.co for v in me.vertices if v.co.z<0.10]
ny=sum(p.y for p in nk)/len(nk); ay=sum(p.y for p in an)/len(an)
tilt=math.atan2(ny-ay, CUT); print("TILT deg", math.degrees(tilt))
T=Matrix.Rotation(tilt,3,'X')
for v in me.vertices: v.co=T@v.co
top=TALL
neck=[v.co for v in me.vertices if CUT<v.co.z<CUT+0.03 and abs(v.co.x)<0.06]
cx=sum(p.x for p in neck)/len(neck); cy=sum(p.y for p in neck)/len(neck)
for v in me.vertices: v.co.x-=cx; v.co.y-=cy
print("TOP",top,"CUT",CUT)
def split(keep_above):
    o=src.copy(); o.data=src.data.copy(); bpy.context.scene.collection.objects.link(o)
    bm=bmesh.new(); bm.from_mesh(o.data)
    geom=bm.verts[:]+bm.edges[:]+bm.faces[:]
    if not WALL:
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0,0,CUT), plane_no=(0,0,1), clear_inner=keep_above, clear_outer=not keep_above)
    else:
        # cut along the plane and the wall, then keep whole faces: the halves are complementary, so their rims meet exactly
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0,0,CUT), plane_no=(0,0,1))
        for p,nrm in WALL:
            band=[f for f in bm.faces if any(CUT-0.002<v.co.z<CUT2+0.03 for v in f.verts)]
            bmesh.ops.bisect_plane(bm, geom=list({x for f in band for x in (*f.verts,*f.edges)})+band, plane_co=p, plane_no=nrm)
        head_face=lambda c: c.z>CUT and (c.z>CUT2 or all((c-p).dot(nrm)<0 for p,nrm in WALL))
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if head_face(f.calc_center_median())!=keep_above], context="FACES")
    bm.to_mesh(o.data); bm.free(); return o
head=split(True); body=split(False)
bpy.data.objects.remove(src)
# measurements (GLB: y = blender z, z = -blender y)
hv=[v.co for v in head.data.vertices]
crown=max(p.z for p in hv)
nose=min(p.y for p in hv if p.z>CUT+0.05)
chin=min(p.z for p in hv if p.y < nose+0.045 and abs(p.x)<0.02)
back=-max(p.y for p in hv if p.z>chin)
bv=[v.co for v in body.data.vertices]
for a,b in ((0.75,0.95),(0.95,1.15),(1.15,1.37)): print("TORSO back z %.2f-%.2f: %.4f" % (a,b,-max(p.y for p in bv if a<p.z<b and abs(p.x)<0.2)))
print("MEASURE (GLB space) crown y %.4f  chin y %.4f  back of skull z %.4f  nose %.4f" % (crown, chin, back, nose))
head.name=PID; head.data.materials[0].name=PID+".body"
# body: own material copy, 2-bone skin, breath key
bm_mat=head.data.materials[0].copy(); bm_mat.name=PID+".skin"; body.data.materials[0]=bm_mat
body.name=PID+"_body"
arm=bpy.data.armatures.new(PID+"_rig"); ao=bpy.data.objects.new(PID+"_rig",arm); bpy.context.scene.collection.objects.link(ao)
bpy.context.view_layer.objects.active=ao; bpy.ops.object.mode_set(mode="EDIT")
b=arm.edit_bones.new("body"); b.head=(0,0,0.95); b.tail=(0,0,1.30)
n=arm.edit_bones.new("neck"); n.head=(0,0,1.30); n.tail=(0,0,CUT); n.parent=b
bpy.ops.object.mode_set(mode="OBJECT")
gb=body.vertex_groups.new(name="body"); gn=body.vertex_groups.new(name="neck")
for v in body.data.vertices:
    w=min(1,max(0,(v.co.z-1.30)/(CUT-1.30))) if abs(v.co.x)<0.09 else 0
    gb.add([v.index],1-w,"REPLACE"); gn.add([v.index],w,"REPLACE")
body.parent=ao; m=body.modifiers.new("arm","ARMATURE"); m.object=ao
# breath: chest rises forward (-y) up to 2.2 cm, belly 1.2 cm, shoulders shrug toward the head 2 cm
body.shape_key_add(name="Basis"); k=body.shape_key_add(name="breath")
def sm(a,b,x): t=min(1,max(0,(x-a)/(b-a))); return t*t*(3-2*t)
for i,v in enumerate(body.data.vertices):
    p=v.co; d=Vector((0,0,0))
    if abs(p.x)<0.2 and p.y<0.02:
        chest=sm(0.98,1.12,p.z)*(1-sm(1.26,1.36,p.z)); belly=sm(0.92,1.0,p.z)*(1-sm(1.0,1.08,p.z))
        d.y-=0.022*chest+0.012*belly
    d.z+=0.02*sm(1.2,1.32,p.z)*sm(0.06,0.14,abs(p.x))
    k.data[i].co=p+d
def export(objs, path):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs: o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_image_format="AUTO", export_morph_normal=False, export_skins=True, export_apply=False)
export([head],HEAD); export([body,ao],BODY)
print("DONE", len(head.data.polygons), len(body.data.polygons))

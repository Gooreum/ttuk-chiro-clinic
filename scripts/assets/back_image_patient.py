"""Back-press mode body for an image-to-3D patient (patient11..14): its rigged scan (image3d_rig.py) posed PRONE the way
back_patient.py poses 박대리, as one static GLB in three.js world coordinates plus the height field of its back.
   - pose: arms along the sides (ARM_OUT per patient: 마동철's arms hang off a torso wider than the pad), elbows a touch
     bent, solved so the arms and thighs rest on the pad; feet pointed; the neck and head straightened onto the upper
     spine (복순할매's hunch would push her face into the table)
   - the pad plane: the chest front sinking SINK; a belly that sticks out past the chest (마동철) meets it half way and
     squashes into the pad
   - soft tissue on the pad and the prone transform as in back_patient.py (the base of the neck at three.js z NECK_Z)
   - the scan keeps its own texture (lighting baked in by the scan); one mesh, material "<pid>.skin"
   usage: blender -b <rig.blend> --python back_image_patient.py -- <pid> out_raw.glb surface.json"""
import bpy, sys, os, math, json
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
ARGS=sys.argv[sys.argv.index("--")+1:]
PID, OUT, SURF = ARGS[:3]
TABLE_TOP=0.82; SINK=0.014; SOFT=0.012; NECK_Z=-0.07
HIP_FLEX=-3.0; FOOT_POINT=72.0
ARM_OUT={"patient11": 0.15, "patient12": 0.30, "patient13": 0.18, "patient14": 0.12}[PID]
GRID=dict(x0=-0.34, x1=0.34, z0=-0.62, z1=0.86, step=0.01)

arm=next(o for o in bpy.data.objects if o.type=="ARMATURE"); scan=next(o for o in bpy.data.objects if o.type=="MESH")
AW=arm.matrix_world; BN=arm.data.bones; PB=arm.pose.bones
NECK=AW@BN["neck_01"].head_local; PELVIS=AW@BN["pelvis"].head_local; HEADB=AW@BN["head"].head_local
bpy.context.view_layer.objects.active=arm
bpy.ops.object.mode_set(mode="POSE")
def upd(): bpy.context.view_layer.update()
def turn(pb, R, h):
    upd(); pb.matrix=AW.inverted()@Matrix.Translation(h)@R.to_4x4()@Matrix.Translation(-h)@AW@pb.matrix
def head(pb): upd(); return AW@pb.head
def axis(pb): upd(); return (AW@pb.tail-AW@pb.head).normalized()
def aim(pb, target): turn(pb, axis(pb).rotation_difference(target.normalized()).to_matrix(), head(pb))
def Rx(deg): return Matrix.Rotation(math.radians(deg), 3, "X")

def pose(tilt, hip=HIP_FLEX):
    for pb in PB: pb.matrix_basis=Matrix.Identity(4)
    upd()
    up=axis(PB["spine_03"]); aim(PB["neck_01"], up); aim(PB["head"], up)
    for sd,s in (("l",1),("r",-1)):
        aim(PB["upperarm_"+sd], Vector((s*ARM_OUT, -tilt, -1)))
        aim(PB["lowerarm_"+sd], Vector((s*ARM_OUT*0.4, -tilt*1.5, -1)))
        aim(PB["hand_"+sd], axis(PB["lowerarm_"+sd]))
        turn(PB["thigh_"+sd], Rx(hip), head(PB["thigh_"+sd]))
        turn(PB["calf_"+sd], Rx(-hip*0.25), head(PB["calf_"+sd]))
        turn(PB["foot_"+sd], Rx(FOOT_POINT), head(PB["foot_"+sd]))
    upd()

dg=bpy.context.evaluated_depsgraph_get()
GROUPS={"arm":["upperarm_l","lowerarm_l","hand_l","upperarm_r","lowerarm_r","hand_r"], "leg":["thigh_l","calf_l","thigh_r","calf_r"]}
names={g.index: g.name for g in scan.vertex_groups}
GV={k:[v.index for v in scan.data.vertices if sum(g.weight for g in v.groups if names[g.group] in ns)>0.5] for k,ns in GROUPS.items()}
TORSO_Z=(PELVIS.z+0.05, NECK.z-0.04)
def fronts():
    dg.update(); me=scan.evaluated_get(dg).to_mesh(); W=scan.matrix_world
    res={k: min((W@me.vertices[i].co).y for i in ids) for k,ids in GV.items()}
    torso=[(W@v.co) for v in me.vertices if TORSO_Z[0]<(W@v.co).z<TORSO_Z[1] and abs((W@v.co).x)<0.16]
    res["chest"]=min(p.y for p in torso if p.z>(TORSO_Z[0]+TORSO_Z[1])/2); res["belly"]=min(p.y for p in torso)
    scan.evaluated_get(dg).to_mesh_clear(); return res
tilt=0.12; hip=HIP_FLEX
for it in range(14):
    pose(tilt, hip); f=fronts(); plane=(f["chest"] if f["chest"]-f["belly"] < 0.03 else (f["chest"]+f["belly"])/2)+SINK
    err=f["arm"]-(plane+0.004); errl=f["leg"]-(plane+0.002)
    print("POSE it %d tilt %.3f hip %.1f | front: chest %.3f belly %.3f arm %.3f leg %.3f | plane %.3f err arm %+.4f leg %+.4f" % (it, tilt, hip, f["chest"], f["belly"], f["arm"], f["leg"], plane, err, errl))
    if abs(err)<0.0015 and abs(errl)<0.002: break
    tilt+=err*1.6; hip=max(-25, min(15, hip-errl*110))
PLANE_Y=plane
bpy.ops.object.mode_set(mode="OBJECT")

# ---- apply the pose, drop the rig ----
bpy.context.view_layer.objects.active=scan
for m in list(scan.modifiers): bpy.ops.object.modifier_apply(modifier=m.name)
mw=scan.matrix_world.copy(); scan.parent=None; scan.matrix_world=mw
bpy.data.objects.remove(arm, do_unlink=True)
bpy.ops.object.select_all(action="DESELECT"); scan.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
for g in list(scan.vertex_groups): scan.vertex_groups.remove(g)

# ---- soft tissue on the pad (back_patient.py) ----
def soft(y):
    u=y-PLANE_Y
    if u>=SOFT: return y
    return PLANE_Y+SOFT-SOFT*(1-math.exp(-(SOFT-u)/SOFT))
HEAD_FREE=NECK.z+0.02
for v in scan.data.vertices:
    if v.co.z>HEAD_FREE: continue
    y=soft(v.co.y); f=min(1.0, max(0.0, (HEAD_FREE-v.co.z)/0.05))
    v.co.y+=(y-v.co.y)*f
scan.data.update()

# ---- prone ----
TY=TABLE_TOP-PLANE_Y; TZ=NECK.z+NECK_Z
M=Matrix(((-1,0,0,0),(0,0,1,-TZ),(0,1,0,TY),(0,0,0,1)))
scan.data.transform(M); scan.data.update()   # a proper rotation (det +1): the normals stay
scan.name=scan.data.name="back_patient_skin"; scan.data.materials[0].name=PID+".skin"
for p in scan.data.polygons: p.use_smooth=True
to3=lambda p: (lambda q: (round(q.x,4), round(q.z,4), round(-q.y,4)))(M@p)
for nm,p in (("neck_01 (C7/T1)",NECK),("pelvis",PELVIS),("head",HEADB)): print("MEASURE", nm, "three.js", to3(p))
V=[v.co for v in scan.data.vertices]
print("BBOX three.js x %.3f..%.3f y %.3f..%.3f z %.3f..%.3f" % (min(p.x for p in V),max(p.x for p in V),min(p.z for p in V),max(p.z for p in V),-max(p.y for p in V),-min(p.y for p in V)))

# ---- height field of the top surface (three.js y) ----
tree=BVHTree.FromPolygons([v.co.copy() for v in scan.data.vertices], [list(p.vertices) for p in scan.data.polygons])
nx=int(round((GRID["x1"]-GRID["x0"])/GRID["step"]))+1; nz=int(round((GRID["z1"]-GRID["z0"])/GRID["step"]))+1
hf=[]
for j in range(nz):
    z=GRID["z0"]+j*GRID["step"]
    for i in range(nx):
        hit=tree.ray_cast(Vector((GRID["x0"]+i*GRID["step"], -z, 3.0)), Vector((0,0,-1)))
        hf.append(round(hit[0].z,4) if hit[0] is not None else None)
with open(SURF,"w") as fh:
    json.dump(dict(GRID, nx=nx, nz=nz, tableTop=TABLE_TOP, neckZ=round(to3(NECK)[2],4), pelvisZ=round(to3(PELVIS)[2],4),
                   headZ=round(to3(HEADB)[2],4), y=hf), fh, separators=(",",":"))
mid=[hf[j*nx+nx//2] for j in range(nz)]
print("SPINE y (x=0) every 5 cm:", [(round(GRID["z0"]+j*GRID["step"],2), mid[j]) for j in range(0,nz,5)])
bpy.ops.object.select_all(action="DESELECT"); scan.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True, export_skins=False, export_animations=False,
    export_morph=False, export_apply=False, export_yup=True, export_image_format="AUTO", export_extras=False)
print("WROTE", OUT, os.path.getsize(OUT))

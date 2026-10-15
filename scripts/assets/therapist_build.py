"""Therapist body (towel traction 3rd-person view) from an MPFB (MakeHuman, CC0) character, plus his stool, as one static GLB.
   - a ~32-year-old Asian male, skin middleage_asian_male (same map as arms.glb), black short04 hair, eyebrow001,
     eyelashes01, low-poly eyes (dark brown iris), the male_casualsuit06 T-shirt + jeans, white shoes05 sneakers
   - posed with the game_engine rig: SITTING on a low round clinic stool behind the patient's head, trunk upright and
     leaning LEAN degrees back (the towel is pulled toward him), neck and head flexed so the face looks down at the
     patient's face, knees bent, thighs sloping down under the head end of the table, feet flat on the floor. The pose
     is solved so the two shoulder joints (upperarm heads) land on the arm IK anchors of realAssets.js (camBase (0, 1.55,
     -0.24) + (+-0.19, -0.33, -0.03)); the stool's seat is built under the solved buttocks and the shoes stand on y 0
     (user: "치료자가 환자 얼굴이랑 너무 가까움. 수건을 뒤로 당겨야 되는데..." -- the old 42 deg forward bend, 2026-10-15)
   - the arms are removed from the shoulder down (arms.glb supplies them): skin weighted to the arm bones and anything
     past a plane at CUT_T along the upper arm; the T-shirt keeps its sleeve cap up to that plane and the cut is closed
     with a cap, so the arm's own sleeve (which starts at 12 %) overlaps it and no hole shows
   - pose applied, rig dropped: static meshes in world space, three.js coordinates after export (y up, +z = facing)
   - skin: kept UV islands repacked, Cycles bake of diffuse x ambient occlusion; shirt / pants: the shirt's own AO map x
     baked scene AO (the head, arms-length and stool shade them), coloured by the base colour factor (shirt = coat white
     0xf4f1ea, pants = navy) so the game can tint them like arms.glb's sleeve; hair, brows, lashes, eyes, shoes keep
     their asset textures
   - `stool`: padded round seat (36 cm, bevelled cushion), black seat pan, chrome gas-lift column in a black sleeve,
     5-star base (one leg straight back) with twin-wheel casters; untextured PBR materials stool.seat / stool.black /
     stool.chrome
   - empties mark_shoulder_l / _r, mark_eyes, mark_hip (midpoint of the hip joints: pivot for a small lean back while
     pulling), mark_fall (floor point at the back edge of the back caster, x 0: the pivot the body + stool tip over)
   usage: blender -b --python therapist_build.py -- out_raw.glb [bake_size=1024] [cycles_samples=16] [preview_dir]
          bake_size 0 = no baking (quick pose check); preview_dir renders the game's towel camera + a side view with
          stand-ins for the table, the patient's head and the arms (not exported)"""
import bpy, bmesh, importlib, sys, os, math
import numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
P="bl_ext.user_default.mpfb"
HS=importlib.import_module(P+".services.humanservice").HumanService
TS=importlib.import_module(P+".services.targetservice").TargetService
LS=importlib.import_module(P+".services.locationservice").LocationService
ARGS=sys.argv[sys.argv.index("--")+1:]
OUT=ARGS[0]; BAKE=int(ARGS[1]) if len(ARGS)>1 else 1024; SAMPLES=int(ARGS[2]) if len(ARGS)>2 else 16
PREVIEW=ARGS[3] if len(ARGS)>3 else ""

# ---- targets, three.js world (m): x = x, y = up, z = toward the patient's feet. Blender: (x, -z, y) ----
def B3(x, y, z): return Vector((x, -z, y))          # three.js point -> Blender
CAM=(0.0, 1.55, -0.24)                               # camBase (src/input/orientation.js, default aspect)
SHOULDER=(0.19, -0.33, -0.03)                        # realAssets.js SHOULDER (offset from camBase)
SH_T=B3(SHOULDER[0], CAM[1]+SHOULDER[1], CAM[2]+SHOULDER[2])   # left shoulder target (x mirrored for the right)
FACE_T=B3(0.0, 1.11, 0.12)                           # the patient's face (eyes), looked at from above
LEAN=-16.0           # trunk bone lean (degrees, + = forward): the rest spine leans forward ~6 deg, so the hip -> shoulder
                     # line ends up ~8 deg back from vertical (MEASURE trunk): upright, leaning back against the towel
LEAN_SPLIT={"pelvis":0.5, "spine_01":0.2, "spine_02":0.15, "spine_03":0.15}
EYES_DOWN=14.0       # the eyes look this far below where the face points (the head does not flex all the way)
NECK_SPLIT=0.55      # share of the head flexion taken by neck_01 (the rest by the head bone)
UPPER_FLEX=0.08      # share of the head flexion taken by spine_03 (shoulders round a little over the patient)
ANKLE_FWD=0.30       # ankles this far in front of the hip joints (three.js +z, m): shins slope back under the knees
ANKLE_X=0.17         # ankles this far either side of the middle (m): knees apart, the feet clear the table's base
KNEE_OUT=0.35        # knee pole: forward + this much outward
# the room's treatment table (src/scene/room.js): pad top 0.84 from z -0.06; head extension (0.48 wide) y 0.78..0.88,
# z -0.49..-0.05; steel frame y 0.62..0.66 from z 0.10; base box (0.42 wide) y 0.02..0.62 from z 0.30
TABLE=[((0.74,0.13,2.26),(0,0.775,1.07)), ((0.48,0.1,0.44),(0,0.83,-0.27)), ((0.66,0.04,1.9),(0,0.64,1.05)),
       ((0.42,0.6,1.5),(0,0.32,1.05))]
SEAT_R=0.18          # stool seat radius (36 cm)
SEAT_SINK=0.012      # the buttocks press this far into the cushion
BASE_R=0.27          # stool star base: centre to caster axle
WHEEL_R=0.028        # caster wheel radius
# upper arm direction at the cut (three.js, x = outward): toward the elbow the runtime IK picks for the fists beside
# the patient's jaw ((+-0.118, 1.07, 0.135)): forward, down and a touch outward (realAssets.js solveArm keeps the
# elbow under the view, out and down)
ARM_DIR=(0.12, -0.68, 0.72)
CUT_T=0.18           # keep the sleeve cap / skin up to 18 % along the upper arm (arms.glb starts at 12 %: overlap)
SLEEVE_R=0.10        # shirt UV islands within this radius of the upper-arm axis are the sleeve pieces
ARM_R=0.14           # skin past the cut plane within this radius of the upper-arm axis is removed too
AO_MIX=0.7
AO_FLOOR=0.55        # the shirt / jeans asset AO is remapped to AO_FLOOR..1
TUCK=0.006           # jeans / skin pushed this far behind the shirt where the bent hips push them through it
SHIRT_COLOR=(0xf4/255, 0xf1/255, 0xea/255)          # mats.coat (the arms' sleeve colour)
PANTS_COLOR=(0x2a/255, 0x33/255, 0x45/255)          # dark navy work trousers
FINGERS=["thumb","index","middle","ring","pinky"]

for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
info={
  "name":"therapist",
  "phenotype":{"gender":1.0,"age":0.556,"muscle":0.6,"weight":0.5,"proportions":0.5,"height":0.52,"cupsize":0.5,"firmness":0.5,
               "race":{"asian":1.0,"caucasian":0.0,"african":0.0}},
  "skin_mhmat":"middleage_asian_male/middleage_asian_male.mhmat","skin_material_type":"GAMEENGINE",
  "eyes":"low-poly/low-poly.mhclo","eyes_material_type":"MAKESKIN",
  "eyebrows":"eyebrow001/eyebrow001.mhclo","eyelashes":"eyelashes01/eyelashes01.mhclo",
  "hair":"short04/short04.mhclo","teeth":"","tongue":"",
  "targets":[],"clothes":["male_casualsuit06/male_casualsuit06.mhclo","shoes05/shoes05.mhclo"],"clothes_material_type":"GAMEENGINE",
  "rig":"game_engine","proxy":""
}
st=HS.get_default_deserialization_settings(); st["subdiv_levels"]=0; st["load_clothes"]=True
body=HS.deserialize_from_dict(info, st)
arm=[o for o in bpy.data.objects if o.type=="ARMATURE"][0]
meshes={o.name.split(".")[-1]: o for o in bpy.data.objects if o.type=="MESH" and o is not body}
print("MESHES", body.name, list(meshes))
shirt=meshes["male_casualsuit06"]; shoes=meshes["shoes05"]; hair=meshes["short04"]; eye=meshes["low-poly"]
brows=meshes["eyebrow001"]; lashes=meshes["eyelashes01"]
TS.bake_targets(body)
bpy.context.view_layer.update()

def group_verts(o, names):
    idx={o.vertex_groups[n].index for n in names if n in o.vertex_groups}
    return {v.index for v in o.data.vertices if any(g.group in idx and g.weight>0 for g in v.groups)}
helper=group_verts(body, ["HelperGeometry","JointCubes"])
hidden=set()
for m in body.modifiers:
    if m.type=="MASK" and m.vertex_group and m.vertex_group not in ("HelperGeometry","JointCubes"):
        g=group_verts(body,[m.vertex_group])
        hidden |= g if m.invert_vertex_group else {v.index for v in body.data.vertices}-g
print("HELPER", len(helper), "HIDDEN", len(hidden))
for m in list(body.modifiers):
    if m.type!="ARMATURE": body.modifiers.remove(m)

# ---- rest measurements ----
AW=arm.matrix_world; BN=arm.data.bones; PB=arm.pose.bones
eye_rest=sum((eye.matrix_world@v.co for v in eye.data.vertices), Vector())/len(eye.data.vertices)
EYE_LOCAL=(AW@BN["head"].matrix_local).inverted()@eye_rest          # eye midpoint in the head bone's frame
FWD_LOCAL=(BN["head"].matrix_local.to_3x3().inverted()@Vector((0,-1,0))).normalized()   # the face's front (-Y)
# the shoe soles (rest, world) and the foot bone each follows: the posed lowest sole point stands on the floor
SOLE_PTS={sd:[shoes.matrix_world@v.co for v in shoes.data.vertices if (shoes.matrix_world@v.co).z<0.02 and (v.co.x>0)==(sd=="l")] for sd in "lr"}
SOLE=min(p.z for sd in "lr" for p in SOLE_PTS[sd])
ANKLE_Z={sd:(AW@BN["foot_"+sd].head_local).z for sd in "lr"}
print("REST shoulder", tuple(round(x,3) for x in AW@BN["upperarm_l"].head_local), "eyes", tuple(round(x,3) for x in eye_rest),
      "ankle", round(ANKLE_Z["l"],3), "sole pts", len(SOLE_PTS["l"]), "sole", round(SOLE,4), "SH_T", tuple(round(x,3) for x in SH_T))

bpy.context.view_layer.objects.active=arm
bpy.ops.object.mode_set(mode="POSE")
def upd(): bpy.context.view_layer.update()
def turn(pb, R, h):
    """turn a pose bone (world space) by rotation R about the point h"""
    upd(); pb.matrix=AW.inverted()@Matrix.Translation(h)@R.to_4x4()@Matrix.Translation(-h)@AW@pb.matrix
def head(pb): upd(); return AW@pb.head
def tail(pb): upd(); return AW@pb.tail
def axis(pb): return (tail(pb)-head(pb)).normalized()
def aim(pb, target):
    turn(pb, axis(pb).rotation_difference(target.normalized()).to_matrix(), head(pb))
def Rx(deg): return Matrix.Rotation(math.radians(deg), 3, "X")
def eyes_now(): upd(); return AW@PB["head"].matrix@BN["head"].matrix_local.inverted()@AW.inverted()@(AW@BN["head"].matrix_local@EYE_LOCAL)
def face_fwd(): upd(); return ((AW@PB["head"].matrix).to_3x3()@FWD_LOCAL).normalized()
def sag_angle(a, b):
    """signed angle (deg) turning a into b about +X, in the y-z plane"""
    return math.degrees(math.atan2(a.y*b.z-a.z*b.y, a.y*b.y+a.z*b.z))

def hips_now(): return (head(PB["thigh_l"])+head(PB["thigh_r"]))/2
def pose_upper(neck_flex, clav_scale):
    """trunk lean, head flexion, clavicle length, upper arms; the legs are posed afterwards (pose_legs)"""
    for pb in PB: pb.matrix_basis=Matrix.Identity(4); pb.scale=(1,1,1)
    for sd in "lr":
        PB["clavicle_"+sd].scale=(1, clav_scale, 1)
        arm.data.bones["upperarm_"+sd].inherit_scale="NONE"
    upd()
    turn(PB["pelvis"], Rx(LEAN*LEAN_SPLIT["pelvis"]), hips_now())
    for b in ("spine_01","spine_02","spine_03"): turn(PB[b], Rx(LEAN*LEAN_SPLIT[b]), head(PB[b]))
    # looking down at the patient: the upper back rounds a little, the neck and head take the rest (deg about +X)
    turn(PB["spine_03"], Rx(neck_flex*UPPER_FLEX), head(PB["spine_03"]))
    nf=neck_flex*(1-UPPER_FLEX)
    turn(PB["neck_01"], Rx(nf*NECK_SPLIT), head(PB["neck_01"]))
    turn(PB["head"], Rx(nf*(1-NECK_SPLIT)), head(PB["head"]))
    # upper arms toward the elbows (only the sleeve cap survives; this shapes the deltoid under it)
    for sd,s in (("l",1),("r",-1)):
        aim(PB["upperarm_"+sd], Vector((s*ARM_DIR[0], -ARM_DIR[2], ARM_DIR[1])))
    upd()
    return {sd: head(PB["upperarm_"+sd]) for sd in "lr"}

def sole(sd):
    D=AW@PB["foot_"+sd].matrix@BN["foot_"+sd].matrix_local.inverted()@AW.inverted()
    return min((D@p).z for p in SOLE_PTS[sd])
def pose_legs(T, ankle_z):
    """seated legs: two-bone IK from each hip joint to an ankle ANKLE_FWD in front and ANKLE_X to the side at world
       height ankle_z (Blender, after the translation T); knees forward and a little out; feet flat as at rest"""
    hp=hips_now()
    for sd,s in (("l",1),("r",-1)):
        th,ca,ft=PB["thigh_"+sd],PB["calf_"+sd],PB["foot_"+sd]
        upd(); foot_rest=(AW@BN["foot_"+sd].matrix_local).to_3x3().normalized()
        Hh=head(th); Lt=(head(ca)-Hh).length; Lc=(head(ft)-head(ca)).length
        A=Vector((s*ANKLE_X-T.x, hp.y-ANKLE_FWD, ankle_z-T.z))
        dv=A-Hh; d=min(dv.length, 0.9995*(Lt+Lc)); e=dv.normalized()
        a=(Lt*Lt-Lc*Lc+d*d)/(2*d); h=math.sqrt(max(Lt*Lt-a*a,0.0))
        pole=Vector((s*KNEE_OUT,-1,0)); pole=(pole-pole.project(e)).normalized()
        K=Hh+a*e+h*pole
        aim(th, K-Hh); aim(ca, A-head(ca))
        upd(); R=foot_rest@(AW@ft.matrix).to_3x3().normalized().inverted()
        turn(ft, R, head(ft))
    upd()

# solve: clavicle scale for the anchor width, head flexion so the face (minus EYES_DOWN) points at the patient's face;
# the whole body is then translated so the shoulders sit on the anchors (that sets the seat height)
neck=30.0; clav=1.0; T=Vector()
for it in range(30):
    sh=pose_upper(neck, clav)
    mid=(sh["l"]+sh["r"])/2
    T=Vector((-mid.x, SH_T.y-mid.y, SH_T.z-mid.z))
    half=(sh["l"].x-sh["r"].x)/2
    E=eyes_now()+T
    want=(FACE_T-E).normalized()
    want=Rx(-EYES_DOWN)@want                           # the face points a little above the gaze
    dn=sag_angle(face_fwd(), want)
    print("SOLVE it %d neck %.1f clav %.3f | half %.4f | eyes %s | head err %+.1f" %
          (it, neck, clav, half, tuple(round(x,3) for x in E), dn))
    if abs(half-SH_T.x)<0.0005 and abs(dn)<0.3: break
    neck+=dn*0.9
    clav*=1+(SH_T.x-half)/max(half-0.02,0.05)
sh=pose_upper(neck, clav)
# legs: lower the ankle target until the lower sole stands on the floor
ankle_z=ANKLE_Z["l"]-SOLE
for it in range(6):
    pose_legs(T, ankle_z)
    fl=min(sole(sd) for sd in "lr")+T.z
    print("FEET it %d ankle z %.4f sole %+.4f" % (it, ankle_z, fl))
    if abs(fl)<0.0005: break
    ankle_z-=fl
SH={sd: sh[sd]+T for sd in "lr"}
UA={sd:(head(PB["upperarm_"+sd])+T, tail(PB["upperarm_"+sd])+T) for sd in "lr"}
EYES=eyes_now()+T
HIP=hips_now()+T
KNEES={sd: head(PB["calf_"+sd])+T for sd in "lr"}
print("POSE neck flex %.1f clavicle x%.3f T %s hip %s knees %s" % (neck, clav, tuple(round(x,4) for x in T),
      tuple(round(x,3) for x in (HIP.x,HIP.z,-HIP.y)), [tuple(round(x,3) for x in (k.x,k.z,-k.y)) for k in KNEES.values()]))
bpy.ops.object.mode_set(mode="OBJECT")

# ---- apply the pose, drop the rig, move into place ----
objs=[body]+list(meshes.values())
for o in objs:
    if o.data.shape_keys: o.shape_key_clear()
    bpy.context.view_layer.objects.active=o
    for m in list(o.modifiers):
        if m.type=="ARMATURE": bpy.ops.object.modifier_apply(modifier=m.name)
        else: o.modifiers.remove(m)
    mw=o.matrix_world.copy(); o.parent=None; o.matrix_world=Matrix.Translation(T)@mw
bpy.data.objects.remove(arm, do_unlink=True)
bpy.ops.object.select_all(action="DESELECT")
for o in objs: o.select_set(True)
bpy.context.view_layer.objects.active=body
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)        # local = world from here on

def plane(sd):
    s,e=UA[sd]; return s.lerp(e,CUT_T), (e-s).normalized()
def beyond(p, sd):
    co,n=plane(sd); s,_=UA[sd]; d=p-s
    return (p-co).dot(n)>0 and (d-n*d.dot(n)).length<ARM_R

# ---- skin: drop helpers, the hidden parts under the clothes, the arms ----
ARMB={sd:["upperarm_"+sd,"lowerarm_"+sd,"hand_"+sd]+[f"{f}_0{i}_{sd}" for f in FINGERS for i in (1,2,3)] for sd in "lr"}
gi={sd:{body.vertex_groups[n].index for n in ARMB[sd] if n in body.vertex_groups} for sd in "lr"}
dead=set(helper)|hidden
for v in body.data.vertices:
    for sd in "lr":
        if sum(g.weight for g in v.groups if g.group in gi[sd])>=0.5 or beyond(v.co, sd): dead.add(v.index)
bm=bmesh.new(); bm.from_mesh(body.data); bm.verts.ensure_lookup_table()
bmesh.ops.delete(bm, geom=[bm.verts[i] for i in dead], context="VERTS")
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
bm.to_mesh(body.data); bm.free()
for o in objs:
    for g in list(o.vertex_groups): o.vertex_groups.remove(g)

# ---- shirt: cut the sleeve pieces at the plane, cap the opening ----
def uv_islands(bm):
    uv=bm.loops.layers.uv.active; bm.faces.ensure_lookup_table()
    key=lambda f:{l.vert:tuple(l[uv].uv) for l in f.loops}
    isl=[-1]*len(bm.faces); n=0
    for f in bm.faces:
        if isl[f.index]>=0: continue
        isl[f.index]=n; stk=[f]
        while stk:
            x=stk.pop(); kx=key(x)
            for ed in x.edges:
                for g in ed.link_faces:
                    if isl[g.index]<0 and all((Vector(kx[v])-Vector(key(g)[v])).length<1e-5 for v in ed.verts):
                        isl[g.index]=n; stk.append(g)
        n+=1
    return isl
def sleeve_faces(bm, sd):
    """the sleeve pattern piece: UV islands whose faces ALL lie within SLEEVE_R of the upper-arm axis"""
    isl=uv_islands(bm); s,e=UA[sd]; ax=(e-s).normalized()
    far=set()
    for f in bm.faces:
        p=f.calc_center_median()-s
        if (p-ax*p.dot(ax)).length>=SLEEVE_R: far.add(isl[f.index])
    return [f for f in bm.faces if isl[f.index] not in far]
bm=bmesh.new(); bm.from_mesh(shirt.data); uv=bm.loops.layers.uv.active
for sd in "lr":
    sleeve=sleeve_faces(bm, sd)
    co,n=plane(sd)
    bmesh.ops.bisect_plane(bm, geom=list({v for f in sleeve for v in f.verts})+list({ed for f in sleeve for ed in f.edges})+sleeve,
                           dist=1e-5, plane_co=co, plane_no=n)
    kill=[f for f in sleeve_faces(bm, sd) if (f.calc_center_median()-co).dot(n)>0]   # the bisect keeps the islands
    bmesh.ops.delete(bm, geom=kill, context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    rim=[ed for ed in bm.edges if ed.is_boundary and all(abs((v.co-co).dot(n))<2e-4 and (v.co-co).length<0.16 for v in ed.verts)]
    # cap: a fan from the rim's centre (works for an open or a closed rim), facing out along the arm, slightly domed
    loops_uv=[l[uv].uv.copy() for ed in rim for f in ed.link_faces for l in f.loops]
    cu=sum(loops_uv, Vector((0,0)))/max(len(loops_uv),1)
    cap=[]
    if rim:
        c=sum((v.co for ed in rim for v in ed.verts), Vector())/(2*len(rim))
        cv=bm.verts.new(c+n*0.008)
        for ed in rim:
            a,b=ed.verts
            if (a.co-c).cross(b.co-c).dot(n)<0: a,b=b,a
            try: cap.append(bm.faces.new((a,b,cv)))
            except ValueError: pass
        for f in cap:
            for l in f.loops: l[uv].uv=cu
    print("SLEEVE CAP", sd, "rim edges", len(rim), "cap faces", len(cap))
bm.normal_update(); bm.to_mesh(shirt.data); bm.free()
shirt.data.update()

# ---- split the clothes: jeans = connected pieces mostly below the hips ----
HIP_Z=SH_T.z-0.30
bm=bmesh.new(); bm.from_mesh(shirt.data); bm.faces.ensure_lookup_table()
pants_f=set(); seen=set()
for f0 in bm.faces:
    if f0.index in seen: continue
    piece=[]; stk=[f0]; seen.add(f0.index)
    while stk:
        f=stk.pop(); piece.append(f)
        for ed in f.edges:
            for g in ed.link_faces:
                if g.index not in seen: seen.add(g.index); stk.append(g)
    lowz=sorted(f.calc_center_median().z for f in piece)
    if lowz[len(lowz)//2] < HIP_Z-0.05: pants_f |= {f.index for f in piece}
bm.free()
pants=shirt.copy(); pants.data=shirt.data.copy(); bpy.context.collection.objects.link(pants)
def keep_faces(o, keep):
    bm=bmesh.new(); bm.from_mesh(o.data); bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.index not in keep], context="FACES_ONLY")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bm.to_mesh(o.data); bm.free()
keep_faces(shirt, {p.index for p in shirt.data.polygons}-pants_f); keep_faces(pants, pants_f)

# the bent hips fold the shirt's hem into the jeans' waistband (black in the AO map: it is always under the shirt):
# anything of the jeans / skin near the waist that lies outside the shirt is pulled back behind it
def tuck(o, zmin, zmax):
    tr=BVHTree.FromPolygons([v.co for v in shirt.data.vertices], [p.vertices[:] for p in shirt.data.polygons])
    n=0
    for v in o.data.vertices:
        if not (zmin < v.co.z < zmax): continue
        loc,nrm,_,d=tr.find_nearest(v.co, 0.06)
        if loc is not None and (v.co-loc).dot(nrm) > -TUCK:
            v.co=loc-nrm*TUCK; n+=1
    o.data.update(); print("TUCK", o.name, n, "verts")
WAIST=(min(v.co.z for v in shirt.data.vertices), max(v.co.z for v in pants.data.vertices))
print("WAIST z", tuple(round(x,3) for x in WAIST))
tuck(pants, WAIST[0]-0.02, WAIST[1]+0.01)
tuck(body, WAIST[0]-0.02, SH_T.z-0.05)

names={body:"therapist_skin", shirt:"therapist_shirt", pants:"therapist_pants", shoes:"therapist_shoes", hair:"therapist_hair",
       brows:"therapist_brows", lashes:"therapist_lashes", eye:"therapist_eyes"}
for o,nm in names.items(): o.name=nm; o.data.name=nm
objs=list(names)
tris=0
for o in objs:
    t=sum(len(p.vertices)-2 for p in o.data.polygons); tris+=t
    print("MESH", o.name, len(o.data.vertices), "verts", t, "tris")
print("TRIS total", tris)

# ---- the stool: seat under the solved buttocks ----
def mat(name, color, rough, metal=0.0):
    m=bpy.data.materials.new(name); m.use_nodes=True; b=[n for n in m.node_tree.nodes if n.type=="BSDF_PRINCIPLED"][0]
    b.inputs["Base Color"].default_value=(*color,1); b.inputs["Roughness"].default_value=rough; b.inputs["Metallic"].default_value=metal
    return m
SEAT_C=Vector((0.0, HIP.y+0.035))                    # seat centre (Blender x, y): under the sit bones, a little behind the hips
near=[v.co for o in (pants, body) for v in o.data.vertices if (v.co.xy-SEAT_C).length<0.09 and v.co.z<HIP.z]
ST=min(p.z for p in near)+SEAT_SINK                  # seat top (cushion pressed in a little under the buttocks)
pokes=sum(1 for o in (pants, body) for v in o.data.vertices if (v.co.xy-SEAT_C).length<SEAT_R and v.co.z<ST-0.02)
print("STOOL seat top %.3f centre three.js z %.3f | clothes / skin points > 2 cm inside the cushion %d" % (ST, -SEAT_C.y, pokes))
bm=bmesh.new()
def spin(profile, segs, mi, smooth=True):
    """revolve (r, z) points around the stool axis"""
    vs=[bm.verts.new((SEAT_C.x+r, SEAT_C.y, z)) for r,z in profile]
    es=[bm.edges.new((vs[i],vs[i+1])) for i in range(len(vs)-1)]
    bmesh.ops.spin(bm, geom=vs+es, cent=(SEAT_C.x,SEAT_C.y,0), axis=(0,0,1), angle=2*math.pi, steps=segs, use_merge=True)
    for f in list(bm.faces):
        if f.material_index==0 and f not in done: f.material_index=mi; f.smooth=smooth; done.add(f)
done=set()
# cushion (vinyl, 7 cm, rounded top edge, slightly domed) and the black seat pan under it
spin([(0,ST+0.004),(0.08,ST+0.002),(0.13,ST-0.003),(0.158,ST-0.010),(0.173,ST-0.021),(SEAT_R,ST-0.036),(0.179,ST-0.054),
      (0.172,ST-0.064),(0.155,ST-0.068)], 28, 0)
spin([(0.155,ST-0.068),(0.156,ST-0.080),(0.135,ST-0.090),(0.06,ST-0.096),(0.0,ST-0.097)], 28, 1)
# gas lift: black sleeve on the hub, chrome piston up to the seat pan
spin([(0.034,0.11),(0.036,0.13),(0.035,0.33),(0.030,0.336),(0.0215,0.336),(0.0215,ST-0.094)], 14, 2)
for f in bm.faces:
    if f.material_index==2 and f.calc_center_median().z<0.333: f.material_index=1
# hub
spin([(0.0,0.14),(0.045,0.135),(0.056,0.115),(0.050,0.092),(0.0,0.088)], 14, 1)
# 5-star base, one leg straight back (+Y Blender = -z three.js), polished metal; twin-wheel casters
for k in range(5):
    a=math.radians(90+72*k); d=Vector((math.cos(a), math.sin(a), 0)); t=Vector((-d.y, d.x, 0))
    c=Vector((SEAT_C.x, SEAT_C.y, 0))
    def q(r, w, z): return bm.verts.new(c+d*r+t*w+Vector((0,0,z)))
    r0,r1=0.045,BASE_R+0.012
    # tapered, slightly drooping arm with a bevelled top: 2 sections x 6 points
    def sec(r, w, ztop, zbot):
        return [q(r,-w,zbot), q(r,w,zbot), q(r,w,ztop-0.008), q(r,w*0.55,ztop), q(r,-w*0.55,ztop), q(r,-w,ztop-0.008)]
    A=sec(r0,0.026,0.128,0.098); B=sec(r1,0.017,0.104,0.086)
    for i in range(6):
        f=bm.faces.new((A[i],A[(i+1)%6],B[(i+1)%6],B[i])); f.material_index=2
    f=bm.faces.new(B[::-1]); f.material_index=2
    # caster: stem housing (black box) + two wheels on a tangent axle, trailing a little outward
    w0=BASE_R+0.012; hz0,hz1=WHEEL_R+0.004,0.088
    hb=[q(w0+dx, dw, z) for z in (hz0,hz1) for dx,dw in ((-0.018,-0.022),(0.026,-0.022),(0.026,0.022),(-0.018,0.022))]
    for idx in ((0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)):
        f=bm.faces.new([hb[i] for i in idx]); f.material_index=1
    for side in (-1,1):
        wc=c+d*(BASE_R+0.015)+t*side*0.02+Vector((0,0,WHEEL_R))
        n=12; ring=[[],[]]
        for j,off in enumerate((-0.0115,0.0115)):
            for i in range(n):
                ang=2*math.pi*i/n
                ring[j].append(bm.verts.new(wc+t*off*side+d*math.cos(ang)*WHEEL_R+Vector((0,0,math.sin(ang)*WHEEL_R))))
        for i in range(n):
            f=bm.faces.new((ring[0][i],ring[0][(i+1)%n],ring[1][(i+1)%n],ring[1][i])); f.material_index=1; f.smooth=True
        for j in (0,1):
            f=bm.faces.new(ring[j] if (j==1)==(side>0) else ring[j][::-1]); f.material_index=1
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
bmesh.ops.dissolve_degenerate(bm, edges=bm.edges, dist=1e-6)
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
me_st=bpy.data.meshes.new("stool"); bm.to_mesh(me_st); bm.free()
stool=bpy.data.objects.new("stool", me_st); bpy.context.collection.objects.link(stool)
for m in (mat("stool.seat",(0.035,0.045,0.07),0.42), mat("stool.black",(0.012,0.012,0.014),0.5), mat("stool.chrome",(0.85,0.86,0.88),0.18,1.0)):
    me_st.materials.append(m)
st_tris=sum(len(p.vertices)-2 for p in me_st.polygons)
FALL=Vector((0.0, SEAT_C.y+BASE_R+0.015+WHEEL_R, 0.0))   # back edge of the back caster's wheels, on the floor
print("MESH stool", len(me_st.vertices), "verts", st_tris, "tris")

# ---- materials ----
def bsdf(m): return [n for n in m.node_tree.nodes if n.type=="BSDF_PRINCIPLED"][0]
def tex_node(m): return [n for n in m.node_tree.nodes if n.type=="TEX_IMAGE"][0]
def simple_mat(name, img, rough, alpha=False, color=None, normal=None):
    fm=bpy.data.materials.new(name); fm.use_nodes=True; nt=fm.node_tree; b=bsdf(fm)
    ti=nt.nodes.new("ShaderNodeTexImage"); ti.image=img
    if color:
        mix=nt.nodes.new("ShaderNodeMix"); mix.data_type="RGBA"; mix.blend_type="MULTIPLY"; mix.inputs["Factor"].default_value=1.0
        mix.inputs["B"].default_value=(*color,1); nt.links.new(ti.outputs["Color"], mix.inputs["A"]); nt.links.new(mix.outputs["Result"], b.inputs["Base Color"])
    else: nt.links.new(ti.outputs["Color"], b.inputs["Base Color"])
    if alpha: nt.links.new(ti.outputs["Alpha"], b.inputs["Alpha"])
    if normal:
        tn=nt.nodes.new("ShaderNodeTexImage"); tn.image=normal; normal.colorspace_settings.name="Non-Color"
        nm=nt.nodes.new("ShaderNodeNormalMap"); nt.links.new(tn.outputs["Color"], nm.inputs["Color"]); nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    b.inputs["Roughness"].default_value=rough
    return fm
def set_mat(o, m): o.data.materials.clear(); o.data.materials.append(m)
DIR=os.path.dirname(os.path.abspath(OUT))
def save(img, name):
    img.name=name; img.filepath_raw=os.path.join(DIR, name+".png"); img.file_format="PNG"; img.save(); return img

for o in objs:
    for m in o.data.materials:
        if m: m.name=m.name+"_src"           # free the names for the exported materials
# eyes: dark brown iris (same recolour as mpfb_export_head.py; low-poly eyes share brown_eye.png's layout)
brown=bpy.data.images.load(os.path.join(LS.get_user_data(),"eyes","materials","brown_eye.png"))
W,H=brown.size; px=np.array(brown.pixels[:]).reshape(H,W,4)
r,g,bb=px[...,0],px[...,1],px[...,2]; lum=0.3*r+0.59*g+0.11*bb
iris=(r>g*1.35)&(r-bb>0.12)&(px[...,3]>0.5)
yy,xx=np.mgrid[0:H,0:W]/W; disc=np.zeros_like(iris)
for cx,cy in [(296/1024,1-726/1024),(724/1024,1-304/1024)]: disc|=((xx-cx)**2+(yy-cy)**2)<(118/1024)**2
iris&=disc
px[...,:3]=np.where(iris[...,None], np.stack([lum*0.62,lum*0.40,lum*0.26],-1)*1.05, px[...,:3]); px[...,3]=1.0
brown.pixels[:]=px.ravel(); save(brown, "therapist_eye")
set_mat(eye, simple_mat("therapist.eyes", brown, 0.3))
for o,nm,rough in ((hair,"therapist.short04",0.5),(brows,"therapist.eyebrow001",0.7),(lashes,"therapist.eyelashes01",0.7)):
    src=tex_node(o.data.materials[0]).image
    set_mat(o, simple_mat(nm, src, rough, alpha=True))
shoe_img=tex_node(shoes.data.materials[0]).image
set_mat(shoes, simple_mat("therapist.shoes", shoe_img, 0.6))

cmat=shirt.data.materials[0]
texs={n.image.name:n.image for n in cmat.node_tree.nodes if n.type=="TEX_IMAGE"}
dif=[i for k,i in texs.items() if "diffuse" in k.lower()][0]
nrm_img=[i for k,i in texs.items() if "normal" in k.lower()][0]
ao_img=bpy.data.images.load(bpy.path.abspath(dif.filepath).replace("_diffuse.png","_ao.png"))
# the asset's AO is black where the shirt always covers the jeans' waistband and on the hem's underside; leaning forward
# the shirt rides up and shows them, so the occlusion is lifted to AO_FLOOR (the baked scene AO adds the real shading)
_a=np.array(ao_img.pixels[:]).reshape(-1,ao_img.channels)
_a[:,:3]=AO_FLOOR+(1-AO_FLOOR)*_a[:,:3]
ao_img.pixels[:]=_a.ravel(); ao_img.update()
skin_src=[n for n in body.data.materials[0].node_tree.nodes if n.type=="TEX_IMAGE" and n.name.lower().startswith("diffuse")][0].image
cards=[hair, brows, lashes]

def emit_bake_mat(name, src, uvname, target, ao_dist, ao_mix):
    m=bpy.data.materials.new(name); m.use_nodes=True; t=m.node_tree; t.nodes.clear()
    uvn=t.nodes.new("ShaderNodeUVMap"); uvn.uv_map=uvname
    tx=t.nodes.new("ShaderNodeTexImage"); tx.image=src; t.links.new(uvn.outputs[0], tx.inputs[0])
    ao=t.nodes.new("ShaderNodeAmbientOcclusion"); ao.samples=32; ao.inputs["Distance"].default_value=ao_dist
    f=t.nodes.new("ShaderNodeMix"); f.data_type="FLOAT"; f.inputs["Factor"].default_value=ao_mix
    f.inputs["A"].default_value=1.0; t.links.new(ao.outputs["AO"], f.inputs["B"])
    mul=t.nodes.new("ShaderNodeMix"); mul.data_type="RGBA"; mul.blend_type="MULTIPLY"; mul.inputs["Factor"].default_value=1.0
    t.links.new(tx.outputs["Color"], mul.inputs["A"]); t.links.new(f.outputs["Result"], mul.inputs["B"])
    em=t.nodes.new("ShaderNodeEmission"); t.links.new(mul.outputs["Result"], em.inputs["Color"])
    out=t.nodes.new("ShaderNodeOutputMaterial"); t.links.new(em.outputs[0], out.inputs["Surface"])
    tg=t.nodes.new("ShaderNodeTexImage"); tg.image=target; t.nodes.active=tg; tg.select=True
    return m
def bake(objs_, mats_, keep_mats):
    sc=bpy.context.scene; sc.render.engine="CYCLES"; sc.cycles.device="CPU"; sc.cycles.samples=SAMPLES
    sc.render.bake.margin=8; sc.render.bake.use_selected_to_active=False
    for o in cards: o.hide_render=True
    for o,m in zip(objs_, mats_): set_mat(o, m)
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs_: o.select_set(True)
    bpy.context.view_layer.objects.active=objs_[0]
    bpy.ops.object.bake(type="EMIT")
    for o in cards: o.hide_render=False
    for o,m in zip(objs_, keep_mats): set_mat(o, m)

me=body.data; u0=me.uv_layers[0]; u0.name="UVOrig"
u=np.zeros(len(me.loops)*2); u0.data.foreach_get("uv", u)
nu=me.uv_layers.new(name="UVMap"); nu.data.foreach_set("uv", u); me.uv_layers.active=nu
if BAKE>0:
    bpy.ops.object.select_all(action="DESELECT"); body.select_set(True); bpy.context.view_layer.objects.active=body
    bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT"); bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.pack_islands(rotate=True, margin=0.004); bpy.ops.object.mode_set(mode="OBJECT")
    skin_img=bpy.data.images.new("therapist_skin", BAKE, BAKE, alpha=False)
    cloth_img=bpy.data.images.new("therapist_cloth", BAKE, BAKE, alpha=False)
    skin_m=simple_mat("therapist.skin", skin_img, 0.55)
    shirt_m=simple_mat("therapist.shirt", cloth_img, 0.85, color=SHIRT_COLOR, normal=nrm_img)
    pants_m=simple_mat("therapist.pants", cloth_img, 0.85, color=PANTS_COLOR, normal=nrm_img)
    bake([body], [emit_bake_mat("bk_skin", skin_src, "UVOrig", skin_img, 0.02, AO_MIX)], [skin_m])
    save(skin_img, "therapist_skin")
    # clothes: one map on the shirt's own UVs (shirt + jeans share it): the asset AO x the posed scene's AO
    cb=emit_bake_mat("bk_cloth", ao_img, "UVMap" if "UVMap" in shirt.data.uv_layers else shirt.data.uv_layers[0].name, cloth_img, 0.04, 0.6)
    bake([shirt, pants], [cb, cb], [shirt_m, pants_m])
    save(cloth_img, "therapist_cloth")
else:
    skin_m=simple_mat("therapist.skin", skin_src, 0.55)
    shirt_m=simple_mat("therapist.shirt", ao_img, 0.85, color=SHIRT_COLOR, normal=nrm_img)
    pants_m=simple_mat("therapist.pants", ao_img, 0.85, color=PANTS_COLOR, normal=nrm_img)
    set_mat(body, skin_m); set_mat(shirt, shirt_m); set_mat(pants, pants_m)
me.uv_layers.remove(me.uv_layers["UVOrig"])
for o in objs:
    for p in o.data.polygons: p.use_smooth=True

# ---- marker empties (three.js coordinates after export) ----
objs.append(stool)
marks={"shoulder_l":SH["l"], "shoulder_r":SH["r"], "eyes":EYES, "hip":HIP, "fall":FALL}
for nm,p in marks.items():
    e=bpy.data.objects.new("mark_"+nm, None); e.location=p; bpy.context.collection.objects.link(e); objs.append(e)
def three(p): return (round(p.x,4), round(p.z,4), round(-p.y,4))
for nm,p in marks.items(): print("MEASURE", nm, "three.js", three(p))
tgt={"shoulder_l":(SHOULDER[0],CAM[1]+SHOULDER[1],CAM[2]+SHOULDER[2]),"shoulder_r":(-SHOULDER[0],CAM[1]+SHOULDER[1],CAM[2]+SHOULDER[2])}
for nm in tgt:
    print("MEASURE", nm, "error vs anchor (m) %.4f" % (Vector(three(marks[nm]))-Vector(tgt[nm])).length)
print("MEASURE trunk (hip joints -> shoulder joints) %.1f deg back from vertical" % math.degrees(math.atan2((SH["l"].y+SH["r"].y)/2-HIP.y, (SH["l"].z+SH["r"].z)/2-HIP.z)))
print("MEASURE eyes to the patient's face (m) %.3f, seat top %.3f, stool seat centre z %.3f" % ((EYES-FACE_T).length, ST, -SEAT_C.y))
allv=[o.matrix_world@v.co for o in objs if o.type=="MESH" for v in o.data.vertices]
lo=Vector((min(p.x for p in allv),min(p.y for p in allv),min(p.z for p in allv))); hi=Vector((max(p.x for p in allv),max(p.y for p in allv),max(p.z for p in allv)))
print("BBOX three.js x %.3f..%.3f y %.3f..%.3f z %.3f..%.3f" % (lo.x,hi.x,lo.z,hi.z,-hi.y,-lo.y))
# what of the body / stool sits inside the room's table boxes (the head extension, the frame, the base)
for (sx,sy,sz),(cx,cy,cz) in TABLE:
    n=sum(1 for p in allv if abs(p.x-cx)<sx/2 and abs(p.z-cy)<sy/2 and abs(-p.y-cz)<sz/2)
    ins=[(o.name, three(o.matrix_world@v.co)) for o in objs if o.type=="MESH" for v in o.data.vertices
         if abs((o.matrix_world@v.co).x-cx)<sx/2 and abs((o.matrix_world@v.co).z-cy)<sy/2 and abs(-(o.matrix_world@v.co).y-cz)<sz/2]
    print("TABLE box %s at %s: %d vertices inside %s" % ((sx,sy,sz),(cx,cy,cz),n, sorted({nm for nm,_ in ins})))
    if 0<n<40: print("   ", ins[:6])

bpy.ops.object.select_all(action="DESELECT")
for o in objs: o.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True, export_skins=False, export_animations=False,
    export_morph=False, export_apply=False, export_yup=True, export_texcoords=True, export_normals=True,
    export_materials="EXPORT", export_image_format="AUTO", export_extras=False)
print("WROTE", OUT, os.path.getsize(OUT))

# ---- previews (not exported): the towel camera of game/loop.js and a side view, with stand-ins ----
if PREVIEW:
    os.makedirs(PREVIEW, exist_ok=True)
    sc=bpy.context.scene
    def stand(name, obj, color):
        m=bpy.data.materials.new(name); m.use_nodes=True; bb=[n for n in m.node_tree.nodes if n.type=="BSDF_PRINCIPLED"][0]
        bb.inputs["Base Color"].default_value=(*color,1); bb.inputs["Roughness"].default_value=0.6
        obj.data.materials.append(m); return obj
    for (sx,sy,sz),(cx,cy,cz) in TABLE:
        bpy.ops.mesh.primitive_cube_add(size=1, location=B3(cx,cy,cz)); o=bpy.context.object; o.scale=(sx,sz,sy)
        stand("tbl", o, (0.12,0.2,0.2))
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.1, location=B3(0,1.04,0.1)); stand("pt_head", bpy.context.object, (0.75,0.55,0.45))
    bpy.ops.mesh.primitive_cube_add(size=1, location=B3(0,0.93,0.8)); o=bpy.context.object; o.scale=(0.42,1.0,0.18)
    stand("pt_body", o, (0.5,0.6,0.7))
    bpy.ops.mesh.primitive_plane_add(size=8, location=(0,0,0)); stand("floor", bpy.context.object, (0.35,0.28,0.22))
    # arms: shoulder -> elbow (out and down, the runtime IK's choice) -> fist beside the jaw
    LA,LB=0.2335,0.2374
    rods=[]
    def rod(p0, p1, r, color):
        d=p1-p0; bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=d.length, location=(p0+p1)/2, vertices=16)
        o=bpy.context.object; o.rotation_mode="QUATERNION"; o.rotation_quaternion=d.to_track_quat("Z","Y"); stand("arm", o, color)
        rods.append(o)
    for sd,sg in (("l",1),("r",-1)):
        S0=SH[sd]; W=B3(sg*0.118,1.07,0.135)
        u=(W-S0).normalized(); dd=(W-S0).length; a=(LA*LA-LB*LB+dd*dd)/(2*dd); h=math.sqrt(max(LA*LA-a*a,0))
        v=Vector((sg*0.5,0,-0.85)); v=(v-v.project(u)).normalized()
        E=S0+u*a+v*h
        print("PREVIEW arm", sd, "upper arm dir three.js", tuple(round(x,3) for x in ((E-S0).normalized().x*sg, (E-S0).normalized().z, -(E-S0).normalized().y)))
        rod(S0+(E-S0)*0.12, E, 0.052, (0.95,0.94,0.9)); rod(E, W, 0.038, (0.8,0.6,0.5))
    sun=bpy.data.objects.new("sun", bpy.data.lights.new("sun","SUN")); sc.collection.objects.link(sun)
    sun.data.energy=3.0; sun.rotation_euler=(math.radians(40),0,math.radians(30))
    sc.world=sc.world or bpy.data.worlds.new("w"); sc.world.use_nodes=True
    bg=sc.world.node_tree.nodes.get("Background"); bg.inputs[0].default_value=(0.5,0.55,0.6,1); bg.inputs[1].default_value=0.8
    try: sc.render.engine="BLENDER_EEVEE"
    except TypeError: sc.render.engine="BLENDER_EEVEE_NEXT"
    sc.render.resolution_x,sc.render.resolution_y=844,390; sc.render.resolution_percentage=100
    sc.view_settings.view_transform="AgX" if "AgX" in [i.identifier for i in sc.view_settings.bl_rna.properties["view_transform"].enum_items] else "Filmic"
    cam=bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam); sc.camera=cam
    cam.data.sensor_fit="VERTICAL"; cam.data.angle=math.radians(50); cam.data.clip_start=0.02
    for nm,pos,look in (("towel_cam",(-0.34,1.62,0.74),(0,1.06,-0.1)), ("side",(1.6,1.2,0.0),(0,1.0,-0.2)), ("back",(-1.1,1.1,-1.5),(0,0.7,-0.2))):
        P0=B3(*pos); cam.location=P0; cam.rotation_mode="QUATERNION"; cam.rotation_quaternion=(B3(*look)-P0).to_track_quat("-Z","Y")
        sc.render.filepath=os.path.join(PREVIEW, nm+".png"); bpy.ops.render.render(write_still=True)
        print("PREVIEW", sc.render.filepath)
    # the body alone (no arms, no table head extension): the sleeve caps, the lap on the seat
    for o in rods: o.hide_render=True
    for o in bpy.data.objects:
        if o.name.startswith("Cube") and abs(o.location.y-0.27)<1e-3: o.hide_render=True
    for nm,pos,look in (("bare_towel_cam",(-0.34,1.62,0.74),(0,1.06,-0.1)), ("bare_front",(0.75,1.05,0.55),(0,0.95,-0.25))):
        P0=B3(*pos); cam.location=P0; cam.rotation_quaternion=(B3(*look)-P0).to_track_quat("-Z","Y")
        sc.render.filepath=os.path.join(PREVIEW, nm+".png"); bpy.ops.render.render(write_still=True)
        print("PREVIEW", sc.render.filepath)

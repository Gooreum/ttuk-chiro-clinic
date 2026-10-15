"""Back-press mode therapist (src/back/scene.js): an MPFB (MakeHuman, CC0) character standing at the patient's left
   side of the table (three.js +x), facing the table (-x), leaning over the prone patient with the arms almost straight
   and both hands stacked on the spine (the right hand under, palm on the back, the left hand crossed over its back), as
   a SKINNED GLB whose bind pose is that working pose, so the game only nudges a few bones:
   - the root follows the hands along the spine (three.js z), spine_01..03 flex to drop the body weight onto the hands,
     two-bone arm IK keeps the stacked hands on the back (the hands keep their bind orientation)
   - same look as the towel-mode therapist (therapist_build.py): ~32-year-old Asian male, middleage_asian_male skin,
     short04 black hair, eyebrow001, eyelashes01, low-poly eyes, male_casualsuit06 T-shirt (white) + jeans (navy), shoes05
   - hands placed on the patient's real back (back_surface.json from back_patient.py) at the middle target (z HZ): the
     under palm's lowest skin 2 mm above the back, the top hand 2 mm above the under hand; forearms take 60 % of the
     hand twist (no twist bones: a hand-only twist would wring the wrist skin)
   - skin: kept UV islands repacked, Cycles bake of diffuse x AO; shirt / pants: the asset AO x scene AO, coloured by
     the base colour factor (shirt 0xf4f1ea, pants 0x2a3345); hair / brows / lashes / eyes / shoes keep their textures
   - empties: mark_contact (the under palm's contact point on the back), mark_shoulder_l / _r, mark_hip
   usage: blender -b --python back_therapist.py -- out_raw.glb back_surface.json [bake_size=1024] [cycles_samples=16] [preview_dir]"""
import bpy, bmesh, importlib, sys, os, math, json
import numpy as np
from mathutils import Vector, Matrix, Quaternion
from mathutils.bvhtree import BVHTree
P="bl_ext.user_default.mpfb"
HS=importlib.import_module(P+".services.humanservice").HumanService
TS=importlib.import_module(P+".services.targetservice").TargetService
LS=importlib.import_module(P+".services.locationservice").LocationService
ARGS=sys.argv[sys.argv.index("--")+1:]
OUT=ARGS[0]; SURF=ARGS[1]; BAKE=int(ARGS[2]) if len(ARGS)>2 else 1024; SAMPLES=int(ARGS[3]) if len(ARGS)>3 else 16
PREVIEW=ARGS[4] if len(ARGS)>4 else ""

def B3(x, y, z): return Vector((x, -z, y))          # three.js point -> Blender
def T3(p): return Vector((p.x, p.z, -p.y))          # Blender -> three.js
HZ=-0.05+0.5*0.6     # the middle target on the back (three.js z): the bind pose's hands
STAND_X=0.45         # hip joints this far from the table's midline (three.js +x): thighs against the pad's edge
REACH=0.93           # lean until shoulder -> wrist is this share of the arm's length (elbows nearly locked; the pad
                     # top is waist high, so the arms slope ~40 deg rather than stand vertical as on a low table)
SPLIT={"pelvis":0.30, "spine_01":0.30, "spine_02":0.22, "spine_03":0.18}
KNEE=8.0             # knees a touch soft (degrees)
FEET_X=0.10          # feet a little behind the hips (three.js +x)
FEET_Z=0.15          # feet apart (three.js z, each side)
D_UNDER=Vector((-1.0, 0.0, 0.42)).normalized()     # under (right) hand: fingers across the spine, toward the feet a bit
D_TOP=Vector((-1.0, 0.0, -0.55)).normalized()      # top (left) hand crosses over it
CURL_UNDER=(4, 8, 10); CURL_TOP=(18, 30, 28)
THUMB_UNDER=(-6, 0, 4); THUMB_TOP=(-4, 6, 10)
TWIST_SHARE=0.6
SHIRT_COLOR=(0xf4/255, 0xf1/255, 0xea/255); PANTS_COLOR=(0x2a/255, 0x33/255, 0x45/255)
AO_MIX=0.7; AO_FLOOR=0.55
FINGERS=["thumb","index","middle","ring","pinky"]

S=json.load(open(SURF))
def surf(x, z):
    """top of the patient (three.js y) at (x, z), bilinear on the height field"""
    fx=(x-S["x0"])/S["step"]; fz=(z-S["z0"])/S["step"]
    i=max(0, min(S["nx"]-2, int(math.floor(fx)))); j=max(0, min(S["nz"]-2, int(math.floor(fz)))); u=fx-i; v=fz-j
    def g(a,b):
        y=S["y"][b*S["nx"]+a]; return y if y is not None else S["tableTop"]
    return (g(i,j)*(1-u)+g(i+1,j)*u)*(1-v)+(g(i,j+1)*(1-u)+g(i+1,j+1)*u)*v

for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
info={
  "name":"therapist",
  "phenotype":{"gender":1.0,"age":0.556,"muscle":0.6,"weight":0.5,"proportions":0.5,"height":0.62,"cupsize":0.5,"firmness":0.5,
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
for o in [body]+list(meshes.values()):
    for m in list(o.modifiers):
        if m.type!="ARMATURE": o.modifiers.remove(m)

# face the table: MakeHuman faces -Y (three.js +z); turned -90 deg about Z it faces -X (three.js -x)
arm.rotation_euler=(0, 0, math.radians(-90)); arm.location=B3(STAND_X, 0, HZ)
bpy.context.view_layer.update()
AW=arm.matrix_world; BN=arm.data.bones; PB=arm.pose.bones
SOLE_PTS={sd:[shoes.matrix_world@v.co for v in shoes.data.vertices if (shoes.matrix_world@v.co).z<0.02 and (v.co.x>0)==(sd=="l")] for sd in "lr"}
SOLE_PTS={sd:[arm.matrix_world.inverted()@p for p in pts] for sd,pts in SOLE_PTS.items()}   # (meshes are not parented-transformed yet)
LU={sd:(BN["lowerarm_"+sd].head_local-BN["upperarm_"+sd].head_local).length for sd in "lr"}
LF={sd:(BN["hand_"+sd].head_local-BN["lowerarm_"+sd].head_local).length for sd in "lr"}
print("ARM LEN", {sd:(round(LU[sd],4), round(LF[sd],4)) for sd in "lr"})

bpy.context.view_layer.objects.active=arm
bpy.ops.object.mode_set(mode="POSE")
def upd(): bpy.context.view_layer.update()
def turn(pb, R, h):
    upd(); M=arm.matrix_world; pb.matrix=M.inverted()@Matrix.Translation(h)@R.to_4x4()@Matrix.Translation(-h)@M@pb.matrix
def head(pb): upd(); return arm.matrix_world@pb.head
def tail(pb): upd(); return arm.matrix_world@pb.tail
def axis(pb): return (tail(pb)-head(pb)).normalized()
def aim(pb, target): turn(pb, axis(pb).rotation_difference(target.normalized()).to_matrix(), head(pb))
def rot(axis_, deg): return Matrix.Rotation(math.radians(deg), 3, axis_)
def frame(a, b):
    a=a.normalized(); b=(b-b.project(a)).normalized(); return Matrix((a, b, a.cross(b))).transposed()
def palm_local(sd, s):
    ML=BN["hand_"+sd].matrix_local.to_3x3().inverted()
    d=(BN["middle_01_"+sd].head_local-BN["hand_"+sd].head_local).normalized()
    across=BN["index_01_"+sd].head_local-BN["pinky_01_"+sd].head_local
    return ML@d, ML@(d.cross(across)*s).normalized()
PALM={sd: palm_local(sd, s) for sd,s in (("l",1),("r",-1))}
SIDE=B3(0,0,1)      # the therapist's lateral axis (three.js +z = his left): flexing forward turns about it (Blender)
def hips_now(): return (head(PB["thigh_l"])+head(PB["thigh_r"]))/2
dg=bpy.context.evaluated_depsgraph_get()
def evald(o):
    dg.update(); me=o.evaluated_get(dg).to_mesh(); W=o.matrix_world
    return me, W

def pose_body(lean):
    """hip hinge: pelvis + spine flex forward by `lean`, the legs stay planted (thighs counter-rotated), soft knees"""
    for pb in PB: pb.matrix_basis=Matrix.Identity(4)
    upd()
    hp=hips_now()
    turn(PB["pelvis"], rot(SIDE, lean*SPLIT["pelvis"]), hp)
    for b in ("spine_01","spine_02","spine_03"): turn(PB[b], rot(SIDE, lean*SPLIT[b]), head(PB[b]))
    for sd in "lr":
        # (+ about SIDE swings a hanging bone's end backward, +x): knees forward, shins back, feet flat
        turn(PB["thigh_"+sd], rot(SIDE, -lean*SPLIT["pelvis"]-KNEE*0.5), head(PB["thigh_"+sd]))
        turn(PB["calf_"+sd], rot(SIDE, KNEE), head(PB["calf_"+sd]))
        turn(PB["foot_"+sd], rot(SIDE, -KNEE*0.5), head(PB["foot_"+sd]))
    upd()
def sole():
    M=arm.matrix_world
    return min((M@PB["foot_"+sd].matrix@BN["foot_"+sd].matrix_local.inverted()@p).z for sd in "lr" for p in SOLE_PTS[sd])

HANDV={sd:{v.index for v in body.data.vertices if v.index not in helper and v.index not in hidden and
           sum(g.weight for g in v.groups if body.vertex_groups[g.group].name in (["hand_"+sd]+[f"{f}_0{i}_{sd}" for f in FINGERS for i in (1,2,3)]))>0.5}
       for sd in "lr"}
def hand_pts(sd):
    me,W=evald(body); pts=[W@me.vertices[i].co for i in HANDV[sd]]; body.evaluated_get(dg).to_mesh_clear(); return pts

def pose_arm(sd, s, W, D, N, curl, thumb):
    """two-bone IK shoulder -> wrist W (Blender), hand frame (fingers D, palm facing N), elbow pole out and up"""
    ua, la, hd = PB["upperarm_"+sd], PB["lowerarm_"+sd], PB["hand_"+sd]
    Sh=head(ua); Lu=LU[sd]; Lf=LF[sd]
    dv=W-Sh; d=min(dv.length, 0.999*(Lu+Lf)); e=dv.normalized()
    a=(Lu*Lu-Lf*Lf+d*d)/(2*d); h=math.sqrt(max(Lu*Lu-a*a, 0.0))
    pole=B3(0.5, 0.3, s*1.0)                   # elbows out to the sides (right arm toward -z) and a little back
    pole=(pole-pole.project(e)).normalized()
    E=Sh+a*e+h*pole
    aim(ua, E-Sh)
    u=axis(ua); f=axis(la); F=(W-head(la)).normalized()
    fp=f-f.project(u); Fp=F-F.project(u)
    if fp.length>1e-4 and Fp.length>1e-4:
        fp.normalize(); Fp.normalize()
        turn(ua, Quaternion(u, math.atan2(u.dot(fp.cross(Fp)), fp.dot(Fp))).to_matrix(), head(ua))
    aim(la, W-head(la))
    # hand frame wanted; share the twist about the forearm axis with the forearm
    dl,nl=PALM[sd]
    upd(); R3=(arm.matrix_world@hd.matrix).to_3x3().normalized()
    want=frame(D, N); cur=frame(R3@dl, R3@nl)
    Rh=(want@cur.transposed()).to_quaternion()
    fa=axis(la)
    # swing-twist split of Rh about the forearm axis
    pr=Vector((Rh.x,Rh.y,Rh.z)).project(fa); tw=Quaternion((Rh.w, pr.x, pr.y, pr.z)); tw.normalize()
    ang=tw.angle if Vector((tw.x,tw.y,tw.z)).dot(fa)>=0 else -tw.angle
    if ang>math.pi: ang-=2*math.pi
    if ang<-math.pi: ang+=2*math.pi
    turn(la, Quaternion(fa, ang*TWIST_SHARE).to_matrix(), head(la))
    upd(); R3=(arm.matrix_world@hd.matrix).to_3x3().normalized()
    turn(hd, want@frame(R3@dl, R3@nl).transposed(), head(hd))
    Np=(N-N.project(D)).normalized()
    for fn in FINGERS:
        angs=thumb if fn=="thumb" else curl
        for j,ang_ in enumerate(angs):
            pb=PB["%s_%02d_%s" % (fn, j+1, sd)]; dc=axis(pb)
            flat=(dc-dc.project(Np)).normalized()
            aim(pb, flat*math.cos(math.radians(ang_))+Np*math.sin(math.radians(ang_)))
    upd()
    return ang

DOWN=B3(0,-1,0)
Du=B3(*D_UNDER); Dt=B3(*D_TOP)
# palm centre offset from the wrist along the fingers (~ the middle of the metacarpals)
PALM_FWD=0.045
# contact: the top of the back at x 0 (the spine groove; the palm spans the paraspinals: take the max over +-4 cm)
CY=max(surf(dx, HZ) for dx in (-0.04,-0.02,0,0.02,0.04))
C=B3(0.0, CY, HZ)
print("CONTACT three.js (0, %.4f, %.4f)" % (CY, HZ))
lean=20.0; gap_u=0.035; gap_t=0.035
for it in range(24):
    pose_body(lean)
    T=Vector((0,0,-sole())); arm.location=arm.location+T; upd()
    Wu=C-Du*PALM_FWD+Vector((0,0,gap_u))
    Wt=C+Vector((0,0,gap_u+gap_t))-Dt*PALM_FWD
    sh={sd:head(PB["upperarm_"+sd]) for sd in "lr"}
    reach=((Wu-sh["r"]).length/(LU["r"]+LF["r"]), (Wt-sh["l"]).length/(LU["l"]+LF["l"]))
    tw_r=pose_arm("r", -1, Wu, Du, DOWN, CURL_UNDER, THUMB_UNDER)
    tw_l=pose_arm("l", 1, Wt, Dt, DOWN, CURL_TOP, THUMB_TOP)
    # clearances: the under palm over the back, the top hand over the under hand
    pu=hand_pts("r"); pt=hand_pts("l")
    cu=min(p.z-surf(p.x, -p.y) for p in pu)
    me,W=evald(body)
    vs=[W@me.vertices[i].co for i in range(len(me.vertices))]
    fs=[p.vertices[:] for p in me.polygons if all(i in HANDV["r"] for i in p.vertices)]
    body.evaluated_get(dg).to_mesh_clear()
    under=BVHTree.FromPolygons(vs, fs)
    gaps=[]
    for p in pt:
        hit=under.ray_cast(p, Vector((0,0,-1)), 0.08)
        if hit[0] is not None: gaps.append(p.z-hit[0].z)
    ct=min(gaps) if gaps else 0.01
    print("SOLVE it %d lean %.1f shoulders x %.3f | reach r %.3f l %.3f | under palm %+.4f top %+.4f (%d over) | twist r %.0f l %.0f" %
          (it, lean, T3((sh["l"]+sh["r"])/2).x, reach[0], reach[1], cu, ct, len(gaps), math.degrees(tw_r), math.degrees(tw_l)))
    shx=T3((sh["l"]+sh["r"])/2).x
    rr=sum(reach)/2
    ok=abs(cu-0.002)<0.001 and abs(ct-0.002)<0.0015 and abs(rr-REACH)<0.003
    if ok: break
    gap_u-=(cu-0.002); gap_t-=(ct-0.002)
    lean+=(rr-REACH)*100
# the head looks down at the hands
hd=PB["head"]; nk=PB["neck_01"]
for b,share in ((nk,0.6),(hd,0.4)):
    turn(b, rot(SIDE, 18*share), head(b))
upd()
KNEES={sd:T3(head(PB["calf_"+sd])) for sd in "lr"}
HIPS=T3(hips_now()); SH={sd:T3(head(PB["upperarm_"+sd])) for sd in "lr"}
ELB={sd:T3(head(PB["lowerarm_"+sd])) for sd in "lr"}
WR={sd:T3(head(PB["hand_"+sd])) for sd in "lr"}
print("POSE lean %.1f hips %s shoulders %s elbows %s wrists %s knees %s" % (lean, tuple(round(x,3) for x in HIPS),
      {k:tuple(round(x,3) for x in v) for k,v in SH.items()}, {k:tuple(round(x,3) for x in v) for k,v in ELB.items()},
      {k:tuple(round(x,3) for x in v) for k,v in WR.items()}, {k:tuple(round(x,3) for x in v) for k,v in KNEES.items()}))
for sd in "lr":
    a=(SH[sd]-ELB[sd]).angle(WR[sd]-ELB[sd]); print("ELBOW", sd, "inner angle %.0f deg" % math.degrees(a))
# the actual contact point: the under palm's lowest vertices (mean of those within 3 mm of the lowest)
pu=hand_pts("r"); lo=min(p.z-surf(p.x,-p.y) for p in pu)
near=[p for p in pu if p.z-surf(p.x,-p.y)<lo+0.004]
CONTACT=sum(near, Vector())/len(near)
print("CONTACT measured three.js", tuple(round(x,4) for x in T3(CONTACT)), "from", len(near), "verts")

# ---- bind = this pose: apply it to the meshes, make it the rest pose, re-skin ----
bpy.ops.object.mode_set(mode="OBJECT")
objs=[body]+list(meshes.values())
for o in objs:
    if o.data.shape_keys: o.shape_key_clear()
    bpy.context.view_layer.objects.active=o
    for m in list(o.modifiers):
        if m.type=="ARMATURE": bpy.ops.object.modifier_apply(modifier=m.name)
bpy.ops.object.select_all(action="DESELECT"); arm.select_set(True); bpy.context.view_layer.objects.active=arm
bpy.ops.object.mode_set(mode="POSE"); bpy.ops.pose.armature_apply(selected=False); bpy.ops.object.mode_set(mode="OBJECT")
# drop the arm / root transforms into the data (the meshes are children of the armature)
bpy.ops.object.select_all(action="DESELECT")
for o in [arm]+objs: o.select_set(True)
bpy.context.view_layer.objects.active=arm
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
for o in objs:
    md=o.modifiers.new("Armature","ARMATURE"); md.object=arm
    if o.parent is not arm:
        mw=o.matrix_world.copy(); o.parent=arm; o.matrix_world=mw

bm=bmesh.new(); bm.from_mesh(body.data); bm.verts.ensure_lookup_table()
bmesh.ops.delete(bm, geom=[bm.verts[i] for i in (helper|hidden)], context="VERTS")
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
bm.to_mesh(body.data); bm.free()
# helper vertex groups are not bones: drop every group that is not a bone (the exporter needs bone-named groups only)
bones={b.name for b in arm.data.bones}
for o in objs:
    for g in list(o.vertex_groups):
        if g.name not in bones: o.vertex_groups.remove(g)

# ---- split the clothes: jeans = connected pieces mostly below the hips ----
HIPZ=hips_z=B3(*HIPS).z
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
    zs=sorted((shirt.matrix_world@f.calc_center_median()).z for f in piece)
    if zs[len(zs)//2] < HIPZ-0.04: pants_f |= {f.index for f in piece}
bm.free()
pants=shirt.copy(); pants.data=shirt.data.copy(); bpy.context.collection.objects.link(pants); pants.parent=arm
pants.modifiers.clear(); md=pants.modifiers.new("Armature","ARMATURE"); md.object=arm
def keep_faces(o, keep):
    bm=bmesh.new(); bm.from_mesh(o.data); bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.index not in keep], context="FACES_ONLY")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bm.to_mesh(o.data); bm.free()
keep_faces(shirt, {p.index for p in shirt.data.polygons}-pants_f); keep_faces(pants, pants_f)

names={body:"back_therapist_skin", shirt:"back_therapist_shirt", pants:"back_therapist_pants", shoes:"back_therapist_shoes",
       hair:"back_therapist_hair", brows:"back_therapist_brows", lashes:"back_therapist_lashes", eye:"back_therapist_eyes"}
for o,nm in names.items(): o.name=nm; o.data.name=nm
objs=list(names)
arm.name="back_therapist_rig"; arm.data.name="back_therapist_rig"
tris=0
for o in objs:
    t=sum(len(p.vertices)-2 for p in o.data.polygons); tris+=t; print("MESH", o.name, len(o.data.vertices), "verts", t, "tris")
print("TRIS total", tris, "bones", len(arm.data.bones))

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
        if m: m.name=m.name+"_src"
brown=bpy.data.images.load(os.path.join(LS.get_user_data(),"eyes","materials","brown_eye.png"))
W_,H_=brown.size; px=np.array(brown.pixels[:]).reshape(H_,W_,4)
r,g,bb=px[...,0],px[...,1],px[...,2]; lum=0.3*r+0.59*g+0.11*bb
iris=(r>g*1.35)&(r-bb>0.12)&(px[...,3]>0.5)
yy,xx=np.mgrid[0:H_,0:W_]/W_; disc=np.zeros_like(iris)
for cx,cy in [(296/1024,1-726/1024),(724/1024,1-304/1024)]: disc|=((xx-cx)**2+(yy-cy)**2)<(118/1024)**2
iris&=disc
px[...,:3]=np.where(iris[...,None], np.stack([lum*0.62,lum*0.40,lum*0.26],-1)*1.05, px[...,:3]); px[...,3]=1.0
brown.pixels[:]=px.ravel(); save(brown, "back_therapist_eye")
set_mat(eye, simple_mat("back_therapist.eyes", brown, 0.3))
for o,nm,rough in ((hair,"back_therapist.short04",0.5),(brows,"back_therapist.eyebrow001",0.7),(lashes,"back_therapist.eyelashes01",0.7)):
    set_mat(o, simple_mat(nm, tex_node(o.data.materials[0]).image, rough, alpha=True))
set_mat(shoes, simple_mat("back_therapist.shoes", tex_node(shoes.data.materials[0]).image, 0.6))
cmat=shirt.data.materials[0]
texs={n.image.name:n.image for n in cmat.node_tree.nodes if n.type=="TEX_IMAGE"}
dif=[i for k,i in texs.items() if "diffuse" in k.lower()][0]
nrm_img=[i for k,i in texs.items() if "normal" in k.lower()][0]
ao_img=bpy.data.images.load(bpy.path.abspath(dif.filepath).replace("_diffuse.png","_ao.png"))
_a=np.array(ao_img.pixels[:]).reshape(-1,ao_img.channels); _a[:,:3]=AO_FLOOR+(1-AO_FLOOR)*_a[:,:3]
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
    skin_img=bpy.data.images.new("back_therapist_skin", BAKE, BAKE, alpha=False)
    cloth_img=bpy.data.images.new("back_therapist_cloth", BAKE, BAKE, alpha=False)
    skin_m=simple_mat("back_therapist.skin", skin_img, 0.55)
    shirt_m=simple_mat("back_therapist.shirt", cloth_img, 0.85, color=SHIRT_COLOR, normal=nrm_img)
    pants_m=simple_mat("back_therapist.pants", cloth_img, 0.85, color=PANTS_COLOR, normal=nrm_img)
    bake([body], [emit_bake_mat("bk_skin", skin_src, "UVOrig", skin_img, 0.02, AO_MIX)], [skin_m])
    save(skin_img, "back_therapist_skin")
    cuv="UVMap" if "UVMap" in shirt.data.uv_layers else shirt.data.uv_layers[0].name
    cb=emit_bake_mat("bk_cloth", ao_img, cuv, cloth_img, 0.04, 0.6)
    bake([shirt, pants], [cb, cb], [shirt_m, pants_m])
    save(cloth_img, "back_therapist_cloth")
else:
    skin_m=simple_mat("back_therapist.skin", skin_src, 0.55)
    set_mat(body, skin_m)
    set_mat(shirt, simple_mat("back_therapist.shirt", ao_img, 0.85, color=SHIRT_COLOR, normal=nrm_img))
    set_mat(pants, simple_mat("back_therapist.pants", ao_img, 0.85, color=PANTS_COLOR, normal=nrm_img))
me.uv_layers.remove(me.uv_layers["UVOrig"])
for o in objs:
    for p in o.data.polygons: p.use_smooth=True

marks={"contact":CONTACT, "shoulder_l":B3(*SH["l"]), "shoulder_r":B3(*SH["r"]), "hip":B3(*HIPS)}
empties=[]
for nm,p in marks.items():
    e=bpy.data.objects.new("mark_"+nm, None); e.location=p; bpy.context.collection.objects.link(e); empties.append(e)
    print("MEASURE", nm, "three.js", tuple(round(x,4) for x in T3(p)))
bpy.ops.object.select_all(action="DESELECT")
for o in [arm]+objs+empties: o.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True, export_skins=True, export_animations=False,
    export_morph=False, export_apply=False, export_yup=True, export_texcoords=True, export_normals=True,
    export_materials="EXPORT", export_image_format="AUTO", export_extras=False, export_def_bones=False)
print("WROTE", OUT, os.path.getsize(OUT))

if PREVIEW:
    os.makedirs(PREVIEW, exist_ok=True)
    sc=bpy.context.scene
    bpy.ops.import_scene.gltf(filepath=os.path.join(os.path.dirname(os.path.abspath(OUT)), "patient_raw.glb"))
    bpy.ops.mesh.primitive_cube_add(size=1, location=B3(0, 0.77, 0.3)); bpy.context.object.scale=(0.68, 2.0, 0.1)
    bpy.ops.mesh.primitive_plane_add(size=8, location=(0,0,0))
    sun=bpy.data.objects.new("sun", bpy.data.lights.new("sun","SUN")); sc.collection.objects.link(sun)
    sun.data.energy=3.0; sun.rotation_euler=(math.radians(35),0,math.radians(40))
    try: sc.render.engine="BLENDER_EEVEE"
    except TypeError: sc.render.engine="BLENDER_EEVEE_NEXT"
    sc.render.resolution_x,sc.render.resolution_y=844,390
    cam=bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam); sc.camera=cam
    cam.data.sensor_fit="VERTICAL"; cam.data.angle=math.radians(50)
    for nm,pos,look in (("t_over",(1.1,1.95,0.75),(0,1.0,0.2)),("t_front",(-1.6,1.4,0.25),(0.2,1.1,0.25)),("t_hands",(0.3,1.35,0.6),(0,1.05,0.25)),
                        ("t_head",(0.2,1.3,-1.2),(0.2,1.1,0.25))):
        P0=B3(*pos); cam.location=P0; cam.rotation_mode="QUATERNION"; cam.rotation_quaternion=(B3(*look)-P0).to_track_quat("-Z","Y")
        sc.render.filepath=os.path.join(PREVIEW, nm+".png"); bpy.ops.render.render(write_still=True)

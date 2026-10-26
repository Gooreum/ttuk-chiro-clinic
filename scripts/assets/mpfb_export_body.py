"""Patient body GLB (the head is <patient>.glb): same MPFB (MakeHuman, CC0) phenotype as the head (patients.py),
   so the neck meets the head's neck vertex for vertex.
   - clothes: the preset's T-shirt + jeans (CC0), split into shirt and pants (connected pieces, by height); both keep only
     their own ambient-occlusion map (the game tints them with the gown / pants palette colours, no logo)
   - arms posed with the hands resting on the belly, left over right (game_engine rig, solved so the palms just touch
     the shirt / the other hand and the forearms clear the flanks, applied), the rig is then dropped
   - everything the head GLB keeps (above mid-neck, mpfb_export_head.py) is removed: the two meshes share one seam
   - skin: remaining UV islands repacked into one map, Cycles bake of the original diffuse x ambient occlusion
   - a two-bone skin (body, neck): the neck bone carries the seam ring (weight 1) and fades out over NECK_FADE, so the
     game turns the upper neck with the head pivot and the seam never opens
   - shape key "breath": chest and belly rise (front only, back stays on the table) and the shoulders lift toward the
     head, on skin and shirt alike (kept clear of the neck seam)
   chain (5th arg, neck-rig lab only, 2026-10-26): the same body with a multi-joint skin instead of the two bones,
   body -> spine_02 -> spine_03 -> clavicle_l/r (the game_engine weights merged into them, the upper arm only near the
   shoulder) and neck_1, neck_2, neck all children of body (the game spreads the head turn over them, src/scene/realAssets.js
   neckChain). Written to lab-assets/, never to public/ (vite.config.js labAssets).
   usage: blender -b --python mpfb_export_body.py -- out.glb [bake_size=1024] [cycles_samples=16] [patient01] [chain]"""
import bpy, bmesh, importlib, sys, os, math
import numpy as np
from mathutils import Vector, Matrix, Quaternion, kdtree
from mathutils.bvhtree import BVHTree
P="bl_ext.user_default.mpfb"
HS=importlib.import_module(P+".services.humanservice").HumanService
TS=importlib.import_module(P+".services.targetservice").TargetService
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from patients import human_info, fit_scale, CHIN_TIP, PATIENTS
ARGS=sys.argv[sys.argv.index("--")+1:]
OUT=ARGS[0]; BAKE=int(ARGS[1]) if len(ARGS)>1 else 1024; SAMPLES=int(ARGS[2]) if len(ARGS)>2 else 16
PID=ARGS[3] if len(ARGS)>3 else "patient01"
FLAGS=ARGS[4:]
CHAIN="chain" in FLAGS
FULL="full" in FLAGS          # neck-rig lab: every face the clothes hid comes back (the exposure check)
SKIN=next((a[5:] for a in FLAGS if a.startswith("skin=")), None)   # neck-rig lab: "rings,H" only the skin that shows
AO_MIX=0.7
NECK_FADE=0.08       # metres from the seam over which the neck bone's weight falls to 0 (the game redoes the skin's weights about the neck column on load, src/scene/realAssets.js neckColumn)
BREATH_CHEST=0.026   # rib cage rise at full inhale (metres)
BREATH_BELLY=0.016   # belly rise at full inhale: a broad soft swell, never a bulge
SHRUG=0.03           # shoulders lift toward the head at full inhale (metres): the move that reads from the head end

for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
info=human_info(PID, rig="game_engine", clothes=True, face=False)
st=HS.get_default_deserialization_settings(); st["subdiv_levels"]=0; st["load_clothes"]=True
body=HS.deserialize_from_dict(info, st)
arm=[o for o in bpy.data.objects if o.type=="ARMATURE"][0]
cloth=[o for o in bpy.data.objects if o.type=="MESH" and o is not body][0]
print("BODY", body.name, len(body.data.vertices), "CLOTH", cloth.name, len(cloth.data.vertices))
for o in (body, cloth): print("MODS", o.name, [(m.type, m.name, getattr(m,"vertex_group",None), getattr(m,"invert_vertex_group",None)) for m in o.modifiers])
TS.bake_targets(body)
bpy.context.view_layer.update()
mw=body.matrix_world

# ---- what the head GLB keeps (same rule as mpfb_export_head.py, on the unposed body) ----
def group_verts(o, names):
    idx={o.vertex_groups[n].index for n in names if n in o.vertex_groups}
    return {v.index for v in o.data.vertices if any(g.group in idx and g.weight>0 for g in v.groups)}
helper=group_verts(body, ["HelperGeometry","JointCubes"])
top=max((mw@v.co).z for v in body.data.vertices if v.index not in helper)
K=fit_scale(PID, top, (mw@body.data.vertices[CHIN_TIP].co).z)     # 1.0 for adult-sized bodies (patients.py)
CUT=top-0.30*K
print("TOP", round(top,4), "CUT", round(CUT,4), "FIT", round(K,4))
def head_keeps(p): return not (p.z < CUT or (p.z < top-0.225*K and abs(p.x) > 0.072*K))
headv={v.index for v in body.data.vertices if v.index not in helper and head_keeps(mw@v.co)}
# hidden under the clothes (MPFB's delete-group mask modifiers)
hidden=set()
for m in body.modifiers:
    if m.type=="MASK" and m.vertex_group and m.vertex_group not in ("HelperGeometry","JointCubes"):
        g=group_verts(body,[m.vertex_group])
        hidden |= g if m.invert_vertex_group else {v.index for v in body.data.vertices}-g
print("HELPER", len(helper), "HEAD", len(headv), "HIDDEN", len(hidden))
def restore_set(rings, H):
    """hidden skin within `rings` mesh rings of the kept skin's edge and no lower than CUT - H (the neck, the collarbones
       and the collar's underside: what a turned or drawn-out neck shows from under the collar)"""
    nb={}
    for e in body.data.edges:
        a,b=e.vertices; nb.setdefault(a,[]).append(b); nb.setdefault(b,[]).append(a)
    kept=lambda i: i not in hidden and i not in helper
    front={i for i in hidden if any(kept(j) for j in nb.get(i,()))}; got=set(front)
    for _ in range(int(rings)-1):
        front={j for i in front for j in nb.get(i,()) if j in hidden and j not in got}; got|=front
    return {i for i in got if (mw@body.data.vertices[i].co).z >= CUT-H*K}
RESTORE=set(hidden) if FULL else restore_set(*map(float, SKIN.split(","))) if SKIN else set()
print("RESTORE", len(RESTORE), "of hidden", len(hidden))
if RESTORE:     # follows the vertices through the pose and the deletes, for the tuck under the shirt below
    at=body.data.attributes.new("lab_restored", "INT", "POINT")
    for i in RESTORE: at.data[i].value=1
# seam tree: head-side vertices, rest positions (the neck is not posed)
tree=kdtree.KDTree(len(headv))
for i in headv: tree.insert(mw@body.data.vertices[i].co, i)
tree.balance()
B=lambda n: arm.matrix_world@arm.data.bones[n].head_local
Z_PELVIS=B("pelvis").z; Z_CHEST=B("spine_03").z; Z_CLAV=B("clavicle_l").z
print("BONES pelvis %.3f spine_03 %.3f clavicle %.3f neck %.3f" % (Z_PELVIS, Z_CHEST, Z_CLAV, B("neck_01").z))
# chain: the rig is dropped once the arms are posed, so keep what the merged skin needs (rest heads; only the arms are
# posed, each about its own head, so the shoulder joints stay put)
BONE_NAMES={b.name for b in arm.data.bones}
BP={n: B(n).copy() for n in ("spine_02","spine_03","neck_01","clavicle_l","clavicle_r","upperarm_l","upperarm_r")}
MERGE={"spine_02": ["spine_02"], "spine_03": ["spine_03"], "clavicle_l": ["clavicle_l"], "clavicle_r": ["clavicle_r"], "neck": ["neck_01", "head"]}
ARM_FADE=(0.06, 0.12)     # m from the upper arm's head: its weight goes with the clavicle inside, to the trunk outside
def merge_groups(o):
    """game_engine groups -> m_body, m_spine_02, m_spine_03, m_clavicle_l/r, m_neck (the rest of the rig -> m_body;
       the upper arm joins its clavicle only near the shoulder, so the forearms and the hands on the belly stay put)"""
    names={g.index: g.name for g in o.vertex_groups}; W=o.matrix_world; acc=[]
    for v in o.data.vertices:
        w=dict.fromkeys(["body", *MERGE], 0.0)
        for g in v.groups:
            n=names[g.group]
            if n not in BONE_NAMES or g.weight<=0: continue
            k=next((k for k,src in MERGE.items() if n in src), None)
            if k: w[k]+=g.weight; continue
            if n in ("upperarm_l","upperarm_r"):
                d=(W@v.co-BP[n]).length; t=max(0.0, min(1.0, (d-ARM_FADE[0]*K)/((ARM_FADE[1]-ARM_FADE[0])*K))); f=1-t*t*(3-2*t)
                w["clavicle_"+n[-1]]+=g.weight*f; w["body"]+=g.weight*(1-f); continue
            w["body"]+=g.weight
        if sum(w.values())<=0: w["body"]=1.0
        acc.append(w)
    for g in list(o.vertex_groups): o.vertex_groups.remove(g)
    for k in ("body", *MERGE):
        vg=o.vertex_groups.new(name="m_"+k)
        for i,w in enumerate(acc):
            if w[k]>0: vg.add([i], w[k], "REPLACE")

# ---- pose: upper arms along the sides, elbows bent, hands resting on the belly (left over right), then bake ----
# (98 clinic videos: the supine patient almost always rests both hands on the belly)
bpy.context.view_layer.objects.active=arm
bpy.ops.object.mode_set(mode="POSE")
AW=arm.matrix_world; PB=arm.pose.bones
def frame(a, b):
    """orthonormal frame (columns): a, b made perpendicular to a, a x b"""
    a=a.normalized(); b=(b-b.project(a)).normalized(); return Matrix((a, b, a.cross(b))).transposed()
def turn(pb, R, h):
    """turn a pose bone (world space) by rotation R about the point h"""
    bpy.context.view_layer.update()
    pb.matrix=AW.inverted()@Matrix.Translation(h)@R.to_4x4()@Matrix.Translation(-h)@AW@pb.matrix
def head(pb): bpy.context.view_layer.update(); return AW@pb.head
def axis(pb): bpy.context.view_layer.update(); return (AW@pb.tail-AW@pb.head).normalized()
def aim(pb, target):
    """turn a pose bone (world space, about its head) so it points along target"""
    turn(pb, axis(pb).rotation_difference(target.normalized()).to_matrix(), head(pb))
def palm_local(sd, s):
    """the hand's finger direction and palm normal (rest pose) in the hand bone's own space"""
    bn=arm.data.bones; ML=bn["hand_"+sd].matrix_local.to_3x3().inverted()
    d=(bn["middle_01_"+sd].head_local-bn["hand_"+sd].head_local).normalized()
    across=bn["index_01_"+sd].head_local-bn["pinky_01_"+sd].head_local
    return ML@d, ML@(d.cross(across)*s).normalized()
PALM={sd: palm_local(sd, s) for sd,s in (("l",1),("r",-1))}
LF={sd: (arm.data.bones["hand_"+sd].head_local-arm.data.bones["lowerarm_"+sd].head_local).length for sd in "lr"}
# the shirt's front surface (rest pose; the arms are clear of the belly there)
dg=bpy.context.evaluated_depsgraph_get()
def bvh_of(objs, keep=None):
    vs=[]; fs=[]
    for o in objs:
        me=o.evaluated_get(dg).to_mesh(); n=len(vs); W=o.matrix_world
        vs += [W@v.co for v in me.vertices]
        fs += [[n+i for i in p.vertices] for p in me.polygons if keep is None or all(i in keep for i in p.vertices)]
        o.evaluated_get(dg).to_mesh_clear()
    return BVHTree.FromPolygons(vs, fs)
SHIRT0=bvh_of([cloth])
def front(x, z):
    """point and outward normal of the shirt's front at (x, z)"""
    hit=SHIRT0.ray_cast(Vector((x, -1.0, z)), Vector((0, 1, 0)))
    return (hit[0], hit[1]) if hit[0] else (Vector((x, -0.14*K, z)), Vector((0, -1, 0)))
X_HAND={"r": 0.085*K, "l": 0.10*K}  # wrists this far from the midline
T_HAND={"r": 0.34, "l": 0.37}    # wrist height, fraction pelvis -> clavicle (navel): the under hand a little lower
D_HAND={"r": -0.35, "l": -0.50}  # hands slope toward the feet as they cross the midline
GAP={"r": 0.02*K, "l": 0.04*K}   # wrist bone in front of the shirt (solved below so the palms just touch)
CURL={"r": (4, 9, 15), "l": (6, 14, 22)}  # finger segments bend toward the belly (degrees from the palm plane, cumulative): relaxed
THUMB={"r": (-3, 0, 3), "l": (-12, -4, 2)}  # thumbs lie along the index, the top one lifted (at rest they would dig in)
POLE={"r": 1.2, "l": 1.2}        # elbow pole (out, back): back toward the table until the forearm would cut the shirt
def pose_arms():
    for pb in PB: pb.matrix_basis=Matrix.Identity(4)
    bpy.context.view_layer.update()
    for sd,s in (("r",-1),("l",1)):
        ua, la, hd = PB["upperarm_"+sd], PB["lowerarm_"+sd], PB["hand_"+sd]
        z=Z_PELVIS+T_HAND[sd]*(Z_CLAV-Z_PELVIS); x=X_HAND[sd]*s
        P0,_=front(x, z); Wr=Vector((x, P0.y-GAP[sd], z))
        # the hand lies along the belly: fingers toward the midline and the feet, palm facing the shirt under its middle
        D=Vector((-s, 0.0, D_HAND[sd])).normalized()
        _,Nm=front(x+0.08*K*D.x, z+0.08*K*D.z); Pt,_=front(x+0.16*K*D.x, z+0.16*K*D.z)
        D=(Pt-P0).normalized(); N=-Nm
        # two-bone IK: elbow on the circle around shoulder->wrist, toward the pole (out and back to the table)
        S=head(ua); Lu=(head(la)-S).length; Lf=LF[sd]
        dv=Wr-S; d=min(dv.length, 0.999*(Lu+Lf)); e=dv.normalized()
        a=(Lu*Lu-Lf*Lf+d*d)/(2*d); h=math.sqrt(max(Lu*Lu-a*a, 0.0))
        p=Vector((s, POLE[sd], 0.0)); p=(p-p.project(e)).normalized()
        E=S+a*e+h*p
        aim(ua, E-S)
        # roll the upper arm about its axis so the elbow hinge points at the wrist, then bend the elbow
        u=axis(ua); f=axis(la); F=(Wr-head(la)).normalized()
        fp=(f-f.project(u)).normalized(); Fp=(F-F.project(u)).normalized()
        turn(ua, Quaternion(u, math.atan2(u.dot(fp.cross(Fp)), fp.dot(Fp))).to_matrix(), head(ua))
        aim(la, Wr-head(la))
        dl,nl=PALM[sd]
        bpy.context.view_layer.update(); R3=(AW@hd.matrix).to_3x3().normalized()
        turn(hd, frame(D, N)@frame(R3@dl, R3@nl).transposed(), head(hd))
        Np=(N-N.project(D)).normalized()
        for fn,angs in (("thumb",THUMB[sd]),("index",CURL[sd]),("middle",CURL[sd]),("ring",CURL[sd]),("pinky",CURL[sd])):
            for j,ang in enumerate(angs):
                pb=PB["%s_%02d_%s" % (fn, j+1, sd)]; dcur=axis(pb)
                flat=(dcur-dcur.project(Np)).normalized()      # keep the finger's spread, lay it in the palm plane
                aim(pb, flat*math.cos(math.radians(ang))+Np*math.sin(math.radians(ang)))
    bpy.context.view_layer.update()
# vertices each hand (and forearm) moves, for the contact check
def bone_verts(names, wmin=0.5):
    gi={body.vertex_groups[n].index for n in names if n in body.vertex_groups}
    return {v.index for v in body.data.vertices if v.index not in helper and v.index not in hidden
            and sum(g.weight for g in v.groups if g.group in gi)>wmin}
FING=[f+"_%02d_" % j for f in ("thumb","index","middle","ring","pinky") for j in (1,2,3)]
HANDV={sd: bone_verts(["hand_"+sd]+[f+sd for f in FING]) for sd in "lr"}
ARMV={sd: bone_verts(["lowerarm_"+sd]) for sd in "lr"}
for m in body.modifiers:
    if m.type=="MASK": m.show_viewport=False      # keep the vertex order for the check (dropped by apply_pose anyway)
def clearance(sd, objs, under=None):
    """signed distance (m) of the hand's and the forearm's closest vertex to the obstacles (negative = inside):
       nearest-surface test against the clothes, and for the top hand a front-to-back test against the hand under it
       (the hands are stacked along -Y, where the nearest-surface sign is unreliable between the fingers)"""
    dg.update(); tr=bvh_of(objs)
    me=body.evaluated_get(dg).to_mesh(); W=body.matrix_world
    best={"hand": 1.0, "arm": 1.0}; gaps=[]
    for key,ids in (("hand", HANDV[sd]), ("arm", ARMV[sd])):
        for i in ids:
            p=W@me.vertices[i].co
            loc,nrm,_,dist=tr.find_nearest(p, 0.05)
            if loc is not None: best[key]=min(best[key], dist if (p-loc).dot(nrm)>=0 else -dist)
            if under and key=="hand":
                f=under.ray_cast(Vector((p.x, -1.0, p.z)), Vector((0, 1, 0)))[0]
                if f is not None and f.y-p.y<0.05: gaps.append(f.y-p.y); best[key]=min(best[key], f.y-p.y)
    body.evaluated_get(dg).to_mesh_clear()
    if gaps: gaps.sort(); best["stack"]=round(gaps[len(gaps)//10], 4)     # how closely the top hand lies on the other
    return best
# solve: each hand's closest vertex 2 mm off the shirt (the top hand: off the under hand); an elbow whose forearm would
# cut the shirt's flank is lifted off the table a little
for it in range(12):
    pose_arms()
    under=bvh_of([body], keep=HANDV["r"])
    c={"r": clearance("r", [cloth]), "l": clearance("l", [cloth], under)}
    done=True
    for sd in "rl":
        err=c[sd]["hand"]-0.002
        if abs(err)>0.001: GAP[sd]-=err; done=False
        if c[sd]["arm"]<0.002: POLE[sd]-=0.1; done=False
    if done: break
print("HANDS", "solved" if done else "NOT SOLVED", "it", it, {sd: dict(gap=round(GAP[sd],4), pole=round(POLE[sd],2),
      hand=round(c[sd]["hand"],4), forearm=round(c[sd]["arm"],4)) for sd in "rl"}, "stack p10", c["l"].get("stack"))
for sd in "rl":
    print("HANDPOS", sd, "elbow", tuple(round(v,3) for v in head(PB["lowerarm_"+sd])), "wrist", tuple(round(v,3) for v in head(PB["hand_"+sd])),
          "fingertip", tuple(round(v,3) for v in AW@PB["middle_03_"+sd].tail))
for m in body.modifiers:
    if m.type=="MASK": m.show_viewport=True
bpy.ops.object.mode_set(mode="OBJECT")
bpy.context.view_layer.update()
def apply_pose(o):
    if o.data.shape_keys: o.shape_key_clear()
    for m in list(o.modifiers):
        if m.type!="ARMATURE": o.modifiers.remove(m)
    bpy.context.view_layer.objects.active=o
    for m in list(o.modifiers): bpy.ops.object.modifier_apply(modifier=m.name)
    o.parent=None
for o in (body, cloth): apply_pose(o)
bpy.data.objects.remove(arm, do_unlink=True)
for o in (body, cloth): print("MATRIX", o.name, [round(x,3) for x in o.matrix_world.to_euler()], [round(x,3) for x in o.matrix_world.to_scale()])
bpy.ops.object.select_all(action="DESELECT"); body.select_set(True); cloth.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)     # local = world from here on

def delete_verts(o, kill):
    bpy.context.view_layer.objects.active=o
    bpy.ops.object.mode_set(mode="EDIT"); bm=bmesh.from_edit_mesh(o.data); bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.verts[i] for i in kill], context="VERTS"); bmesh.update_edit_mesh(o.data)
    bpy.ops.object.mode_set(mode="OBJECT")
# body keeps every face the head drops: delete only the faces whose vertices are all head-side
bpy.context.view_layer.objects.active=body
bpy.ops.object.mode_set(mode="EDIT"); bm=bmesh.from_edit_mesh(body.data); bm.verts.ensure_lookup_table(); bm.faces.ensure_lookup_table()
dead=set(helper)|(hidden-RESTORE)
faces=[f for f in bm.faces if all(v.index in headv for v in f.verts) or any(v.index in dead for v in f.verts)]
bmesh.ops.delete(bm, geom=faces, context="FACES_ONLY")
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
bmesh.update_edit_mesh(body.data); bpy.ops.object.mode_set(mode="OBJECT")
if CHAIN: merge_groups(body)
else:
    for g in list(body.vertex_groups): body.vertex_groups.remove(g)
print("BODY KEPT", len(body.data.vertices), "verts", sum(len(p.vertices)-2 for p in body.data.polygons), "tris")

# ---- clothes: shirt / pants, per connected piece by height (a piece centred below the hips is the jeans) ----
cmat=cloth.data.materials[0]
texs={n.image.name:n.image for n in cmat.node_tree.nodes if n.type=="TEX_IMAGE"}
print("CLOTH TEX", list(texs))
dif=[i for k,i in texs.items() if "diffuse" in k.lower()][0]
nrm_img=[i for k,i in texs.items() if "normal" in k.lower()][0]
ao_img=bpy.data.images.load(bpy.path.abspath(dif.filepath).replace("_diffuse.png","_ao.png"))   # not wired in the game-engine material
def is_pants(poly): return poly.center.z < Z_PELVIS
bm=bmesh.new(); bm.from_mesh(cloth.data); bm.faces.ensure_lookup_table()
pants_faces=set(); seen=set()
for f0 in bm.faces:
    if f0.index in seen: continue
    piece=[]; stack=[f0]; seen.add(f0.index)
    while stack:
        f=stack.pop(); piece.append(f.index)
        for e in f.edges:
            for g in e.link_faces:
                if g.index not in seen: seen.add(g.index); stack.append(g)
    if 2*sum(is_pants(cloth.data.polygons[i]) for i in piece) > len(piece): pants_faces |= set(piece)
bm.free()
print("CLOTH faces", len(cloth.data.polygons), "pants", len(pants_faces))
pants=cloth.copy(); pants.data=cloth.data.copy(); pants.name="patient_pants"; pants.data.name="patient_pants"
bpy.context.collection.objects.link(pants)
cloth.name="patient_shirt"; cloth.data.name="patient_shirt"
def keep_faces(o, keep):
    bpy.context.view_layer.objects.active=o
    bpy.ops.object.mode_set(mode="EDIT"); bm=bmesh.from_edit_mesh(o.data); bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.index not in keep], context="FACES_ONLY")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bmesh.update_edit_mesh(o.data); bpy.ops.object.mode_set(mode="OBJECT")
keep_faces(cloth, {p.index for p in cloth.data.polygons} - pants_faces)
keep_faces(pants, pants_faces)
for o in (cloth, pants):
    if CHAIN: merge_groups(o)
    else:
        for g in list(o.vertex_groups): o.vertex_groups.remove(g)
    print("CLOTH", o.name, len(o.data.vertices), "verts", sum(len(p.vertices)-2 for p in o.data.polygons), "tris")
# optional (patients.py "tuck"): skin that pokes through the shirt (extreme muscle/weight: shoulders, trapezius) is pulled
# back under it. Only skin whose nearest shirt face is an inner face (no hem/collar/sleeve-edge vertex) is touched.
TUCK=PATIENTS[PID].get("tuck", 0.0)
if TUCK:
    sh=cloth.data; edge_count={}
    for e in sh.edges: edge_count[e.key]=0
    for pl in sh.polygons:
        for k in pl.edge_keys: edge_count[k]+=1
    rim={i for k,c in edge_count.items() if c==1 for i in k}
    near_rim={pl.index for pl in sh.polygons if any(i in rim for i in pl.vertices)}
    tr=BVHTree.FromPolygons([v.co for v in sh.vertices], [list(pl.vertices) for pl in sh.polygons])
    moved=0
    for v in body.data.vertices:
        loc,nrm,fi,dist=tr.find_nearest(v.co, 0.03)
        if loc is None or fi in near_rim: continue
        d=(v.co-loc).dot(nrm)
        # poke-through is shallow and the skin faces the same way as the shirt (a forearm lying on the belly faces it)
        if -TUCK < d < 0.01 and v.normal.dot(nrm) > 0.5:
            v.co=loc-nrm*TUCK; moved+=1
    print("TUCK", TUCK, "skin verts pulled under the shirt", moved)
# neck-rig lab: restored skin sits 3 mm under the shirt at least (MPFB fitted the shirt to a body it then hid: some of
# it lies on or through the cloth and would flicker / poke out). The collar's rim faces are left alone (no inside there).
if RESTORE:
    sh=cloth.data; edge_count={}
    for pl in sh.polygons:
        for k in pl.edge_keys: edge_count[k]=edge_count.get(k,0)+1
    rim={i for k,c in edge_count.items() if c==1 for i in k}
    near_rim={pl.index for pl in sh.polygons if any(i in rim for i in pl.vertices)}
    tr=BVHTree.FromPolygons([v.co for v in sh.vertices], [list(pl.vertices) for pl in sh.polygons])
    flag=body.data.attributes["lab_restored"].data; pushed=0; n=0
    for v in body.data.vertices:
        if not flag[v.index].value: continue
        n+=1
        loc,nrm,fi,dist=tr.find_nearest(v.co, 0.03)
        if loc is None or fi in near_rim: continue
        d=(v.co-loc).dot(nrm)
        if -0.003 < d < 0.01 and v.normal.dot(nrm) > 0.3:
            v.co=loc-nrm*0.003; pushed+=1
    print("RESTORED", n, "skin verts kept,", pushed, "pushed 3 mm under the shirt")
    body.data.attributes.remove(body.data.attributes["lab_restored"])
# AO + normal only: the colour comes from the game palette
for o,name in ((cloth,"patient.shirt"),(pants,"patient.pants")):
    fm=bpy.data.materials.new(name); fm.use_nodes=True
    b=[n for n in fm.node_tree.nodes if n.type=="BSDF_PRINCIPLED"][0]
    ti=fm.node_tree.nodes.new("ShaderNodeTexImage"); ti.image=ao_img; fm.node_tree.links.new(ti.outputs["Color"], b.inputs["Base Color"])
    tn=fm.node_tree.nodes.new("ShaderNodeTexImage"); tn.image=nrm_img; tn.image.colorspace_settings.name="Non-Color"
    nm=fm.node_tree.nodes.new("ShaderNodeNormalMap"); fm.node_tree.links.new(tn.outputs["Color"], nm.inputs["Color"])
    fm.node_tree.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    b.inputs["Roughness"].default_value=0.85
    o.data.materials.clear(); o.data.materials.append(fm)

# ---- skin: repack + bake diffuse x AO (the clothes occlude the skin around them too) ----
me=body.data; uv=me.uv_layers[0]; uv.name="UVOrig"
u=np.zeros(len(me.loops)*2); uv.data.foreach_get("uv", u)
nu=me.uv_layers.new(name="UVMap"); nu.data.foreach_set("uv", u); me.uv_layers.active=nu
bpy.ops.object.select_all(action="DESELECT"); body.select_set(True); bpy.context.view_layer.objects.active=body
bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT"); bpy.ops.uv.select_all(action="SELECT")
bpy.ops.uv.pack_islands(rotate=True, margin=0.004); bpy.ops.object.mode_set(mode="OBJECT")
skin=me.materials[0]
src=[n for n in skin.node_tree.nodes if n.type=="TEX_IMAGE" and n.name.lower().startswith("diffuse")][0].image
sc=bpy.context.scene; sc.render.engine="CYCLES"; sc.cycles.device="CPU"; sc.cycles.samples=SAMPLES
sc.render.bake.margin=8; sc.render.bake.use_selected_to_active=False
img=bpy.data.images.new(PID+"_body_skin", BAKE, BAKE, alpha=False)
m=bpy.data.materials.new("bk"); m.use_nodes=True; t=m.node_tree; t.nodes.clear()
uvn=t.nodes.new("ShaderNodeUVMap"); uvn.uv_map="UVOrig"
tx=t.nodes.new("ShaderNodeTexImage"); tx.image=src; t.links.new(uvn.outputs[0], tx.inputs[0])
ao=t.nodes.new("ShaderNodeAmbientOcclusion"); ao.samples=32; ao.inputs["Distance"].default_value=0.02
f=t.nodes.new("ShaderNodeMix"); f.data_type="FLOAT"; f.inputs["Factor"].default_value=AO_MIX
f.inputs["A"].default_value=1.0; t.links.new(ao.outputs["AO"], f.inputs["B"])
mul=t.nodes.new("ShaderNodeMix"); mul.data_type="RGBA"; mul.blend_type="MULTIPLY"; mul.inputs["Factor"].default_value=1.0
t.links.new(tx.outputs["Color"], mul.inputs["A"]); t.links.new(f.outputs["Result"], mul.inputs["B"])
em=t.nodes.new("ShaderNodeEmission"); t.links.new(mul.outputs["Result"], em.inputs["Color"])
out=t.nodes.new("ShaderNodeOutputMaterial"); t.links.new(em.outputs[0], out.inputs["Surface"])
tg=t.nodes.new("ShaderNodeTexImage"); tg.image=img; t.nodes.active=tg; tg.select=True
me.materials.clear(); me.materials.append(m)
bpy.ops.object.bake(type="EMIT")
img.filepath_raw=os.path.join(os.path.dirname(os.path.abspath(OUT)), PID+"_body_skin.png"); img.file_format="PNG"; img.save()
fm=bpy.data.materials.new("patient.skin"); fm.use_nodes=True
b=[n for n in fm.node_tree.nodes if n.type=="BSDF_PRINCIPLED"][0]
ti=fm.node_tree.nodes.new("ShaderNodeTexImage"); ti.image=img; fm.node_tree.links.new(ti.outputs["Color"], b.inputs["Base Color"])
b.inputs["Roughness"].default_value=0.55
me.materials.clear(); me.materials.append(fm)
me.uv_layers.remove(me.uv_layers["UVOrig"])

# ---- breath shape key: front of the chest and belly rise (-Y is the front in MakeHuman's Blender space) ----
def smooth(a, b, x):
    t=max(0.0, min(1.0, (x-a)/(b-a))); return t*t*(3-2*t)
def bell(t, c, r):
    u=min(1.0, abs(t-c)/r); return 0.5+0.5*math.cos(math.pi*u)
def rise(z):
    """Chest leads, the belly follows softly; both fade out before the pelvis and the collarbones."""
    t=(z-Z_PELVIS)/(Z_CLAV-Z_PELVIS)
    return (BREATH_CHEST*bell(t, 0.68, 0.36) + BREATH_BELLY*bell(t, 0.3, 0.3))*K
def breath_key(o, yc):
    o.shape_key_add(name="Basis", from_mix=False)
    k=o.shape_key_add(name="breath", from_mix=False)
    for v,d in zip(o.data.vertices, k.data):
        p=v.co
        front=smooth(-0.02*K, 0.1*K, yc - p.y)              # 0 behind the torso's mid-depth, 1 toward the front
        side=smooth(0.0, 1.0, 1.0 - abs(p.x)/(0.24*K))
        r=rise(p.z)*front*side
        # the rib cage widens a little with the chest, not the belly
        wide=0.25*BREATH_CHEST*K*bell((p.z-Z_PELVIS)/(Z_CLAV-Z_PELVIS), 0.68, 0.36)*front*side
        # shoulders and the top of the arms ride up, well clear of the neck seam (|x| <= 0.072)
        sh=smooth(0.11*K, 0.18*K, abs(p.x))*smooth(Z_CLAV-0.32*K, Z_CLAV-0.12*K, p.z)
        d.co=p+Vector((wide*(1 if p.x>0 else -1), -r, SHRUG*K*sh))     # rises, widens, shrugs
    k.value=0.0
ys=[v.co.y for v in cloth.data.vertices if abs(v.co.z-Z_CHEST)<0.05*K and abs(v.co.x)<0.12*K]
yc=(min(ys)+max(ys))/2 if ys else 0.0
print("TORSO yc %.3f" % yc)
for o in (body, cloth): breath_key(o, yc)

# ---- two-bone skin: body (static) and neck (turns with the head pivot in the game) ----
ab=bpy.data.armatures.new("patient_body"); ao_=bpy.data.objects.new("patient_body", ab); bpy.context.collection.objects.link(ao_)
bpy.context.view_layer.objects.active=ao_; bpy.ops.object.mode_set(mode="EDIT")
r=ab.edit_bones.new("body"); r.head=(0,0,Z_PELVIS); r.tail=(0,0,Z_PELVIS+0.1)
n=ab.edit_bones.new("neck"); n.head=(0,0,CUT-0.03*K); n.tail=(0,0,CUT+0.05*K); n.parent=r
if CHAIN:
    def bone(name, h, t, parent):
        e=ab.edit_bones.new(name); e.head=h; e.tail=t; e.parent=parent; return e
    s2=bone("spine_02", BP["spine_02"], BP["spine_03"], r)
    s3=bone("spine_03", BP["spine_03"], BP["neck_01"], s2)
    for sd in "lr": bone("clavicle_"+sd, BP["clavicle_"+sd], BP["upperarm_"+sd], s3)
    # siblings of the seam bone: each gets its own world transform from the game (a share of the head turn)
    for i,dz in ((1,0.09),(2,0.06)): bone("neck_%d" % i, (0,0,CUT-dz*K), (0,0,CUT-dz*K+0.03*K), r)
bpy.ops.object.mode_set(mode="OBJECT")
TRUNK=("body","spine_02","spine_03","clavicle_l","clavicle_r")
def chain_weights(o, nn_w):
    """neck weight w (seam fade, as for the two bones; the game redoes the skin's column) + the merged trunk groups x (1-w)
       (MPFB's own neck_01/head weight rides on spine_03: the neck's base goes with the chest)"""
    names={g.index: g.name for g in o.vertex_groups}; rows=[]
    for v in o.data.vertices:
        t=dict.fromkeys(TRUNK, 0.0)
        for g in v.groups:
            n=names[g.group]
            if n.startswith("m_"): k=n[2:]; t["spine_03" if k=="neck" else k]+=g.weight
        s=sum(t.values()) or 1.0
        rows.append({k: x/s for k,x in t.items()})
    for g in list(o.vertex_groups): o.vertex_groups.remove(g)
    groups={k: o.vertex_groups.new(name=k) for k in (*TRUNK, "neck", "neck_1", "neck_2")}
    for v,t in zip(o.data.vertices, rows):
        w=nn_w(v)
        if w>0.001: groups["neck"].add([v.index], w, "REPLACE")
        for k,x in t.items():
            if x*(1-w)>0.001: groups[k].add([v.index], x*(1-w), "REPLACE")
for o in (body, cloth, pants):
    if CHAIN:
        def nn_w(v, o=o):
            _,_,dist=tree.find(o.matrix_world@v.co)
            w=max(0.0, 1.0 - dist/(NECK_FADE*K)); return w*w*(3-2*w)
        chain_weights(o, nn_w)
        o.parent=ao_; md=o.modifiers.new("Armature","ARMATURE"); md.object=ao_
        continue
    gb=o.vertex_groups.new(name="body"); gn=o.vertex_groups.new(name="neck")
    nn=0
    for v in o.data.vertices:
        _,_,dist=tree.find(o.matrix_world@v.co)
        w=max(0.0, 1.0 - dist/(NECK_FADE*K)); w=w*w*(3-2*w)
        if w>0.001: gn.add([v.index], w, "REPLACE"); nn+=1
        if w<0.999: gb.add([v.index], 1.0-w, "REPLACE")
    print("NECK WEIGHTS", o.name, nn)
    o.parent=ao_; md=o.modifiers.new("Armature","ARMATURE"); md.object=ao_

bpy.ops.object.select_all(action="DESELECT")
for o in (ao_, body, cloth, pants): o.select_set(True)
body.name="patient_body_skin"; body.data.name="patient_body_skin"
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True, export_skins=True, export_animations=False,
    export_morph=True, export_morph_normal=True, export_apply=False, export_yup=True, export_texcoords=True, export_normals=True,
    export_materials="EXPORT", export_image_format="AUTO", export_extras=False, export_def_bones=False)
print("WROTE", OUT, os.path.getsize(OUT))

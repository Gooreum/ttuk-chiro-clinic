"""Back-press mode patient (src/back/scene.js): patient01 (박대리, patients.py) lying PRONE on the treatment table, as
   one static GLB in three.js world coordinates, plus the height field of his back (the top surface) as JSON.
   - the whole MPFB (MakeHuman, CC0) character: body with head, short02 hair, T-shirt + jeans (male_casualsuit06),
     game_engine rig only for posing (dropped)
   - pose: arms along the sides on the table, elbows a touch bent, palms up; hips a touch flexed so the thighs rest on
     the pad; feet pointed (soles up, toes toward the table's end); head straight, face down in the face hole
   - prone: rotated so the front faces the table (three.js -y), the crown points at -z (the table's head end), the
     patient's left goes to three.js -x. Placed so the chest lies on the pad (TABLE_TOP) sinking SINK, and the base of
     the neck (neck_01 head, ~C7/T1) is at three.js z NECK_Z: the game's back zone z -0.05..0.55 then runs T1 -> L5
   - soft tissue on the pad: every skin / clothes vertex below the pad top + SOFT is pushed up by a smooth monotone
     clamp (chest, belly, thighs and forearms flatten on the pad; the order of the layers is kept, so the shirt never
     sinks into the skin). The head is excluded (the face is in the hole)
   - skin: kept UV islands repacked, Cycles bake of diffuse x AO (with a stand-in pad, so the sides darken toward it);
     shirt / pants: the asset AO x baked scene AO, colour from the game (gown / pants palette); hair keeps its texture
   - back_surface.json: top surface height (three.js y) on a grid over x, z (the game places the hands, the target rings
     and picks on it; no raycasting of the quantized meshes at runtime)
   usage: blender -b --python back_patient.py -- out_raw.glb surface.json [bake_size=1024] [cycles_samples=16] [preview_dir]"""
import bpy, bmesh, importlib, sys, os, math, json
import numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
P="bl_ext.user_default.mpfb"
HS=importlib.import_module(P+".services.humanservice").HumanService
TS=importlib.import_module(P+".services.targetservice").TargetService
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from patients import human_info
ARGS=sys.argv[sys.argv.index("--")+1:]
OUT=ARGS[0]; SURF=ARGS[1]; BAKE=int(ARGS[2]) if len(ARGS)>2 else 1024; SAMPLES=int(ARGS[3]) if len(ARGS)>3 else 16
PREVIEW=ARGS[4] if len(ARGS)>4 else ""
PID="patient01"
TABLE_TOP=0.82       # pad top (three.js y)
SINK=0.014           # the chest sinks this far into the pad
SOFT=0.012           # soft-tissue clamp band above the pad top
NECK_Z=-0.07         # three.js z of the base of the neck
ARM_OUT=0.15         # upper arms this far out per metre down the body
HIP_FLEX=-3.0        # thighs tilt toward the table (degrees, start value: solved so the thighs rest on the pad)
FOOT_POINT=72.0      # feet pointed (degrees)
GRID=dict(x0=-0.34, x1=0.34, z0=-0.62, z1=0.86, step=0.01)
AO_MIX=0.7
AO_FLOOR=0.55

for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
info=human_info(PID, rig="game_engine", clothes=True, face=False)
info["hair"]="short02/short02.mhclo"
st=HS.get_default_deserialization_settings(); st["subdiv_levels"]=0; st["load_clothes"]=True
body=HS.deserialize_from_dict(info, st)
arm=[o for o in bpy.data.objects if o.type=="ARMATURE"][0]
meshes={o.name.split(".")[-1]: o for o in bpy.data.objects if o.type=="MESH" and o is not body}
print("MESHES", body.name, list(meshes))
cloth=meshes["male_casualsuit06"]; hair=meshes["short02"]
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
print("HELPER", len(helper), "HIDDEN", len(hidden))

AW=arm.matrix_world; BN=arm.data.bones; PB=arm.pose.bones
NECK=AW@BN["neck_01"].head_local; PELVIS=AW@BN["pelvis"].head_local; HEADB=AW@BN["head"].head_local
print("REST neck_01 %s pelvis %s head %s" % (tuple(round(x,3) for x in NECK), tuple(round(x,3) for x in PELVIS), tuple(round(x,3) for x in HEADB)))

bpy.context.view_layer.objects.active=arm
bpy.ops.object.mode_set(mode="POSE")
def upd(): bpy.context.view_layer.update()
def turn(pb, R, h):
    upd(); pb.matrix=AW.inverted()@Matrix.Translation(h)@R.to_4x4()@Matrix.Translation(-h)@AW@pb.matrix
def head(pb): upd(); return AW@pb.head
def axis(pb): upd(); return (AW@pb.tail-AW@pb.head).normalized()
def aim(pb, target): turn(pb, axis(pb).rotation_difference(target.normalized()).to_matrix(), head(pb))
def Rx(deg): return Matrix.Rotation(math.radians(deg), 3, "X")
def frame(a, b):
    a=a.normalized(); b=(b-b.project(a)).normalized(); return Matrix((a, b, a.cross(b))).transposed()
def palm_local(sd, s):
    ML=BN["hand_"+sd].matrix_local.to_3x3().inverted()
    d=(BN["middle_01_"+sd].head_local-BN["hand_"+sd].head_local).normalized()
    across=BN["index_01_"+sd].head_local-BN["pinky_01_"+sd].head_local
    return ML@d, ML@(d.cross(across)*s).normalized()
PALM={sd: palm_local(sd, s) for sd,s in (("l",1),("r",-1))}

def pose(tilt, hip=HIP_FLEX):
    """tilt: the arms lean toward the front (the table) by this much per metre down"""
    for pb in PB: pb.matrix_basis=Matrix.Identity(4)
    upd()
    for sd,s in (("l",1),("r",-1)):
        aim(PB["upperarm_"+sd], Vector((s*ARM_OUT, -tilt, -1)))
        # roll the upper arm so the elbow bends toward the back (the hinge faces the table), then the forearm
        aim(PB["lowerarm_"+sd], Vector((s*ARM_OUT*0.4, -tilt*1.5, -1)))
        D=axis(PB["lowerarm_"+sd]); N=Vector((0, 1, 0))           # palms up (the back side, the ceiling when prone)
        hd=PB["hand_"+sd]; dl,nl=PALM[sd]
        upd(); R3=(AW@hd.matrix).to_3x3().normalized()
        turn(hd, frame(D, N)@frame(R3@dl, R3@nl).transposed(), head(hd))
        Np=(N-N.project(D)).normalized()
        for fn in ("index","middle","ring","pinky","thumb"):
            for j,ang in enumerate((8, 14, 12) if fn!="thumb" else (0, 4, 6)):
                pb=PB["%s_%02d_%s" % (fn, j+1, sd)]; dc=axis(pb)
                flat=(dc-dc.project(Np)).normalized()
                aim(pb, flat*math.cos(math.radians(ang))+Np*math.sin(math.radians(ang)))
        turn(PB["thigh_"+sd], Rx(hip), head(PB["thigh_"+sd]))
        turn(PB["calf_"+sd], Rx(-hip*0.25), head(PB["calf_"+sd]))
        turn(PB["foot_"+sd], Rx(FOOT_POINT), head(PB["foot_"+sd]))
    upd()

dg=bpy.context.evaluated_depsgraph_get()
FRONT_GROUPS={"arm":["upperarm_l","lowerarm_l","hand_l","upperarm_r","lowerarm_r","hand_r"],
              "leg":["thigh_l","calf_l","thigh_r","calf_r"], "foot":["foot_l","ball_l","foot_r","ball_r"]}
GV={k:{v.index for v in body.data.vertices if v.index not in helper and v.index not in hidden and
       sum(g.weight for g in v.groups if body.vertex_groups[g.group].name in names)>0.5} for k,names in FRONT_GROUPS.items()}
TORSO_Z=(PELVIS.z+0.05, NECK.z-0.04)
def fronts():
    """the front-most (min y) point of the torso (shirt), the arms, legs and feet (skin), rest coordinates"""
    dg.update()
    me=body.evaluated_get(dg).to_mesh(); W=body.matrix_world
    res={k: min((W@me.vertices[i].co).y for i in ids) for k,ids in GV.items()}
    body.evaluated_get(dg).to_mesh_clear()
    mc=cloth.evaluated_get(dg).to_mesh(); Wc=cloth.matrix_world
    res["chest"]=min((Wc@v.co).y for v in mc.vertices if TORSO_Z[0]<(Wc@v.co).z<TORSO_Z[1] and abs((Wc@v.co).x)<0.16)
    cloth.evaluated_get(dg).to_mesh_clear()
    return res
# solve the arm tilt so the arms just rest on the pad (their front-most point at the pad top)
tilt=0.12; hip=HIP_FLEX
for it in range(14):
    pose(tilt, hip); f=fronts(); plane=f["chest"]+SINK
    err=f["arm"]-(plane+0.004); errl=f["leg"]-(plane+0.002)
    print("POSE it %d tilt %.3f hip %.1f | front: chest %.3f arm %.3f leg %.3f foot %.3f | plane %.3f err arm %+.4f leg %+.4f" % (it, tilt, hip, f["chest"], f["arm"], f["leg"], f["foot"], plane, err, errl))
    if abs(err)<0.0015 and abs(errl)<0.002: break
    tilt+=err*1.6; hip-=errl*110
PLANE_Y=plane
bpy.ops.object.mode_set(mode="OBJECT")

# ---- apply the pose, drop the rig ----
objs=[body, cloth, hair]
for o in list(meshes.values()):
    if o not in objs: bpy.data.objects.remove(o, do_unlink=True)
for o in objs:
    if o.data.shape_keys: o.shape_key_clear()
    bpy.context.view_layer.objects.active=o
    for m in list(o.modifiers): bpy.ops.object.modifier_apply(modifier=m.name)
    mw=o.matrix_world.copy(); o.parent=None; o.matrix_world=mw
bpy.data.objects.remove(arm, do_unlink=True)
bpy.ops.object.select_all(action="DESELECT")
for o in objs: o.select_set(True)
bpy.context.view_layer.objects.active=body
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

bm=bmesh.new(); bm.from_mesh(body.data); bm.verts.ensure_lookup_table()
bmesh.ops.delete(bm, geom=[bm.verts[i] for i in (helper|hidden)], context="VERTS")
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
bm.to_mesh(body.data); bm.free()
for o in objs:
    for g in list(o.vertex_groups): o.vertex_groups.remove(g)

# ---- soft tissue on the pad (rest coordinates: the pad is the plane y = PLANE_Y, the front is -y) ----
def soft(y):
    u=y-PLANE_Y                      # height above the pad toward the back (+)
    if u>=SOFT: return y
    d=SOFT-u                         # how far into the band (0 at its top)
    return PLANE_Y+SOFT-SOFT*(1-math.exp(-d/SOFT))
HEAD_FREE=NECK.z+0.02
def clamp_mesh(o):
    n=0
    for v in o.data.vertices:
        if v.co.z>HEAD_FREE: continue
        y=soft(v.co.y)
        # fade out toward the neck so the face keeps its shape
        f=min(1.0, max(0.0, (HEAD_FREE-v.co.z)/0.05))
        if y!=v.co.y: v.co.y=v.co.y+(y-v.co.y)*f; n+=1
    o.data.update(); print("SOFT", o.name, n, "verts")
# the clamp is monotone in y, so a shirt vertex in front of the skin stays in front of it
for o in (body, cloth): clamp_mesh(o)

# ---- split the clothes: jeans = connected pieces mostly below the hips ----
bm=bmesh.new(); bm.from_mesh(cloth.data); bm.faces.ensure_lookup_table()
pants_f=set(); seen=set()
for f0 in bm.faces:
    if f0.index in seen: continue
    piece=[]; stk=[f0]; seen.add(f0.index)
    while stk:
        f=stk.pop(); piece.append(f)
        for ed in f.edges:
            for g in ed.link_faces:
                if g.index not in seen: seen.add(g.index); stk.append(g)
    if 2*sum(f.calc_center_median().z<PELVIS.z for f in piece)>len(piece): pants_f |= {f.index for f in piece}
bm.free()
pants=cloth.copy(); pants.data=cloth.data.copy(); bpy.context.collection.objects.link(pants)
def keep_faces(o, keep):
    bm=bmesh.new(); bm.from_mesh(o.data); bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.index not in keep], context="FACES_ONLY")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bm.to_mesh(o.data); bm.free()
keep_faces(cloth, {p.index for p in cloth.data.polygons}-pants_f); keep_faces(pants, pants_f)

# ---- prone: rest (x, y, z) -> three.js (-x, y - PLANE_Y + TABLE_TOP - SINK... , -z + tz) ----
# Blender (export y-up): three = (bx, bz, -by)  =>  bx = -x, by = z - TZ, bz = y + TY
TY=TABLE_TOP-PLANE_Y-SINK*0     # the pad plane (chest front + SINK) lands on TABLE_TOP
TZ=NECK.z+NECK_Z                # three z = -(z) + TZ  =>  neck z -> NECK_Z
M=Matrix(((-1,0,0,0),(0,0,1,-TZ),(0,1,0,TY),(0,0,0,1)))
names={body:"back_patient_skin", cloth:"back_patient_shirt", pants:"back_patient_pants", hair:"back_patient_hair"}
for o,nm in names.items():
    o.data.transform(M); o.data.update(); o.name=nm; o.data.name=nm
    if M.to_3x3().determinant()<0: o.data.flip_normals()
objs=list(names)
def three(p): return (round(p.x,4), round(p.z,4), round(-p.y,4))
def to3(p): return three(M@p)
for nm,p in (("neck_01 (C7/T1)",NECK),("pelvis",PELVIS),("head",HEADB)): print("MEASURE", nm, "three.js", to3(p))
allv=[v.co for o in objs for v in o.data.vertices]
print("BBOX three.js x %.3f..%.3f y %.3f..%.3f z %.3f..%.3f" % (min(p.x for p in allv),max(p.x for p in allv),
      min(p.z for p in allv),max(p.z for p in allv),-max(p.y for p in allv),-min(p.y for p in allv)))
for o in objs: print("MESH", o.name, len(o.data.vertices), "verts", sum(len(p.vertices)-2 for p in o.data.polygons), "tris")

# ---- height field of the top surface (three.js y) ----
vs=[]; fs=[]
for o in objs:
    n=len(vs); vs+=[v.co.copy() for v in o.data.vertices]; fs+=[[n+i for i in p.vertices] for p in o.data.polygons]
tree=BVHTree.FromPolygons(vs, fs)
nx=int(round((GRID["x1"]-GRID["x0"])/GRID["step"]))+1; nz=int(round((GRID["z1"]-GRID["z0"])/GRID["step"]))+1
hf=[]
for j in range(nz):
    z=GRID["z0"]+j*GRID["step"]
    for i in range(nx):
        x=GRID["x0"]+i*GRID["step"]
        hit=tree.ray_cast(Vector((x, -z, 3.0)), Vector((0,0,-1)))
        hf.append(round(hit[0].z,4) if hit[0] is not None else None)
with open(SURF,"w") as fh:
    json.dump(dict(GRID, nx=nx, nz=nz, tableTop=TABLE_TOP, neckZ=round(to3(NECK)[2],4), pelvisZ=round(to3(PELVIS)[2],4),
                   headZ=round(to3(HEADB)[2],4), y=hf), fh, separators=(",",":"))
mid=[hf[j*nx+nx//2] for j in range(nz)]
print("SPINE y (x=0) every 5 cm:", [(round(GRID["z0"]+j*GRID["step"],2), mid[j]) for j in range(0,nz,5)])
print("WROTE", SURF, os.path.getsize(SURF))

# ---- materials, bake ----
def bsdf(m): return [n for n in m.node_tree.nodes if n.type=="BSDF_PRINCIPLED"][0]
def tex_node(m): return [n for n in m.node_tree.nodes if n.type=="TEX_IMAGE"][0]
def simple_mat(name, img, rough, alpha=False, normal=None):
    fm=bpy.data.materials.new(name); fm.use_nodes=True; nt=fm.node_tree; b=bsdf(fm)
    ti=nt.nodes.new("ShaderNodeTexImage"); ti.image=img; nt.links.new(ti.outputs["Color"], b.inputs["Base Color"])
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
hair_img=tex_node(hair.data.materials[0]).image
set_mat(hair, simple_mat("back.short02", hair_img, 0.5, alpha=True))
cmat=cloth.data.materials[0]
texs={n.image.name:n.image for n in cmat.node_tree.nodes if n.type=="TEX_IMAGE"}
dif=[i for k,i in texs.items() if "diffuse" in k.lower()][0]
nrm_img=[i for k,i in texs.items() if "normal" in k.lower()][0]
ao_img=bpy.data.images.load(bpy.path.abspath(dif.filepath).replace("_diffuse.png","_ao.png"))
_a=np.array(ao_img.pixels[:]).reshape(-1,ao_img.channels); _a[:,:3]=AO_FLOOR+(1-AO_FLOOR)*_a[:,:3]
ao_img.pixels[:]=_a.ravel(); ao_img.update()
skin_src=[n for n in body.data.materials[0].node_tree.nodes if n.type=="TEX_IMAGE" and n.name.lower().startswith("diffuse")][0].image

# stand-in pad for the AO bake (not exported)
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, -0.25, TABLE_TOP-0.05)); pad=bpy.context.object; pad.scale=(0.68, 2.2, 0.1)
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
    hair.hide_render=True
    for o,m in zip(objs_, mats_): set_mat(o, m)
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs_: o.select_set(True)
    bpy.context.view_layer.objects.active=objs_[0]
    bpy.ops.object.bake(type="EMIT")
    hair.hide_render=False
    for o,m in zip(objs_, keep_mats): set_mat(o, m)
me=body.data; u0=me.uv_layers[0]; u0.name="UVOrig"
u=np.zeros(len(me.loops)*2); u0.data.foreach_get("uv", u)
nu=me.uv_layers.new(name="UVMap"); nu.data.foreach_set("uv", u); me.uv_layers.active=nu
if BAKE>0:
    bpy.ops.object.select_all(action="DESELECT"); body.select_set(True); bpy.context.view_layer.objects.active=body
    bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT"); bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.pack_islands(rotate=True, margin=0.004); bpy.ops.object.mode_set(mode="OBJECT")
    skin_img=bpy.data.images.new("back_patient_skin", BAKE, BAKE, alpha=False)
    cloth_img=bpy.data.images.new("back_patient_cloth", BAKE, BAKE, alpha=False)
    skin_m=simple_mat("back.skin", skin_img, 0.55)
    shirt_m=simple_mat("back.shirt", cloth_img, 0.85, normal=nrm_img)
    pants_m=simple_mat("back.pants", cloth_img, 0.85, normal=nrm_img)
    bake([body], [emit_bake_mat("bk_skin", skin_src, "UVOrig", skin_img, 0.03, AO_MIX)], [skin_m])
    save(skin_img, "back_patient_skin")
    cuv="UVMap" if "UVMap" in cloth.data.uv_layers else cloth.data.uv_layers[0].name
    cb=emit_bake_mat("bk_cloth", ao_img, cuv, cloth_img, 0.05, 0.6)
    bake([cloth, pants], [cb, cb], [shirt_m, pants_m])
    save(cloth_img, "back_patient_cloth")
else:
    skin_m=simple_mat("back.skin", skin_src, 0.55)
    set_mat(body, skin_m); set_mat(cloth, simple_mat("back.shirt", ao_img, 0.85, normal=nrm_img)); set_mat(pants, simple_mat("back.pants", ao_img, 0.85, normal=nrm_img))
me.uv_layers.remove(me.uv_layers["UVOrig"])
for o in objs:
    for p in o.data.polygons: p.use_smooth=True
bpy.data.objects.remove(pad, do_unlink=True)

bpy.ops.object.select_all(action="DESELECT")
for o in objs: o.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True, export_skins=False, export_animations=False,
    export_morph=False, export_apply=False, export_yup=True, export_texcoords=True, export_normals=True,
    export_materials="EXPORT", export_image_format="AUTO", export_extras=False)
print("WROTE", OUT, os.path.getsize(OUT))

if PREVIEW:
    os.makedirs(PREVIEW, exist_ok=True)
    sc=bpy.context.scene
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, -0.25, TABLE_TOP-0.05)); bpy.context.object.scale=(0.68, 2.2, 0.1)
    sun=bpy.data.objects.new("sun", bpy.data.lights.new("sun","SUN")); sc.collection.objects.link(sun)
    sun.data.energy=3.0; sun.rotation_euler=(math.radians(35),0,math.radians(40))
    try: sc.render.engine="BLENDER_EEVEE"
    except TypeError: sc.render.engine="BLENDER_EEVEE_NEXT"
    sc.render.resolution_x,sc.render.resolution_y=844,390
    cam=bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam); sc.camera=cam
    cam.data.sensor_fit="VERTICAL"; cam.data.angle=math.radians(50)
    def B3(x,y,z): return Vector((x,-z,y))
    for nm,pos,look in (("side",(1.8,1.2,0.25),(0,0.9,0.25)),("over",(0.9,1.75,0.35),(0,0.95,0.2)),("head",(0,1.3,-1.4),(0,0.9,0.0))):
        P0=B3(*pos); cam.location=P0; cam.rotation_mode="QUATERNION"; cam.rotation_quaternion=(B3(*look)-P0).to_track_quat("-Z","Y")
        sc.render.filepath=os.path.join(PREVIEW, nm+".png"); bpy.ops.render.render(write_still=True)

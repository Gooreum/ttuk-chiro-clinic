"""Patient body GLB (the head is <patient>.glb): same MPFB (MakeHuman, CC0) phenotype as the head (patients.py),
   so the neck meets the head's neck vertex for vertex.
   - clothes: the preset's T-shirt + jeans (CC0), split into shirt and pants (connected pieces, by height); both keep only
     their own ambient-occlusion map (the game tints them with the gown / pants palette colours, no logo)
   - arms posed down along the sides (game_engine rig, applied), the rig is then dropped
   - everything the head GLB keeps (above mid-neck, mpfb_export_head.py) is removed: the two meshes share one seam
   - skin: remaining UV islands repacked into one map, Cycles bake of the original diffuse x ambient occlusion
   - a two-bone skin (body, neck): the neck bone carries the seam ring (weight 1) and fades out over NECK_FADE, so the
     game turns the upper neck with the head pivot and the seam never opens
   - shape key "breath": chest and belly rise (front only, back stays on the table), on skin and shirt alike
   usage: blender -b --python mpfb_export_body.py -- out.glb [bake_size=1024] [cycles_samples=16] [patient01]"""
import bpy, bmesh, importlib, sys, os, math
import numpy as np
from mathutils import Vector, Matrix, kdtree
P="bl_ext.user_default.mpfb"
HS=importlib.import_module(P+".services.humanservice").HumanService
TS=importlib.import_module(P+".services.targetservice").TargetService
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from patients import human_info
ARGS=sys.argv[sys.argv.index("--")+1:]
OUT=ARGS[0]; BAKE=int(ARGS[1]) if len(ARGS)>1 else 1024; SAMPLES=int(ARGS[2]) if len(ARGS)>2 else 16
PID=ARGS[3] if len(ARGS)>3 else "patient01"
AO_MIX=0.7
NECK_FADE=0.08       # metres from the seam over which the neck bone's weight falls to 0
BREATH=0.04          # chest/belly rise at full inhale (metres)

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
CUT=top-0.30
print("TOP", round(top,4), "CUT", round(CUT,4))
def head_keeps(p): return not (p.z < CUT or (p.z < top-0.225 and abs(p.x) > 0.072))
headv={v.index for v in body.data.vertices if v.index not in helper and head_keeps(mw@v.co)}
# hidden under the clothes (MPFB's delete-group mask modifiers)
hidden=set()
for m in body.modifiers:
    if m.type=="MASK" and m.vertex_group and m.vertex_group not in ("HelperGeometry","JointCubes"):
        g=group_verts(body,[m.vertex_group])
        hidden |= g if m.invert_vertex_group else {v.index for v in body.data.vertices}-g
print("HELPER", len(helper), "HEAD", len(headv), "HIDDEN", len(hidden))
# seam tree: head-side vertices, rest positions (the neck is not posed)
tree=kdtree.KDTree(len(headv))
for i in headv: tree.insert(mw@body.data.vertices[i].co, i)
tree.balance()
B=lambda n: arm.matrix_world@arm.data.bones[n].head_local
Z_PELVIS=B("pelvis").z; Z_CHEST=B("spine_03").z; Z_CLAV=B("clavicle_l").z
print("BONES pelvis %.3f spine_03 %.3f clavicle %.3f neck %.3f" % (Z_PELVIS, Z_CHEST, Z_CLAV, B("neck_01").z))

# ---- pose: arms down along the sides, then bake the pose into the meshes ----
bpy.context.view_layer.objects.active=arm
bpy.ops.object.mode_set(mode="POSE")
def aim(pb, target):
    """turn a pose bone (world space, about its head) so it points along target"""
    bpy.context.view_layer.update()
    M=arm.matrix_world@pb.matrix
    h=M.to_translation(); d=(arm.matrix_world@pb.tail - h).normalized()
    R=d.rotation_difference(target.normalized()).to_matrix().to_4x4()
    W=Matrix.Translation(h)@R@Matrix.Translation(-h)@M
    pb.matrix=arm.matrix_world.inverted()@W
for sd,s in (("l",1),("r",-1)):
    aim(arm.pose.bones["upperarm_"+sd], Vector((0.22*s, 0.05, -1)))
    aim(arm.pose.bones["lowerarm_"+sd], Vector((0.1*s, -0.12, -1)))
    aim(arm.pose.bones["hand_"+sd], Vector((0.02*s, -0.1, -1)))
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
dead=set(helper)|hidden
faces=[f for f in bm.faces if all(v.index in headv for v in f.verts) or any(v.index in dead for v in f.verts)]
bmesh.ops.delete(bm, geom=faces, context="FACES_ONLY")
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
bmesh.update_edit_mesh(body.data); bpy.ops.object.mode_set(mode="OBJECT")
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
    for g in list(o.vertex_groups): o.vertex_groups.remove(g)
    print("CLOTH", o.name, len(o.data.vertices), "verts", sum(len(p.vertices)-2 for p in o.data.polygons), "tris")
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
def bump(z):
    t=(z-(Z_PELVIS+0.04))/((Z_CLAV-0.03)-(Z_PELVIS+0.04))
    return math.sin(math.pi*max(0.0,min(1.0,t)))**0.7
def breath_key(o, yc):
    o.shape_key_add(name="Basis", from_mix=False)
    k=o.shape_key_add(name="breath", from_mix=False)
    for v,d in zip(o.data.vertices, k.data):
        p=v.co
        front=max(0.0, min(1.0, (yc - p.y)/0.09))           # 0 at the torso's mid-depth, 1 toward the front
        side=max(0.0, 1.0 - abs(p.x)/0.26)
        w=bump(p.z)*front*side
        d.co=p+Vector((0.45*BREATH*w*(1 if p.x>0 else -1), -BREATH*w, 0))     # rises and widens
    k.value=0.0
ys=[v.co.y for v in cloth.data.vertices if abs(v.co.z-Z_CHEST)<0.05 and abs(v.co.x)<0.12]
yc=(min(ys)+max(ys))/2 if ys else 0.0
print("TORSO yc %.3f" % yc)
for o in (body, cloth): breath_key(o, yc)

# ---- two-bone skin: body (static) and neck (turns with the head pivot in the game) ----
ab=bpy.data.armatures.new("patient_body"); ao_=bpy.data.objects.new("patient_body", ab); bpy.context.collection.objects.link(ao_)
bpy.context.view_layer.objects.active=ao_; bpy.ops.object.mode_set(mode="EDIT")
r=ab.edit_bones.new("body"); r.head=(0,0,Z_PELVIS); r.tail=(0,0,Z_PELVIS+0.1)
n=ab.edit_bones.new("neck"); n.head=(0,0,CUT-0.03); n.tail=(0,0,CUT+0.05); n.parent=r
bpy.ops.object.mode_set(mode="OBJECT")
for o in (body, cloth, pants):
    gb=o.vertex_groups.new(name="body"); gn=o.vertex_groups.new(name="neck")
    nn=0
    for v in o.data.vertices:
        _,_,dist=tree.find(o.matrix_world@v.co)
        w=max(0.0, 1.0 - dist/NECK_FADE); w=w*w*(3-2*w)
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

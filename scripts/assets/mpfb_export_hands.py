"""Therapist hands GLB from an MPFB (MakeHuman, CC0) character with the game_engine rig.
   - build a middle-aged male (skin middleage_asian_male), bake the phenotype into the basis
   - keep only each hand and the wrist half of the forearm (cut at CUT_T along the lower-arm bone, from the elbow)
   - one skinned mesh + its own small armature per side: lowerarm (root) -> hand -> thumb/index/middle/ring/pinky 01-03
   - skin: repack the kept UV islands into one map and bake (Cycles) the original diffuse x ambient occlusion
   - bones are named <bone>_<l|r>, meshes hand_mesh_<l|r> (no name clash: GLTFLoader would rename a duplicate);
     realAssets.js measures the hand frame on the rest skeleton and uses PALM_DEPTH / CUT_T printed below
   usage: blender -b --python mpfb_export_hands.py -- out.glb [bake_size=1024] [cycles_samples=32]"""
import bpy, bmesh, importlib, sys, os, math
import numpy as np
from mathutils import Vector
P="bl_ext.user_default.mpfb"
HS=importlib.import_module(P+".services.humanservice").HumanService
TS=importlib.import_module(P+".services.targetservice").TargetService
ARGS=sys.argv[sys.argv.index("--")+1:]
OUT=ARGS[0]; BAKE=int(ARGS[1]) if len(ARGS)>1 else 1024; SAMPLES=int(ARGS[2]) if len(ARGS)>2 else 32
CUT_T=0.42          # keep the lower-arm from 42 % of its length (elbow = 0) to the wrist
AO_MIX=0.75
FINGERS=["thumb","index","middle","ring","pinky"]

for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
info={
  "name":"therapist",
  "phenotype":{"gender":1.0,"age":0.62,"muscle":0.55,"weight":0.5,"proportions":0.5,"height":0.5,"cupsize":0.5,"firmness":0.5,
               "race":{"asian":1.0,"caucasian":0.0,"african":0.0}},
  "skin_mhmat":"middleage_asian_male/middleage_asian_male.mhmat","skin_material_type":"GAMEENGINE",
  "eyes":"","eyebrows":"","eyelashes":"","hair":"","teeth":"","tongue":"",
  "targets":[],"clothes":[],"rig":"game_engine","proxy":""
}
st=HS.get_default_deserialization_settings(); st["subdiv_levels"]=0
body=HS.deserialize_from_dict(info, st)
arm=[o for o in bpy.data.objects if o.type=="ARMATURE"][0]
print("BODY", body.name, len(body.data.vertices), "ARMATURE", arm.name, len(arm.data.bones))
TS.bake_targets(body)
for m in list(body.modifiers): body.modifiers.remove(m)
bpy.context.view_layer.update()
mw=body.matrix_world
# the rig was fitted to the default body before the bake? refit bone positions to the baked mesh is done by MPFB on load.

# ---- which vertices to keep ----
def gidx(name):
    g=body.vertex_groups.get(name); return g.index if g else None
helper=set()
for gname in ["HelperGeometry","JointCubes"]:
    gi=gidx(gname)
    if gi is not None:
        for v in body.data.vertices:
            if any(e.group==gi and e.weight>0 for e in v.groups): helper.add(v.index)
def side_bones(sd):
    return ["lowerarm_"+sd,"hand_"+sd]+[f"{f}_0{i}_{sd}" for f in FINGERS for i in (1,2,3)]
KEEP={sd:set(side_bones(sd)) for sd in "lr"}
bw=arm.matrix_world
def bone_line(name):
    b=arm.data.bones[name]; return bw@b.head_local, bw@b.tail_local
keepv={}
for sd in "lr":
    e,w=bone_line("lowerarm_"+sd)
    axis=(w-e); L=axis.length; axis.normalize()
    names={gidx(n):n for n in KEEP[sd] if gidx(n) is not None}
    up=gidx("upperarm_"+sd)
    ks=set()
    for v in body.data.vertices:
        if v.index in helper: continue
        tot=sum(g.weight for g in v.groups if g.group in names)
        if tot<0.5: continue
        if up is not None and any(g.group==up and g.weight>0.05 for g in v.groups): continue
        p=mw@v.co
        if (p-e).dot(axis)/L < CUT_T: continue
        ks.add(v.index)
    keepv[sd]=ks
    print("SIDE", sd, "verts", len(ks), "forearm length %.3f" % L)

# ---- split into one object per side ----
def make_side(sd):
    o=body.copy(); o.data=body.data.copy(); o.name="hand_mesh_"+sd; o.data.name="hand_mesh_"+sd
    bpy.context.collection.objects.link(o)
    bpy.context.view_layer.objects.active=o
    bpy.ops.object.select_all(action="DESELECT"); o.select_set(True)
    if o.data.shape_keys: o.shape_key_clear()
    bpy.ops.object.mode_set(mode="EDIT"); bm=bmesh.from_edit_mesh(o.data); bm.verts.ensure_lookup_table()
    kill=[bm.verts[i] for i in range(len(bm.verts)) if i not in keepv[sd]]
    bmesh.ops.delete(bm, geom=kill, context="VERTS"); bmesh.update_edit_mesh(o.data); bpy.ops.object.mode_set(mode="OBJECT")
    # loose bits (stray verts whose neighbours were cut away)
    bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT"); bpy.ops.mesh.delete_loose(); bpy.ops.object.mode_set(mode="OBJECT")
    keep={n for n in KEEP[sd]}
    for g in list(o.vertex_groups):
        if g.name not in keep: o.vertex_groups.remove(g)
    # renormalise the remaining bone weights
    for v in o.data.vertices:
        s=sum(g.weight for g in v.groups)
        if s>0:
            for g in v.groups: g.weight/=s
        else:
            o.vertex_groups["lowerarm_"+sd].add([v.index],1.0,"REPLACE")
    print("HAND", sd, len(o.data.vertices), "verts", sum(len(p.vertices)-2 for p in o.data.polygons), "tris")
    return o
hands={sd:make_side(sd) for sd in "lr"}
bpy.data.objects.remove(body, do_unlink=True)

# ---- skin: one repacked map for both hands, diffuse x AO baked with Cycles ----
for o in hands.values():
    me=o.data; uv=me.uv_layers[0]; uv.name="UVOrig"
    u=np.zeros(len(me.loops)*2); uv.data.foreach_get("uv", u)
    nu=me.uv_layers.new(name="UVMap"); nu.data.foreach_set("uv", u); me.uv_layers.active=nu
bpy.ops.object.select_all(action="DESELECT")
for o in hands.values(): o.select_set(True)
bpy.context.view_layer.objects.active=hands["l"]
bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT"); bpy.ops.uv.select_all(action="SELECT")
bpy.ops.uv.pack_islands(rotate=True, margin=0.006); bpy.ops.object.mode_set(mode="OBJECT")
skin=hands["l"].data.materials[0]
src=[n for n in skin.node_tree.nodes if n.type=="TEX_IMAGE" and n.name.lower().startswith("diffuse")][0].image
sc=bpy.context.scene; sc.render.engine="CYCLES"; sc.cycles.device="CPU"; sc.cycles.samples=SAMPLES
sc.render.bake.margin=8; sc.render.bake.use_selected_to_active=False
img=bpy.data.images.new("therapist_hands_skin", BAKE, BAKE, alpha=False)
m=bpy.data.materials.new("bk"); m.use_nodes=True; t=m.node_tree; t.nodes.clear()
uvn=t.nodes.new("ShaderNodeUVMap"); uvn.uv_map="UVOrig"
tx=t.nodes.new("ShaderNodeTexImage"); tx.image=src; t.links.new(uvn.outputs[0], tx.inputs[0])
ao=t.nodes.new("ShaderNodeAmbientOcclusion"); ao.samples=32; ao.inputs["Distance"].default_value=0.012
f=t.nodes.new("ShaderNodeMix"); f.data_type="FLOAT"; f.inputs["Factor"].default_value=AO_MIX
f.inputs["A"].default_value=1.0; t.links.new(ao.outputs["AO"], f.inputs["B"])
mul=t.nodes.new("ShaderNodeMix"); mul.data_type="RGBA"; mul.blend_type="MULTIPLY"; mul.inputs["Factor"].default_value=1.0
t.links.new(tx.outputs["Color"], mul.inputs["A"]); t.links.new(f.outputs["Result"], mul.inputs["B"])
em=t.nodes.new("ShaderNodeEmission"); t.links.new(mul.outputs["Result"], em.inputs["Color"])
out=t.nodes.new("ShaderNodeOutputMaterial"); t.links.new(em.outputs[0], out.inputs["Surface"])
tg=t.nodes.new("ShaderNodeTexImage"); tg.image=img; t.nodes.active=tg; tg.select=True
for o in hands.values():
    o.data.materials.clear(); o.data.materials.append(m)
bpy.ops.object.select_all(action="DESELECT")
for o in hands.values(): o.select_set(True)
bpy.context.view_layer.objects.active=hands["l"]
bpy.ops.object.bake(type="EMIT")
img.filepath_raw=os.path.join(os.path.dirname(os.path.abspath(OUT)), "therapist_hands_skin.png"); img.file_format="PNG"; img.save()
fm=bpy.data.materials.new("therapist_hands.skin"); fm.use_nodes=True
b=[n for n in fm.node_tree.nodes if n.type=="BSDF_PRINCIPLED"][0]
ti=fm.node_tree.nodes.new("ShaderNodeTexImage"); ti.image=img; fm.node_tree.links.new(ti.outputs["Color"], b.inputs["Base Color"])
b.inputs["Roughness"].default_value=0.55
for o in hands.values():
    o.data.materials.clear(); o.data.materials.append(fm)
    o.data.uv_layers.remove(o.data.uv_layers["UVOrig"])

# ---- one small armature per side ----
def side_armature(sd):
    a=arm.copy(); a.data=arm.data.copy(); a.name="therapist_hand_"+sd; a.data.name=a.name
    bpy.context.collection.objects.link(a)
    bpy.ops.object.select_all(action="DESELECT"); a.select_set(True); bpy.context.view_layer.objects.active=a
    bpy.ops.object.mode_set(mode="EDIT")
    eb=a.data.edit_bones
    for bn in list(eb):
        if bn.name not in KEEP[sd]: eb.remove(bn)
    eb["lowerarm_"+sd].parent=None
    bpy.ops.object.mode_set(mode="OBJECT")
    o=hands[sd]; o.parent=a; o.matrix_parent_inverse=a.matrix_world.inverted()
    mod=o.modifiers.new("Armature","ARMATURE"); mod.object=a
    # palm-side skin depth below the bone plane at the palm centre (realAssets.js PALM_DEPTH)
    W=a.matrix_world
    head=lambda n: W@a.data.bones[n].head_local
    wrist=head("hand_"+sd); knuckle=head("middle_01_"+sd)
    fingers=(knuckle-wrist).normalized()
    across=(head("pinky_01_"+sd)-head("index_01_"+sd)); across=(across-fingers*across.dot(fingers)).normalized()
    normal=fingers.cross(across).normalized()
    if (W@a.data.bones["thumb_03_"+sd].tail_local-wrist).dot(normal)<0: normal=-normal
    mid=wrist.lerp(knuckle,0.5)
    near=[o.matrix_world@v.co for v in o.data.vertices]
    near=[p for p in near if abs((p-mid).dot(fingers))<0.02 and abs((p-mid).dot(across))<0.02]
    print("PALM_DEPTH", sd, round(max((p-mid).dot(normal) for p in near),4) if near else None, "CUT_T", CUT_T)
    return a
arms={sd:side_armature(sd) for sd in "lr"}
bpy.data.objects.remove(arm, do_unlink=True)

bpy.ops.object.select_all(action="DESELECT")
for sd in "lr": arms[sd].select_set(True); hands[sd].select_set(True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True, export_skins=True, export_animations=False,
    export_morph=False, export_apply=False, export_yup=True, export_texcoords=True, export_normals=True,
    export_materials="EXPORT", export_image_format="AUTO", export_extras=False, export_def_bones=False)
print("WROTE", OUT, os.path.getsize(OUT))

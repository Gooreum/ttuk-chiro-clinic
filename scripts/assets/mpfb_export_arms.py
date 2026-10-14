"""Therapist arms GLB from an MPFB (MakeHuman, CC0) character with the game_engine rig.
   - a middle-aged male (skin middleage_asian_male) in the male_casualsuit06 T-shirt, phenotype baked into the basis
   - per side: the arm skin (weight >= 0.5 on the arm bones) from the shoulder cut (a plane at SHOULDER_T along the
     upper-arm bone) to the fingertips, and the shirt's sleeve over it = its sleeve pattern piece (UV island) cut by the
     same plane; the hem band (HEM from the plane fitted through the open edge) is its own material so the game can
     colour it separately
   - skin under the sleeve is dropped: MPFB's clothes delete group, plus anything deeper than SKIN_IN inside the
     sleeve opening (the loose sleeve does not cover it everywhere), so it never pokes through
   - one armature per side: upperarm (root) -> lowerarm -> hand -> thumb/index/middle/ring/pinky 01-03
   - skin: repack the kept UV islands into one map and bake (Cycles) the original diffuse x ambient occlusion (the sleeve
     shades the arm under it); the sleeve keeps the shirt's AO and normal maps
   - bones are named <bone>_<l|r>, meshes arm_skin_<l|r> / arm_sleeve_<l|r> (GLTFLoader renames clashing names);
     realAssets.js measures the arm on the rest skeleton and uses PALM_DEPTH printed below
   usage: blender -b --python mpfb_export_arms.py -- out.glb [bake_size=1024] [cycles_samples=16]"""
import bpy, bmesh, importlib, sys, os, math
import numpy as np
from mathutils import Vector
P="bl_ext.user_default.mpfb"
HS=importlib.import_module(P+".services.humanservice").HumanService
TS=importlib.import_module(P+".services.targetservice").TargetService
ARGS=sys.argv[sys.argv.index("--")+1:]
OUT=ARGS[0]; BAKE=int(ARGS[1]) if len(ARGS)>1 else 1024; SAMPLES=int(ARGS[2]) if len(ARGS)>2 else 16
SHOULDER_T=0.12     # keep the arm from 12 % along the upper-arm bone (shoulder joint = 0): the cut sits off screen
SLEEVE_R=0.10       # the sleeve = the shirt's UV islands (pattern pieces) lying within this radius of the upper-arm axis
SKIN_IN=0.035       # skin kept this far inside the sleeve opening (deeper skin would poke through the loose sleeve)
HEM=0.022           # metres from the sleeve's open edge that make the hem band
AO_MIX=0.75
FINGERS=["thumb","index","middle","ring","pinky"]

for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
info={
  "name":"therapist",
  "phenotype":{"gender":1.0,"age":0.62,"muscle":0.55,"weight":0.5,"proportions":0.5,"height":0.5,"cupsize":0.5,"firmness":0.5,
               "race":{"asian":1.0,"caucasian":0.0,"african":0.0}},
  "skin_mhmat":"middleage_asian_male/middleage_asian_male.mhmat","skin_material_type":"GAMEENGINE",
  "eyes":"","eyebrows":"","eyelashes":"","hair":"","teeth":"","tongue":"",
  "targets":[],"clothes":["male_casualsuit06/male_casualsuit06.mhclo"],"clothes_material_type":"GAMEENGINE",
  "rig":"game_engine","proxy":""
}
st=HS.get_default_deserialization_settings(); st["subdiv_levels"]=0; st["load_clothes"]=True
body=HS.deserialize_from_dict(info, st)
arm=[o for o in bpy.data.objects if o.type=="ARMATURE"][0]
cloth=[o for o in bpy.data.objects if o.type=="MESH" and o is not body][0]
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
for o in (body, cloth):
    for m in list(o.modifiers): o.modifiers.remove(m)

def side_bones(sd):
    return ["upperarm_"+sd,"lowerarm_"+sd,"hand_"+sd]+[f"{f}_0{i}_{sd}" for f in FINGERS for i in (1,2,3)]
KEEP={sd:set(side_bones(sd)) for sd in "lr"}
bw=arm.matrix_world
def bone_line(name):
    b=arm.data.bones[name]; return bw@b.head_local, bw@b.tail_local
for sd in "lr":
    for n in ("upperarm_","lowerarm_"):
        h,t=bone_line(n+sd); print("LEN", n+sd, round((t-h).length,4))

def cut_plane(sd):
    """the shoulder cut: perpendicular to the upper-arm bone at SHOULDER_T"""
    s,e=bone_line("upperarm_"+sd); return s.lerp(e,SHOULDER_T), (e-s).normalized()

def arm_verts(o, sd, skip):
    """skin: weight >= 0.5 on the side's bones (split() then cuts at SHOULDER_T)"""
    names={o.vertex_groups[n].index for n in KEEP[sd] if n in o.vertex_groups}
    return {v.index for v in o.data.vertices if v.index not in skip and sum(g.weight for g in v.groups if g.group in names)>=0.5}

def sleeve_verts(o, sd):
    """sleeve: the shirt's UV islands (its pattern pieces) whose faces all lie within SLEEVE_R of the upper-arm axis;
       vertex weights cut the shoulder cap raggedly, the pattern piece follows the real seam"""
    s,e=bone_line("upperarm_"+sd); ax=(e-s).normalized()
    bm=bmesh.new(); bm.from_mesh(o.data); uv=bm.loops.layers.uv.active; bm.faces.ensure_lookup_table()
    key=lambda f:{l.vert:tuple(l[uv].uv) for l in f.loops}
    isl=[-1]*len(bm.faces); n=0
    for f in bm.faces:
        if isl[f.index]>=0: continue
        isl[f.index]=n; st=[f]
        while st:
            x=st.pop(); kx=key(x)
            for ed in x.edges:
                for g in ed.link_faces:
                    if isl[g.index]<0 and all((Vector(kx[v])-Vector(key(g)[v])).length<1e-5 for v in ed.verts):
                        isl[g.index]=n; st.append(g)
        n+=1
    far=set()
    for f in bm.faces:
        p=o.matrix_world@f.calc_center_median()-s
        if (p-ax*p.dot(ax)).length>=SLEEVE_R: far.add(isl[f.index])
    ks={v.index for f in bm.faces if isl[f.index] not in far for v in f.verts}; bm.free()
    return ks

def split(src, keepv, name, sd, plane=None):
    o=src.copy(); o.data=src.data.copy(); o.name=name; o.data.name=name
    bpy.context.collection.objects.link(o)
    if o.data.shape_keys: o.shape_key_clear()
    bpy.context.view_layer.objects.active=o
    bpy.ops.object.mode_set(mode="EDIT"); bm=bmesh.from_edit_mesh(o.data); bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.verts[i] for i in range(len(bm.verts)) if i not in keepv], context="VERTS")
    co,no=plane or cut_plane(sd); inv=o.matrix_world.inverted()
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:]+bm.edges[:]+bm.faces[:], dist=1e-5, clear_inner=True,
        plane_co=inv@co, plane_no=(inv.to_3x3()@no).normalized())
    bmesh.update_edit_mesh(o.data)
    bpy.ops.mesh.select_all(action="SELECT"); bpy.ops.mesh.delete_loose(); bpy.ops.object.mode_set(mode="OBJECT")
    for g in list(o.vertex_groups):
        if g.name not in KEEP[sd]: o.vertex_groups.remove(g)
    for g in KEEP[sd]:
        if g not in o.vertex_groups: o.vertex_groups.new(name=g)
    for v in o.data.vertices:
        s=sum(g.weight for g in v.groups)
        if s>0:
            for g in v.groups: g.weight/=s
        else: o.vertex_groups["upperarm_"+sd].add([v.index],1.0,"REPLACE")
    print("MESH", name, len(o.data.vertices), "verts", sum(len(p.vertices)-2 for p in o.data.polygons), "tris")
    return o
sleeves={sd:split(cloth, sleeve_verts(cloth, sd), "arm_sleeve_"+sd, sd) for sd in "lr"}

# ---- sleeve: AO + normal of the shirt (colour from the game palette); the hem band is its own material ----
cmat=cloth.data.materials[0]
texs={n.image.name:n.image for n in cmat.node_tree.nodes if n.type=="TEX_IMAGE"}
dif=[i for k,i in texs.items() if "diffuse" in k.lower()][0]
nrm_img=[i for k,i in texs.items() if "normal" in k.lower()][0]
ao_img=bpy.data.images.load(bpy.path.abspath(dif.filepath).replace("_diffuse.png","_ao.png"))
def cloth_mat(name):
    fm=bpy.data.materials.new(name); fm.use_nodes=True
    b=[n for n in fm.node_tree.nodes if n.type=="BSDF_PRINCIPLED"][0]
    ti=fm.node_tree.nodes.new("ShaderNodeTexImage"); ti.image=ao_img; fm.node_tree.links.new(ti.outputs["Color"], b.inputs["Base Color"])
    tn=fm.node_tree.nodes.new("ShaderNodeTexImage"); tn.image=nrm_img; tn.image.colorspace_settings.name="Non-Color"
    nm=fm.node_tree.nodes.new("ShaderNodeNormalMap"); fm.node_tree.links.new(tn.outputs["Color"], nm.inputs["Color"])
    fm.node_tree.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    b.inputs["Roughness"].default_value=0.85
    return fm
sleeve_mat, hem_mat = cloth_mat("therapist.sleeve"), cloth_mat("therapist.hem")
RIM={}
for sd,o in sleeves.items():   # hem band = the sleeve within HEM of the plane fitted through its open edge
    o.data.materials.clear(); o.data.materials.append(sleeve_mat); o.data.materials.append(hem_mat)
    bm=bmesh.new(); bm.from_mesh(o.data); inv=o.matrix_world.inverted()
    s,e=bone_line("upperarm_"+sd); s,ax=inv@s,(inv.to_3x3()@(e-s)).normalized()
    end=max((v.co-s).dot(ax) for v in bm.verts)
    rim=np.array([v.co[:] for e in bm.edges if e.is_boundary for v in e.verts if (v.co-s).dot(ax)>end-0.05])
    c=rim.mean(0); n=Vector(np.linalg.svd(rim-c)[2][2]); c=Vector(c)
    if n.dot(ax)<0: n=-n
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:]+bm.edges[:]+bm.faces[:], dist=1e-5, plane_co=c-n*HEM, plane_no=n)
    for f in bm.faces: f.material_index=int((f.calc_center_median()-c).dot(n)>-HEM)
    nh=sum(f.material_index for f in bm.faces); bm.to_mesh(o.data); bm.free()
    RIM[sd]=(o.matrix_world@c, (o.matrix_world.to_3x3()@n).normalized())
    print("SLEEVE", sd, "end %.3f along the upper arm, open edge tilted %.0f deg" % (end, math.degrees(n.angle(ax))), "hem faces", nh)

# skin: hidden under the clothes (MPFB delete group) and cut SKIN_IN inside the sleeve's open edge (no poke-through)
skins={sd:split(body, arm_verts(body, sd, helper|hidden), "arm_skin_"+sd, sd, (RIM[sd][0]-RIM[sd][1]*SKIN_IN, RIM[sd][1])) for sd in "lr"}

# ---- skin: one repacked map for both arms, diffuse x AO baked with Cycles (sleeves in the scene shade the arm) ----
bpy.data.objects.remove(body, do_unlink=True); bpy.data.objects.remove(cloth, do_unlink=True)
for o in skins.values():
    me=o.data; uv=me.uv_layers[0]; uv.name="UVOrig"
    u=np.zeros(len(me.loops)*2); uv.data.foreach_get("uv", u)
    nu=me.uv_layers.new(name="UVMap"); nu.data.foreach_set("uv", u); me.uv_layers.active=nu
bpy.ops.object.select_all(action="DESELECT")
for o in skins.values(): o.select_set(True)
bpy.context.view_layer.objects.active=skins["l"]
bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT"); bpy.ops.uv.select_all(action="SELECT")
bpy.ops.uv.pack_islands(rotate=True, margin=0.004); bpy.ops.object.mode_set(mode="OBJECT")
skin=skins["l"].data.materials[0]
src=[n for n in skin.node_tree.nodes if n.type=="TEX_IMAGE" and n.name.lower().startswith("diffuse")][0].image
sc=bpy.context.scene; sc.render.engine="CYCLES"; sc.cycles.device="CPU"; sc.cycles.samples=SAMPLES
sc.render.bake.margin=8; sc.render.bake.use_selected_to_active=False
img=bpy.data.images.new("therapist_arms_skin", BAKE, BAKE, alpha=False)
m=bpy.data.materials.new("bk"); m.use_nodes=True; t=m.node_tree; t.nodes.clear()
uvn=t.nodes.new("ShaderNodeUVMap"); uvn.uv_map="UVOrig"
tx=t.nodes.new("ShaderNodeTexImage"); tx.image=src; t.links.new(uvn.outputs[0], tx.inputs[0])
ao=t.nodes.new("ShaderNodeAmbientOcclusion"); ao.samples=32; ao.inputs["Distance"].default_value=0.015
f=t.nodes.new("ShaderNodeMix"); f.data_type="FLOAT"; f.inputs["Factor"].default_value=AO_MIX
f.inputs["A"].default_value=1.0; t.links.new(ao.outputs["AO"], f.inputs["B"])
mul=t.nodes.new("ShaderNodeMix"); mul.data_type="RGBA"; mul.blend_type="MULTIPLY"; mul.inputs["Factor"].default_value=1.0
t.links.new(tx.outputs["Color"], mul.inputs["A"]); t.links.new(f.outputs["Result"], mul.inputs["B"])
em=t.nodes.new("ShaderNodeEmission"); t.links.new(mul.outputs["Result"], em.inputs["Color"])
out=t.nodes.new("ShaderNodeOutputMaterial"); t.links.new(em.outputs[0], out.inputs["Surface"])
tg=t.nodes.new("ShaderNodeTexImage"); tg.image=img; t.nodes.active=tg; tg.select=True
for o in skins.values():
    o.data.materials.clear(); o.data.materials.append(m)
bpy.ops.object.select_all(action="DESELECT")
for o in skins.values(): o.select_set(True)
bpy.context.view_layer.objects.active=skins["l"]
bpy.ops.object.bake(type="EMIT")
img.filepath_raw=os.path.join(os.path.dirname(os.path.abspath(OUT)), "therapist_arms_skin.png"); img.file_format="PNG"; img.save()
fm=bpy.data.materials.new("therapist.skin"); fm.use_nodes=True
b=[n for n in fm.node_tree.nodes if n.type=="BSDF_PRINCIPLED"][0]
ti=fm.node_tree.nodes.new("ShaderNodeTexImage"); ti.image=img; fm.node_tree.links.new(ti.outputs["Color"], b.inputs["Base Color"])
b.inputs["Roughness"].default_value=0.55
for o in skins.values():
    o.data.materials.clear(); o.data.materials.append(fm)
    o.data.uv_layers.remove(o.data.uv_layers["UVOrig"])

# ---- one small armature per side ----
def side_armature(sd):
    a=arm.copy(); a.data=arm.data.copy(); a.name="therapist_arm_"+sd; a.data.name=a.name
    bpy.context.collection.objects.link(a)
    bpy.ops.object.select_all(action="DESELECT"); a.select_set(True); bpy.context.view_layer.objects.active=a
    bpy.ops.object.mode_set(mode="EDIT")
    eb=a.data.edit_bones
    for bn in list(eb):
        if bn.name not in KEEP[sd]: eb.remove(bn)
    eb["upperarm_"+sd].parent=None
    bpy.ops.object.mode_set(mode="OBJECT")
    for o in (skins[sd], sleeves[sd]):
        o.parent=a; o.matrix_parent_inverse=a.matrix_world.inverted()
        mod=o.modifiers.new("Armature","ARMATURE"); mod.object=a
    W=a.matrix_world
    head=lambda n: W@a.data.bones[n].head_local
    wrist=head("hand_"+sd); knuckle=head("middle_01_"+sd)
    fingers=(knuckle-wrist).normalized()
    across=(head("pinky_01_"+sd)-head("index_01_"+sd)); across=(across-fingers*across.dot(fingers)).normalized()
    normal=fingers.cross(across).normalized()
    if (W@a.data.bones["thumb_03_"+sd].tail_local-wrist).dot(normal)<0: normal=-normal
    mid=wrist.lerp(knuckle,0.5)
    o=skins[sd]
    near=[o.matrix_world@v.co for v in o.data.vertices]
    near=[p for p in near if abs((p-mid).dot(fingers))<0.02 and abs((p-mid).dot(across))<0.02]
    print("PALM_DEPTH", sd, round(max((p-mid).dot(normal) for p in near),4) if near else None)
    return a
arms={sd:side_armature(sd) for sd in "lr"}
bpy.data.objects.remove(arm, do_unlink=True)

bpy.ops.object.select_all(action="DESELECT")
for sd in "lr":
    for o in (arms[sd], skins[sd], sleeves[sd]): o.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True, export_skins=True, export_animations=False,
    export_morph=False, export_apply=False, export_yup=True, export_texcoords=True, export_normals=True,
    export_materials="EXPORT", export_image_format="AUTO", export_extras=False, export_def_bones=False)
print("WROTE", OUT, os.path.getsize(OUT))

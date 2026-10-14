"""Build patient01 head GLB from the MPFB character in park.blend (mpfb_build_character.py, with teeth + tongue).
   - bake the phenotype into the basis, add 12 expression-unit shape keys (Asian set)
   - refit eyebrows/eyelashes/teeth/tongue per expression and store as their own shape keys
     (teeth/tongue keep only the units that actually move them; only the lower teeth row follows the jaw and the
      tongue rides on it; every proxy key is left at weight 0 so the GLB's default morph weights are 0)
   - drop helper geometry and everything below mid-neck
   - skin: repack the remaining head UV islands to fill a new map, then bake (Cycles) the original diffuse
     multiplied by ambient occlusion into it -> higher texel density + nostrils/sockets/lip line/ears/mouth depth
   - eyes: iris recoloured to dark brown, cornea shell split into its own mesh/material (".cornea")
   - hair: short02 normal map attached
   - export GLB (meters, +Y up) with morph targets
   usage: blender -b park.blend --python mpfb_export_head.py -- out.glb [bake_size=2048] [cycles_samples=48]
   (2048 / 48 takes ~6 min on an M-series CPU; the baked PNGs are written next to out.glb)"""
import bpy, bmesh, importlib, sys, os, math, mathutils, mathutils.kdtree
import numpy as np
P="bl_ext.user_default.mpfb"
TS=importlib.import_module(P+".services.targetservice").TargetService
CS=importlib.import_module(P+".services.clothesservice").ClothesService
LS=importlib.import_module(P+".services.locationservice").LocationService
ARGS=sys.argv[sys.argv.index("--")+1:]
OUT=ARGS[0]; BAKE=int(ARGS[1]) if len(ARGS)>1 else 2048
AO_MIX=0.7         # how much of the baked occlusion darkens the skin (0 = none)
UNITS=["eye-left-closure","eye-right-closure","eye-left-slit","eye-right-slit",
       "eyebrows-left-inner-up","eyebrows-right-inner-up","eyebrows-left-down","eyebrows-right-down",
       "mouth-corner-puller","mouth-open","mouth-compression","mouth-pursing"]
body=[o for o in bpy.data.objects if o.name.endswith(".body")][0]
NAMES=["eyebrow001","eyelashes01","high-poly","short02","teeth_base","tongue01"]
proxies={k:[o for o in bpy.data.objects if o.name.endswith(k)][0] for k in NAMES}
TS.bake_targets(body)
udir=os.path.join(LS.get_mpfb_data(),"targets","expression","units","asian")
for u in UNITS:
    TS.load_target(body, os.path.join(udir,u+".target.gz"), weight=0.0, name=u)
keys=body.data.shape_keys.key_blocks
print("KEYS", [k.name for k in keys])
def coords(o): return [v.co.copy() for v in o.data.vertices]
def set_all(val_for):
    for k in keys:
        if k.name!=keys[0].name: k.value=val_for.get(k.name,0.0)
# neutral fit + one fit per unit for the proxies that must follow the skin
follow=["eyebrow001","eyelashes01","teeth_base","tongue01"]
sparse={"teeth_base","tongue01"}      # only store units that move these
fits={f:{} for f in follow}
set_all({})
for f in follow:
    CS.fit_clothes_to_human(proxies[f], body, set_parent=False); fits[f]["_basis"]=coords(proxies[f])
for u in UNITS:
    set_all({u:1.0})
    for f in follow:
        CS.fit_clothes_to_human(proxies[f], body, set_parent=False); fits[f][u]=coords(proxies[f])
set_all({})
def upper_teeth(o, base):
    """The unit targets drag the whole teeth proxy down with the jaw. Only the lower row may follow:
       teeth are separate pieces (centroid above/below the bite), the shared gum piece splits per vertex."""
    me_=o.data; parent=list(range(len(me_.vertices)))
    def find(i):
        while parent[i]!=i: parent[i]=parent[parent[i]]; i=parent[i]
        return i
    for e in me_.edges: parent[find(e.vertices[0])]=find(e.vertices[1])
    comps={}
    for v in me_.vertices: comps.setdefault(find(v.index),[]).append(v.index)
    cz={r:sum(base[i].z for i in vs)/len(vs) for r,vs in comps.items()}
    small=sorted(cz[r] for r,vs in comps.items() if len(vs)<200)
    gaps=[(small[i+1]-small[i], (small[i+1]+small[i])/2) for i in range(len(small)-1)]
    split=max(gaps)[1]
    up=[False]*len(me_.vertices)
    for r,vs in comps.items():
        for i in vs: up[i] = (base[i].z > split) if len(vs)>=200 else (cz[r] > split)
    print("TEETH split z %.4f upper verts %d of %d" % (split, sum(up), len(up)))
    return up
for f in follow:
    o=proxies[f]; base=fits[f]["_basis"]
    for v,c in zip(o.data.vertices, base): v.co=c
    if f=="teeth_base":
        up=upper_teeth(o, base)
        for u in UNITS: fits[f][u]=[b if k else c for b,c,k in zip(base, fits[f][u], up)]
        lower=[i for i,k in enumerate(up) if not k]
    if f=="tongue01":
        # the tongue fit barely moves; let it ride on the lower jaw (displacement of the nearest lower tooth/gum vertex)
        tb=fits["teeth_base"]["_basis"]; kd=mathutils.kdtree.KDTree(len(lower))
        for j,i in enumerate(lower): kd.insert(tb[i], j)
        kd.balance()
        near=[lower[kd.find(c)[1]] for c in base]
        for u in UNITS:
            tu=fits["teeth_base"][u]
            fits[f][u]=[c+(tu[i]-tb[i]) for c,i in zip(base, near)]
    o.shape_key_add(name="Basis")
    for u in UNITS:
        move=max((a-b).length for a,b in zip(fits[f][u], base))
        if f in sparse and move < 2e-4: continue
        sk=o.shape_key_add(name=u, from_mix=False)
        for d,c in zip(sk.data, fits[f][u]): d.co=c
    for k in o.data.shape_keys.key_blocks[1:]: k.value=0.0     # new keys start at 1.0 -> exported as default weight 1
    print("SHAPEKEYS", f, [k.name for k in o.data.shape_keys.key_blocks])
for k in keys:
    if k.name.startswith("temporary_fitting_key"): body.shape_key_remove(k)
# remove modifiers (helper masks, delete groups) and helper geometry, cut below mid-neck
for o in [body]+list(proxies.values()):
    for m in list(o.modifiers): o.modifiers.remove(m)
    o.parent=None
bpy.context.view_layer.update()
mw=body.matrix_world
helper=set()
for gname in ["HelperGeometry","JointCubes"]:
    g=body.vertex_groups.get(gname)
    if g:
        gi=g.index
        for v in body.data.vertices:
            if any(e.group==gi and e.weight>0 for e in v.groups): helper.add(v.index)
bodyverts=[v for v in body.data.vertices if v.index not in helper]
top=max((mw@v.co).z for v in bodyverts)
CUT=top-0.30
print("TOP",round(top,4),"CUT",round(CUT,4))
bpy.context.view_layer.objects.active=body
bpy.ops.object.mode_set(mode="EDIT"); bm=bmesh.from_edit_mesh(body.data); bm.verts.ensure_lookup_table()
def gone(v):
    w=mw@v.co
    return w.z < CUT or (w.z < top-0.225 and abs(w.x) > 0.072)   # keep the neck, drop shoulders/trapezius
kill=[bm.verts[i] for i in range(len(bm.verts)) if i in helper or gone(bm.verts[i])]
bmesh.ops.delete(bm, geom=kill, context="VERTS"); bmesh.update_edit_mesh(body.data); bpy.ops.object.mode_set(mode="OBJECT")
print("HEAD VERTS", len(body.data.vertices), "TRIS", sum(len(p.vertices)-2 for p in body.data.polygons))
# lip line (front of the lips, mouth height) for the mouth-interior darkening below
gi=body.vertex_groups["lips"].index
lipv=[mw@v.co for v in body.data.vertices if any(e.group==gi and e.weight>0.5 for e in v.groups)]
LIP_Y=min(p.y for p in lipv); LIP_Z=sum(p.z for p in lipv)/len(lipv)
print("LIPS", len(lipv), round(LIP_Y,4), round(LIP_Z,4))
for g in list(body.vertex_groups): body.vertex_groups.remove(g)

def tex_node(mat):
    return [n for n in mat.node_tree.nodes if n.type=="TEX_IMAGE" and n.name.lower().startswith("diffuse")][0]
def bsdf(mat):
    return [n for n in mat.node_tree.nodes if n.type=="BSDF_PRINCIPLED"][0]

# ---- skin: repack UVs + bake diffuse x AO ----
me=body.data
old_uv=me.uv_layers[0]; old_uv.name="UVOrig"
u=np.zeros(len(me.loops)*2); old_uv.data.foreach_get("uv", u); u=u.reshape(-1,2)
print("UV BBOX orig", u.min(0).round(4), u.max(0).round(4))
new_uv=me.uv_layers.new(name="UVMap"); new_uv.data.foreach_set("uv", u.ravel())
me.uv_layers.active=new_uv
bpy.ops.object.select_all(action="DESELECT"); body.select_set(True); bpy.context.view_layer.objects.active=body
bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.uv.select_all(action="SELECT")
bpy.ops.uv.pack_islands(rotate=True, margin=0.004)
bpy.ops.object.mode_set(mode="OBJECT")
# texel density: ratio of uv area per mesh area, new vs old
def uv_area(layer):
    a=0.0
    for p in me.polygons:
        pts=[layer.data[li].uv for li in p.loop_indices]
        for i in range(1,len(pts)-1):
            a+=abs((pts[i]-pts[0]).cross(pts[i+1]-pts[0]))/2
    return a
ao_, an_ = uv_area(me.uv_layers["UVOrig"]), uv_area(me.uv_layers["UVMap"])
print("UV AREA orig %.4f new %.4f linear gain %.2f (at same texture size)" % (ao_, an_, math.sqrt(an_/ao_)))

# ---- bake helpers: emission = diffuse x soft AO (x depth darkening), Cycles, into a new image ----
sc=bpy.context.scene; sc.render.engine="CYCLES"; sc.cycles.device="CPU"; sc.cycles.samples=int(ARGS[2]) if len(ARGS)>2 else 48
sc.render.bake.margin=8; sc.render.bake.use_selected_to_active=False
def emit_mat(name, src_img, src_uv, tgt_img, ao_mix, scale, depth=None):
    """depth=(y0, y1, f0, f1): multiply by f0 at blender y0 (front) -> f1 at y1 (deeper inside), clamped"""
    m=bpy.data.materials.new(name); m.use_nodes=True; t=m.node_tree; t.nodes.clear()
    uvn=t.nodes.new("ShaderNodeUVMap"); uvn.uv_map=src_uv
    tx=t.nodes.new("ShaderNodeTexImage"); tx.image=src_img; t.links.new(uvn.outputs[0], tx.inputs[0])
    ao=t.nodes.new("ShaderNodeAmbientOcclusion"); ao.samples=32; ao.inputs["Distance"].default_value=0.035
    f=t.nodes.new("ShaderNodeMix"); f.data_type="FLOAT"; f.inputs["Factor"].default_value=ao_mix
    f.inputs["A"].default_value=1.0; t.links.new(ao.outputs["AO"], f.inputs["B"])
    k=t.nodes.new("ShaderNodeMath"); k.operation="MULTIPLY"; k.inputs[1].default_value=scale; t.links.new(f.outputs["Result"], k.inputs[0])
    last=k
    if depth:
        geo=t.nodes.new("ShaderNodeNewGeometry"); sep=t.nodes.new("ShaderNodeSeparateXYZ"); t.links.new(geo.outputs["Position"], sep.inputs[0])
        mr=t.nodes.new("ShaderNodeMapRange"); mr.clamp=True
        for i,v in zip(["From Min","From Max","To Min","To Max"], depth): mr.inputs[i].default_value=v
        t.links.new(sep.outputs["Y"], mr.inputs["Value"])
        k2=t.nodes.new("ShaderNodeMath"); k2.operation="MULTIPLY"; t.links.new(k.outputs[0], k2.inputs[0]); t.links.new(mr.outputs["Result"], k2.inputs[1])
        last=k2
    mul=t.nodes.new("ShaderNodeMix"); mul.data_type="RGBA"; mul.blend_type="MULTIPLY"; mul.inputs["Factor"].default_value=1.0
    t.links.new(tx.outputs["Color"], mul.inputs["A"]); t.links.new(last.outputs[0], mul.inputs["B"])
    em=t.nodes.new("ShaderNodeEmission"); t.links.new(mul.outputs["Result"], em.inputs["Color"])
    out=t.nodes.new("ShaderNodeOutputMaterial"); t.links.new(em.outputs[0], out.inputs["Surface"])
    tg=t.nodes.new("ShaderNodeTexImage"); tg.image=tgt_img; t.nodes.active=tg; tg.select=True
    return m
def bake(obj, mats_for_faces, size, name, hide=()):
    """mats_for_faces: list of temp materials; obj faces must already carry material_index into that list"""
    keep=[m for m in obj.data.materials]; keep_idx=[p.material_index for p in obj.data.polygons]
    obj.data.materials.clear()
    for m in mats_for_faces: obj.data.materials.append(m)
    for p,i in zip(obj.data.polygons, obj["_bake_idx"]): p.material_index=i
    for o in hide: o.hide_render=True
    bpy.ops.object.select_all(action="DESELECT"); obj.select_set(True); bpy.context.view_layer.objects.active=obj
    bpy.ops.object.bake(type="EMIT")
    for o in hide: o.hide_render=False
    obj.data.materials.clear()
    for m in keep: obj.data.materials.append(m)
    for p,i in zip(obj.data.polygons, keep_idx): p.material_index=i
    img=mats_for_faces[0].node_tree.nodes.active.image
    img.filepath_raw=os.path.join(os.path.dirname(OUT), name+".png"); img.file_format="PNG"; img.save()
    return img
# alpha cards (brows, lashes, hair) stay out of the occlusion: hair cards would paint a dark band over the forehead
cards=[proxies[k] for k in ["eyebrow001","eyelashes01","short02"]]

# skin: diffuse x AO into the repacked map; mouth interior (behind the lips, not facing forward) fades to dark
skin=me.materials[0]; src_img=tex_node(skin).image
mw=body.matrix_world
def inside(p):
    c=mw@p.center; n=(mw.to_3x3()@p.normal).normalized()
    return abs(c.x)<0.032 and LIP_Z-0.025 < c.z < LIP_Z+0.016 and c.y > LIP_Y+0.004 and n.y > -0.3
# UV islands of the original map (faces joined across edges whose two uv corners match); an island that is
# mostly inside the mouth is mouth cavity and gets the dark treatment as a whole
uvo=me.uv_layers["UVOrig"].data
parent=list(range(len(me.polygons)))
def find(i):
    while parent[i]!=i: parent[i]=parent[parent[i]]; i=parent[i]
    return i
edge_seen={}
for p in me.polygons:
    for li in p.loop_indices:
        lo=me.loops[li]; e=lo.edge_index
        nxt=me.loops[p.loop_indices[(list(p.loop_indices).index(li)+1)%p.loop_total]]
        key=(round(uvo[li].uv.x,5),round(uvo[li].uv.y,5),round(uvo[nxt.index].uv.x,5),round(uvo[nxt.index].uv.y,5))
        if e in edge_seen:
            q,k2=edge_seen[e]
            if (k2[2],k2[3],k2[0],k2[1])==key or k2==key: parent[find(p.index)]=find(q)
        else: edge_seen[e]=(p.index,key)
isl={}
for p in me.polygons: isl.setdefault(find(p.index),[]).append(p.index)
mouth=set()
for r,fs in isl.items():
    if sum(inside(me.polygons[f]) for f in fs) > 0.35*len(fs): mouth.update(fs)
print("UV ISLANDS", len(isl), "mouth islands faces", len(mouth))
idx=[1 if (p.index in mouth or inside(p)) else 0 for p in me.polygons]
body["_bake_idx"]=idx
print("MOUTH interior faces", sum(idx))
img=bpy.data.images.new("patient01_skin", BAKE, BAKE, alpha=False)
mA=emit_mat("bk_skin", src_img, "UVOrig", img, AO_MIX, 1.0)
mB=emit_mat("bk_mouth", src_img, "UVOrig", img, AO_MIX, 1.0, depth=(LIP_Y+0.004, LIP_Y+0.03, 0.75, 0.10))
bake(body, [mA,mB], BAKE, "patient01_skin", hide=cards)
nt=skin.node_tree; b=bsdf(skin)
for n in list(nt.nodes):
    if n.type=="TEX_IMAGE": nt.nodes.remove(n)
tg=nt.nodes.new("ShaderNodeTexImage"); tg.image=img; nt.links.new(tg.outputs["Color"], b.inputs["Base Color"])
me.uv_layers.remove(me.uv_layers["UVOrig"])

# teeth + tongue: same UVs, ivory instead of paper white, darker toward the throat
for key, scale, span, aom in [("teeth_base", 0.85, 0.045, 0.2), ("tongue01", 0.6, 0.04, 0.5)]:
    o=proxies[key]; m=o.data.materials[0]; tn=tex_node(m)
    ys=[(o.matrix_world@v.co).y for v in o.data.vertices]; y0=min(ys)
    o["_bake_idx"]=[0]*len(o.data.polygons)
    size=512 if key=="teeth_base" else 256
    ti=bpy.data.images.new("patient01_"+key, size, size, alpha=False)
    mt=emit_mat("bk_"+key, tn.image, o.data.uv_layers[0].name, ti, aom, scale, depth=(y0+0.004, y0+span, 1.0, 0.3))
    bake(o, [mt], size, "patient01_"+key, hide=cards)
    tn.image=ti

# ---- eyes: dark brown iris, cornea split ----
eye=proxies["high-poly"]; em=eye.data.materials[0]; et=tex_node(em)
brown=bpy.data.images.load(os.path.join(LS.get_user_data(),"eyes","materials","brown_eye.png"))
W,H=brown.size; px=np.array(brown.pixels[:]).reshape(H,W,4)
r,g,bb=px[...,0],px[...,1],px[...,2]
lum=0.3*r+0.59*g+0.11*bb
iris=(r>g*1.35)&(r-bb>0.12)&(px[...,3]>0.5)
# iris discs only (texture rows are bottom-up): keep the two eye centres, not the red veins
yy,xx=np.mgrid[0:H,0:W]/W
disc=np.zeros_like(iris)
for cx,cy in [(296/1024,1-726/1024),(724/1024,1-304/1024)]:
    disc|=((xx-cx)**2+(yy-cy)**2)<(118/1024)**2
iris&=disc
dark=np.stack([lum*0.62,lum*0.40,lum*0.26],-1)*1.05     # dark brown, keeps the fibre detail
px[...,:3]=np.where(iris[...,None],dark,px[...,:3])
brown.pixels[:]=px.ravel(); brown.name="patient01_eye"; brown.filepath_raw=os.path.join(os.path.dirname(OUT),"patient01_eye.png"); brown.file_format="PNG"; brown.save()
et.image=brown
print("IRIS px", int(iris.sum()))
# cornea = faces mapped into the transparent corner of the eye texture (u>0.87, v<0.13)
bpy.ops.object.select_all(action="DESELECT"); eye.select_set(True); bpy.context.view_layer.objects.active=eye
uvl=eye.data.uv_layers.active
sel=0
for p in eye.data.polygons:
    cu=sum(uvl.data[li].uv.x for li in p.loop_indices)/p.loop_total
    cv=sum(uvl.data[li].uv.y for li in p.loop_indices)/p.loop_total
    p.select = cu>0.87 and cv<0.13; sel+=p.select
print("CORNEA faces", sel, "of", len(eye.data.polygons))
bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.separate(type="SELECTED"); bpy.ops.object.mode_set(mode="OBJECT")
cornea=[o for o in bpy.context.selected_objects if o.name!=eye.name][0]
cornea.name=body.name.replace(".body",".cornea"); cornea.data.name=cornea.name
cm=bpy.data.materials.new(cornea.name); cm.use_nodes=True; cb=bsdf(cm)
cb.inputs["Base Color"].default_value=(0.02,0.02,0.02,1); cb.inputs["Roughness"].default_value=0.04; cb.inputs["Alpha"].default_value=0.15
cornea.data.materials.clear(); cornea.data.materials.append(cm)
print("EYE faces left", len(eye.data.polygons), "cornea", len(cornea.data.polygons))

# ---- hair normal map ----
hm=proxies["short02"].data.materials[0]; hnt=hm.node_tree
nimg=bpy.data.images.load(os.path.join(LS.get_mpfb_data() if os.path.exists(os.path.join(LS.get_mpfb_data(),"hair","short02")) else LS.get_user_data(),"hair","short02","short02_normal.png"))
nimg.colorspace_settings.name="Non-Color"
nn=hnt.nodes.new("ShaderNodeTexImage"); nn.image=nimg
nm=hnt.nodes.new("ShaderNodeNormalMap"); hnt.links.new(nn.outputs["Color"], nm.inputs["Color"])
hnt.links.new(nm.outputs["Normal"], bsdf(hm).inputs["Normal"])

exp=[body,cornea]+list(proxies.values())
for o in bpy.data.objects:
    o.select_set(o in exp)
    if o.type=="MESH": print("EXPORT", o.name, o.select_get(), len(o.data.vertices), [m.name for m in o.data.materials],
                             [k.name for k in o.data.shape_keys.key_blocks][1:] if o.data.shape_keys else [])
# measurements used by realAssets.js (GLB space: y up = blender z, z = -blender y)
used={i for p in body.data.polygons for i in p.vertices}      # loose verts are not exported
ws=[mw@body.data.vertices[i].co for i in used]
# "chin" as realAssets.js uses it (GLB.chin 1.358): lowest centre-line point in front of y -0.07, which lands on the
# jaw/neck line; the bony chin tip itself sits higher (front of y -0.1 gives ~1.401)
chin=min(p.z for p in ws if p.y < -0.07 and abs(p.x) < 0.02)
print("MEASURE (GLB space) crown y %.4f  chin y %.4f  back of skull z %.4f" % (max(p.z for p in ws), chin, -max(p.y for p in ws)))
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True, export_morph=True, export_morph_normal=True,
    export_apply=False, export_yup=True, export_texcoords=True, export_normals=True, export_materials="EXPORT", export_image_format="AUTO")
print("WROTE", OUT, os.path.getsize(OUT))

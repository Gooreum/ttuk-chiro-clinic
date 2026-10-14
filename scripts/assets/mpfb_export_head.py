"""Build patient01 head GLB from the MPFB character in park.blend.
   - bake the phenotype into the basis, add 12 expression-unit shape keys (Asian set)
   - refit eyebrows/eyelashes per expression and store as their own shape keys
   - drop helper geometry and everything below mid-neck, recolour eyes brown
   - export GLB (meters, +Y up) with morph targets"""
import bpy, bmesh, importlib, sys, os, mathutils
P="bl_ext.user_default.mpfb"
TS=importlib.import_module(P+".services.targetservice").TargetService
CS=importlib.import_module(P+".services.clothesservice").ClothesService
LS=importlib.import_module(P+".services.locationservice").LocationService
OUT=sys.argv[sys.argv.index("--")+1]
UNITS=["eye-left-closure","eye-right-closure","eye-left-slit","eye-right-slit",
       "eyebrows-left-inner-up","eyebrows-right-inner-up","eyebrows-left-down","eyebrows-right-down",
       "mouth-corner-puller","mouth-open","mouth-compression","mouth-pursing"]
body=[o for o in bpy.data.objects if o.name.endswith(".body")][0]
proxies={k:[o for o in bpy.data.objects if o.name.endswith(k)][0] for k in ["eyebrow001","eyelashes01","high-poly","short02"]}
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
# neutral fit + one fit per unit for the face proxies that must follow the skin
follow=["eyebrow001","eyelashes01"]
fits={f:{} for f in follow}
set_all({})
for f in follow:
    CS.fit_clothes_to_human(proxies[f], body, set_parent=False); fits[f]["_basis"]=coords(proxies[f])
for u in UNITS:
    set_all({u:1.0})
    for f in follow:
        CS.fit_clothes_to_human(proxies[f], body, set_parent=False); fits[f][u]=coords(proxies[f])
set_all({})
for f in follow:
    o=proxies[f]
    for v,c in zip(o.data.vertices, fits[f]["_basis"]): v.co=c
    o.shape_key_add(name="Basis")
    for u in UNITS:
        sk=o.shape_key_add(name=u, from_mix=False)
        for d,c in zip(sk.data, fits[f][u]): d.co=c
for k in keys:
    if k.name.startswith("temporary_fitting_key"): body.shape_key_remove(k)
# remove modifiers (helper masks, delete groups) and helper geometry, cut below mid-neck
for o in [body]+list(proxies.values()):
    for m in list(o.modifiers): o.modifiers.remove(m)
    o.parent=None
bpy.context.view_layer.update()
mw=body.matrix_world
top=max((mw@v.co).z for v in body.data.vertices if True)
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
for g in list(body.vertex_groups): body.vertex_groups.remove(g)
# brown eyes
brown=os.path.join(LS.get_user_data(),"eyes","materials","brown_eye.png")
for m in proxies["high-poly"].data.materials:
    if m and m.use_nodes:
        for n in m.node_tree.nodes:
            if n.type=="TEX_IMAGE": n.image=bpy.data.images.load(brown)
for o in bpy.data.objects:
    o.select_set(o in [body]+list(proxies.values()))
    print("EXPORT", o.name, o.type, o.select_get(), len(o.data.vertices) if o.type=="MESH" else "")
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True, export_morph=True, export_morph_normal=True,
    export_apply=False, export_yup=True, export_texcoords=True, export_normals=True, export_materials="EXPORT", export_image_format="AUTO")
print("WROTE", OUT, os.path.getsize(OUT))

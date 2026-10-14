import bpy, importlib, sys, math, mathutils
P="bl_ext.user_default.mpfb"
HS=importlib.import_module(P+".services.humanservice").HumanService
OUT=sys.argv[sys.argv.index("--")+1]
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
info = {
  "name": "park_daeri",
  "phenotype": {"gender":1.0,"age":0.554,"muscle":0.5,"weight":0.55,"proportions":0.5,"height":0.5,"cupsize":0.5,"firmness":0.5,
                "race":{"asian":1.0,"caucasian":0.0,"african":0.0}},
  "skin_mhmat": "young_asian_male/young_asian_male.mhmat",
  "skin_material_type": "GAMEENGINE",
  "eyes": "high-poly/high-poly.mhclo", "eyes_material_type": "MAKESKIN",
  "eyebrows": "eyebrow001/eyebrow001.mhclo",
  "eyelashes": "eyelashes01/eyelashes01.mhclo",
  "hair": "short02/short02.mhclo",
  "targets": [], "clothes": [], "rig": "", "proxy": ""
}
s = HS.get_default_deserialization_settings(); s["subdiv_levels"] = 0
base = HS.deserialize_from_dict(info, s)
print("BASE", base.name, len(base.data.vertices))
for o in bpy.data.objects: print("OBJ", o.name, o.type, len(o.data.vertices) if o.type=="MESH" else "")
bpy.ops.wm.save_as_mainfile(filepath=OUT)

"""Build one patient's MPFB character (head proxies: eyes, brows, lashes, hair, teeth, tongue) and save a .blend
   for mpfb_export_head.py. Presets live in patients.py.
   usage: blender -b --python mpfb_build_character.py -- out.blend [patient01]"""
import bpy, importlib, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from patients import human_info
P="bl_ext.user_default.mpfb"
HS=importlib.import_module(P+".services.humanservice").HumanService
ARGS=sys.argv[sys.argv.index("--")+1:]
OUT=ARGS[0]; PID=ARGS[1] if len(ARGS)>1 else "patient01"
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
info = human_info(PID)
s = HS.get_default_deserialization_settings(); s["subdiv_levels"] = 0
base = HS.deserialize_from_dict(info, s)
base["patient_id"] = PID
print("BASE", PID, base.name, len(base.data.vertices))
for o in bpy.data.objects: print("OBJ", o.name, o.type, len(o.data.vertices) if o.type=="MESH" else "")
bpy.ops.wm.save_as_mainfile(filepath=OUT)

"""MPFB character presets, one per patient (src/patient/roster.js order). Shared by mpfb_build_character.py,
   mpfb_export_head.py and mpfb_export_body.py so the head and body of a patient are the same person.
   age: MPFB age 0.5 = 25 years, 1.0 = 90 years (linear in between): 0.5 + (years - 25) / 130.
   gray: recolour hair and brows to grey (the hair textures are brown/black; the game tint can only darken).
   hair "" = bald (scalp skin).
   proportions / height / cupsize (optional, default 0.5): MPFB phenotype overrides (1.0 proportions = idealised).
   fit (optional, default 1.0): scale of the head/body exporters' absolute cut and pose constants (neck cut, hand rest)
   for a body whose head is not adult-sized; "auto" = the head height (crown to chin) relative to patient01's.
   tuck (optional, metres): mpfb_export_body.py pulls skin that pokes through the shirt this far back under it."""
PATIENTS = {
    # 박대리, 32, office worker
    "patient01": dict(name="park_daeri", gender=1.0, age=0.554, muscle=0.5, weight=0.55, skin="young_asian_male",
                      hair="short02", eyebrows="eyebrow001", eyelashes="eyelashes01", clothes="male_casualsuit06", gray=False),
    # 최교수, 54, professor, grey hair (the roster's glasses are primitive-only)
    "patient02": dict(name="choi_gyosu", gender=1.0, age=0.723, muscle=0.42, weight=0.5, skin="middleage_asian_male",
                      hair="short03", eyebrows="eyebrow002", eyelashes="eyelashes01", clothes="male_casualsuit06", gray=True),
    # 이라이더, 27, delivery rider, messy black hair
    "patient03": dict(name="lee_rider", gender=1.0, age=0.515, muscle=0.62, weight=0.47, skin="young_asian_male",
                      hair="short04", eyebrows="eyebrow003", eyelashes="eyelashes01", clothes="male_casualsuit06", gray=False),
    # 정작가, 31, webtoon artist, long bob
    "patient04": dict(name="jung_jakga", gender=0.0, age=0.546, muscle=0.4, weight=0.45, skin="young_asian_female",
                      hair="bob01", eyebrows="eyebrow009", eyelashes="eyelashes02", clothes="female_casualsuit01", gray=False, tuck=0.003),
    # 김사장, 63, company owner, bald. middle-aged skin map: the old one is orange-brown with a dark stubble shadow
    # over the scalp, which reads as a sunburnt bald head; the age morph already gives the wrinkles
    "patient05": dict(name="kim_sajang", gender=1.0, age=0.792, muscle=0.4, weight=0.62, skin="middleage_asian_male",
                      hair="", eyebrows="eyebrow001", eyelashes="eyelashes01", clothes="male_casualsuit06", gray=True),
    # 조멸치, 28, a very skinny guy
    "patient06": dict(name="jo_myeolchi", gender=1.0, age=0.523, muscle=0.3, weight=0.0, skin="young_asian_male",
                      hair="short01", eyebrows="eyebrow003", eyelashes="eyelashes01", clothes="male_casualsuit06", gray=False),
    # 한미모, 26, a pretty young woman (idealised proportions). female_elegantsuit01 has long sleeves: they cover the
    # wrists, so the hands-on-belly solver never clears them (NOT SOLVED); the T-shirt + jeans works. long01: from the
    # supine game camera the ponytail sank into the pillow (read as a boy); long hair frames the face on the pillow
    "patient07": dict(name="han_mimo", gender=0.0, age=0.508, muscle=0.45, weight=0.4, proportions=1.0, cupsize=0.7, skin="young_asian_female",
                      hair="long01", eyebrows="eyebrow009", eyelashes="eyelashes02", clothes="female_casualsuit01", gray=False, tuck=0.003),
    # 마동철, 38, huge muscular heavy wrestler, thick neck. short04: tight dark slicked crop (short03 is a pinkish-brown
    # bowl cut over one eye, short02 a light-brown mop)
    "patient08": dict(name="ma_dongcheol", gender=1.0, age=0.6, muscle=1.0, weight=1.0, skin="middleage_asian_male",
                      hair="short04", eyebrows="eyebrow002", eyelashes="eyelashes01", clothes="male_casualsuit06", gray=False, tuck=0.003),
    # 복순할매, 79, granny, short grey perm (short02 greyed; bob01/bob02 both hang a side bang over one eye).
    # middle-aged skin map (the old one reads orange, see patient05)
    "patient09": dict(name="boksun_halmae", gender=0.0, age=0.915, muscle=0.3, weight=0.6, skin="middleage_asian_female",
                      hair="short02", eyebrows="eyebrow009", eyelashes="eyelashes02", clothes="female_casualsuit02", gray=True, tuck=0.003),
    # 정꼬마, 11, a kid: the exporters' cut / hand constants scale with his head. male_casualsuit04 (T-shirt): the
    # long-sleeved casualsuit01/02 cover the wrists like the elegant suit
    "patient10": dict(name="jung_kkoma", gender=1.0, age=0.1875, muscle=0.5, weight=0.5, skin="young_asian_male",
                      hair="short01", eyebrows="eyebrow001", eyelashes="eyelashes01", clothes="male_casualsuit04", gray=False, fit="auto"),
}

CHIN_TIP=783       # MakeHuman base-mesh vertex at the bony chin tip (same topology for every preset)
REF_HEAD=0.2266    # patient01: crown z - chin tip z (metres)
def fit_scale(pid, top, chin_tip_z):
    """factor for the exporters' absolute lengths (neck cut, trapezius cut, hand rest, breath falloffs): 1.0 unless the
       preset asks for it, so patient01..05 export exactly as before"""
    f=PATIENTS[pid].get("fit", 1.0)
    return (top-chin_tip_z)/REF_HEAD if f=="auto" else float(f)

def human_info(pid, rig="", clothes=False, face=True):
    p = PATIENTS[pid]
    info = {
        "name": p["name"],
        "phenotype": {"gender": p["gender"], "age": p["age"], "muscle": p["muscle"], "weight": p["weight"], "proportions": p.get("proportions", 0.5),
                      "height": p.get("height", 0.5), "cupsize": p.get("cupsize", 0.5), "firmness": 0.5, "race": {"asian": 1.0, "caucasian": 0.0, "african": 0.0}},
        "skin_mhmat": f"{p['skin']}/{p['skin']}.mhmat", "skin_material_type": "GAMEENGINE",
        "eyes": "", "eyebrows": "", "eyelashes": "", "hair": "", "teeth": "", "tongue": "",
        "targets": [], "clothes": [], "rig": rig, "proxy": ""
    }
    if face:
        info.update({"eyes": "high-poly/high-poly.mhclo", "eyes_material_type": "MAKESKIN",
                     "eyebrows": f"{p['eyebrows']}/{p['eyebrows']}.mhclo", "eyelashes": f"{p['eyelashes']}/{p['eyelashes']}.mhclo",
                     "teeth": "teeth_base/teeth_base.mhclo", "tongue": "tongue01/tongue01.mhclo"})
        if p["hair"]: info["hair"] = f"{p['hair']}/{p['hair']}.mhclo"
    if clothes:
        info["clothes"] = [f"{p['clothes']}/{p['clothes']}.mhclo"]; info["clothes_material_type"] = "GAMEENGINE"
    return info

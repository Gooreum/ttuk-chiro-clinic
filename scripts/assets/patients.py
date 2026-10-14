"""MPFB character presets, one per patient (src/patient/roster.js order). Shared by mpfb_build_character.py,
   mpfb_export_head.py and mpfb_export_body.py so the head and body of a patient are the same person.
   age: MPFB age 0.5 = 25 years, 1.0 = 90 years (linear in between): 0.5 + (years - 25) / 130.
   gray: recolour hair and brows to grey (the hair textures are brown/black; the game tint can only darken).
   hair "" = bald (scalp skin)."""
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
                      hair="bob01", eyebrows="eyebrow009", eyelashes="eyelashes02", clothes="female_casualsuit01", gray=False),
    # 김사장, 63, company owner, bald. middle-aged skin map: the old one is orange-brown with a dark stubble shadow
    # over the scalp, which reads as a sunburnt bald head; the age morph already gives the wrinkles
    "patient05": dict(name="kim_sajang", gender=1.0, age=0.792, muscle=0.4, weight=0.62, skin="middleage_asian_male",
                      hair="", eyebrows="eyebrow001", eyelashes="eyelashes01", clothes="male_casualsuit06", gray=True),
}

def human_info(pid, rig="", clothes=False, face=True):
    p = PATIENTS[pid]
    info = {
        "name": p["name"],
        "phenotype": {"gender": p["gender"], "age": p["age"], "muscle": p["muscle"], "weight": p["weight"], "proportions": 0.5,
                      "height": 0.5, "cupsize": 0.5, "firmness": 0.5, "race": {"asian": 1.0, "caucasian": 0.0, "african": 0.0}},
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

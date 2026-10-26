"""Neck-rig lab: patient08's two-bone neck (base) vs the multi-joint one (chain), same game screen, cameras and poses.

    npm run build:cases && npx vite preview --mode cases --outDir dist-cases --port 5291 --strictPort --host 127.0.0.1
    .venv/bin/python -I scripts/necklab/shoot.py [--url http://127.0.0.1:5291] [--out shots/necklab]

Rigs: base (public/models/patient08/body.glb), chain (lab-assets/patient08/body_chain.glb: neck_1, neck_2, neck + trunk
follow), chain0 (chain without the trunk following), hat (chain with piecewise-linear weights, the crease check).
Cameras: game (the 목꺾기 view as it is), towel (the 목뽑기 third-person TV_POS / TV_LOOK), side (diagnostic close-up of the
neck from the patient's left, HUD hidden). Writes <out>/<rig>/<pose>_<cam>.png, <out>/cmp/<pose>_<cam>.png
[base | chain | diff], <out>/grid_<cam>.png, the motion strips, metrics.json and metrics.md.
"""
import argparse, json, pathlib

from PIL import Image, ImageChops, ImageDraw, ImageFont
from playwright.sync_api import sync_playwright

THRESH = 24


def diff_stats(a, b):
    """scripts/compare.py's diff measure (that script runs its main() when imported): share of pixels whose largest
    channel difference is above 24, and the heat map"""
    d = ImageChops.difference(a.convert("RGB"), b.convert("RGB"))
    r, g, bl = d.split()
    peak = ImageChops.lighter(ImageChops.lighter(r, g), bl)
    over = sum(peak.histogram()[THRESH + 1:])
    return 100.0 * over / (a.width * a.height), d.point(lambda v: 255 if v > THRESH else v * 4)

RIGS = {"base": "necklab=base", "chain": "necklab=chain", "chain0": "necklab=chain&follow=0", "hat": "necklab=chain&weights=hat",
        # the game's own picture (towel-stage copy; 목뽑기 with towelNeck.js's finer neck): what a player sees today
        "stage": "necklab=stage", "stageTowel": "necklab=stage&mode=towel"}
POSES = [  # (name, pose): rotation alone, stretch alone, bend alone, then combined
    ("rest", {}), ("rot60", {"rot": 60}), ("rot75", {"rot": 75}), ("rotm75", {"rot": -75}),
    ("str16", {"stretch": 0.16}), ("comp03", {"stretch": -0.03}), ("bend32", {"bend": 32}),
    ("str16_rot75", {"stretch": 0.16, "rot": 75}), ("str16_bend32", {"stretch": 0.16, "bend": 32}),
    ("twist20", {"twist": 20}),
]
CAMS = {
    "game": None,
    "towel": {"pos": [-0.34, 1.62, 0.74], "look": [0, 1.06, -0.1]},     # game/loop.js TV_POS / TV_LOOK
    "side": {"pos": [0.22, 1.38, 0.55], "look": [0, 1.0, 0.18]},        # diagnostic: neck and collar from over the left chest
}
HIDE_HUD = "#hud,#chartMini,#speech,.bottom,#coach,.hud-top,#zeroBtn{visibility:hidden!important}"


def cam_js(c):
    return "null" if c is None else "{pos:{x:%f,y:%f,z:%f,isVector3:true},look:{x:%f,y:%f,z:%f}}" % (*c["pos"], *c["look"])


def open_rig(browser, url, q):
    ctx = browser.new_context(viewport={"width": 1280, "height": 800}, locale="ko-KR")
    pg = ctx.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(f"{url}/index.html?{q}")
    pg.wait_for_function("window.__neckLab && (window.__neckLab.ready || window.__neckLab.error)", timeout=300000)
    err = pg.evaluate("window.__neckLab.error")
    if err:
        raise SystemExit(f"{q}: {err}")
    return ctx, pg, errs


def shot(pg, pose, cam, path, hide):
    pg.evaluate("h => { let s = document.getElementById('labHide'); if(!s){ s = document.createElement('style'); s.id = 'labHide';"
                " document.head.appendChild(s); } s.textContent = h; }", HIDE_HUD if hide else "")
    m = pg.evaluate("([p, c, h]) => window.__neckLab.pose({...p, cam: c, hideArms: h})", [pose, cam, hide])
    pg.wait_for_timeout(250)
    pg.screenshot(path=str(path))
    return m


def label(im, text):
    d = ImageDraw.Draw(im)
    try:
        f = ImageFont.truetype("/System/Library/Fonts/AppleSDGothicNeo.ttc", 26)
    except OSError:
        f = ImageFont.load_default()
    d.rectangle([0, 0, 18 + 15 * len(text), 40], fill=(0, 0, 0))
    d.text((9, 5), text, fill=(255, 255, 255), font=f)
    return im


def side_by_side(a, b, out, la, lb):
    A, B = Image.open(a).convert("RGB"), Image.open(b).convert("RGB")
    pct, heat = diff_stats(A, B)
    w, h = A.size
    im = Image.new("RGB", (w * 3, h))
    im.paste(label(A.copy(), la), (0, 0)); im.paste(label(B.copy(), lb), (w, 0)); im.paste(label(heat.convert("RGB"), f"diff {pct:.1f}%"), (2 * w, 0))
    im.save(out)
    return pct


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://127.0.0.1:5291")
    ap.add_argument("--out", default="shots/necklab")
    ap.add_argument("--rigs", default="base,chain,chain0,hat,stage,stageTowel")
    ap.add_argument("--assemble", action="store_true", help="only rebuild the comparisons and metrics.md from <out>/<rig>/data.json")
    args = ap.parse_args()
    if args.assemble:
        return assemble(pathlib.Path(args.out))
    out = pathlib.Path(args.out)
    rigs = args.rigs.split(",")
    metrics, motion, strips = {}, {}, {}
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        for rig in rigs:
            ctx, pg, errs = open_rig(browser, args.url, RIGS[rig])
            (out / rig).mkdir(parents=True, exist_ok=True)
            metrics[rig] = {}
            if rig == "chain":
                metrics["sameMesh"] = pg.evaluate("window.__neckLab.sameMesh()")
            for name, pose in POSES:
                for cam, c in CAMS.items():
                    m = shot(pg, pose, c, out / rig / f"{name}_{cam}.png", cam != "game")
                metrics[rig][name] = m
                print(rig, name, "seam p95 %.2fmm" % m["seam"]["p95"], "minArea %.3f" % m["minArea"], "flip", m["flipped"], flush=True)
            if rig in ("base", "chain"):
                # the game's own motions, recorded frame by frame; ten instants are then re-held and measured exactly
                motion[rig], strips[rig] = {}, {}
                for k in ("turn", "stretch", "crack"):
                    rec = pg.evaluate("k => window.__neckLab.curve(k)", k)
                    # ten instants evenly over the motion, plus its peak (the biggest turn off the start, or the longest pull)
                    idx = {int(i * (len(rec) - 1) / 9) for i in range(10)}
                    idx.add(max(range(len(rec)), key=lambda i: abs(rec[i]["rot"] - rec[0]["rot"]) + 400 * rec[i]["pull"]))
                    picks = [dict(rec[i], f=i) for i in sorted(idx)]
                    rows, files = [], []
                    for i, fr in enumerate(picks):
                        pose = {"rot": fr["rot"], "bend": fr["bend"], "stretch": fr["pull"], "followRot": fr["followRot"], "followBend": fr["followBend"]}
                        f = out / rig / f"motion_{k}_{i}.png"
                        m = shot(pg, pose, CAMS["side"], f, True)
                        rows.append({"f": fr["f"], "t": fr["t"], "rot": fr["rot"], "pull": fr["pull"], "seamP95": m["seam"]["p95"], "minArea": m["minArea"],
                                     "minRadius": m["minRadius"], "flipped": m["flipped"], "shoulder": m["shoulder"]["left"]})
                        files.append(str(f))
                    motion[rig][k] = {"frames": len(rec), "samples": rows, "trace": [[r["t"], round(r["rot"], 2), round(r["bend"], 2), round(r["pull"], 4)] for r in rec]}
                    strips[rig][k] = {"t": [r["t"] for r in rows], "files": files}
            (out / rig / "data.json").write_text(json.dumps({"metrics": metrics[rig], "motion": motion.get(rig), "strips": strips.get(rig),
                                                             "sameMesh": metrics.get("sameMesh") if rig == "chain" else None}, ensure_ascii=False))
            if errs:
                print(rig, "page errors:", errs[:3])
            ctx.close()
        browser.close()
    assemble(out)


def assemble(out):
    """comparison images, grids, strips and metrics.md from every <out>/<rig>/data.json there is"""
    metrics, motion, strips = {}, {}, {}
    for d in sorted(out.iterdir()):
        f = d / "data.json"
        if f.is_file():
            j = json.loads(f.read_text())
            metrics[d.name] = j["metrics"]
            if j.get("motion"):
                motion[d.name], strips[d.name] = j["motion"], j["strips"]
            if j.get("sameMesh"):
                metrics["sameMesh"] = j["sameMesh"]
    rigs = [r for r in RIGS if r in metrics]
    # comparisons [base | chain | diff] and grids
    (out / "cmp").mkdir(parents=True, exist_ok=True)
    diffs = {}
    for name, _ in POSES:
        for cam in CAMS:
            if "base" in rigs and "chain" in rigs:
                diffs[f"{name}_{cam}"] = side_by_side(out / "base" / f"{name}_{cam}.png", out / "chain" / f"{name}_{cam}.png",
                                                      out / "cmp" / f"{name}_{cam}.png", f"기존 2본 · {name}", f"다중 관절 · {name}")
    # the game's own picture today (목꺾기 towel-stage body / 목뽑기 finer neck) next to the chain
    for ref in ("stage", "stageTowel"):
        if ref in rigs and "chain" in rigs:
            (out / f"cmp_{ref}").mkdir(parents=True, exist_ok=True)
            for name, _ in POSES:
                for cam in CAMS:
                    diffs[f"{ref}:{name}_{cam}"] = side_by_side(out / ref / f"{name}_{cam}.png", out / "chain" / f"{name}_{cam}.png",
                                                                out / f"cmp_{ref}" / f"{name}_{cam}.png", f"게임 현재({ref}) · {name}", f"다중 관절 · {name}")
    for cam in CAMS:
        rows = [Image.open(out / "cmp" / f"{n}_{cam}.png") for n, _ in POSES if (out / "cmp" / f"{n}_{cam}.png").exists()]
        if rows:
            w, h = rows[0].size
            g = Image.new("RGB", (w // 2, h // 2 * len(rows)))
            for i, r in enumerate(rows):
                g.paste(r.resize((w // 2, h // 2)), (0, i * h // 2))
            g.save(out / f"grid_{cam}.png")
    for k in ("turn", "stretch", "crack"):
        if all(r in strips for r in ("base", "chain")):
            ims = [[Image.open(f).resize((426, 266)) for f in strips[r][k]["files"]] for r in ("base", "chain")]
            g = Image.new("RGB", (426 * max(len(r) for r in ims), 266 * 2))
            for j, row in enumerate(ims):
                for i, im in enumerate(row):
                    g.paste(label(im, f"{'기존' if j == 0 else '체인'} {strips['chain' if j else 'base'][k]['t'][i]:.2f}s"), (426 * i, 266 * j))
            g.save(out / f"motion_{k}.png")
    (out / "metrics.json").write_text(json.dumps({"metrics": metrics, "motion": motion, "diffs": diffs}, ensure_ascii=False, indent=1))
    write_md(out, metrics, motion, rigs)


def write_md(out, metrics, motion, rigs):
    L = ["# 목 리그 비교 수치 (patient08)", "",
         "접합부: 이음매 링 쌍의 휴지 대비 벌어짐(mm). 단면적·반지름: 6구간 중 최솟값, 리그 효과만(pinch 제외) / 화면(pinch 포함).",
         "비틀림 2차차분: 구간별 비틀림 각의 꺾임(도, 작을수록 매끈). 손-배: 배 위 손과 그 아래 배 사이 간격 변화(mm).", ""]
    hdr = "| 포즈 | 리그 | 접합 평균/p95/최대 | 최소 반지름비 | 최소 단면적비 (리그/화면) | 구간 길이비 | 비틀림 꺾임 | 변 길이비 최소~최대 | 뒤집힌 면 | 어깨 L/R cm | 깃-피부 차 cm(평균/최대) | 관통 | 손-배 mm |"
    L += [hdr, "|" + "---|" * 13]
    for name, _ in POSES:
        for rig in rigs:
            m = metrics.get(rig, {}).get(name)
            if not m:
                continue
            s = m["seam"]
            lens = [b["length"] for b in m["bands"] if b["length"]]
            L.append(f"| {name} | {rig} | {s['mean']:.2f}/{s['p95']:.2f}/{s['max']:.2f} | {m['minRadius']:.3f} | {m['minArea']:.3f} / {m['minAreaDrawn']:.3f}"
                     f" | {min(lens):.2f}~{max(lens):.2f} | {m['twistD2']:.1f} | {m['edge']['min']:.2f}~{m['edge']['max']:.2f} | {m['flipped']}/{m['tris']}"
                     f" | {m['shoulder']['left']:.2f}/{m['shoulder']['right']:.2f} | {m['collarApartCm']['mean']:.2f}/{m['collarApartCm']['max']:.2f}"
                     f" | {m['poke']}/{m['contacts']} | {m['handBellyMm']:.1f} |")
    L += ["", "## 구간별 (rot75, str16_rot75)", ""]
    for name in ("rot75", "str16_rot75", "bend32"):
        for rig in rigs:
            m = metrics.get(rig, {}).get(name)
            if m:
                L.append(f"- {name} {rig}: 반지름 " + " ".join(f"{b['radius']:.2f}" for b in m["bands"]) + " · 단면적 " + " ".join(f"{b['area']:.2f}" for b in m["bands"])
                         + " · 비틀림° " + " ".join(f"{b['twist']:.0f}" for b in m["bands"]))
    L += ["", "## 움직임 (게임의 곡선 함수를 60fps로 진행, 10개 시점 + 정점을 세워 측정)", ""]
    for rig, ks in motion.items():
        for k, mo in ks.items():
            sm = mo["samples"]; end = sm[-1]
            L.append(f"- {rig} {k}: {mo['frames']}스텝 · 접합 p95 최대 {max(x['seamP95'] for x in sm):.2f}mm · 최소 단면적비 {min(x['minArea'] for x in sm):.3f}"
                     f" · 뒤집힌 면 최대 {max(x['flipped'] for x in sm)} · 끝: 회전 {end['rot']:.2f}° 당김 {1000*end['pull']:.1f}mm 단면적비 {end['minArea']:.3f} 어깨 {end['shoulder']:.2f}cm")
            L.append("  - 시점별 (시각: 회전°/당김mm → 최소 단면적비): " + ", ".join(f"{x['t']:.2f}s: {x['rot']:.0f}/{1000*x['pull']:.0f} → {x['minArea']:.2f}" for x in sm))
    if "sameMesh" in metrics:
        L += ["", "## 메시 동일성 (body.glb vs body_chain.glb)", "", "```", json.dumps(metrics["sameMesh"], ensure_ascii=False), "```"]
    if metrics.get("chain", {}).get("rest"):
        L += ["", f"바인드 항등성 오차(chain, W0·boneInverse 최대 차): {metrics['chain']['rest']['bindErr']}"]
    (out / "metrics.md").write_text("\n".join(L) + "\n")


if __name__ == "__main__":
    main()

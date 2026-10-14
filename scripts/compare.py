"""Side-by-side regression check between two shot folders.

    python -I scripts/compare.py shots/legacy shots/new [--out shots/compare] [--max 0.5]

For each of 1-title / 2-play / 3-crack / 4-switch prints the share of pixels whose largest channel difference is
above 24 (out of 255), and writes <out>/<name>.png as [A | B | diff heatmap]. With --max, exits 1 when
any scene differs by more than that many percent.
"""
import argparse, pathlib, sys

from PIL import Image, ImageChops

NAMES = ["1-title", "2-play", "3-crack", "4-switch"]
THRESH = 24


def diff_stats(a, b):
    d = ImageChops.difference(a.convert("RGB"), b.convert("RGB"))
    r, g, bl = d.split()
    peak = ImageChops.lighter(ImageChops.lighter(r, g), bl)
    over = sum(peak.histogram()[THRESH + 1:])
    heat = d.point(lambda v: 255 if v > THRESH else v * 4)
    return 100.0 * over / (a.width * a.height), heat


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("a")
    ap.add_argument("b")
    ap.add_argument("--out", default="shots/compare")
    ap.add_argument("--max", type=float, help="fail if any scene differs by more than this percent")
    args = ap.parse_args()
    a_dir, b_dir, out = pathlib.Path(args.a), pathlib.Path(args.b), pathlib.Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    worst = 0.0
    for n in NAMES:
        a, b = Image.open(a_dir / f"{n}.png"), Image.open(b_dir / f"{n}.png")
        if a.size != b.size:
            sys.exit(f"{n}: size differs {a.size} vs {b.size}")
        pct, heat = diff_stats(a, b)
        worst = max(worst, pct)
        sheet = Image.new("RGB", (a.width * 3 + 16, a.height), (15, 35, 31))
        sheet.paste(a.convert("RGB"), (0, 0))
        sheet.paste(b.convert("RGB"), (a.width + 8, 0))
        sheet.paste(heat, (a.width * 2 + 16, 0))
        sheet.save(out / f"{n}.png")
        print(f"{n}: {pct:.3f}% pixels differ")
    print(f"worst: {worst:.3f}%  sheets: {out}")
    if args.max is not None and worst > args.max:
        sys.exit(1)


main()

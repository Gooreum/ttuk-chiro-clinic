"""Headless check for 뚝 카이로 클리닉.

Takes three landscape-phone screenshots into ./shots/<label>:
  1-title.png  intro screen
  2-play.png   first patient, after a short drag
  3-crack.png  the success moment (x-ray, zoom, speech bubble)
  4-switch.png  2.6 s later: the same patient's opposite side (banner, mirrored target)

Two targets:
  python -I scripts/shot.py dist-shot                 Vite build made with `npm run build:shot`
                                                     (served over a local http server; hit test forced by define)
  python -I scripts/shot.py --legacy legacy/index.html
                                                     single-file prototype; a temp copy with the hit test forced
                                                     is opened from file://, the original is never modified

Math.random is seeded and the page clock is driven by Playwright, so two runs of the same build give the
same frames (CSS transitions still run on wall time). Prints page/console errors and exits 1 if there are any.

Setup:  python3 -m venv .venv && .venv/bin/pip install playwright pillow && .venv/bin/python -m playwright install chromium
"""
import argparse, asyncio, functools, http.server, pathlib, sys, tempfile, threading

from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
HOOK_FROM = "const distNorm = () => distAt(cur.rot, cur.bend);"
HOOK_TO = "const distNorm = () => 0.2;"

# mulberry32, seed 1: same "random" patients, blinks and sparks on every run.
# Reseeded on the first tap (진료 시작): three.min.js (CDN) and the tree-shaken npm build create a different
# number of library objects at load (each takes Math.random for its uuid), so the game's own draws are
# aligned from the tap onwards.
SEED_RANDOM = """
(() => { let a = 1; Math.random = function(){
  a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  addEventListener("pointerdown", () => { a = 1; }, {capture: true, once: true}); })();
"""


def parse():
    ap = argparse.ArgumentParser()
    ap.add_argument("target", nargs="?", default="dist-shot", help="built directory (default: dist-shot)")
    ap.add_argument("--legacy", metavar="HTML", help="single-file index.html to shoot instead of a build")
    ap.add_argument("--label", help="output folder under shots/ (default: new or legacy)")
    return ap.parse_args()


def serve(directory):
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    handler = functools.partial(Quiet, directory=str(directory))
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, f"http://127.0.0.1:{srv.server_address[1]}/"


def legacy_url(path):
    html = path.read_text(encoding="utf-8")
    if HOOK_FROM not in html:
        print("warning: hit-test hook not found; 3-crack.png may show a miss instead of a crack")
    forced = pathlib.Path(tempfile.mkdtemp()) / "index.html"
    forced.write_text(html.replace(HOOK_FROM, HOOK_TO), encoding="utf-8")
    return forced.as_uri()


async def shoot(url, out):
    errors = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"])
        page = await browser.new_page(viewport={"width": 812, "height": 375}, device_scale_factor=1)
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
        page.on("console", lambda m: errors.append(f"console: {m.text}") if m.type == "error" else None)
        await page.add_init_script(SEED_RANDOM)
        await page.clock.install(time=0)
        await page.clock.pause_at(1000)

        async def run(ms, settle=0):
            await page.clock.run_for(ms)
            if settle:
                await page.wait_for_timeout(settle)  # let CSS transitions (wall time) finish

        await page.goto(url)
        await page.evaluate("document.fonts.ready")
        await run(2500, 400)
        await page.screenshot(path=str(out / "1-title.png"))

        await page.click("#start")
        await run(3000, 500)
        await page.mouse.move(406, 200)
        await page.mouse.down()
        for i in range(30):
            await page.mouse.move(406 + i * 3, 200 - i * 0.6)
            await run(30)
        await page.mouse.up()
        await run(700, 400)
        await page.screenshot(path=str(out / "2-play.png"))

        await page.keyboard.press("Space")
        await run(420)
        await page.screenshot(path=str(out / "3-crack.png"))

        await run(2600, 500)
        await page.screenshot(path=str(out / "4-switch.png"))
        await browser.close()
    return errors


def main():
    args = parse()
    srv = None
    if args.legacy:
        url = legacy_url(pathlib.Path(args.legacy).resolve())
        label = args.label or "legacy"
    else:
        target = (ROOT / args.target) if not pathlib.Path(args.target).is_absolute() else pathlib.Path(args.target)
        if not (target / "index.html").is_file():
            sys.exit(f"{target}/index.html not found; run `npm run build:shot` first")
        srv, url = serve(target)
        label = args.label or "new"
    out = ROOT / "shots" / label
    out.mkdir(parents=True, exist_ok=True)
    try:
        errors = asyncio.run(shoot(url, out))
    finally:
        if srv:
            srv.shutdown()
    print("saved:", ", ".join(str(p.relative_to(ROOT)) for p in sorted(out.glob("*.png"))))
    print("errors:", errors or "none")
    sys.exit(1 if errors else 0)


main()

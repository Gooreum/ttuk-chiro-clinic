"""Headless check for 뚝 카이로 클리닉.

Takes three landscape-phone screenshots into ./shots:
  1-title.png  intro screen
  2-play.png   first patient, after a short drag
  3-crack.png  the success moment (x-ray, zoom, speech bubble)

For shot 3 a temporary copy of index.html is made where the hit test always succeeds,
so the original file is never modified. Prints page/console errors at the end.

Setup:  pip install playwright && python -m playwright install chromium
Run:    python scripts/shot.py [path/to/index.html]
"""
import asyncio, pathlib, sys, tempfile

from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = pathlib.Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else ROOT / "index.html"
OUT = ROOT / "shots"
HOOK_FROM = "const distNorm = () => distAt(cur.rot, cur.bend);"
HOOK_TO = "const distNorm = () => 0.2;"


async def main():
    OUT.mkdir(exist_ok=True)
    html = SRC.read_text(encoding="utf-8")
    if HOOK_FROM not in html:
        print("warning: hit-test hook not found; 3-crack.png may show a miss instead of a crack")
    forced = pathlib.Path(tempfile.mkdtemp()) / "index.html"
    forced.write_text(html.replace(HOOK_FROM, HOOK_TO), encoding="utf-8")

    errors = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"])
        page = await browser.new_page(viewport={"width": 812, "height": 375}, device_scale_factor=1)
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
        page.on("console", lambda m: errors.append(f"console: {m.text}") if m.type == "error" else None)

        # software WebGL is slow; give it time
        await page.goto(forced.as_uri())
        await page.wait_for_timeout(2500)
        await page.screenshot(path=str(OUT / "1-title.png"))

        await page.click("#start")
        await page.wait_for_timeout(3000)
        await page.mouse.move(406, 200)
        await page.mouse.down()
        for i in range(30):
            await page.mouse.move(406 + i * 3, 200 - i * 0.6)
            await page.wait_for_timeout(30)
        await page.mouse.up()
        await page.wait_for_timeout(700)
        await page.screenshot(path=str(OUT / "2-play.png"))

        await page.keyboard.press("Space")
        await page.wait_for_timeout(420)
        await page.screenshot(path=str(OUT / "3-crack.png"))
        await browser.close()

    print("saved:", ", ".join(str(p.relative_to(ROOT)) for p in sorted(OUT.glob("*.png"))))
    print("errors:", errors or "none")


asyncio.run(main())

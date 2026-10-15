"""Headless screenshots of the back-press scene (scripts/assets/back_preview.html) through a running Vite dev server.
   usage: .venv/bin/python -I scripts/assets/back_shot.py http://localhost:5173 out_dir
   Shots: idle (ring 1 active), preload, thrust peak, rebound after ok (ring done pulse), over (trampoline + ripple),
   portrait fit; plus pick round-trips (projectPosition -> pickPosition) printed."""
import sys, os
from playwright.sync_api import sync_playwright
BASE=sys.argv[1].rstrip("/"); OUT=sys.argv[2]; os.makedirs(OUT, exist_ok=True)
SHOTS=[
  ("1-idle", "pos=0.18&step=0&completed=0"),
  ("2-preload", "pos=0.5&step=1&completed=1&pressure=1"),
  ("3-thrust", "pos=0.5&step=1&completed=1&pressure=1&impulse=1"),
  ("4-ok-pulse", "pos=0.5&step=2&completed=2&after=0.18&done=1"),
  ("5-over", "pos=0.82&step=2&completed=2&kind=over&after=0.22"),
  ("6-weak", "pos=0.82&step=2&completed=2&kind=weak&pressure=1&impulse=1"),
  ("7-portrait", "pos=0.5&step=1&completed=1&w=390&h=844"),
  ("8-done", "pos=0.82&step=2&completed=3"),
]
errors=[]
with sync_playwright() as p:
    b=p.chromium.launch(args=["--use-gl=swiftshader","--enable-webgl","--ignore-gpu-blocklist"])
    for name,qs in SHOTS:
        w,h=(390,844) if "w=390" in qs else (844,390)
        pg=b.new_page(viewport={"width":w,"height":h}, device_scale_factor=1)
        pg.set_default_timeout(120000)
        pg.on("console", lambda m: m.type in ("error","warning") and errors.append(m.text))
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.goto(f"{BASE}/scripts/assets/back_preview.html?{qs}&w={w}&h={h}")
        pg.wait_for_function("window.__ready===true", timeout=120000)
        pg.screenshot(path=os.path.join(OUT, name+".png"))
        if name=="1-idle":
            res=pg.evaluate("""() => { const s = window.__back; return [0, 0.18, 0.5, 0.82, 1].map(v => { const q = s.projectPosition(v);
                return [v, Math.round(q.x), Math.round(q.y), s.pickPosition(q.x, q.y)]; }).concat([["off", 20, 20, s.pickPosition(20, 20)]]); }""")
            for r in res: print("PICK", r)
        pg.close()
    b.close()
for e in errors: print("CONSOLE", e)
print("WROTE", OUT)

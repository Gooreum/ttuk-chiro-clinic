import { defineConfig } from "vite";
import fs from "node:fs";
import path from "node:path";
import {clinicEffects} from "./scripts/build/clinic-effects.mjs";

// lab-assets/ (neck-rig lab GLBs, src/dev/neckLab.js) are not in public/: only the case build gets them, at lab/<path>.
// Other modes have no such plugin, so dist/ never holds them.
function labAssets(){
  const dir = path.resolve("lab-assets");
  const files = () => fs.existsSync(dir) ? fs.readdirSync(dir, {recursive: true}).filter(f => fs.statSync(path.join(dir, f)).isFile()) : [];
  return {
    name: "lab-assets",
    configureServer(server){
      server.middlewares.use((req, res, next) => {
        const m = /\/lab\/(.+?)(\?|$)/.exec(req.url || "");
        const f = m && path.join(dir, decodeURIComponent(m[1]));
        if(!f || !f.startsWith(dir) || !fs.existsSync(f)) return next();
        res.setHeader("Content-Type", "model/gltf-binary"); fs.createReadStream(f).pipe(res);
      });
    },
    generateBundle(){
      for(const f of files()) this.emitFile({type: "asset", fileName: "lab/" + f.split(path.sep).join("/"), source: fs.readFileSync(path.join(dir, f))});
    }
  };
}

// base "./": the same dist/ works at a GitHub Pages sub-path and at a Netlify Drop root.
// __FORCE_HIT__ is true only in `vite build --mode shot` (scripts/shot.py); the normal build drops the branch.
// __CASES__ is true only in `vite build --mode cases` (npm run build:cases): the case site replays scenarios live (src/dev/caseRunner.js).
// __TOSS__ is true only in `vite build --mode toss` (npm run build:toss): Apps-in-Toss ads and purchase (src/platform/toss.js).
// __APP__ is true only in `vite build --mode app` (npm run build:app): Capacitor store apps, AdMob ads (src/platform/admob.js).
export default defineConfig(({ mode }) => ({
  base: "./",
  plugins: mode === "cases" ? [clinicEffects(), labAssets()] : [clinicEffects()],
  define: { __FORCE_HIT__: JSON.stringify(mode === "shot"), __TOSS__: JSON.stringify(mode === "toss"), __CASES__: JSON.stringify(mode === "cases"), __APP__: JSON.stringify(mode === "app") },
  build: { rollupOptions: { input: { main: "index.html", back: "back.html", side: "side.html" } }, outDir: mode === "shot" ? "dist-shot" : mode === "cases" ? "dist-cases" : "dist", emptyOutDir: true },
  test: { environment: "node", include: ["test/**/*.test.js"] }
}));

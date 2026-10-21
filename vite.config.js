import { defineConfig } from "vite";
import {clinicEffects} from "./scripts/build/clinic-effects.mjs";

// base "./": the same dist/ works at a GitHub Pages sub-path and at a Netlify Drop root.
// __FORCE_HIT__ is true only in `vite build --mode shot` (scripts/shot.py); the normal build drops the branch.
// __CASES__ is true only in `vite build --mode cases` (npm run build:cases): the case site replays scenarios live (src/dev/caseRunner.js).
// __TOSS__ is true only in `vite build --mode toss` (npm run build:toss): Apps-in-Toss ads and purchase (src/platform/toss.js).
export default defineConfig(({ mode }) => ({
  base: "./",
  plugins:[clinicEffects()],
  define: { __FORCE_HIT__: JSON.stringify(mode === "shot"), __TOSS__: JSON.stringify(mode === "toss"), __CASES__: JSON.stringify(mode === "cases") },
  build: { rollupOptions: { input: { main: "index.html", back: "back.html", side: "side.html" } }, outDir: mode === "shot" ? "dist-shot" : mode === "cases" ? "dist-cases" : "dist", emptyOutDir: true },
  test: { environment: "node", include: ["test/**/*.test.js"] }
}));

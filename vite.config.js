import { defineConfig } from "vite";
import {clinicEffects} from "./scripts/build/clinic-effects.mjs";

// base "./": the same dist/ works at a GitHub Pages sub-path and at a Netlify Drop root.
// __FORCE_HIT__ is true only in `vite build --mode shot` (scripts/shot.py); the normal build drops the branch.
export default defineConfig(({ mode }) => ({
  base: "./",
  plugins:[clinicEffects()],
  define: { __FORCE_HIT__: JSON.stringify(mode === "shot") },
  build: { rollupOptions: { input: { main: "index.html", back: "back.html" } }, outDir: mode === "shot" ? "dist-shot" : "dist", emptyOutDir: true },
  test: { environment: "node", include: ["test/**/*.test.js"] }
}));

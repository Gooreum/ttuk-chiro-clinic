import { defineConfig } from "vite";

// base "./": the same dist/ works at a GitHub Pages sub-path and at a Netlify Drop root.
// __FORCE_HIT__ is true only in `vite build --mode shot` (scripts/shot.py); the normal build drops the branch.
export default defineConfig(({ mode }) => ({
  base: "./",
  define: { __FORCE_HIT__: JSON.stringify(mode === "shot") },
  build: { outDir: mode === "shot" ? "dist-shot" : "dist", emptyOutDir: true },
  test: { environment: "node", include: ["test/**/*.test.js"] }
}));

import { defineConfig } from "@playwright/test";

// e2e on the shot build (`vite build --mode shot`): __FORCE_HIT__ makes every crack/tug land, and window.__game /
// window.__backShot expose the state. Headless Chromium has no motion sensors, so the game runs on its drag/key fallback.
export default defineConfig({
  testDir: "e2e",
  timeout: 480_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4179/",
    viewport: { width: 812, height: 375 },
    locale: "ko-KR",
    browserName: "chromium",
    launchOptions: { args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] }
  },
  webServer: {
    command: "npx vite preview --outDir dist-shot --port 4179 --strictPort --host 127.0.0.1",
    url: "http://127.0.0.1:4179/",
    reuseExistingServer: false,
    timeout: 60_000
  }
});

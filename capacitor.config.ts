import type { CapacitorConfig } from "@capacitor/cli";

// Store apps (iOS/Android): `npm run build:app` builds dist/ with __APP__ and syncs it into the native projects.
const config: CapacitorConfig = {
  appId: "com.gooreum.ttukchiro",
  appName: "뚝 카이로 클리닉",
  webDir: "dist"
};

export default config;

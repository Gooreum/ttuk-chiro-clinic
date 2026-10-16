import { defineConfig } from '@apps-in-toss/web-framework/config';

// 앱인토스 테스트 배포용. `npm run build:toss` → ttuk-chiro.ait
// 표시 이름·아이콘은 3.x부터 콘솔에서 관리한다.
export default defineConfig({
  appName: 'ttuk-chiro',
  brand: {
    primaryColor: '#17312c',
  },
  navigationBar: {
    transparentBackground: true,
    theme: 'dark',
  },
  webView: {
    bounces: false,
    overScrollMode: 'never',
    allowsInlineMediaPlayback: true,
    // 뼈 소리·음악은 첫 탭에서 AudioContext를 깨운 뒤 재생한다
    mediaPlaybackRequiresUserAction: false,
  },
  permissions: [],
  webBundleDir: 'dist',
});

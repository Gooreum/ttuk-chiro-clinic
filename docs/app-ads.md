# 앱 버전 광고 (Capacitor + AdMob)

## 구조
- `npm run build:app`이 `vite build --mode app`(`__APP__` define)을 돌리고 `cap sync`로 네이티브 프로젝트에 넣는다.
- 광고 진입점은 `src/platform/ads.js` 하나다. `ui/monetize.js`, `ui/shop.js`가 여기서 가져온다.
- `__APP__`이면 `src/platform/admob.js`, 아니면 기존 `toss.js`다. 일반·toss·shot·cases 빌드엔 AdMob 플러그인이 번들되지 않는다(동적 import가 `__APP__` 뒤에 있다).
- `admob.js`는 `@capacitor-community/admob`의 보상형(`prepareRewardVideoAd` → `showRewardVideoAd`, `RewardAdPluginEvents.Rewarded`로 보상 확인, `Dismissed`만으로는 지급 안 함)과 전면(`prepareInterstitial` → `showInterstitial`)을 쓴다.
- iOS는 첫 광고 전에 `requestTrackingAuthorization()`(ATT), 이어서 `requestConsentInfo()` / `showConsentForm()`(UMP), 그다음 `initialize()`를 부른다.
- 규칙(`core/monetize.js`: 전면 간격, 이어하기 조건 등)은 토스와 같다. 광고 제거 결제는 앱에서 숨긴다(`canBuyAdFree` = false).
- 광고 단위 ID는 `admob.js`의 Google 공식 테스트 ID가 기본이다. 실제 ID는 `REAL_IDS`에 채운다(비어 있으면 테스트 ID 유지). 출시 전에 반드시 채운다.
- 앱 ID(AdMob App ID)는 코드가 아니라 네이티브 설정에 넣는다: Android `AndroidManifest.xml`의 `com.google.android.gms.ads.APPLICATION_ID` meta-data, iOS `Info.plist`의 `GADApplicationIdentifier`, 그리고 `NSUserTrackingUsageDescription`.

## 공식 확인 결과 (2026-10-22)
- Capacitor 문서(capacitorjs.com/docs/guides/ads)는 `@capacitor-community/admob` 설치 후 `npx cap update`를 안내한다.
- 플러그인 8.2.1이 최신, Capacitor 8.5 이상용이다. Capacitor 7이면 `@capacitor-community/admob@7`. 이 레포는 `@capacitor/*` 8.5.3 + admob 8.2.1이다.
- 공식 확인 안 됨: 플러그인 전체 호환표, 실기기 동작, 각 이벤트 페이로드의 필드 이름(코드는 `code`/`message`만 방어적으로 읽는다).
- 공식 확인 안 됨: `requestConsentInfo()`의 `status === "REQUIRED"` 문자열 값(README 요약만 확인). 실기기에서 확인한다.

## 네이티브 프로젝트
- `npx cap add android` / `npx cap add ios`는 성공했다(`capacitor.config.ts`를 읽으려면 `typescript` 개발 의존성이 필요해 추가). 실제 Xcode·Android 빌드는 하지 않았다.
- `android/`, `ios/`는 Capacitor가 만든 `.gitignore`로 빌드 산출물·웹 복사본(`public/`)이 빠진다. 커밋 대상으로 둔다(앱 ID·권한 설정을 손으로 고치기 때문).

## 남은 사람 단계
- AdMob 계정 재활성화 검토 중. 풀리면 앱 2개(iOS, Android)를 등록하고 보상형·전면 단위를 만든다.
- Play Console 본인 확인 3건.
- Apple Developer 가입($99/년).
- 앱별 `app-ads.txt`: 개발자 웹사이트 루트에 올리고 스토어 등록 정보의 개발자 웹사이트와 맞춘다.
- iOS ATT 문구, UMP 동의 메시지(AdMob 콘솔 개인정보 및 메시지에서 만든다), 개인정보처리방침 URL.
- 테스트 기기 등록 후 실제 ID로 바꿔 한 번 확인한다. 본인 광고를 직접 누르지 않는다.

## 정책 확인 필요
- 같은 게임을 앱인토스와 스토어에 동시에 내도 되는지: 앱인토스 입점 약관·Google Play·App Store 정책에서 공식 확인 안 됨. 출시 전에 약관을 직접 읽어 확인한다.
- 앱 안 광고 단위 ID와 토스 광고 그룹 ID는 별개이고 서로 섞이지 않는다.
- 가족용/아동 대상이 아님을 스토어 설문과 AdMob 설정에서 일관되게 답한다.

import type { CapacitorConfig } from '@capacitor/cli';

// 화면은 앱 안에 담아서 나간다. 원격 주소(server.url)를 띄우는 방식은 쓰지 않는다.
//
// 처음에는 그 방식으로 만들었다. 웹만 배포하면 앱도 같이 갱신돼서 APK를 다시 뿌릴 일이
// 거의 없다는 게 컸다. 스토어에 올리기로 하면서 그 이점을 포기했다. 두 가지 때문이다.
//
//   - 애플 4.2(최소 기능): 웹사이트를 그대로 띄우는 앱은 리젝된다. 네이티브 기능으로
//     웹에서 못 하는 일을 해야 통과한다(갤러리 자동 스캔이 그 근거가 된다).
//   - 애플 2.5.2 / 구글: 심사를 통과한 뒤에 기능이 바뀌는 구조를 금지한다.
//     server.url은 정확히 그것이다 — 심사받은 앱과 사용자가 실제로 보는 화면이 달라진다.
//
// 그래서 이제 화면을 고치면 새 빌드를 올리고 심사를 받아야 한다.
//
// 다만 개발 중에 매번 APK를 다시 까는 건 낭비라서, 환경변수를 준 빌드에서만 예전처럼
// 원격 주소를 띄우게 열어뒀다. 배포용 빌드에는 절대 들어가지 않아야 하므로,
// .github/workflows/build-android-apk.yml은 이 값을 주지 않는다.
//
//   MOACON_DEV_SERVER=https://ceaser501.github.io/our-home-gift/ npx cap sync android
const devServerUrl = process.env.MOACON_DEV_SERVER;

const config: CapacitorConfig = {
  // 앱을 식별하는 값. 스토어 주소에 그대로 들어가고, 한 번 올리면 절대 못 바꾼다.
  //
  // 앱 이름과 일부러 다르게 뒀다. 이름은 화면에 뜨는 글자라 언제든 바꿀 수 있지만
  // 이 값은 그 한 번이 전부라서, 이름을 여기 묶어두면 이름을 바꿀 때 앱을 새로
  // 내야 한다. 「모아콘」은 선등록 상표(MOACON, 제9류)와 겹치는 이름이라
  // 언젠가 바꾸게 될 수 있다 — docs/store-release.md 6장.
  //
  // 실제로 쓰이는 자리는 android/app/build.gradle의 applicationId와 iOS의
  // PRODUCT_BUNDLE_IDENTIFIER다. 여기 값은 플랫폼을 새로 붙일 때만 쓰인다.
  appId: 'io.github.ceaser501.ourhomegift',
  appName: '모아콘',
  webDir: '../client/dist',
  android: {
    allowMixedContent: false,
  },
  plugins: {
    // 앱을 보고 있는 중에도 알림을 띄운다.
    //
    // 안드로이드는 앱이 앞에 나와 있으면 알림을 안 그린다. 앱이 이미 보이니 굳이
    // 띄울 것 없다는 판단인데, 이 앱에서는 그게 아니다 — 참여 신청이 오면 승인할
    // 사람은 대개 앱을 켜둔 채 딴 화면을 보고 있고, 그때 아무것도 안 뜨면 신청한
    // 쪽이 하염없이 기다린다.
    //
    // 'alert'가 안드로이드에서 실제로 그리는 열쇠다(banner·list는 아이폰 말). 캐패시터
    // 플러그인이 이 값을 보고 앞에 있을 때도 직접 알림을 만든다.
    PushNotifications: {
      presentationOptions: ['alert', 'sound', 'badge'],
    },
  },
  ...(devServerUrl
    ? {
        server: {
          url: devServerUrl,
          androidScheme: 'https',
        },
      }
    : {}),
};

export default config;

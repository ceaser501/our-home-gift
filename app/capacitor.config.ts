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
    // ⚠ 이 값은 아이폰에서만 먹는다.
    //
    // 한동안 "'alert'가 안드로이드에서 그리는 열쇠"라고 적어뒀는데 틀린 말이었다.
    // 캐패시터의 푸시 플러그인도 파이어베이스 플러그인도 안드로이드에서는 알림을 직접
    // 그리지 않는다 — 둘 다 "받았다"는 신호만 던진다(플러그인 소스로 확인했다).
    //
    // 그래서 갤럭시는 앱을 켜둔 채로는 알림이 안 보였다. 내려두면 보였는데 그건
    // 시스템이 대신 그려주는 자리라서다. 보내는 폰에 따라 다른 것처럼 보였던 것도
    // 이것이다 — 누른 폰은 앞에 있고 다른 폰은 주머니에 있으니 늘 다른 폰에서만 떴다.
    //
    // 갤럭시에서 그리는 일은 이제 화면 쪽이 한다(client/src/utils/foregroundPush.js).
    PushNotifications: {
      presentationOptions: ['alert', 'sound', 'badge'],
    },

    // 아이폰은 같은 값을 여기서 읽는다.
    //
    // 아이폰 알림은 @capacitor-firebase/messaging 이 받는데, 그 플러그인은 위
    // PushNotifications 칸을 쳐다보지 않는다. 그래서 이 줄이 없으면 앱이 앞에 떠
    // 있는 동안 알림이 오기는 오는데 화면에 안 그려진다 — 서버 기록에는 '보냈다'로
    // 남고 폰에서는 아무 일도 안 일어난다. 참여 신청을 넣고 승인 화면을 보고 있는
    // 그 순간이 정확히 앱이 앞에 있는 때다.
    FirebaseMessaging: {
      presentationOptions: ['alert', 'badge', 'sound'],
    },
  },
  // 파이어베이스 메시징 플러그인이 SwiftPM에서 이름이 겹치는 것을 피하는 설정.
  //
  // 이 플러그인은 firebase-ios-sdk를 끌어오는데, 다른 패키지가 같은 것을 다른 이름으로
  // 가리키면 Xcode가 "같은 패키지가 둘"이라며 멈춘다. symlink로 얹으면 그 충돌이 없다.
  // 플러그인 README가 시키는 것이고, Capacitor CLI 8.4.0 이상에서만 먹는다(우리는 8.5).
  experimental: {
    ios: {
      spm: {
        packageOptions: {
          '@capacitor-firebase/messaging': { symlink: true },
        },
      },
    },
  },

  // 웹뷰가 화면을 여는 주소.
  //
  // 카카오 지도 SDK는 스크립트를 부른 주소(Referer)로 등록된 도메인인지 판정한다.
  // 안드로이드 기본값은 https://localhost 라 개발자센터에 그 주소를 등록해두면 되는데,
  // iOS 기본값은 capacitor://localhost 다 — 등록할 수 있는 형태가 아니라 늘 거절당한다.
  // 아이폰에서 지도가 「불러오는 중…」에서 멈춰 있던 이유가 이것이다.
  //
  // 둘을 https://localhost 로 맞춘다. 등록해둔 도메인 하나로 양쪽이 다 된다.
  // iOS는 아직 깔린 사람이 없어서 주소가 바뀌어도 잃을 것이 없다(주소가 바뀌면 그
  // 주소에 묶인 localStorage가 초기화된다 — 안드로이드는 값이 그대로라 영향이 없다).
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
    ...(devServerUrl ? { url: devServerUrl } : {}),
  },
};

export default config;

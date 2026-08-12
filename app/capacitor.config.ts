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
  appId: 'io.github.ceaser501.moacon',
  appName: '모아콘',
  webDir: '../client/dist',
  android: {
    allowMixedContent: false,
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

# 아이폰 앱

안드로이드와 나란히 두려고 만든 문서다. 안드로이드는 `docs/app-release.md`에 있다.

## 먼저: 아이폰에는 "APK 링크로 주기"가 없다

안드로이드는 APK를 만들어 링크로 주면 받은 사람이 설치한다. 아이폰은 그 길이 막혀 있다 —
**애플이 서명하지 않은 앱은 아이폰이 실행하지 않는다.** 서명하려면 애플 개발자 계정에서
발급한 인증서와 프로비저닝 프로파일이 있어야 하고, 그 계정이 연 $99다.

그래서 아이폰에 앱을 넣는 길은 셋뿐이다.

| 길 | 필요한 것 | 쓸모 |
|---|---|---|
| Xcode로 케이블 연결 | 맥 + 무료 애플 ID | 내 아이폰 하나. **7일마다 다시 깔아야 한다** |
| TestFlight | 애플 개발자 계정 ($99/년) | 최대 100대. 링크로 초대한다. 심사 하루 |
| 앱스토어 | 위와 같음 + 심사 통과 | 누구나 |

맥이 없고 계정도 없으면 지금 당장 아이폰에서 앱을 볼 방법은 없다.

## 그동안 아이폰에서 확인하는 법 — 웹

화면과 데이터는 앱이나 웹이나 같은 것이다. 사파리에서 열고 **공유 → 홈 화면에 추가**를
하면 주소창 없이 앱처럼 뜬다.

    https://ceaser501.github.io/our-home-gift/

초대 링크 확인은 이걸로 충분하다. 링크를 눌러서 초대받은 화면이 뜨고, 이름을 적어
참여 신청까지 가는 길은 전부 웹 쪽 코드다. 앱이어야만 되는 부분이 없다.

앱이어야 되는 것은 두 가지고, 둘 다 아이폰에서는 아직 안 된다(아래).

## 지금 저장소에 있는 것

`app/ios/`에 Xcode 프로젝트가 들어 있다. 맥이 있으면 바로 열린다.

    cd client && npm run build
    cd ../app && npx cap sync ios
    npx cap open ios          # Xcode가 열린다

맞춰둔 것:

| 자리 | 값 |
|---|---|
| 번들 ID | `io.github.ceaser501.moacon` (안드로이드 패키지명과 같다) |
| 앱 이름 | 모아콘 |
| 아이콘 | `assets/app-icons/store/icon-1024.png` |
| 진입 화면 | `assets/splash/` 밝은 것·어두운 것 |
| 로그인 복귀 | `io.github.ceaser501.moacon://login` (Info.plist의 CFBundleURLTypes) |
| 권한 문구 | 카메라 · 사진 · 위치 |
| 최소 버전 | iOS 15 |

의존성은 CocoaPods가 아니라 **Swift Package Manager**로 붙는다(캐패시터 8부터). 맥에
CocoaPods를 깔 일이 없다. 대신 `app/node_modules`가 있어야 한다 — `Package.swift`가
그 폴더를 직접 가리킨다.

빌드가 되는지는 `.github/workflows/build-ios-app.yml`을 손으로 돌려서 본다(Actions →
Build iOS app → Run workflow). 맥 러너는 분을 10배로 차감해서 자동으로 돌지 않는다.
컴파일까지만 하고 설치 파일은 나오지 않는다 — 서명할 계정이 없어서다.

## 아이폰에서 아직 안 되는 것

**알림.** 코드가 파이어베이스(FCM) 토큰을 기다리는데, `@capacitor/push-notifications`는
아이폰에서 APNs 토큰을 준다. 서버가 그 토큰으로는 못 보낸다. 아이폰용 파이어베이스 설정
(`GoogleService-Info.plist`)과 토큰을 FCM 것으로 바꿔주는 플러그인이 있어야 한다.
지금 상태로 알림을 켜면 15초 뒤에 "알림 서버와 연결하지 못했어요"가 뜬다
(`client/src/nativePush.js`의 타임아웃). 앱이 죽지는 않는다.

**사진첩 훑기.** 안드로이드 전용 기능이다. `client/src/utils/gallery.js`가 플랫폼을 보고
갈리므로 아이폰에서는 버튼조차 나오지 않는다. 아이폰용은 사진 접근 방식이 달라서
(PHPickerViewController) 네이티브 코드를 새로 짜야 한다.

이 둘이 없으면 애플 심사 4.2(최소 기능)에 걸릴 수 있다는 것도 같이 적어둔다 —
웹사이트를 그대로 띄우는 앱은 리젝된다. 안드로이드는 사진첩 훑기가 그 근거였다.

## 계정이 생긴 뒤에 할 일

1. **개발자 계정** — developer.apple.com, 연 $99. 개인은 승인까지 하루이틀.
2. **App ID 등록** — `io.github.ceaser501.moacon`. Push Notifications 체크.
3. **Xcode에서 Signing & Capabilities** — 팀을 고르고 Push Notifications를 추가한다.
   여기서 `App.entitlements`가 생긴다(지금은 없다 — 팀 없이는 만들어봐야 안 붙는다).
4. **카카오 개발자센터 → 플랫폼 → iOS** — 번들 ID를 등록한다. 초대 공유는 크롬 탭
   (아이폰에서는 사파리 뷰)에서 도는 웹 페이지라 도메인 등록만으로 될 것으로 보이는데,
   **실기로 확인하지 않았다.**
5. **TestFlight** — Xcode에서 Archive → Distribute, 또는 CI에 서명을 붙인다.
   `.github/workflows/build-ios-app.yml`에 인증서를 푸는 단계와 `-exportArchive`를
   더하면 된다. 안드로이드가 서명 키를 시크릿에서 꺼내 쓰는 방식과 같다.

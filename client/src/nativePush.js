import { PushNotifications } from '@capacitor/push-notifications';
import { isNativeApp } from './utils/browser';
import { saveNativePushToken, deleteMyNativePushTokens, hasMyNativePushTokens } from './api';

// 앱(안드로이드)의 알림. 웹의 push.js와 짝이다.
//
// 앱 웹뷰에는 웹푸시가 없다. 대신 파이어베이스(FCM)가 폰마다 토큰을 하나 내주고,
// 서버는 그 토큰으로 알림을 보낸다. 여기서 하는 일은 웹 쪽과 정확히 같은 세 가지다 —
// 켜기(토큰을 받아 서버에 저장), 끄기(내 토큰 전부 삭제), 지금 켜져 있는지.
//
// 토큰은 서버가 볼 때 웹 구독과 나란히 선다. 발송 함수(send-expiry-notifications,
// send-test-notification)가 웹 구독과 FCM 토큰 양쪽으로 보낸다.

export function isNativePushSupported() {
  return isNativeApp();
}

function isIos() {
  return window.Capacitor?.getPlatform?.() === 'ios';
}

// 켜기. 권한을 묻고, 토큰을 받아, 서버에 적는다.
//
// registration 이벤트를 먼저 걸고 register()를 부른다 — 순서를 바꾸면 토큰이
// 이벤트로 왔다 가버린 뒤라 영영 기다리게 된다.
// 아이폰은 파이어베이스 플러그인으로 받는다.
//
// @capacitor/push-notifications 는 아이폰에서 APNs 토큰을 준다. 서버는 FCM 한 갈래로만
// 보내는데(send-expiry-notifications) FCM은 APNs 토큰을 모른다 — 그래서 켜도 알림이
// 안 온다. 파이어베이스 플러그인은 같은 자리에서 FCM 토큰을 주고, 애플로 전달하는 일은
// 파이어베이스가 대신 한다. 서버와 토큰 표는 손대지 않아도 된다.
//
// 안드로이드는 지금까지 잘 돌던 길이라 그대로 둔다.
async function iosFcmToken() {
  const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');

  const permission = await FirebaseMessaging.requestPermissions();
  if (permission.receive !== 'granted') {
    throw new Error('알림 권한을 허용해주셔야 켤 수 있어요.');
  }

  const { token } = await FirebaseMessaging.getToken();
  if (!token) {
    // GoogleService-Info.plist 가 빌드에 안 들어갔거나 APNs 키가 안 붙은 경우다.
    throw new Error('알림 서버와 연결하지 못했어요. 잠시 뒤 다시 시도해주세요.');
  }
  return token;
}

export async function enableNativePush({ familyId }) {
  if (isIos()) {
    const token = await iosFcmToken();
    await saveNativePushToken({ familyId, token });
    return token;
  }

  const permission = await PushNotifications.requestPermissions();
  if (permission.receive !== 'granted') {
    throw new Error('알림 권한을 허용해주셔야 켤 수 있어요.');
  }

  const token = await new Promise((resolve, reject) => {
    // 파이어베이스 설정이 빌드에 안 들어간 경우(google-services.json 없음) 등록이
    // 오지도 실패하지도 않고 조용히 멈출 수 있다. 마냥 기다리게 두지 않는다.
    const timer = setTimeout(() => reject(new Error('알림 서버와 연결하지 못했어요. 잠시 뒤 다시 시도해주세요.')), 15000);
    const done = (fn) => (value) => {
      clearTimeout(timer);
      PushNotifications.removeAllListeners();
      fn(value);
    };
    PushNotifications.addListener('registration', done((result) => resolve(result.value)));
    PushNotifications.addListener('registrationError', done((err) => reject(new Error(err?.error || '알림 등록에 실패했어요.'))));
    PushNotifications.register().catch(done(reject));
  });

  await saveNativePushToken({ familyId, token });
  return token;
}

// 끄기. 이 계정으로 등록된 토큰을 전부 지운다 — 폰을 바꾸거나 앱을 다시 깔면 토큰이
// 새로 생기는데, 지금 것 하나만 지우면 예전 토큰으로 알림이 계속 간다(웹 구독과 같은 사정).
export async function disableNativePush(userId) {
  await deleteMyNativePushTokens(userId);
}

// 지금 이 계정으로 알림이 가는 상태인지. 서버 목록에 토큰이 있는지로 본다.
export async function isNativePushEnabled(userId) {
  return hasMyNativePushTokens(userId);
}

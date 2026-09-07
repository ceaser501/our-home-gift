import { PushNotifications } from '@capacitor/push-notifications';
import { isNativeApp } from './utils/browser';
import { saveNativePushToken, deleteNativePushToken, hasNativePushToken } from './api';

// 앱의 알림. 웹의 push.js와 짝이다.
//
// 앱 웹뷰에는 웹푸시가 없다. 대신 파이어베이스(FCM)가 폰마다 토큰을 하나 내주고,
// 서버는 그 토큰으로 알림을 보낸다. 여기서 하는 일은 웹 쪽과 정확히 같은 세 가지다 —
// 켜기(토큰을 받아 서버에 저장), 끄기(이 폰 토큰 삭제), 지금 켜져 있는지.
//
// 토큰은 서버가 볼 때 웹 구독과 나란히 선다. 발송 함수(send-expiry-notifications,
// send-test-notification, notify-join-request)가 웹 구독과 FCM 토큰 양쪽으로 보낸다.
//
// ⚠ 켜져 있는지는 '이 폰'을 기준으로 본다. 계정 기준이 아니다.
//
// 예전에는 "이 계정으로 등록된 토큰이 하나라도 있으면 켜짐"으로 봤다. 폰 한 대만 쓰는
// 동안에는 맞는 말이었는데, 같은 계정으로 갤럭시와 아이폰에 함께 로그인하자 이렇게 됐다:
// 갤럭시에서 켜두면 아이폰의 스위치도 켜진 것으로 보이고, 이미 켜져 있으니 아이폰에서는
// 아무도 스위치를 누르지 않고, 그래서 아이폰의 토큰은 서버에 한 번도 올라가지 않는다.
// 알림은 갤럭시에만 갔다. 화면에는 "켜짐"이라고 적혀 있는데 그 폰만 안 울렸다.

export function isNativePushSupported() {
  return isNativeApp();
}

function isIos() {
  return window.Capacitor?.getPlatform?.() === 'ios';
}

// 이 폰이 예전에 알림을 켰었는지. 토큰이 갈렸을 때 조용히 다시 등록해주기 위한 표시다.
function memoryKey(userId) {
  return `moacon:push-on:${userId}`;
}

function rememberOn(userId, on) {
  try {
    if (on) window.localStorage.setItem(memoryKey(userId), '1');
    else window.localStorage.removeItem(memoryKey(userId));
  } catch {
    // 적어두지 못해도 켜고 끄는 일 자체는 서버 쪽 토큰으로 남는다.
  }
}

function wasOn(userId) {
  try {
    return window.localStorage.getItem(memoryKey(userId)) === '1';
  } catch {
    return false;
  }
}

// 아이폰은 파이어베이스 플러그인으로 받는다.
//
// @capacitor/push-notifications 는 아이폰에서 APNs 토큰을 준다. 서버는 FCM 한 갈래로만
// 보내는데 FCM은 APNs 토큰을 모른다 — 그래서 켜도 알림이 안 온다. 파이어베이스 플러그인은
// 같은 자리에서 FCM 토큰을 주고, 애플로 전달하는 일은 파이어베이스가 대신 한다.
// 서버와 토큰 표는 손대지 않아도 된다.
async function iosToken({ ask }) {
  const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');

  const permission = ask
    ? await FirebaseMessaging.requestPermissions()
    : await FirebaseMessaging.checkPermissions();
  if (permission.receive !== 'granted') {
    if (!ask) return null;
    throw permissionDenied();
  }

  // 이미 받아둔 것이 있으면 그걸로 끝이다. 두 번째부터는 늘 여기서 끝난다.
  const ready = await FirebaseMessaging.getToken()
    .then((r) => r.token || null)
    .catch(() => null);
  if (ready) return ready;

  // 확인하는 때(ask=false)는 여기까지다. 오래전에 받아둔 것을 읽는 자리라, 없으면
  // 없는 것이다 — 여기서 기다리면 내 메뉴가 그만큼 늦게 뜬다.
  if (!ask) return null;

  // 권한을 막 받은 직후에는 토큰이 아직 없다.
  //
  // 허락을 누른 그 순간 iOS가 애플(APNs)에 등록을 시작하고, 파이어베이스는 그 등록이
  // 끝나야 FCM 토큰을 내준다. 그사이에 물으면 빈손이거나 "No APNS token specified"로
  // 튕긴다.
  //
  // 첫 설정 화면에서 알림을 켜고 시작했는데 내 메뉴에서는 꺼져 있던 것이 이것이었다.
  //
  // 몇 밀리초 쉬었다 다시 물어보는 식으로 한 번 고쳤다가 되돌렸다. 얼마나 걸릴지는
  // 우리가 정하는 값이 아니다 — 망이 느리거나 애플 쪽이 밀리면 몇 초가 걸릴 수 있고,
  // 그때 몇 번을 물어볼지 미리 정해둔 숫자는 결국 찍은 것이다.
  //
  // 파이어베이스는 토큰이 만들어지면 알려준다. 그 소식을 기다린다. 안드로이드가 예전부터
  // 쓰던 방식과 같다(아래 androidToken의 'registration'). 시간을 재는 것은 영영 안 오는
  // 경우를 위한 마지막 그물일 뿐이고, 안드로이드가 오래 써온 15초를 그대로 쓴다 —
  // 이 자리는 사람이 스위치를 눌러놓고 기다리는 자리라 더 길게 잡을 이유가 없다.
  return await new Promise((resolve, reject) => {
    let handle = null;
    let settled = false;

    const timer = setTimeout(
      // 여기까지 왔으면 기다려서 될 일이 아니다. GoogleService-Info.plist가 빌드에
      // 안 들어갔거나 APNs 키가 안 붙은 경우가 대부분이다.
      () => finish(() => reject(new Error('알림 서버와 연결하지 못했어요. 잠시 뒤 다시 시도해주세요.'))),
      15000
    );

    function finish(fn) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      handle?.remove();
      fn();
    }

    FirebaseMessaging.addListener('tokenReceived', ({ token }) => {
      if (token) finish(() => resolve(token));
    })
      .then((h) => {
        handle = h;
        // 소식이 먼저 오고 손잡이가 나중에 올 수 있다. 그때는 여기서 치운다.
        if (settled) h.remove();
      })
      .catch(() => finish(() => reject(new Error('알림 서버와 연결하지 못했어요. 잠시 뒤 다시 시도해주세요.'))));
  });
}

// 권한을 거절한 것과 그 밖의 실패를 갈라서 알린다. 켜기를 부른 쪽이 "켜려고 했다"는
// 것을 적어둘지 정하는 데 쓴다 — 거절한 사람에게는 적어두면 안 된다.
function permissionDenied() {
  const err = new Error('알림 권한을 허용해주셔야 켤 수 있어요.');
  err.permissionDenied = true;
  return err;
}

// 안드로이드는 지금까지 잘 돌던 길이라 그대로 둔다.
async function androidToken({ ask }) {
  const permission = ask
    ? await PushNotifications.requestPermissions()
    : await PushNotifications.checkPermissions();
  if (permission.receive !== 'granted') {
    if (!ask) return null;
    throw permissionDenied();
  }

  return await new Promise((resolve, reject) => {
    // 파이어베이스 설정이 빌드에 안 들어간 경우(google-services.json 없음) 등록이
    // 오지도 실패하지도 않고 조용히 멈출 수 있다. 마냥 기다리게 두지 않는다.
    const timer = setTimeout(
      () => (ask ? reject(new Error('알림 서버와 연결하지 못했어요. 잠시 뒤 다시 시도해주세요.')) : resolve(null)),
      15000
    );
    const done = (fn) => (value) => {
      clearTimeout(timer);
      PushNotifications.removeAllListeners();
      fn(value);
    };
    PushNotifications.addListener('registration', done((result) => resolve(result.value)));
    PushNotifications.addListener(
      'registrationError',
      done((err) => (ask ? reject(new Error(err?.error || '알림 등록에 실패했어요.')) : resolve(null)))
    );
    PushNotifications.register().catch(done(ask ? reject : () => resolve(null)));
  });
}

// 이 폰의 FCM 토큰.
//
// ask가 참이면 권한을 묻고, 안 되면 왜 안 되는지 알린다(스위치를 누른 때다).
// 거짓이면 이미 허락된 경우에만 조용히 받아오고 아니면 null이다(화면을 그리는 때다) —
// 앱을 열자마자 권한 창이 뜨면 무슨 일인지 모른 채 거절하게 된다.
async function deviceToken({ ask }) {
  return isIos() ? iosToken({ ask }) : androidToken({ ask });
}

// 켜기. 권한을 묻고, 토큰을 받아, 서버에 적는다.
//
// 켜려고 했다는 것을 먼저 적어둔다(userId를 준 경우).
//
// 토큰을 받는 일은 우리 손 밖이다. 폰이 애플에 등록하고 파이어베이스가 토큰을 만들어
// 주기까지 기다리는 것이라, 망이 끊기거나 애플 쪽이 밀리면 못 받고 끝날 수 있다.
// 그러면 사용자는 켰는데 안 켜진 것이 되고, 그걸 알 방법도 없다.
//
// 적어두면 다음에 앱을 열 때 저절로 낫는다 — isNativePushEnabled가 이 표시를 보고,
// 토큰은 있는데 서버에 없으면 조용히 다시 적어둔다. 기다리는 시간을 얼마로 잡든
// 놓치는 경우가 남는데, 그 뒤를 이 표시가 받는다.
//
// 권한을 거절한 경우는 지운다. 그건 안 켜기로 한 것이라, 나중에 다른 이유로 권한을
// 주었을 때 묻지도 않고 켜지면 안 된다.
export async function enableNativePush({ familyId, userId }) {
  if (userId) rememberOn(userId, true);
  try {
    const token = await deviceToken({ ask: true });
    await saveNativePushToken({ familyId, token });
    return token;
  } catch (err) {
    if (userId && err?.permissionDenied) rememberOn(userId, false);
    throw err;
  }
}

// 끄기. 이 폰의 토큰만 지운다.
//
// 예전에는 이 계정의 토큰을 전부 지웠다. 폰 두 대를 쓰면 한쪽을 끄는 순간 다른 쪽도
// 같이 꺼졌다. 죽은 토큰이 쌓이는 걱정은 서버가 대신 한다(api.js의 deleteNativePushToken).
export async function disableNativePush(userId) {
  rememberOn(userId, false);
  const token = await deviceToken({ ask: false });
  if (token) await deleteNativePushToken(token);
}

// 지금 이 폰으로 알림이 가는 상태인지.
//
// 이 폰의 토큰이 서버에 있는지로 본다. 켰던 적이 있는데 없다면 토큰이 갈린 것이라
// (앱 업데이트·재설치·파이어베이스의 정기 교체) 조용히 다시 적어둔다. 이걸 안 하면
// 화면은 '꺼짐'으로 돌아가고, 사용자는 켜둔 적 있는 스위치가 왜 꺼졌는지 알 수 없다.
export async function isNativePushEnabled(userId, familyId) {
  const token = await deviceToken({ ask: false });
  if (!token) return false;

  if (await hasNativePushToken(token)) {
    rememberOn(userId, true);
    return true;
  }

  if (!wasOn(userId)) return false;

  try {
    await saveNativePushToken({ familyId: familyId ?? null, token });
    return true;
  } catch {
    return false;
  }
}

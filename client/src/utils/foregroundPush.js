import { isNativeApp } from './browser';

// 앱을 보고 있는 중에 온 알림을 갤럭시에서도 그린다.
//
// ── 왜 안 그려졌나 ──────────────────────────────────────────────────────────
//
// 안드로이드는 알림이 왔을 때 앱이 앞에 있으면 시스템이 그리지 않고 앱에게 넘긴다.
// 앱이 이미 보이니 알아서 하라는 것이다. 그리는 일은 앱 몫이 된다.
//
// 그런데 우리가 쓰는 두 플러그인(@capacitor/push-notifications,
// @capacitor-firebase/messaging)은 안드로이드에서 그 그리는 일을 하지 않는다. 둘 다
// "받았다"는 신호만 던진다. capacitor.config.ts의 presentationOptions는 아이폰 전용
// 값이라 안드로이드에는 아무 영향이 없다 — 거기 적혀 있던 "'alert'가 안드로이드에서
// 그리는 열쇠"라는 말은 틀린 것이었고, 그래서 오래 못 찾았다.
//
// 앱을 내려두면 왔다. 시스템이 그려주는 자리라서다. 켜둔 채로는 안 왔다. 보내는 폰에
// 따라 다른 것처럼 보였던 것도 이것이다 — 누른 폰은 앞에 있고 다른 폰은 주머니에
// 있으니, 늘 다른 폰에서만 보였다.
//
// ── 왜 고쳐야 하나 ──────────────────────────────────────────────────────────
//
// 참여 신청 알림이 그 자리다. 승인할 사람은 대개 앱을 켜둔 채 딴 화면을 보고 있고,
// 그때 아무것도 안 뜨면 신청한 쪽이 하염없이 기다린다.
//
// ── 어떻게 ──────────────────────────────────────────────────────────────────
//
// 받았다는 신호를 듣고 우리가 알림을 하나 띄운다(@capacitor/local-notifications).
// 아이폰은 손대지 않는다 — 거기는 플러그인이 앞에서도 그려준다.
//
// 어느 플러그인이 신호를 주는지는 폰이 정한다. 둘 다 안드로이드에 알림 서비스를
// 등록해두는데 실제로 받는 것은 하나뿐이고, 그게 어느 쪽인지는 빌드가 정한다.
// 그래서 양쪽 다 듣고, 같은 알림이 두 번 오면 뒤엣것을 버린다.

// 방금 그린 것. 같은 알림이 두 플러그인에서 잇달아 오면 두 번 뜨는 것을 막는다.
let lastKey = '';
let lastAt = 0;
const SAME_WITHIN_MS = 3000;

function alreadyDrawn(title, body) {
  const key = `${title}\n${body}`;
  const now = Date.now();
  if (key === lastKey && now - lastAt < SAME_WITHIN_MS) return true;
  lastKey = key;
  lastAt = now;
  return false;
}

// 알림마다 다른 번호를 준다. 같은 번호를 쓰면 앞엣것을 덮어써서, 두 개가 잇달아 와도
// 하나만 남는다.
let nextId = 1;

async function draw(notification) {
  const title = notification?.title || '모아콘';
  const body = notification?.body || '';
  if (alreadyDrawn(title, body)) return;

  const { LocalNotifications } = await import('@capacitor/local-notifications');
  await LocalNotifications.schedule({
    notifications: [
      {
        // 안드로이드는 32비트 정수만 받는다. 앱을 여는 동안 겹치지 않으면 충분하다.
        id: (nextId += 1) % 2147483647,
        title,
        body,
        // 알림 줄에 뜨는 작은 아이콘.
        //
        // 안 주면 플러그인이 시스템의 ⓘ 를 쓴다(LocalNotificationManager.kt의
        // getDefaultSmallIcon). 앱이 내려가 있을 때 오던 알림은 파이어베이스가 그리고
        // 거기는 이 그림을 쓰므로, 안 맞추면 같은 알림인데 앞에 있을 때와 내려가
        // 있을 때 아이콘이 달라진다.
        // (app/android/app/src/main/res/drawable/ic_stat_moacon.xml)
        smallIcon: 'ic_stat_moacon',
        // 시각을 안 주면 곧바로 나간다.
      },
    ],
  });
}

/**
 * 앞에 떠 있을 때 온 알림을 그리게 걸어둔다. 웹과 아이폰에서는 아무 일도 하지 않는다.
 *
 * 실패해도 조용히 넘어간다. 이것이 안 걸려도 앱을 내려두면 알림은 그대로 온다 —
 * 여기서 오류를 내서 앱을 세울 이유가 없다.
 */
export async function watchForegroundPush() {
  if (!isNativeApp()) return;
  if (window.Capacitor?.getPlatform?.() !== 'android') return;

  try {
    const [{ FirebaseMessaging }, { PushNotifications }] = await Promise.all([
      import('@capacitor-firebase/messaging'),
      import('@capacitor/push-notifications'),
    ]);

    await FirebaseMessaging.addListener('notificationReceived', (event) => {
      draw(event?.notification).catch(() => {});
    }).catch(() => {});

    await PushNotifications.addListener('pushNotificationReceived', (notification) => {
      draw(notification).catch(() => {});
    }).catch(() => {});
  } catch {
    // 플러그인을 못 불러왔다. 앱을 내려두면 알림은 그대로 온다.
  }
}

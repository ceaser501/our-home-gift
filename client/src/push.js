import { savePushSubscription, deleteMyPushSubscriptions, hasPushSubscription } from './api';
import { isServiceWorkerSupported, readyServiceWorker } from './utils/serviceWorker';

// 이 앱 전용 VAPID 공개키. 비밀값이 아니라(브라우저에 항상 노출되는 값) 그대로 커밋해도 된다.
// 짝이 되는 개인키(VAPID_PRIVATE_KEY)만 Supabase Edge Function 비밀값으로 따로 보관한다.
const VAPID_PUBLIC_KEY = 'BPERy-BmzU-GQ2No-jC8G0pDzFLySmNJXr76tRKjUkMUSogEcMyswBiLfumkUTAX5rYaApsh1mjQOWQRf4f9ox4';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export function isPushSupported() {
  return typeof window !== 'undefined' && isServiceWorkerSupported() && 'PushManager' in window;
}

async function getRegistration() {
  return readyServiceWorker();
}

export async function getExistingSubscription() {
  if (!isPushSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return null;
  return registration.pushManager.getSubscription();
}

export async function subscribeToPush({ familyId }) {
  if (!isPushSupported()) throw new Error('이 브라우저(또는 이 방식으로 연 페이지)는 푸시 알림을 지원하지 않아요.');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('알림 권한을 허용해주셔야 켤 수 있어요.');

  const registration = await getRegistration();
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  });

  // 누구 것인지는 보내지 않는다. 서버가 로그인한 사람으로 직접 적는다.
  await savePushSubscription({ familyId, subscription });
  return subscription;
}

export async function unsubscribeFromPush(userId) {
  const subscription = await getExistingSubscription();
  if (subscription) await subscription.unsubscribe();
  // 브라우저 구독만 끊으면 서버에 남은 예전 주소로 알림이 계속 나간다. 목록에서도 지운다.
  await deleteMyPushSubscriptions(userId);
}

// 지금 이 브라우저로 알림이 실제로 오는 상태인지. 브라우저 구독과 서버 목록이 모두 있어야 한다.
export async function isPushEnabled() {
  const subscription = await getExistingSubscription();
  if (!subscription) return false;
  return hasPushSubscription(subscription.endpoint);
}

import { savePushSubscription, deletePushSubscription } from './api';

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
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;
}

async function getRegistration() {
  return navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
}

export async function getExistingSubscription() {
  if (!isPushSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return null;
  return registration.pushManager.getSubscription();
}

export async function subscribeToPush({ userId, familyId }) {
  if (!isPushSupported()) throw new Error('이 브라우저(또는 이 방식으로 연 페이지)는 푸시 알림을 지원하지 않아요.');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('알림 권한을 허용해주셔야 켤 수 있어요.');

  const registration = await getRegistration();
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  });

  await savePushSubscription({ userId, familyId, subscription });
  return subscription;
}

export async function unsubscribeFromPush() {
  const subscription = await getExistingSubscription();
  if (!subscription) return;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  await deletePushSubscription(endpoint);
}

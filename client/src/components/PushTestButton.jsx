import { useState } from 'react';
import { BellRing } from 'lucide-react';
import { isPushSupported } from '../push';

const TEST_DELAY_MS = 10000;

// 실제 발송(하루 2번 예약)을 기다리지 않고, 알림이 제대로 뜨는지 바로 확인해보기 위한
// 테스트 버튼. 서버를 거치지 않고 브라우저에서 직접 알림을 띄운다.
export default function PushTestButton() {
  const [pending, setPending] = useState(false);

  if (!isPushSupported()) return null;

  async function handleClick() {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      alert('알림 권한을 허용해주셔야 테스트할 수 있어요.');
      return;
    }

    setPending(true);
    alert('10초 뒤에 테스트 알림이 도착해요. 앱을 잠깐 벗어나 있어도 됩니다.');

    setTimeout(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      const title = '유효기한이 곧 만료돼요';
      const body = '[스타벅스] 아이스 아메리카노 T · D-7 · 곧 만료돼요 (테스트 알림)';
      if (registration) {
        registration.showNotification(title, { body, icon: 'icon-192.png', badge: 'icon-192.png' });
      } else {
        new Notification(title, { body });
      }
      setPending(false);
    }, TEST_DELAY_MS);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      style={{ left: 'max(20px, calc((100vw - 480px) / 2 + 20px))' }}
      className="fixed bottom-[max(24px,env(safe-area-inset-bottom))] z-20 flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-2.5 text-xs font-semibold text-muted-foreground shadow-lg disabled:opacity-50"
    >
      <BellRing className="size-3.5" />
      {pending ? '10초 후 도착…' : '푸시 테스트'}
    </button>
  );
}

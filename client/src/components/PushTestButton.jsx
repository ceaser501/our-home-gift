import { useState } from 'react';
import { BellRing } from 'lucide-react';
import { isPushSupported, ensureServiceWorker } from '../push';

const TEST_DELAY_MS = 5000;

// 실제 발송(하루 2번 예약)을 기다리지 않고, 알림이 제대로 뜨는지 바로 확인해보기 위한
// 테스트 버튼. 서버를 거치지 않고 브라우저에서 직접 알림을 띄운다.
// 모바일 크롬은 new Notification()을 지원하지 않아서(예외 발생) 반드시 서비스워커의
// showNotification을 써야 하므로, 알림 토글을 안 켠 상태여도 여기서 등록해준다.
export default function PushTestButton() {
  const [pending, setPending] = useState(false);

  if (!isPushSupported()) return null;

  async function handleClick() {
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        alert('알림 권한을 허용해주셔야 테스트할 수 있어요.');
        return;
      }

      const registration = await ensureServiceWorker();

      setPending(true);
      alert('5초 뒤에 테스트 알림이 도착해요. 이 화면을 켜둔 채로 기다려주세요.');

      setTimeout(() => {
        registration
          .showNotification('유효기한이 곧 만료돼요', {
            body: '스타벅스 · 아이스 아메리카노 T\n7일 남았어요 (테스트 알림)',
            icon: `${import.meta.env.BASE_URL}icon-192.png`,
            tag: 'gifticon-expiry',
            renotify: true,
          })
          .catch((err) => alert(`알림 표시에 실패했어요: ${err.message}`));
        setPending(false);
      }, TEST_DELAY_MS);
    } catch (err) {
      setPending(false);
      alert(`테스트 알림 준비에 실패했어요: ${err.message}`);
    }
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
      {pending ? '5초 후 도착…' : '푸시 테스트'}
    </button>
  );
}

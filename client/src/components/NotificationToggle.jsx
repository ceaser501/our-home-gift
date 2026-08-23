import { useEffect, useState } from 'react';
import { BellRing } from 'lucide-react';
import { isPushSupported, isPushEnabled, subscribeToPush, unsubscribeFromPush } from '../push';
import { isNativePushSupported, isNativePushEnabled, enableNativePush, disableNativePush } from '../nativePush';
import { useFamily } from '../FamilyContext';
import AlertDialog from './AlertDialog';

// onChange는 켜짐/꺼짐이 바뀐 걸 바깥에도 알려준다. 같은 창의 '알림 테스트' 줄이
// 이 상태를 함께 보여주는데, 여기서만 알고 있으면 그쪽이 낡은 값을 계속 띄운다.
//
// 알림이 오는 길이 둘이다. 웹은 브라우저 구독(웹푸시), 앱은 파이어베이스(FCM) 토큰.
// 앱 웹뷰에는 웹푸시가 없어서 한동안 이 줄이 앱에서 통째로 사라져 있었다(v0.0.80) —
// 켤 방법이 없는데 테스트만 보내라는 화면이 됐다. 이제 앱은 FCM으로 켜고 끈다.
// 화면이 하는 일은 양쪽이 같다: 켜기, 끄기, 지금 켜져 있는지.
export default function NotificationToggle({ asRow = false, onChange }) {
  const { user, family } = useFamily();
  const native = isNativePushSupported();
  const supported = native || isPushSupported();
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    (native ? isNativePushEnabled(user.id) : isPushEnabled())
      .then(apply)
      .catch(() => apply(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function apply(value) {
    setEnabled(value);
    onChange?.(value);
  }

  if (!supported) return null;

  async function handleToggle() {
    setLoading(true);
    try {
      if (enabled) {
        await (native ? disableNativePush(user.id) : unsubscribeFromPush(user.id));
        apply(false);
      } else {
        await (native ? enableNativePush({ familyId: family.id }) : subscribeToPush({ familyId: family.id }));
        apply(true);
      }
    } catch (err) {
      setNotice({ tone: 'warning', title: '알림 설정에 실패했어요', description: err.message });
    } finally {
      setLoading(false);
    }
  }

  const dialogs = <>{notice && <AlertDialog {...notice} onClose={() => setNotice(null)} />}</>;

  if (asRow) {
    return (
      <>
        <button
          type="button"
          onClick={handleToggle}
          disabled={loading}
          className="flex w-full items-center gap-3 px-1 py-3 text-left text-sm disabled:opacity-50"
        >
          <BellRing className="size-4.5 shrink-0 text-muted-foreground" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-foreground">푸시 알림 받기</span>
            {/* 무엇이 폰을 울리는지 적어둔다. 이걸 안 적으면 가족이 기프티콘을 쓸 때마다
                알림이 오는 줄 알고 꺼버린다. 정작 만료 알림까지 같이 꺼지는 셈이다.
                (사용·사용취소·등록은 폰을 울리지 않고 헤더의 종에만 쌓인다.) */}
            <span className="text-xs break-keep text-muted-foreground">사용기한 임박, 가족 참여 신청</span>
          </span>
          <span className={enabled ? 'shrink-0 text-xs font-semibold text-primary' : 'shrink-0 text-xs text-muted-foreground'}>
            {enabled ? '켜짐' : '꺼짐'}
          </span>
        </button>
        {dialogs}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={handleToggle}
        disabled={loading}
        aria-label={enabled ? '알림 끄기' : '알림 켜기'}
        className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground disabled:opacity-50"
      >
        <BellRing className={enabled ? 'size-4 text-primary' : 'size-4'} />
      </button>
      {dialogs}
    </>
  );
}

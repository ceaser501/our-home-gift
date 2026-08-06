import { useEffect, useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { isPushSupported, isPushEnabled, subscribeToPush, unsubscribeFromPush } from '../push';
import { useFamily } from '../FamilyContext';
import AlertDialog from './AlertDialog';

export default function NotificationToggle({ asRow = false }) {
  const { user, family } = useFamily();
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    if (!isPushSupported()) return;
    isPushEnabled()
      .then(setEnabled)
      .catch(() => setEnabled(false));
  }, []);

  if (!isPushSupported()) return null;

  async function handleToggle() {
    setLoading(true);
    try {
      if (enabled) {
        await unsubscribeFromPush(user.id);
        setEnabled(false);
      } else {
        await subscribeToPush({ familyId: family.id });
        setEnabled(true);
      }
    } catch (err) {
      setNotice({ tone: 'warning', title: '알림 설정에 실패했어요', description: err.message });
    } finally {
      setLoading(false);
    }
  }

  const noticeDialog = notice && <AlertDialog {...notice} onClose={() => setNotice(null)} />;

  if (asRow) {
    return (
      <>
        <button
          type="button"
          onClick={handleToggle}
          disabled={loading}
          className="flex w-full items-center gap-3 px-1 py-3 text-left text-sm disabled:opacity-50"
        >
          {enabled ? <Bell className="size-4.5 text-muted-foreground" /> : <BellOff className="size-4.5 text-muted-foreground" />}
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-foreground">폰으로 알림 받기</span>
            {/* 무엇이 폰을 울리는지 적어둔다. 이걸 안 적으면 가족이 기프티콘을 쓸 때마다
                알림이 오는 줄 알고 꺼버린다. 정작 만료 알림까지 같이 꺼지는 셈이다.
                (사용·사용취소·등록은 폰을 울리지 않고 헤더의 종에만 쌓인다.) */}
            <span className="text-xs break-keep text-muted-foreground">유효기한 임박, 가족 참여 신청</span>
          </span>
          <span className={enabled ? 'shrink-0 text-xs font-semibold text-primary' : 'shrink-0 text-xs text-muted-foreground'}>
            {enabled ? '켜짐' : '꺼짐'}
          </span>
        </button>
        {noticeDialog}
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
        {enabled ? <Bell className="size-4 text-primary" /> : <BellOff className="size-4" />}
      </button>
      {noticeDialog}
    </>
  );
}

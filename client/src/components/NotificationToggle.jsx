import { useEffect, useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { isPushSupported, isPushEnabled, subscribeToPush, unsubscribeFromPush } from '../push';
import { hasMyPushSubscriptions } from '../api';
import { useFamily } from '../FamilyContext';
import AlertDialog from './AlertDialog';

// 알림을 켜는 화면. 웹에서는 알림이 웹 주소로 온다.
const WEB_URL = 'https://ceaser501.github.io/our-home-gift/';

// onChange는 켜짐/꺼짐이 바뀐 걸 바깥에도 알려준다. 같은 창의 '알림 테스트' 줄이
// 이 상태를 함께 보여주는데, 여기서만 알고 있으면 그쪽이 낡은 값을 계속 띄운다.
//
// ── 앱(웹뷰)에서는 반쪽만 된다 ──────────────────────────────────────────────
// 안드로이드 웹뷰에는 웹푸시(PushManager)가 없다. 그래서 앱 안에서는 알림을 "켤" 수가
// 없다 — 이 줄을 통째로 감췄더니 "켤 방법이 없는데 어떻게 테스트하냐"가 됐다(v0.0.80).
// 대신 이렇게 한다:
//   상태  — 계정에 등록된 구독이 있는지로 보여준다. 알림은 같은 폰의 크롬(웹) 구독으로
//           도착하므로 이게 실제 동작과 맞는 켜짐/꺼짐이다.
//   끄기  — 계정의 구독을 지우는 일이라 앱에서도 된다.
//   켜기  — 웹에서만 된다. 누르면 크롬으로 여는 길을 안내한다.
// 제대로 하려면 네이티브 알림(FCM)을 붙여야 한다 — docs/next.md에 적어뒀다.
export default function NotificationToggle({ asRow = false, onChange }) {
  const { user, family } = useFamily();
  const supported = isPushSupported();
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState(null);
  // 앱에서 '켜기'를 눌렀을 때의 안내 창.
  const [guide, setGuide] = useState(false);

  useEffect(() => {
    (supported ? isPushEnabled() : hasMyPushSubscriptions(user.id))
      .then(apply)
      .catch(() => apply(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function apply(value) {
    setEnabled(value);
    onChange?.(value);
  }

  // 헤더의 작은 종 버튼은 앱에서 원래부터 없었다. 그대로 둔다.
  if (!supported && !asRow) return null;

  async function handleToggle() {
    if (!supported && !enabled) {
      setGuide(true);
      return;
    }
    setLoading(true);
    try {
      if (enabled) {
        await unsubscribeFromPush(user.id);
        apply(false);
      } else {
        await subscribeToPush({ familyId: family.id });
        apply(true);
      }
    } catch (err) {
      setNotice({ tone: 'warning', title: '알림 설정에 실패했어요', description: err.message });
    } finally {
      setLoading(false);
    }
  }

  const dialogs = (
    <>
      {notice && <AlertDialog {...notice} onClose={() => setNotice(null)} />}
      {guide && (
        <AlertDialog
          tone="info"
          title="알림은 크롬에서 켜요"
          description={'앱에서는 아직 알림을 켤 수 없어요.\n크롬으로 모아콘을 열어 켜주세요. 알림은 이 폰으로 와요.'}
          confirmLabel="크롬으로 열기"
          cancelLabel="닫기"
          onConfirm={() => {
            setGuide(false);
            window.open(WEB_URL, '_blank');
          }}
          onClose={() => setGuide(false)}
        />
      )}
    </>
  );

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
        {enabled ? <Bell className="size-4 text-primary" /> : <BellOff className="size-4" />}
      </button>
      {dialogs}
    </>
  );
}

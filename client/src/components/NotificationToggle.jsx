import { useEffect, useState } from 'react';
import { BellRing, Clock } from 'lucide-react';
import { isPushSupported, isPushEnabled, subscribeToPush, unsubscribeFromPush } from '../push';
import { isNativePushSupported, isNativePushEnabled, enableNativePush, disableNativePush } from '../nativePush';
import { useFamily } from '../FamilyContext';
import AlertDialog from './AlertDialog';
import { SettingLinkRow, SettingSwitchRow } from './SettingRow';
import ExpiryHourSheet, { DEFAULT_EXPIRY_HOUR, formatHour } from './ExpiryHourSheet';

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
  // 알림 받을 시각. 설정 줄에서만 쓴다(헤더의 종 버튼에는 없다).
  const [hour, setHour] = useState(DEFAULT_EXPIRY_HOUR);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    // 가족 아이디까지 넘긴다. 토큰이 갈렸을 때 조용히 다시 적어두는 데 쓴다
    // (nativePush.js의 isNativePushEnabled).
    (native ? isNativePushEnabled(user.id, family.id) : isPushEnabled())
      .then(apply)
      .catch(() => apply(false));
    // 못 읽으면 기본값(9시)을 보여준다. 서버도 줄이 없으면 9시로 보낸다.
    //
    // api는 필요할 때 불러온다. 헤더의 종 버튼도 이 부품이라, 거기까지 DB 모듈을
    // 끌고 다닐 이유가 없다.
    if (asRow) {
      import('../api')
        .then((api) => api.getExpiryHour?.(user.id))
        .then((value) => value && setHour(value))
        .catch(() => {});
    }
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
        await (native ? enableNativePush({ familyId: family.id, userId: user.id }) : subscribeToPush({ familyId: family.id }));
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
        <SettingSwitchRow
          icon={BellRing}
          // 첫 설정 화면(WelcomeSetupScreen)과 같은 이름을 쓴다. 거기서 켜고 온 것을
          // 나중에 여기서 찾을 때 "아, 그때 그것"이 되어야 하는데, 한쪽은 '푸시 알림
          // 받기'이고 다른 쪽은 '사용기한 알림'이면 같은 스위치인 줄 모른다.
          label="사용기한 알림"
          // 무엇이 폰을 울리는지 적어둔다. 이름이 기한만 가리키게 됐으니 이 줄이 더
          // 중요해졌다 — 이걸 안 적으면 가족이 기프티콘을 쓸 때마다 알림이 오는 줄 알고
          // 꺼버린다. 정작 만료 알림까지 같이 꺼지는 셈이다.
          // (사용·사용취소·등록은 폰을 울리지 않고 헤더의 종에만 쌓인다.)
          hint="사용기한 임박, 가족 참여 신청"
          on={enabled}
          onToggle={handleToggle}
          disabled={loading}
        />
        {/* 켜져 있을 때만 시각을 고르게 한다. 꺼진 채로 시각을 고르면 "골랐는데 왜 안
            오지"가 된다. */}
        {enabled && (
          <SettingLinkRow
            icon={Clock}
            label="알림 시간"
            hint={`매일 ${formatHour(hour)} · 기한 7일 전부터`}
            onClick={() => setPicking(true)}
          />
        )}
        {picking && (
          <ExpiryHourSheet
            value={hour}
            onPick={async (next) => {
              const api = await import('../api');
              await api.setExpiryHour(user.id, next);
              setHour(next);
            }}
            onClose={() => setPicking(false)}
          />
        )}
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

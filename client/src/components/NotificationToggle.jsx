import { useEffect, useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { isPushSupported, isPushEnabled, subscribeToPush, unsubscribeFromPush } from '../push';
import { useFamily } from '../FamilyContext';

export default function NotificationToggle({ asRow = false }) {
  const { user, family } = useFamily();
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(false);

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
        await subscribeToPush({ userId: user.id, familyId: family.id });
        setEnabled(true);
      }
    } catch (err) {
      alert(err.message || '알림 설정에 실패했어요.');
    } finally {
      setLoading(false);
    }
  }

  if (asRow) {
    return (
      <button
        type="button"
        onClick={handleToggle}
        disabled={loading}
        className="flex w-full items-center gap-3 px-1 py-3 text-left text-sm disabled:opacity-50"
      >
        {enabled ? <Bell className="size-4.5 text-muted-foreground" /> : <BellOff className="size-4.5 text-muted-foreground" />}
        <span className="flex-1 text-foreground">유효기한 임박 알림</span>
        <span className={enabled ? 'text-xs font-semibold text-primary' : 'text-xs text-muted-foreground'}>
          {enabled ? '켜짐' : '꺼짐'}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={loading}
      aria-label={enabled ? '유효기한 임박 알림 끄기' : '유효기한 임박 알림 켜기'}
      className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground disabled:opacity-50"
    >
      {enabled ? <Bell className="size-4 text-primary" /> : <BellOff className="size-4" />}
    </button>
  );
}

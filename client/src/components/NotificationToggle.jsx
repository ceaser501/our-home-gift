import { useEffect, useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { isPushSupported, getExistingSubscription, subscribeToPush, unsubscribeFromPush } from '../push';
import { useFamily } from '../FamilyContext';

export default function NotificationToggle() {
  const { user, family } = useFamily();
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isPushSupported()) return;
    getExistingSubscription().then((sub) => setEnabled(Boolean(sub)));
  }, []);

  if (!isPushSupported()) return null;

  async function handleToggle() {
    setLoading(true);
    try {
      if (enabled) {
        await unsubscribeFromPush();
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

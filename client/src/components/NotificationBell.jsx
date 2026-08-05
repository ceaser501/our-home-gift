import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import ActivitySheet from './ActivitySheet';
import { getActivityLastRead, listActivities, markActivitiesRead } from '../api';
import { subscribeToActivities } from '../realtime';
import { useFamily } from '../FamilyContext';

// 헤더의 종. 가족이 기프티콘을 올리거나 쓰면 숫자가 붙고, 누르면 목록이 열린다.
//
// 푸시(유효기한 임박, 가족 참여 신청)와는 다른 자리다. 그 둘은 앱을 안 열고 있어도 지금
// 알아야 하는 일이라 폰을 울리고, 여기 쌓이는 것은 다음에 앱을 열었을 때 알면 되는 일이다.
export default function NotificationBell() {
  const { family, user } = useFamily();
  const [activities, setActivities] = useState([]);
  const [lastReadAt, setLastReadAt] = useState(null);
  const [open, setOpen] = useState(false);
  // 연 순간의 "여기까지 읽었음" 값. 열면 곧바로 다 읽음이 되지만, 목록에서는 이번에
  // 새로 온 것에 점을 찍어줘야 해서 열기 직전 값을 따로 들고 있는다.
  const openedWith = useRef(null);

  const load = useCallback(async () => {
    const [rows, readAt] = await Promise.all([listActivities(family.id), getActivityLastRead(family.id)]);
    setActivities(rows);
    setLastReadAt(readAt);
  }, [family.id]);

  useEffect(() => {
    load();
  }, [load]);

  // 가족이 방금 쓴 것이 새로고침 없이 바로 뜨게 한다.
  useEffect(() => {
    return subscribeToActivities(family.id, () => load());
  }, [family.id, load]);

  const unread = lastReadAt
    ? activities.filter((a) => new Date(a.created_at).getTime() > new Date(lastReadAt).getTime()).length
    : activities.length;

  async function handleOpen() {
    openedWith.current = lastReadAt;
    setOpen(true);
    // 여는 순간 읽음으로 친다. 항목마다 따로 눌러 읽게 하면 숫자가 안 줄어드는 이유를
    // 알기 어렵다. 실패해도 화면은 열어둔다 — 다음에 열 때 다시 시도된다.
    try {
      await markActivitiesRead(family.id, user.id);
      setLastReadAt(new Date().toISOString());
    } catch {
      // 읽음 표시를 못 남긴 것뿐이라 사용자에게 알릴 일은 아니다.
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        aria-label={unread > 0 ? `알림 ${unread}개` : '알림'}
        className="relative flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground"
      >
        <Bell className="size-5" />
        {/* 숫자가 두 자리를 넘으면 종보다 커진다. 그 이상은 "많다"만 알면 충분하다. */}
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-4 font-bold text-destructive-foreground">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && <ActivitySheet activities={activities} lastReadAt={openedWith.current} onClose={() => setOpen(false)} />}
    </>
  );
}

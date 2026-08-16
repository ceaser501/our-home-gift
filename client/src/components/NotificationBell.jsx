import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import ActivitySheet from './ActivitySheet';
import {
  getActivityLastRead,
  listActivities,
  listNoticeReads,
  listNotices,
  markActivitiesRead,
  markNoticesRead,
} from '../api';
import { subscribeToActivities } from '../realtime';
import { useFamily } from '../FamilyContext';
import { importantNotices, splitPinned, unreadNotices } from '../utils/notices';

// 헤더의 종. 가족이 기프티콘을 올리거나 쓰면 숫자가 붙고, 누르면 목록이 열린다.
// 운영자가 낸 중요 공지도 여기로 들어온다.
//
// 푸시(유효기한 임박, 가족 참여 신청)와는 다른 자리다. 그 둘은 앱을 안 열고 있어도 지금
// 알아야 하는 일이라 폰을 울리고, 여기 쌓이는 것은 다음에 앱을 열었을 때 알면 되는 일이다.
//
// 공지를 푸시로 보내려다 접었다. 공지를 종류별로 늘어놓아 보니 미리 알려야 하는 것이
// 거의 없었다 — 새벽 점검은 그 시간에 다들 자고, 장애는 미리 알 수 없고, 기능 안내는
// 애초에 푸시할 일이 아니다. 이런 것으로 푸시가 몇 번 가면 정작 기한 임박 푸시까지
// 같이 꺼진다.

// 말풍선을 오늘 이미 띄웠는지. 하루에 한 번만 띄운다.
const HINT_KEY = 'important-notice-hinted-on';
const HINT_MS = 3000;

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export default function NotificationBell() {
  const { family, members, user } = useFamily();
  const [activities, setActivities] = useState([]);
  const [notices, setNotices] = useState([]);
  const [noticeReads, setNoticeReads] = useState([]);
  const [lastReadAt, setLastReadAt] = useState(null);
  const [open, setOpen] = useState(false);
  const [hint, setHint] = useState(false);
  // 연 순간의 "여기까지 읽었음" 값. 열면 곧바로 다 읽음이 되지만, 목록에서는 이번에
  // 새로 온 것에 점을 찍어줘야 해서 열기 직전 값을 따로 들고 있는다.
  const openedWith = useRef(null);

  const load = useCallback(async () => {
    const [rows, readAt, noticeRows, readIds] = await Promise.all([
      listActivities(family.id),
      getActivityLastRead(family.id),
      listNotices(),
      listNoticeReads(),
    ]);
    setActivities(rows);
    setLastReadAt(readAt);
    setNotices(noticeRows);
    setNoticeReads(readIds);
  }, [family.id]);

  useEffect(() => {
    load();
  }, [load]);

  // 가족이 방금 쓴 것이 새로고침 없이 바로 뜨게 한다.
  useEffect(() => {
    return subscribeToActivities(family.id, () => load());
  }, [family.id, load]);

  const important = importantNotices(notices);
  const unreadNotice = unreadNotices(important, noticeReads);
  const { pinned, rest } = splitPinned(important);

  // 안 읽은 중요 공지가 있으면 종 옆에 말풍선을 띄운다.
  //
  // 앱을 열자마자 막아서는 팝업은 만들지 않는다. 이 앱을 여는 순간 중에 제일 급한 것이
  // 계산대 앞이고, 뒷사람이 기다리는데 무엇이든 앞을 막으면 그건 방해다. 바코드를
  // 띄우러 온 사람은 공지가 있는 줄도 모르고 잘 쓰고 나가는데, 그게 가장 좋은 결과다.
  //
  // 하루에 한 번만 띄운다. 읽으면 그 뒤로 안 뜨고, 안 읽으면 다음 날 다시 한 번.
  // 앱을 하루에 네다섯 번 열 일이 없고, 유료화 같은 것은 한 달 전부터 알리므로 하루
  // 놓쳐도 된다. 급한 점검은 등록을 누르는 자리가 이미 잡아준다.
  useEffect(() => {
    if (unreadNotice.length === 0) return undefined;
    if (localStorage.getItem(HINT_KEY) === todayStr()) return undefined;
    localStorage.setItem(HINT_KEY, todayStr());
    setHint(true);
    const timer = setTimeout(() => setHint(false), HINT_MS);
    return () => clearTimeout(timer);
    // 안 읽은 공지가 생겼는지만 본다. 목록이 바뀔 때마다 다시 재면 말풍선이 계속 살아난다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadNotice.length > 0]);

  // 어디부터 셀지. 마지막으로 종을 연 때가 있으면 그때부터, 한 번도 안 열었으면
  // 이 가족에 들어온 때부터 센다.
  //
  // 예전에는 한 번도 안 열었으면 쌓여 있던 것을 전부 셌다. 새로 들어온 사람이 앱을
  // 처음 열면 종에 50이 박혔는데, 그 숫자는 아무 일도 알려주지 않는다 — 들어오기 전에
  // 가족이 무엇을 했는지는 새로 온 사람의 소식이 아니다.
  const joinedAt = members.find((m) => m.user_id === user.id)?.created_at || null;
  const since = lastReadAt || joinedAt;

  // 내가 한 일은 세지 않는다. 방금 등록한 사람에게 "새 소식 6개"를 알리는 셈이라,
  // 숫자가 붙는 순간 이미 아는 일이다. 한 건씩 올리던 때는 1씩 붙어 덜 거슬렸는데,
  // 일괄 등록이 생기면서 한 번에 여섯도 열도 붙게 됐다.
  //
  // 목록에서는 걸러내지 않는다. 그건 "무슨 일이 있었나"를 되짚는 자리라 내가 한 것도
  // 함께 있어야 한다. 숫자만 남의 소식을 센다.
  const unreadActivity = activities.filter(
    (a) => a.actor_id !== user.id && (!since || new Date(a.created_at).getTime() > new Date(since).getTime())
  ).length;

  // 공지도 같이 센다. 색을 나누려다 접었다 — 색이 갈리면 "이 색이 무슨 뜻이지"를 새로
  // 배워야 하는데, 사용자에게는 둘 다 그냥 안내다. 열 개면 열 개다.
  const unread = unreadActivity + unreadNotice.length;

  async function handleOpen() {
    openedWith.current = lastReadAt;
    setOpen(true);
    setHint(false);
    // 여는 순간 읽음으로 친다. 공지가 맨 위에 고정돼 있어 열면 무조건 보이고, 항목마다
    // 따로 눌러 읽게 하면 숫자가 안 줄어드는 이유를 알기 어렵다.
    // 실패해도 화면은 열어둔다 — 다음에 열 때 다시 시도된다.
    try {
      await markActivitiesRead(family.id, user.id);
      setLastReadAt(new Date().toISOString());
    } catch {
      // 읽음 표시를 못 남긴 것뿐이라 사용자에게 알릴 일은 아니다.
    }
    const ids = important.map((n) => n.id);
    await markNoticesRead(ids, user.id);
    setNoticeReads((prev) => [...new Set([...prev, ...ids])]);
  }

  return (
    <>
      <div className="relative flex shrink-0 items-center">
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

        {/* 무슨 공지인지는 적지 않는다. 점검이든 유료화든 같은 말로 덮는다 — 제목을
            띄우면 그것대로 놀라게 하는 데다, 세 줄짜리 제목이면 화면을 가린다.
            누를 것도 없다. 종을 가리키고 있으니 궁금하면 종을 누르면 된다. */}
        {hint && (
          <span
            role="status"
            className="animate-in fade-in slide-in-from-top-1 pointer-events-none absolute top-full right-0 z-30 mt-1.5 rounded-lg bg-foreground px-2.5 py-1.5 text-[11px] font-semibold whitespace-nowrap text-background shadow-md"
          >
            중요 안내가 있어요
          </span>
        )}
      </div>

      {open && (
        <ActivitySheet
          activities={activities}
          pinnedNotices={pinned}
          listedNotices={rest}
          lastReadAt={openedWith.current}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

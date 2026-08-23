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
import { cn } from '@/lib/utils';
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

// 말풍선을 오늘 어느 공지로 띄웠는지. { on: 날짜, ids: [공지 id] }
//
// 날짜만 적어뒀더니, 오늘 이미 한 번 띄운 뒤에 새 공지가 올라오면 그건 영영 못 알렸다.
// 하루에 한 번이라는 규칙은 "같은 안내를 하루에 한 번"이라는 뜻이지 "하루에 한 마디만"이
// 아니다. 그래서 어느 공지로 띄웠는지까지 적어두고, 그때 없던 공지가 생기면 다시 한 번
// 띄운다. 대신 같은 공지로는 그날 다시 띄우지 않는다.
const HINT_KEY = 'important-notice-hinted';

// 말풍선이 떠 있는 시간.
//
// 3초로 뒀다가 늘렸다. 앱을 켜면 목록을 먼저 읽느라 눈이 아래에 가 있는데, 말풍선은
// 위쪽 종 옆에서 1~2초 뒤에 떴다가 3초 만에 사라진다. 실제로 있는 줄도 모르고 지나갔다.
// 하루에 한 번뿐이라 놓치면 그날은 끝이라, 짧게 두는 쪽이 손해가 크다.
const HINT_MS = 6000;

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function readHinted() {
  try {
    const saved = JSON.parse(localStorage.getItem(HINT_KEY) || 'null');
    if (!saved || saved.on !== todayStr()) return [];
    return Array.isArray(saved.ids) ? saved.ids : [];
  } catch {
    // 값이 깨져 있으면 오늘 아무것도 안 띄운 것으로 본다. 한 번 더 뜨는 건 불편할 뿐이다.
    return [];
  }
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
  // 이 효과가 무엇을 보고 다시 도는지가 중요하다.
  //
  // 한때 "오늘 아직 안 알린 공지"를 밖에서 셈해 그걸 열쇠로 삼았다. 그런데 효과 안에서
  // 곧바로 "알렸다"고 적으므로, 다음 렌더에 그 셈이 빈 값이 되면서 열쇠가 바뀐다. 열쇠가
  // 바뀌면 React가 먼저 뒷정리(clearTimeout)를 부르고 새로 도는데, 새로 돈 쪽은 알릴 것이
  // 없어 곧장 돌아간다. 결과는 6초 뒤 끄는 시계만 사라진 채 말풍선이 영영 남는 것이었다.
  //
  // 그래서 열쇠는 우리가 적는 값에 흔들리지 않는 것으로 둔다 — 안 읽은 공지가 무엇인가.
  // 오늘 알렸는지는 효과 안에서 본다.
  const unreadKey = unreadNotice.map((n) => n.id).join(',');

  useEffect(() => {
    const fresh = unreadNotice.filter((n) => !readHinted().includes(n.id)).map((n) => n.id);
    if (fresh.length === 0) return undefined;
    try {
      localStorage.setItem(HINT_KEY, JSON.stringify({ on: todayStr(), ids: [...readHinted(), ...fresh] }));
    } catch {
      // 못 적으면 다음에 열 때 한 번 더 뜬다. 그뿐이다.
    }
    setHint(true);
    const timer = setTimeout(() => setHint(false), HINT_MS);
    return () => clearTimeout(timer);
    // 안 읽은 공지가 무엇인지만 본다. 목록이 바뀔 때마다 다시 재면 말풍선이 계속 살아난다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadKey]);

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
  // 내가 한 것도 목록에는 그대로 둔다. 그건 "무슨 일이 있었나"를 되짚는 자리라 내가 한
  // 것까지 있어야 이어 읽힌다. 숫자만 남의 소식을 센다.
  const unreadActivity = activities.filter(
    (a) => a.actor_id !== user.id && (!since || new Date(a.created_at).getTime() > new Date(since).getTime())
  ).length;

  // 들어오기 전에 있었던 일은 목록에서도 뺀다.
  //
  // 숫자는 진작부터 가입 시점부터 셌는데 목록은 전부 보여주고 있었다. 한 기준을 두 자리가
  // 다르게 쓴 셈이라, 새로 들어온 사람은 배지가 0인데 열어보면 쉰 줄이 쌓여 있었다.
  // 들어오기 전에 가족이 무엇을 했는지는 새로 온 사람의 소식이 아니다 — 숫자에서 뺀
  // 이유가 목록에서도 그대로 성립한다.
  //
  // 가입 시각을 모르면(구성원 정보를 아직 못 읽었으면) 거르지 않는다. 있는 것을 감추는
  // 것보다 잠깐 더 보이는 편이 낫다.
  const sinceJoined = joinedAt
    ? activities.filter((a) => new Date(a.created_at).getTime() >= new Date(joinedAt).getTime())
    : activities;

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
          className="relative flex size-[42px] shrink-0 items-center justify-center rounded-xl text-foreground/70"
        >
          {/* 말풍선이 뜰 때 한 번 까딱한다. 움직이는 것이 말하는 것이라, 종이 먼저
              움직이면 눈이 그리로 가고 말풍선은 그 뒤를 따른다. */}
          <Bell className={cn('size-5', hint && 'moacon-bell-shake')} />
          {/* 숫자가 두 자리를 넘으면 종보다 커진다. 그 이상은 "많다"만 알면 충분하다.
              흰 테두리를 둘러 종과 뱃지를 떼어놓는다 — 예전에는 종 위로 겹쳐 올라앉아
              두 자리 숫자가 종의 선에 묻혔다. 누를 자리가 42px이 되면서 뱃지도 그 안으로
              들어와, 헤더 밖으로 튀어나가지 않는다. */}
          {unread > 0 && (
            <span className="absolute top-1 right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-[1.5px] border-background bg-destructive px-1.5 text-[11px] font-bold tabular-nums text-destructive-foreground">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </button>

        {/* 무슨 공지인지는 적지 않는다. 점검이든 유료화든 같은 말로 덮는다 — 제목을
            띄우면 그것대로 놀라게 하는 데다, 세 줄짜리 제목이면 화면을 가린다.

            눌러도 아무 일이 없게 뒀다가 고쳤다. 말을 걸어놓고 갈 데가 없으면 고장으로
            보인다. 다만 "보기" 같은 안내는 붙이지 않는다 — 이걸 본 사람은 어차피 종을
            누른다. 말풍선을 눌러도 같은 곳으로 가는 것은 덤이지 약속이 아니다.

            색은 검정에서 앱의 보라로 낮췄다. 검정은 이 앱에서 제일 센 색인데 이건
            알림이 아니라 귀띔이고, 정작 급한 것(빨간 배지)과도 안 겹쳐야 한다. */}
        {hint && (
          <button
            type="button"
            onClick={handleOpen}
            aria-live="polite"
            className="animate-in fade-in slide-in-from-top-1 absolute top-full right-0 z-30 mt-2 rounded-lg bg-primary px-2.5 py-1.5 text-[11px] font-semibold whitespace-nowrap text-primary-foreground shadow-md"
          >
            {/* 꼬리. 이것 하나로 "허공에 뜬 상자"가 "종에 대한 말"이 된다. */}
            <span aria-hidden="true" className="absolute -top-1 right-3 size-2 rotate-45 rounded-[1px] bg-primary" />
            중요 안내가 있어요
          </button>
        )}
      </div>

      {open && (
        <ActivitySheet
          activities={sinceJoined}
          pinnedNotices={pinned}
          listedNotices={rest}
          lastReadAt={openedWith.current}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

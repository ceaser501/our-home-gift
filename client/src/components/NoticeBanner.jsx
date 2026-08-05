import { useEffect, useState } from 'react';
import { Megaphone, X } from 'lucide-react';
import NoticesSheet from './NoticesSheet';
import { listNotices } from '../api';

// 닫은 공지는 다시 띄우지 않는다. 공지마다 따로 기억해야 해서 id 목록으로 둔다.
// "공지 안내 전체 끄기"는 두지 않았다. 운영자가 꼭 알려야 할 것을 적는 자리라,
// 아예 못 받게 하면 공지를 낼 방법이 없어진다. 대신 하나씩은 얼마든지 닫을 수 있다.
const DISMISS_KEY = 'notice-dismissed-ids';

function readDismissed() {
  try {
    const saved = JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]');
    return Array.isArray(saved) ? saved : [];
  } catch {
    // 값이 깨져 있으면 아무것도 안 닫은 것으로 본다. 공지가 한 번 더 보이는 건
    // 불편할 뿐이지만, 여기서 터지면 목록 위쪽이 통째로 안 그려진다.
    return [];
  }
}

export default function NoticeBanner() {
  const [notices, setNotices] = useState([]);
  const [dismissed, setDismissed] = useState(readDismissed);
  const [listOpen, setListOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listNotices().then((rows) => {
      if (!cancelled) setNotices(rows);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // 아직 시작 안 된 공지는 서버(RLS)가 걸러주고, 여기서는 끝난 것만 더 걸러낸다.
  // 끝난 공지도 받아오는 이유는 "공지사항"에서 지난 것까지 보여주기 위해서다.
  const now = Date.now();
  const current = notices.find((n) => (!n.ends_at || new Date(n.ends_at).getTime() > now) && !dismissed.includes(n.id));

  function dismiss(id) {
    // 오래 쓰면 닫은 id가 계속 쌓인다. 지난 공지의 id는 다시 뜰 일이 없으므로 최근 것만 남긴다.
    const next = [...dismissed, id].slice(-50);
    localStorage.setItem(DISMISS_KEY, JSON.stringify(next));
    setDismissed(next);
  }

  if (!current) return null;

  return (
    <>
      {/* 설치 안내(InstallPrompt)와 같은 차림의 상단 띠. 둘이 같이 떠도 한 덩어리로 읽힌다. */}
      <div className="flex w-full items-center gap-2.5 border-b border-border bg-accent/60 px-5 py-3">
        <Megaphone className="size-4 shrink-0 text-primary" />
        {/* 제목만 띠에 싣고 본문은 눌러서 본다. 긴 공지를 통째로 띄우면 목록이 밀린다. */}
        <button type="button" onClick={() => setListOpen(true)} className="min-w-0 flex-1 text-left">
          <span className="block truncate text-xs font-semibold text-foreground">{current.title}</span>
        </button>
        <button type="button" onClick={() => dismiss(current.id)} aria-label="공지 닫기" className="shrink-0 text-muted-foreground">
          <X className="size-4" />
        </button>
      </div>

      {listOpen && <NoticesSheet onClose={() => setListOpen(false)} />}
    </>
  );
}

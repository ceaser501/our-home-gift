import { useEffect, useState } from 'react';
import { Megaphone, X } from 'lucide-react';
import NoticesSheet from './NoticesSheet';
import { listNotices } from '../api';

// 닫은 공지는 다시 띄우지 않는다. 공지마다 따로 기억해야 해서 목록으로 둔다.
// "공지 안내 전체 끄기"는 두지 않았다. 운영자가 꼭 알려야 할 것을 적는 자리라,
// 아예 못 받게 하면 공지를 낼 방법이 없어진다. 대신 하나씩은 얼마든지 닫을 수 있다.
const DISMISS_KEY = 'notice-dismissed-ids';

// 기억하는 것은 id가 아니라 "id + 마지막으로 고친 시각"이다.
//
// id로만 기억하면 한 번 닫은 공지는 그 기기에서 영영 못 뜬다. 그런데 운영자가 그 글을
// 고쳐 다시 올리거나, 안내성이던 것을 중요로 올리는 일이 있다. 사용자가 닫은 것은 "그때
// 그 내용"이지 이 글의 모든 판이 아니므로, 고쳐서 올린 것은 다시 보여주는 게 맞다.
// 반대로 아무도 손대지 않은 공지가 자꾸 되살아나면 닫기 버튼이 거짓말이 된다.
function versionKey(notice) {
  return `${notice.id}:${notice.updated_at || notice.created_at || ''}`;
}

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

export default function NoticeBanner({ refreshKey = 0, onShownChange }) {
  const [notices, setNotices] = useState([]);
  const [dismissed, setDismissed] = useState(readDismissed);
  const [listOpen, setListOpen] = useState(false);

  // 공지는 운영자가 언제든 새로 올린다. 그런데 예전에는 화면이 처음 그려질 때 한 번만
  // 불러와서, 새 공지를 올려도 사용자가 앱을 완전히 껐다 켜기 전까지는 못 봤다.
  // 급한 일을 알리려고 만든 자리인데 그때까지 기다린다면 자리값을 못 한다.
  //
  // refreshKey는 목록을 다시 읽는 순간(당겨서 새로고침, 다른 앱 다녀오기)마다 바뀐다.
  // 공지도 그때 같이 맞춘다 — 사용자가 "최신으로 맞춰줘"라고 한 순간이 곧 그 순간이다.
  useEffect(() => {
    let cancelled = false;
    listNotices().then((rows) => {
      if (!cancelled) setNotices(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  // 아직 시작 안 된 공지는 서버(RLS)가 걸러주고, 여기서는 끝난 것만 더 걸러낸다.
  // 끝난 공지도 받아오는 이유는 "공지사항"에서 지난 것까지 보여주기 위해서다.
  //
  // 띠에 오르는 건 '중요'로 표시한 공지뿐이다. 이 자리는 하나뿐이고 평소에는 주변 매장
  // 안내가 쓰는데, 안내성 공지까지 끼어들면 정작 지금 쓸 수 있는 기프티콘이 가려진다.
  // 중요하지 않은 공지도 사라지지 않는다 — 종 옆 "공지사항"에는 그대로 쌓인다.
  const now = Date.now();
  const current = notices.find(
    (n) => n.is_important && (!n.ends_at || new Date(n.ends_at).getTime() > now) && !dismissed.includes(versionKey(n))
  );

  // 이 띠가 자리를 쓰고 있는지 바깥(App)에 알린다. 주변 매장 안내가 그걸 보고 비켜준다.
  useEffect(() => {
    onShownChange?.(Boolean(current));
  }, [current, onShownChange]);

  function dismiss(notice) {
    // 오래 쓰면 닫은 기록이 계속 쌓인다. 지난 공지는 다시 뜰 일이 없으므로 최근 것만 남긴다.
    const next = [...dismissed, versionKey(notice)].slice(-50);
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
        <button type="button" onClick={() => dismiss(current)} aria-label="공지 닫기" className="shrink-0 text-muted-foreground">
          <X className="size-4" />
        </button>
      </div>

      {listOpen && <NoticesSheet onClose={() => setListOpen(false)} />}
    </>
  );
}

// 공지를 어떻게 다룰지에 대한 판단만 모아둔다. 화면에서 떼어둔 이유는 이 규칙들이
// 세 군데서 쓰이기 때문이다 — 종(배지·말풍선), 알림 목록(맨 위 고정), 등록 버튼(막기).
// 세 군데가 각자 판단하면 하나를 고쳤을 때 나머지 둘이 조용히 어긋난다.

// 지금 게시 중인가. 아직 시작 안 한 글은 서버(RLS)가 걸러주지만, 여기서도 본다 —
// 관리자 미리보기처럼 서버를 안 거치고 들어오는 길이 생겨도 화면 규칙은 그대로여야 한다.
export function isLive(notice, now = Date.now()) {
  if (!notice) return false;
  const started = !notice.starts_at || new Date(notice.starts_at).getTime() <= now;
  const ended = Boolean(notice.ends_at) && new Date(notice.ends_at).getTime() <= now;
  return started && !ended;
}

// 최근에 올린 것이 위로. 종을 열었을 때 맨 위에 붙는 순서다.
function newestFirst(a, b) {
  return new Date(b.starts_at || 0).getTime() - new Date(a.starts_at || 0).getTime();
}

export function importantNotices(notices, now = Date.now()) {
  return (notices || []).filter((n) => n.is_important && isLive(n, now)).sort(newestFirst);
}

// 등록을 막는 공지. 점검·장애가 여기 든다.
//
// `is_important`와 나눠 둔 이유는, 유료화 안내도 중요 공지인데 그게 등록을 막으면 안 되기
// 때문이다. "꼭 봐야 하는가"와 "지금 그 기능이 되는가"는 다른 이야기다.
export function blockingNotice(notices, now = Date.now()) {
  return (notices || []).find((n) => n.blocks_upload && isLive(n, now)) || null;
}

// 종을 열면 맨 위에 고정할 것과, 목록에 섞일 것.
//
// 하나로 할까 했는데 둘로 뒀다. 성격이 다른 둘이 겹칠 때가 있다 — 점검 중인데 유료화
// 안내도 떠 있는 식이다. 셋이 되면 정작 가족 활동이 안 보이므로 거기서 끊는다.
export function splitPinned(important, max = 2) {
  const list = important || [];
  return { pinned: list.slice(0, max), rest: list.slice(max) };
}

export function unreadNotices(important, readIds) {
  const read = new Set(readIds || []);
  return (important || []).filter((n) => !read.has(n.id));
}

// 노출기한이 하루 안쪽일 때만 남은 시간을 적는다.
//
// 게시일자나 노출기한을 그대로 적으면 오해를 산다. 그건 운영하는 쪽 사정이지 사용자가
// 알고 싶은 날짜가 아니다. "유료화 안내 · 2026.09.30까지"라고 적혀 있으면 읽는 사람은
// 9월 30일에 유료화되나 하고 읽는다. 시행일은 본문에 적는다.
//
// 반대로 "오늘 4시까지"는 사용자에게 쓸모가 있다. 점검이 언제 끝나는지가 곧 언제부터
// 다시 등록할 수 있는지라서다.
export function remainingLabel(notice, now = Date.now()) {
  if (!notice?.ends_at) return '';
  const end = new Date(notice.ends_at).getTime();
  if (Number.isNaN(end) || end <= now) return '';
  if (end - now > 24 * 60 * 60 * 1000) return '';

  const endDate = new Date(end);
  const today = new Date(now);
  const sameDay =
    endDate.getFullYear() === today.getFullYear() &&
    endDate.getMonth() === today.getMonth() &&
    endDate.getDate() === today.getDate();

  const hour = endDate.getHours();
  const minute = endDate.getMinutes();
  const clock = minute ? `${hour}시 ${minute}분` : `${hour}시`;
  return `${sameDay ? '오늘' : '내일'} ${clock}까지`;
}

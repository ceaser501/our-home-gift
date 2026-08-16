import { describe, expect, it } from 'vitest';
import {
  blockingNotice,
  importantNotices,
  isLive,
  remainingLabel,
  splitPinned,
  unreadNotices,
} from '../utils/notices';

// 공지 규칙은 세 군데서 쓰인다 — 종(배지·말풍선), 알림 목록(맨 위 고정), 등록 버튼(막기).
// 셋이 각자 판단하면 하나를 고쳤을 때 나머지 둘이 조용히 어긋난다. 그래서 규칙만 여기 모았고,
// 이 파일이 그 규칙을 지킨다.

// 시각은 로컬 시간으로 짓는다. 화면이 "오늘 16시까지"라고 적을 때 쓰는 것도 로컬
// 시간이라, 여기서 UTC로 못박으면 이 테스트가 도는 기계의 시간대에 따라 갈린다.
function at(year, month, day, hour = 0, minute = 0) {
  return new Date(year, month - 1, day, hour, minute).toISOString();
}

const NOW = new Date(at(2026, 8, 16, 10)).getTime();

function notice(overrides) {
  return {
    id: 1,
    title: '안내',
    body: null,
    is_important: false,
    blocks_upload: false,
    starts_at: at(2026, 8, 1),
    ends_at: null,
    ...overrides,
  };
}

describe('isLive', () => {
  it('시작 전이면 아직 아니다', () => {
    expect(isLive(notice({ starts_at: at(2026, 8, 20) }), NOW)).toBe(false);
  });

  it('끝난 것은 아니다', () => {
    expect(isLive(notice({ ends_at: at(2026, 8, 15) }), NOW)).toBe(false);
  });

  it('끝 시각이 없으면 계속 남는다', () => {
    expect(isLive(notice({}), NOW)).toBe(true);
  });
});

describe('importantNotices', () => {
  it('중요 표시를 한 것만, 최근에 올린 것부터', () => {
    const rows = [
      notice({ id: 1, is_important: true, starts_at: at(2026, 8, 1) }),
      notice({ id: 2, is_important: false }),
      notice({ id: 3, is_important: true, starts_at: at(2026, 8, 10) }),
    ];
    expect(importantNotices(rows, NOW).map((n) => n.id)).toEqual([3, 1]);
  });

  it('끝난 것은 빼고 센다', () => {
    const rows = [notice({ id: 1, is_important: true, ends_at: at(2026, 8, 15) })];
    expect(importantNotices(rows, NOW)).toEqual([]);
  });
});

// 유료화 안내도 중요 공지인데 그게 등록을 막으면 안 된다. "꼭 봐야 하는가"와
// "지금 그 기능이 되는가"는 다른 이야기라 표시를 따로 뒀다.
describe('blockingNotice', () => {
  it('중요 표시만으로는 등록을 막지 않는다', () => {
    const rows = [notice({ id: 1, is_important: true })];
    expect(blockingNotice(rows, NOW)).toBeNull();
  });

  it('점검 표시를 한 것이 막는다', () => {
    const rows = [notice({ id: 1, blocks_upload: true })];
    expect(blockingNotice(rows, NOW)?.id).toBe(1);
  });

  it('점검이 끝나면 다시 열린다', () => {
    const rows = [notice({ id: 1, blocks_upload: true, ends_at: at(2026, 8, 16, 9) })];
    expect(blockingNotice(rows, NOW)).toBeNull();
  });
});

describe('splitPinned', () => {
  it('둘까지만 고정하고 나머지는 목록으로 내린다', () => {
    const list = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const { pinned, rest } = splitPinned(list);
    expect(pinned.map((n) => n.id)).toEqual([1, 2]);
    expect(rest.map((n) => n.id)).toEqual([3]);
  });
});

describe('unreadNotices', () => {
  it('읽은 것은 빼고 센다', () => {
    expect(unreadNotices([{ id: 1 }, { id: 2 }], [1]).map((n) => n.id)).toEqual([2]);
  });
});

// 게시일자나 노출기한을 그대로 적으면 오해를 산다. "유료화 안내 · 2026.09.30까지"는
// 9월 30일에 유료화된다는 말로 읽힌다. 하루 안쪽에 끝나는 것만, 남은 시간으로 적는다.
describe('remainingLabel', () => {
  it('오늘 안에 끝나면 오늘 몇 시까지', () => {
    expect(remainingLabel(notice({ ends_at: at(2026, 8, 16, 16) }), NOW)).toBe('오늘 16시까지');
  });

  it('분이 있으면 분까지 적는다', () => {
    expect(remainingLabel(notice({ ends_at: at(2026, 8, 16, 16, 30) }), NOW)).toBe('오늘 16시 30분까지');
  });

  it('날이 바뀌면 내일이라고 적는다', () => {
    expect(remainingLabel(notice({ ends_at: at(2026, 8, 17, 4) }), NOW)).toBe('내일 4시까지');
  });

  it('하루보다 멀면 아무 말도 안 한다', () => {
    expect(remainingLabel(notice({ ends_at: at(2026, 9, 30) }), NOW)).toBe('');
  });

  it('끝 시각이 없으면 아무 말도 안 한다', () => {
    expect(remainingLabel(notice({}), NOW)).toBe('');
  });
});

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';

// 종은 두 가지를 한 자리에서 센다 — 가족 활동과 운영자 공지. 사용자에게는 둘 다 그냥
// 안내라 숫자 하나로 합쳤고, 그래서 한쪽을 고치면 다른 쪽이 조용히 어긋나기 쉽다.

const listActivities = vi.fn();
const getActivityLastRead = vi.fn();
const listNotices = vi.fn();
const listNoticeReads = vi.fn();
const markActivitiesRead = vi.fn();
const markNoticesRead = vi.fn();

vi.mock('../api', () => ({
  listActivities: (...a) => listActivities(...a),
  getActivityLastRead: (...a) => getActivityLastRead(...a),
  listNotices: (...a) => listNotices(...a),
  listNoticeReads: (...a) => listNoticeReads(...a),
  markActivitiesRead: (...a) => markActivitiesRead(...a),
  markNoticesRead: (...a) => markNoticesRead(...a),
}));

vi.mock('../realtime', () => ({ subscribeToActivities: () => () => {} }));

vi.mock('../FamilyContext', () => ({
  useFamily: () => ({
    family: { id: 'fam-1', name: '우리가족' },
    members: [{ user_id: 'me', display_name: '아들', created_at: '2026-01-01T00:00:00Z' }],
    user: { id: 'me' },
  }),
}));

const { default: NotificationBell } = await import('../components/NotificationBell');

function notice(id, overrides = {}) {
  return {
    id,
    title: `공지 ${id}`,
    body: null,
    is_important: true,
    blocks_upload: false,
    starts_at: new Date(Date.now() - id * 60000).toISOString(),
    ends_at: null,
    ...overrides,
  };
}

function activity(id) {
  return {
    id,
    kind: 'created',
    actor_id: 'other',
    actor_name: '엄마',
    gifticon_name: `기프티콘 ${id}`,
    amount: null,
    created_at: new Date().toISOString(),
  };
}

const HINT = '중요 안내가 있어요';

function bellLabel() {
  return document.querySelector('button[aria-label^="알림"]');
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  listActivities.mockResolvedValue([]);
  getActivityLastRead.mockResolvedValue(null);
  listNotices.mockResolvedValue([]);
  listNoticeReads.mockResolvedValue([]);
  markActivitiesRead.mockResolvedValue(undefined);
  markNoticesRead.mockResolvedValue(undefined);
});

describe('NotificationBell', () => {
  // 색을 나누려다 접었다 — 색이 갈리면 "이 색이 무슨 뜻이지"를 새로 배워야 하는데,
  // 사용자에게는 둘 다 그냥 안내다. 열 개면 열 개다.
  it('배지가 활동과 공지를 함께 센다', async () => {
    listActivities.mockResolvedValue([activity(1), activity(2)]);
    listNotices.mockResolvedValue([notice(1)]);

    render(<NotificationBell />);
    expect(await screen.findByRole('button', { name: '알림 3개' })).toBeTruthy();
  });

  it('이미 읽은 공지는 세지 않는다', async () => {
    listNotices.mockResolvedValue([notice(1), notice(2)]);
    listNoticeReads.mockResolvedValue([1]);

    render(<NotificationBell />);
    expect(await screen.findByRole('button', { name: '알림 1개' })).toBeTruthy();
  });

  // 중요하지 않은 공지까지 종을 울리면, 정작 중요한 것이 왔을 때 안 쳐다본다.
  it('중요 표시가 없는 공지는 종을 울리지 않는다', async () => {
    listNotices.mockResolvedValue([notice(1, { is_important: false })]);

    render(<NotificationBell />);
    expect(await screen.findByRole('button', { name: '알림' })).toBeTruthy();
  });

  it('안 읽은 중요 공지가 있으면 말풍선을 띄운다', async () => {
    listNotices.mockResolvedValue([notice(1)]);

    render(<NotificationBell />);
    expect(await screen.findByText(HINT)).toBeTruthy();
  });

  // 앱을 하루에 네다섯 번 열 일이 없다. 열 때마다 뜨면 그건 안내가 아니라 방해다.
  it('같은 날 다시 열면 말풍선은 안 뜬다', async () => {
    listNotices.mockResolvedValue([notice(1)]);

    const { unmount } = render(<NotificationBell />);
    await screen.findByText(HINT);
    unmount();

    render(<NotificationBell />);
    await screen.findByRole('button', { name: '알림 1개' });
    expect(screen.queryByText(HINT)).toBeNull();
  });

  it('안 읽은 중요 공지가 없으면 말풍선도 없다', async () => {
    listNotices.mockResolvedValue([notice(1)]);
    listNoticeReads.mockResolvedValue([1]);

    render(<NotificationBell />);
    await screen.findByRole('button', { name: '알림' });
    expect(screen.queryByText(HINT)).toBeNull();
  });

  // 읽었다 = 종을 연 것. 공지가 맨 위에 고정돼 있어 열면 무조건 보인다.
  // 항목마다 따로 눌러 읽게 하면 숫자가 안 줄어드는 이유를 알기 어렵다.
  it('종을 열면 공지를 읽은 것으로 적고 배지가 준다', async () => {
    listNotices.mockResolvedValue([notice(1), notice(2)]);

    render(<NotificationBell />);
    await screen.findByRole('button', { name: '알림 2개' });

    // 창이 열린 뒤에는 바깥이 aria-hidden이 되어 역할로는 못 찾는다. 종은 창 바깥에
    // 있으므로 여기서부터는 DOM에서 직접 집는다.
    await act(async () => bellLabel().click());

    expect(markNoticesRead).toHaveBeenCalledWith([1, 2], 'me');
    await waitFor(() => expect(bellLabel().getAttribute('aria-label')).toBe('알림'));
  });

  // 셋이 되면 정작 가족 활동이 안 보인다. 넘치는 것은 목록에 시간순으로 섞인다.
  it('종을 열면 중요 공지를 맨 위에 두 개까지 고정한다', async () => {
    listNotices.mockResolvedValue([notice(1), notice(2), notice(3)]);

    render(<NotificationBell />);
    await screen.findByRole('button', { name: '알림 3개' });
    await act(async () => bellLabel().click());

    // 셋 다 보이기는 한다. 위 두 개가 고정 자리에 있고, 나머지는 아래 목록에 섞인다.
    const sheet = document.querySelector('[role="dialog"]');
    const pinned = sheet.querySelector('.sticky');
    expect([...pinned.querySelectorAll('p')].map((el) => el.textContent)).toEqual(['공지 1', '공지 2']);
    expect(sheet.textContent).toContain('공지 3');
  });
});

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// 알림 시트. 새 소식과 지난 소식을 가르고, 하나도 없으면 푸시 스위치를 내민다.

vi.mock('../utils/useBackClose', () => ({ default: () => {} }));
vi.mock('../FamilyContext', () => ({
  useFamily: () => ({ user: { id: 'me' }, family: { id: 'fam-1' } }),
}));
vi.mock('../push', () => ({
  isPushSupported: () => true,
  isPushEnabled: () => Promise.resolve(false),
  subscribeToPush: vi.fn(),
  unsubscribeFromPush: vi.fn(),
}));
vi.mock('../nativePush', () => ({
  isNativePushSupported: () => false,
  isNativePushEnabled: vi.fn(),
  enableNativePush: vi.fn(),
  disableNativePush: vi.fn(),
}));

const { default: ActivitySheet } = await import('../components/ActivitySheet');

// 읽은 시점. 이 뒤에 생긴 것이 '새 소식'이다.
const READ_AT = '2026-08-20T00:00:00Z';

function activity(id, at, extra = {}) {
  return {
    id,
    created_at: at,
    kind: 'used',
    gifticon_name: `기프티콘 ${id}`,
    actor_name: '아빠',
    ...extra,
  };
}

describe('새 소식 / 지난 소식', () => {
  it('안 읽은 것이 있으면 두 구역으로 나뉜다', () => {
    render(
      <ActivitySheet
        activities={[activity(1, '2026-08-21T00:00:00Z'), activity(2, '2026-08-19T00:00:00Z')]}
        lastReadAt={READ_AT}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('새 소식')).toBeTruthy();
    expect(screen.getByText('지난 소식')).toBeTruthy();
    // 구역 제목 옆 개수는 새것에만 붙는다. 지난 것이 몇 개인지는 셀 일이 없다.
    expect(screen.getByText('1')).toBeTruthy();
  });

  // 한쪽이 비어 있는 칸막이는 칸막이가 아니라 그냥 줄 하나다.
  it('안 읽은 것이 없으면 구역을 안 그린다', () => {
    render(
      <ActivitySheet
        activities={[activity(1, '2026-08-19T00:00:00Z')]}
        lastReadAt={READ_AT}
        onClose={vi.fn()}
      />
    );

    expect(screen.queryByText('새 소식')).toBeNull();
    expect(screen.queryByText('지난 소식')).toBeNull();
    expect(screen.getByText('기프티콘 1')).toBeTruthy();
  });

  it('금액은 굵게 따로 선다', () => {
    render(
      <ActivitySheet
        activities={[activity(1, '2026-08-21T00:00:00Z', { kind: 'spent', amount: 18000 })]}
        lastReadAt={READ_AT}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('18,000원').tagName).toBe('B');
  });
});

describe('고정 공지 카드', () => {
  // 남은 시간이 제목 아래 별도 줄이면 카드가 세 줄이 된다. 제목 옆에 붙여 두 줄로 끝낸다.
  //
  // 다만 제목이 밀려서 잘리면 안 된다. 무슨 공지인지를 말하는 유일한 줄이다. 그래서
  // flex로 칸을 나누지 않고 글자 흐름에 맡긴다 — 제목이 길면 남은 시간이 다음 줄로 넘어가고,
  // 제목은 어느 쪽에서도 온전하다.
  it('긴 제목도 안 잘리고, 남은 시간이 같은 문단에 흐른다', () => {
    const soon = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const long = '가족 참여 승인 기능이 생겼어요';
    render(
      <ActivitySheet
        activities={[]}
        pinnedNotices={[{ id: 'n1', title: long, body: '등록이 잠시 안 돼요', ends_at: soon }]}
        lastReadAt={READ_AT}
        onClose={vi.fn()}
      />
    );

    // remainingLabel은 '오늘 15시까지'처럼 적는다(utils/notices.js).
    const line = screen.getByText(/까지$/).closest('p');
    expect(line.textContent).toContain(long);
    expect(line.className).not.toContain('truncate');
  });

  it('확성기 대신 공지 뱃지가 붙는다', () => {
    render(
      <ActivitySheet
        activities={[]}
        pinnedNotices={[{ id: 'n1', title: '서버 점검 안내', body: '등록이 잠시 안 돼요' }]}
        lastReadAt={READ_AT}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('공지')).toBeTruthy();
  });
});

describe('알림이 하나도 없을 때', () => {
  // 알림이 없는 사람 중 상당수는 푸시가 꺼져 있어서 없는 것이다. 그 스위치는 내 메뉴
  // 안에 있어 이 화면과 이어지지 않는다.
  it('푸시 스위치를 여기서 바로 켤 수 있다', () => {
    render(<ActivitySheet activities={[]} lastReadAt={READ_AT} onClose={vi.fn()} />);

    expect(screen.getByText('아직 알림이 없어요')).toBeTruthy();
    const toggle = screen.getByText('푸시 알림 받기').closest('button');
    expect(toggle.getAttribute('role')).toBe('switch');
    expect(toggle.getAttribute('aria-checked')).toBe('false');
  });

  it('30일 안내는 쌓인 것이 있을 때만 나온다', () => {
    render(<ActivitySheet activities={[]} lastReadAt={READ_AT} onClose={vi.fn()} />);
    expect(screen.queryByText(/30일이 지난 알림/)).toBeNull();
  });
});

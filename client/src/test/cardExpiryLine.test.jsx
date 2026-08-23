import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// 카드의 기한 줄에 무엇이 서는지.
//
// 못 쓰는 카드(만료·사용완료)에는 D-day를 안 적는다. 썸네일이 이미 '기한만료'/'사용완료'라고
// 덮고 있어서, 그 옆에서 며칠 지났는지 세는 것은 같은 말을 두 번 하는 것이다.
// 날짜는 남긴다 — 언제까지였는지는 그래도 알아야 한다.

vi.mock('../FamilyContext', () => ({
  useFamily: () => ({
    members: [{ user_id: 'me', display_name: '태수', tag_color: 0 }],
    user: { id: 'me' },
  }),
}));

const { default: GifticonCard } = await import('../components/GifticonCard');

const GIFTICON = {
  id: 'g-1',
  name: '아메리카노',
  brand: '스타벅스',
  owner: '태수',
  expires_at: '2020-01-01',
  code: '1234567890',
  status: 'active',
};

function noop() {}

function renderCard(extra) {
  render(
    <ul>
      <GifticonCard
        gifticon={{ ...GIFTICON, ...extra }}
        onViewCode={noop}
        onViewImage={noop}
        onToggleUsed={noop}
        onEdit={noop}
        onDelete={noop}
        onFindStores={noop}
        onToggleClaim={noop}
        onExtend={noop}
        onSpend={noop}
      />
    </ul>
  );
}

describe('못 쓰는 카드에는 D-day가 없다', () => {
  it('기한이 지난 카드 — 날짜만 남는다', () => {
    renderCard();
    expect(screen.queryByText(/기한 만료/)).toBeNull();
    expect(screen.queryByText(/D-/)).toBeNull();
    expect(screen.queryByText('2020.01.01까지')).toBeTruthy();
  });

  // 사용완료는 기한이 남아 있어도 셀 이유가 없다. 이미 쓴 것이다.
  it('사용완료 카드 — 기한이 남아 있어도 D-day를 안 적는다', () => {
    renderCard({ status: 'used', expires_at: '2099-12-31' });
    expect(screen.queryByText(/D-/)).toBeNull();
    expect(screen.queryByText('2099.12.31까지')).toBeTruthy();
  });

  it('아직 쓸 수 있는 카드에는 D-day가 있다', () => {
    renderCard({ expires_at: '2099-12-31' });
    expect(screen.queryByText(/^D-\d+$/)).toBeTruthy();
  });
});

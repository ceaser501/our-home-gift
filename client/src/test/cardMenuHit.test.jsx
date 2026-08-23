import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// 카드의 ⋮(수정·삭제)이 눌리는지.
//
// 한 번 안 눌린 적이 있다. 카드 전체에 "어디를 눌러도 바코드가 열린다"는 판이
// absolute inset-0으로 깔려 있는데, ⋮ 에서 자리 잡기(relative)를 빼면 그 판 아래로
// 내려간다. 브라우저는 자리를 잡은 요소를 그렇지 않은 요소보다 늘 위에 그려서,
// 화면에는 멀쩡히 보이지만 누르면 바코드가 열린다.
//
// jsdom은 그림을 그리지 않아서 눌러보는 것으로는 이걸 못 잡는다. 그래서 어긋난
// 지점 하나를 그대로 본다 — ⋮ 이 자리를 잡고 있는가.

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
  amount: 4500,
  expires_at: '2099-12-31',
  code: '1234567890',
  status: 'active',
};

const POSITIONED = /(^|\s)(relative|absolute|fixed|sticky)(\s|$)/;

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
  return screen.getByLabelText('더 보기');
}

describe('카드의 ⋮ 은 바코드 판 위에 있다', () => {
  it('보통 카드', () => {
    expect(renderCard().className).toMatch(POSITIONED);
  });

  // 기한이 지난 카드는 바코드 판이 disabled라 눌림을 안 가져가지만, 자리는 그대로
  // 덮고 있다. 여기서도 ⋮ 은 위에 있어야 한다.
  it('기한이 지난 카드', () => {
    expect(renderCard({ expires_at: '2020-01-01' }).className).toMatch(POSITIONED);
  });
});

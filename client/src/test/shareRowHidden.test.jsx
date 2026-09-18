import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

// ⋮ 메뉴의 '공유'는 보낼 원본이 있을 때만 뜬다.
//
// 보내는 것이 원본 사진이라, 원본이 없으면 눌러봐야 보낼 것이 없다. 눌리는데 아무
// 일도 안 일어나는 버튼은 화면에서 제일 나쁜 것이다.
//
// 원본이 없는 경우가 둘이다.
//   - 직접 등록으로 사진 없이 넣은 것
//   - 오래 전에 써서 원본을 지운 것 (docs/after-launch.md 1번)
//
// 둘째가 이 시험이 있는 진짜 이유다. 그 청소는 넉 달 뒤에 돌기 시작하는데, 그때
// image_paths가 비워지면서 image_urls가 빈 배열이 된다. 지금은 안 걸리는 조건이라
// 손으로 확인할 방법이 없다.

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
  expires_at: '2099-12-31',
  code: '1234567890',
  status: 'active',
};

function noop() {}

function openMenu(extra) {
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
  fireEvent.click(screen.getByRole('button', { name: '더 보기' }));
}

const shareRow = () => screen.queryByText('공유');

describe('보내기 줄', () => {
  it('원본이 있으면 뜬다', () => {
    openMenu({ image_urls: ['https://x/a.jpg'] });
    expect(shareRow()).not.toBeNull();
  });

  it('원본이 없으면 감춘다 — 사진 없이 등록한 것', () => {
    openMenu({ image_urls: [] });
    expect(shareRow()).toBeNull();
  });

  it('원본이 없으면 감춘다 — 오래돼서 지운 것', () => {
    // 청소가 image_paths를 비우면 api.js가 image_urls를 빈 배열로 만든다.
    openMenu({ image_urls: [], thumb_image_url: 'https://x/thumb.jpg' });
    expect(shareRow()).toBeNull();
  });

  it('자리가 빈 배열이어도 감춘다', () => {
    // image_urls는 image_paths와 자리를 맞춰 두느라 못 받은 칸이 null로 온다
    // (api.js:87). 길이만 보고 판단하면 여기서 틀린다.
    openMenu({ image_urls: [null, null] });
    expect(shareRow()).toBeNull();
  });

  it('수정·삭제는 원본과 상관없이 늘 있다', () => {
    openMenu({ image_urls: [] });
    expect(screen.queryByText('수정')).not.toBeNull();
    expect(screen.queryByText('삭제')).not.toBeNull();
  });
});

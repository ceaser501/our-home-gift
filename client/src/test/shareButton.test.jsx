import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

// ⋯ 메뉴의 '공유'를 눌렀을 때.
//
// 브라우저는 '누른 직후'에만 공유 창을 열어준다. 누르고 나서 사진을 받고 액자를 그리면
// 그 시간이 지나서 창이 안 떴고, 한 번 더 누르면 그제야 떴다 — 2026-09-26 실기.
//
// 그래서 지키는 것은 둘이다.
//   - 메뉴가 열릴 때 파일을 미리 만들기 시작한다 (누르기 전에)
//   - 그래도 브라우저가 막으면 '한 번 더 눌러주세요'라고 말하고, 다시 누르면 새로
//     만들지 않고 바로 연다

const prepareShareImage = vi.fn();
const sharePrepared = vi.fn();
const saveGifticonImage = vi.fn();

vi.mock('../utils/shareGifticon', () => ({
  prepareShareImage: (...a) => prepareShareImage(...a),
  sharePrepared: (...a) => sharePrepared(...a),
  saveGifticonImage: (...a) => saveGifticonImage(...a),
}));
vi.mock('../FamilyContext', () => ({
  useFamily: () => ({ members: [{ user_id: 'me', display_name: '태수', tag_color: 0 }], user: { id: 'me' } }),
}));

const { default: GifticonCard } = await import('../components/GifticonCard');

const GIFTICON = {
  id: 'g-1', name: '아메리카노', brand: '스타벅스', owner: '태수', expires_at: '2099-12-31',
  code: '1234567890', status: 'active', image_urls: ['https://x/a.jpg'],
};

function noop() {}
function openMenu() {
  render(
    <ul>
      <GifticonCard gifticon={GIFTICON} onViewCode={noop} onViewImage={noop} onToggleUsed={noop}
        onEdit={noop} onDelete={noop} onFindStores={noop} onToggleClaim={noop} onExtend={noop} onSpend={noop} />
    </ul>
  );
  fireEvent.click(screen.getByRole('button', { name: '더 보기' }));
}
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

beforeEach(() => {
  vi.clearAllMocks();
  prepareShareImage.mockResolvedValue({ file: 'FILE' });
});

describe('공유 누르기', () => {
  it('⚠️ 메뉴가 열리면 누르기 전에 파일을 만들기 시작한다', async () => {
    openMenu();
    await flush();
    expect(prepareShareImage).toHaveBeenCalledWith({ url: 'https://x/a.jpg', name: '아메리카노' });
    expect(sharePrepared).not.toHaveBeenCalled();
  });

  it('누르면 미리 만든 파일로 연다 — 새로 만들지 않는다', async () => {
    sharePrepared.mockResolvedValue('shared');
    openMenu();
    await flush();
    await act(async () => { fireEvent.click(screen.getByText('공유')); });
    expect(sharePrepared).toHaveBeenCalledWith({ file: 'FILE' });
    expect(prepareShareImage).toHaveBeenCalledTimes(1);
  });

  it('브라우저가 막으면 한 번 더 누르라고 하고, 다시 누르면 바로 연다', async () => {
    sharePrepared.mockResolvedValueOnce('expired').mockResolvedValueOnce('shared');
    openMenu();
    await flush();
    await act(async () => { fireEvent.click(screen.getByText('공유')); });
    expect(screen.getByText('준비됐어요. 한 번 더 눌러주세요.')).toBeTruthy();

    await act(async () => { fireEvent.click(screen.getByText('공유')); });
    expect(sharePrepared).toHaveBeenCalledTimes(2);
    expect(prepareShareImage).toHaveBeenCalledTimes(1);
  });

  it('준비하다 실패하면 알리고, 다음 누름에 새로 만든다', async () => {
    prepareShareImage.mockRejectedValueOnce(new Error('사진을 받지 못했어요'));
    openMenu();
    await flush();
    await act(async () => { fireEvent.click(screen.getByText('공유')); });
    expect(screen.getByText('사진을 받지 못했어요')).toBeTruthy();
    expect(prepareShareImage).toHaveBeenCalledTimes(2);
  });
});

// 공유 밑의 '저장'. 폰이 따로 창을 띄우지 않으니 됐는지를 이 창이 말한다.
describe('저장 누르기', () => {
  it('누르면 사진첩에 넣고, 저장했다고 말한다', async () => {
    saveGifticonImage.mockResolvedValue('saved');
    openMenu();
    // 메뉴가 열리며 시작한 준비(모듈 불러오기)가 끝난 뒤에 누른다. 공유 시험과 같다 —
    // 시험에서는 둘이 겹치면 가짜 대신 진짜 모듈이 잡혔다.
    await flush();
    fireEvent.click(screen.getByText('저장'));
    expect(await screen.findByText('사진첩에 저장했어요.')).toBeTruthy();
    expect(saveGifticonImage).toHaveBeenCalledWith({ url: 'https://x/a.jpg', name: '아메리카노' });
  });

  it('사진 권한이 없으면 설정에서 허용하라고 한다', async () => {
    saveGifticonImage.mockResolvedValue('denied');
    openMenu();
    // 메뉴가 열리며 시작한 준비(모듈 불러오기)가 끝난 뒤에 누른다. 공유 시험과 같다 —
    // 시험에서는 둘이 겹치면 가짜 대신 진짜 모듈이 잡혔다.
    await flush();
    fireEvent.click(screen.getByText('저장'));
    expect(await screen.findByText('설정에서 사진 권한을 허용해주세요.')).toBeTruthy();
  });
});

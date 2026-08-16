import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

// 등록 화면에서 보는 것은 하나다 — 여러 장을 한 번에 넣을 수 있다는 걸 화면이 말해주는가.
// 기능은 진작 있었는데 화면에 흔적이 없어서, 해보기 전에는 알 수가 없었다.

const prepareImages = vi.fn();
const readGifticonInfo = vi.fn();

vi.mock('../utils/imageAnalyze', () => ({
  prepareImages: (...args) => prepareImages(...args),
  readGifticonInfo: (...args) => readGifticonInfo(...args),
}));

const groupImages = vi.fn();
vi.mock('../utils/gallery', () => ({ groupImages: (...a) => groupImages(...a) }));

vi.mock('../api', () => ({
  createGifticon: vi.fn(async () => ({ id: 'new' })),
  updateGifticon: vi.fn(async () => ({ id: 'old' })),
  searchPrice: vi.fn(),
  findGifticonByCode: vi.fn(async () => null),
  findLookalikeGifticon: vi.fn(async () => null),
}));

vi.mock('../FamilyContext', () => ({
  useFamily: () => ({
    family: { id: 'fam-1', name: '우리가족' },
    members: [{ user_id: 'me', display_name: '아들', created_at: '2026-01-01T00:00:00Z' }],
    user: { id: 'me' },
  }),
}));

const { default: UploadSheet } = await import('../components/UploadSheet');

const NOOP = () => {};

function open(props = {}) {
  return render(
    <UploadSheet mode="create" onClose={NOOP} onSaved={NOOP} onBulk={NOOP} {...props} />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  groupImages.mockResolvedValue({ candidates: [], missed: [], scanned: 0, tally: {} });
  prepareImages.mockResolvedValue({
    code: '111',
    codeType: 'CODE_128',
    barcodeCropBlob: null,
    storageFiles: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })],
    uploads: [{ mediaType: 'image/jpeg', data: 'AAAA' }],
  });
  readGifticonInfo.mockResolvedValue({
    code: '111',
    codeType: 'CODE_128',
    codeConflict: null,
    thumbCropBlob: null,
    category: '카페',
    brand: '스타벅스',
    amount: null,
    expiresAt: '2026-12-31',
    name: '아메리카노',
    isVoucher: false,
  });
});

describe('UploadSheet 여러 장 안내', () => {
  it('새로 등록할 때 사진 자리가 여러 칸으로 보이고 한 줄로 설명한다', () => {
    open();
    expect(screen.getByText(/기프티콘별로 나눠 담아요/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /사진 고르기/ })).toBeTruthy();
  });

  // 안내는 화면에 적힌 약속이다. 고르는 창이 한 장만 받으면 그 약속이 거짓말이 된다.
  it('사진 고르는 창이 여러 장을 받는다', () => {
    open();
    expect(document.querySelector('#gifticon-image').multiple).toBe(true);
  });

  // 수정 화면에서 고른 사진은 지금 보고 있는 그 한 건에 붙는다. 거기서 "나눠 담아요"는
  // 사실이 아니다.
  it('수정 화면에서는 안내하지 않는다', () => {
    open({ mode: 'edit', initial: { id: 'g1', name: '아메리카노', image_paths: [], image_urls: [] }, onBulk: undefined });
    expect(screen.queryByText(/기프티콘별로 나눠 담아요/)).toBeNull();
  });

  // 한 번 넣고 나면 이미 아는 사람이다. 빈 칸 둘은 그때부터 자리만 차지한다.
  it('사진이 붙으면 안내를 걷고 평소 격자로 돌아간다', async () => {
    open();
    const input = document.querySelector('#gifticon-image');

    fireEvent.change(input, {
      target: { files: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })] },
    });

    await waitFor(() => expect(screen.queryByText(/기프티콘별로 나눠 담아요/)).toBeNull());
    expect(screen.getByRole('button', { name: /이미지 추가/ })).toBeTruthy();
  });
});

// 여러 장을 올렸을 때 이 창이 스스로 판단하는 것은 하나다 — 지금 손에 있는 사진들이
// 한 건인가 여러 건인가. 그 판단에 "몇 장인가"는 쓰지 않는다. 바코드가 몇 종류인가만 본다.
describe('여러 장을 올렸을 때 한 건인지 가르는 기준', () => {
  it('바코드가 한 종류면 바코드 없는 사진까지 같이 읽는다', async () => {
    // 원본 + 바코드 스크린샷(같은 번호) + 정보성 스크린샷(바코드 없음).
    // 정보성 사진은 후보가 아니라 missed로 빠지지만, 후보가 하나뿐이므로 이 창에 남는다.
    groupImages.mockResolvedValue({
      candidates: [{ id: 'pick-0', code: '111' }],
      missed: [{ id: 'pick-2' }],
      scanned: 3,
      tally: {},
    });

    const onBulk = vi.fn();
    open({ onBulk });
    fireEvent.change(document.querySelector('#gifticon-image'), {
      target: {
        files: [
          new File(['x'], '원본.jpg', { type: 'image/jpeg' }),
          new File(['x'], '바코드캡처.jpg', { type: 'image/jpeg' }),
          new File(['x'], '정보캡처.jpg', { type: 'image/jpeg' }),
        ],
      },
    });

    await waitFor(() => expect(prepareImages).toHaveBeenCalled());
    expect(onBulk).not.toHaveBeenCalled();
    // 세 장이 통째로 넘어가야 한다. 모델이 셋을 한 번에 보고 답을 합친다.
    expect(prepareImages.mock.calls[0][0]).toHaveLength(3);
  });

  it('바코드가 두 종류면 다건 화면으로 넘긴다', async () => {
    groupImages.mockResolvedValue({
      candidates: [{ id: 'pick-0', code: '111' }, { id: 'pick-1', code: '222' }],
      missed: [{ id: 'pick-2' }],
      scanned: 3,
      tally: {},
    });

    const onBulk = vi.fn();
    open({ onBulk });
    fireEvent.change(document.querySelector('#gifticon-image'), {
      target: {
        files: [
          new File(['x'], 'a.jpg', { type: 'image/jpeg' }),
          new File(['x'], 'b.jpg', { type: 'image/jpeg' }),
          new File(['x'], '정보캡처.jpg', { type: 'image/jpeg' }),
        ],
      },
    });

    await waitFor(() => expect(onBulk).toHaveBeenCalled());
    expect(prepareImages).not.toHaveBeenCalled();
  });
});

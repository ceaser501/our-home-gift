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
    groupImages
      .mockResolvedValueOnce({
        candidates: [{ id: 'pick-0', code: '111' }],
        missed: [{ id: 'pick-2', file: new File(['x'], '정보캡처.jpg', { type: 'image/jpeg' }) }],
        scanned: 3,
        tally: {},
      })
      // 못 읽은 사진을 정밀하게 다시 봐도 바코드가 없다. 진짜 정보성 사진이다.
      .mockResolvedValueOnce({ candidates: [], missed: [], scanned: 1, tally: {} });

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

  // 배스킨 카드처럼 막대가 뭉개져 못 읽는 것, 파인트 쿠폰처럼 바코드 없이 번호만
  // 인쇄된 것 — 둘 다 번호를 모를 뿐 기프티콘이다. 곁가지로 치면 스타벅스 하나에 그
  // 사진이 얹혀서, 거기 적힌 상품명과 기한이 스타벅스 것으로 들어간다.
  //
  // 그림만 봐서는 곁가지인지 딴 물건인지 못 가른다. 서버에 한 장씩 물어본다.
  it('못 읽은 사진에서 번호가 나오면 다건으로 넘긴다', async () => {
    groupImages
      .mockResolvedValueOnce({
        candidates: [{ id: 'pick-0', code: '111' }],
        missed: [{ id: 'pick-1', bars: false, file: new File(['x'], 'pint.jpg', { type: 'image/jpeg' }) }],
        scanned: 2,
        tally: {},
      })
      .mockResolvedValueOnce({ candidates: [], missed: [{ id: 'pick-1', bars: false }], scanned: 1, tally: {} });
    // 물어보니 번호가 나온다 — 곁가지가 아니라 딴 물건이다.
    readGifticonInfo.mockResolvedValue({ code: '92009951402228', name: '파인트 아이스크림' });

    const onBulk = vi.fn();
    open({ onBulk });
    fireEvent.change(document.querySelector('#gifticon-image'), {
      target: {
        files: [
          new File(['x'], 'starbucks.jpg', { type: 'image/jpeg' }),
          new File(['x'], 'pint.jpg', { type: 'image/jpeg' }),
        ],
      },
    });

    await waitFor(() => expect(onBulk).toHaveBeenCalled());
  });

  // 같은 자리에서 갈리는 다른 쪽. 번호가 안 나오면 곁가지다 — 예전처럼 등록 폼으로
  // 가고, 사진 전부를 한 번에 보여준다. 그래야 정보 캡처의 금액이 채워진다.
  it('번호가 안 나오면 곁가지로 보고 등록 폼에서 함께 읽는다', async () => {
    groupImages
      .mockResolvedValueOnce({
        candidates: [{ id: 'pick-0', code: '111' }],
        missed: [{ id: 'pick-1', bars: false, file: new File(['x'], 'info.jpg', { type: 'image/jpeg' }) }],
        scanned: 2,
        tally: {},
      })
      .mockResolvedValueOnce({ candidates: [], missed: [{ id: 'pick-1', bars: false }], scanned: 1, tally: {} });
    readGifticonInfo.mockResolvedValue({ code: null, name: '' });

    const onBulk = vi.fn();
    open({ onBulk });
    fireEvent.change(document.querySelector('#gifticon-image'), {
      target: {
        files: [
          new File(['x'], 'starbucks.jpg', { type: 'image/jpeg' }),
          new File(['x'], 'info.jpg', { type: 'image/jpeg' }),
        ],
      },
    });

    await waitFor(() => expect(prepareImages).toHaveBeenCalled());
    expect(onBulk).not.toHaveBeenCalled();
    // 두 장이 통째로 넘어가야 한다. 나눠 보내면 금액이 무엇의 금액인지 알 수 없다.
    const lastCall = prepareImages.mock.calls[prepareImages.mock.calls.length - 1];
    expect(lastCall[0]).toHaveLength(2);
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

// 얕은 판은 일부러 약하다(1600px, 정밀 탐색 없음). 사진첩 훑기는 그 뒤에 정밀한 판을 한 번
// 더 돌려 놓친 것을 건지는데, 등록 창에는 그 두 번째가 없었다. 그래서 흐릿하게 찍힌
// 기프티콘 한 장이 안 읽히면 두 건이 한 건으로 보였고, 서로 다른 기프티콘의 사진이 통째로
// 합쳐져 남의 금액과 기한이 들어갔다.
describe('얕게 봐서 한 건으로 보일 때', () => {
  const FILES = [
    new File(['x'], 'a.jpg', { type: 'image/jpeg' }),
    new File(['x'], 'b.jpg', { type: 'image/jpeg' }),
  ];

  function pick(files = FILES) {
    open({ onBulk });
    fireEvent.change(document.querySelector('#gifticon-image'), { target: { files } });
  }

  let onBulk;
  beforeEach(() => {
    onBulk = vi.fn();
  });

  it('못 읽은 사진을 정밀하게 다시 보고, 두 건이면 나눈다', async () => {
    groupImages
      .mockResolvedValueOnce({
        candidates: [{ id: 'pick-0', code: '111' }],
        missed: [{ id: 'pick-1', file: FILES[1] }],
        scanned: 2,
        tally: {},
      })
      .mockResolvedValueOnce({
        candidates: [{ id: 'pick-1', code: '222' }],
        missed: [],
        scanned: 1,
        tally: {},
      });

    pick();

    await waitFor(() => expect(onBulk).toHaveBeenCalled());
    // 두 번째 판은 못 읽은 사진만 본다. 정밀 탐색은 느려서, 이미 읽힌 것까지 다시 돌리면
    // 잘 되던 경우가 같이 느려진다.
    expect(groupImages.mock.calls[1][0]).toEqual([FILES[1]]);
    // 이미 찾은 번호는 다시 후보로 만들지 않는다. 안 그러면 한 건이 두 건으로 세어진다.
    expect([...groupImages.mock.calls[1][1].skipCodes]).toEqual(['111']);
  });

  it('정밀하게 봐도 바코드가 없으면 한 건 그대로 둔다', async () => {
    groupImages
      .mockResolvedValueOnce({
        candidates: [{ id: 'pick-0', code: '111' }],
        missed: [{ id: 'pick-1', file: FILES[1] }],
        scanned: 2,
        tally: {},
      })
      .mockResolvedValueOnce({ candidates: [], missed: [], scanned: 1, tally: {} });

    pick();

    await waitFor(() => expect(prepareImages).toHaveBeenCalled());
    expect(onBulk).not.toHaveBeenCalled();
  });

  // 얕은 판이 다 읽었으면 더 볼 것이 없다. 여기서 또 정밀하게 돌면 잘 되던 경우가 느려진다.
  it('못 읽은 사진이 없으면 다시 보지 않는다', async () => {
    groupImages.mockResolvedValue({
      candidates: [{ id: 'pick-0', code: '111' }],
      missed: [],
      scanned: 2,
      tally: {},
    });

    pick();

    await waitFor(() => expect(prepareImages).toHaveBeenCalled());
    expect(groupImages).toHaveBeenCalledTimes(1);
  });
});

describe('사용기한이 지난 기프티콘', () => {
  // 폼 밑의 빨간 줄은 저장 버튼만 보던 눈에 안 들어왔다. 얼럿으로 묻는다.
  it('저장을 막고 얼럿으로 말한다', async () => {
    readGifticonInfo.mockResolvedValue({
      code: '111',
      codeType: 'CODE_128',
      codeConflict: null,
      thumbCropBlob: null,
      category: '카페',
      brand: '스타벅스',
      amount: null,
      expiresAt: '2020-01-01',
      name: '아메리카노',
      isVoucher: false,
    });

    open();
    fireEvent.change(document.querySelector('#gifticon-image'), {
      target: { files: [new File(['x'], '원본.jpg', { type: 'image/jpeg' })] },
    });
    // 읽어온 값이 폼에 앉을 때까지 기다린다.
    await waitFor(() => expect(document.querySelector('#f-name').value).toBe('아메리카노'));

    fireEvent.click(screen.getByText('저장하기'));

    expect(await screen.findByText('사용기한이 지났어요')).toBeTruthy();
  });
});

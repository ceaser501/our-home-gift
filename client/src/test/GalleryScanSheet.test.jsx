import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// 이 창은 사진첩(네이티브)·모델(서버)·캔버스에 기대고 있다. 셋 다 여기서는 못 돈다.
// 그래서 그 셋만 가짜로 두고, 창 자신의 코드는 진짜로 돌린다 — 지금까지 터진 곳이
// 전부 창 자신이었기 때문이다. 가짜를 창 안쪽까지 들이면 정작 볼 것이 안 남는다.

const scanGallery = vi.fn();
const deepScan = vi.fn();
const readGifticonInfo = vi.fn();
const createGifticon = vi.fn();
const findGifticonByCode = vi.fn();

vi.mock('../utils/gallery', async () => {
  const actual = await vi.importActual('../utils/gallery');
  return {
    // 폴더 이름 정리처럼 사진첩을 안 건드리는 것은 진짜를 쓴다.
    FOLDERS: actual.FOLDERS,
    summarizeFolders: actual.summarizeFolders,
    getGalleryStatus: vi.fn(async () => ({ supported: true, granted: true, partial: false })),
    requestGalleryAccess: vi.fn(async () => ({ supported: true, granted: true, partial: false })),
    scanGallery: (...args) => scanGallery(...args),
    deepScan: (...args) => deepScan(...args),
    candidateToFiles: vi.fn(() => [new File(['x'], 'a.jpg', { type: 'image/jpeg' })]),
    dismissImages: vi.fn(),
    undismissImages: vi.fn(),
    countSkipped: vi.fn(() => 0),
    forgetSkipped: vi.fn(),
  };
});

vi.mock('../utils/imageAnalyze', () => ({
  // 캔버스와 zxing이 도는 자리. jsdom에는 캔버스가 없다.
  prepareImages: vi.fn(async () => ({
    code: null,
    codeType: null,
    barcodeCropBlob: null,
    storageFiles: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })],
    uploads: [{ mediaType: 'image/jpeg', data: 'AAAA' }],
  })),
  readGifticonInfo: (...args) => readGifticonInfo(...args),
}));

vi.mock('../api', () => ({
  createGifticon: (...args) => createGifticon(...args),
  findGifticonByCode: (...args) => findGifticonByCode(...args),
  removeImages: vi.fn(async () => {}),
  uploadGifticonImages: vi.fn(async () => ({
    image_paths: ['p/1.jpg'],
    barcode_image_path: null,
    thumb_image_path: null,
  })),
}));

vi.mock('../FamilyContext', () => ({
  useFamily: () => ({
    family: { id: 'fam-1', name: '우리가족' },
    members: [{ user_id: 'me', display_name: '아들', created_at: '2026-01-01T00:00:00Z' }],
    user: { id: 'me' },
  }),
}));

const { default: GalleryScanSheet } = await import('../components/GalleryScanSheet');

function candidate(id, code) {
  return {
    id,
    name: `${id}.jpg`,
    bucket: 'KakaoTalk',
    addedAt: 1_770_000_000,
    code,
    codeType: 'CODE_128',
    images: ['AAAA'],
    shots: null,
    readyNow: false,
  };
}

function info(code, name) {
  return {
    code,
    codeType: 'CODE_128',
    codeConflict: null,
    thumbCropBlob: null,
    category: '카페',
    brand: '스타벅스',
    amount: null,
    expiresAt: '2026-12-31',
    name,
    isVoucher: false,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  findGifticonByCode.mockResolvedValue(null);
  createGifticon.mockResolvedValue({ id: 'new' });
  readGifticonInfo.mockImplementation(async (_prepared, opts) =>
    info(opts?.knownCode || '111', `상품 ${opts?.knownCode || '111'}`)
  );
  deepScan.mockResolvedValue({ candidates: [] });
  scanGallery.mockResolvedValue({
    supported: true,
    granted: true,
    partial: false,
    candidates: [candidate('a', '111'), candidate('b', '222')],
    pending: [],
    scanned: 12,
    since: 1_770_000_000,
    folders: [{ name: 'KakaoTalk', count: 12 }],
    tally: { readFailed: 0, found: 2, alreadyHave: 0 },
  });
});

describe('GalleryScanSheet', () => {
  // 이 하나가 흰 화면을 잡는다. 렌더 도중에 죽는 실수(선언 전에 참조하는 것 등)는
  // 화면 전체를 내려버리는데, 오류 화면도 없이 그냥 하얘져서 앱이 안 켜진 것처럼 보인다.
  // 실제로 그렇게 한 판이 나갔다.
  it('열리기만 해도 죽지 않는다', async () => {
    render(<GalleryScanSheet onRegistered={() => {}} onClose={() => {}} />);
    expect(await screen.findByText('기프티콘 찾기')).toBeTruthy();
  });

  // 이 하나가 "0%에서 멈춤"을 잡는다. start()는 async라서 그 안에서 던져진 오류는
  // 조용한 거절로 끝난다 — 화면은 "잠시만요"인 채로 영영 서 있고, 콘솔에도 안 뜬다.
  it('훑기를 시작하면 끝까지 돌아 목록이 나온다', async () => {
    render(<GalleryScanSheet onRegistered={() => {}} onClose={() => {}} />);
    (await screen.findByRole('button', { name: /사진 허용하고 찾기/ })).click();

    await waitFor(() => expect(scanGallery).toHaveBeenCalled(), { timeout: 3000 });
    expect(await screen.findByText('상품 111', {}, { timeout: 3000 })).toBeTruthy();
    expect(await screen.findByText('상품 222')).toBeTruthy();
  });

  // 오늘 이것 때문에 같은 기프티콘이 두 번 들어갔다. 훑기는 A로 묻고 등록은 B로 했다.
  // 터지는 실수가 아니라 어긋나는 실수라, 짚어두지 않으면 다음에도 그냥 지나간다.
  it('등록하는 번호가 후보를 묶은 번호와 같다', async () => {
    // 모델이 인쇄된 숫자를 다르게 읽은 상황. 그래도 막대 번호로 들어가야 한다.
    readGifticonInfo.mockImplementation(async (_prepared, opts) => info(opts?.knownCode, '상품'));

    render(<GalleryScanSheet onRegistered={() => {}} onClose={() => {}} />);
    (await screen.findByRole('button', { name: /사진 허용하고 찾기/ })).click();
    (await screen.findByRole('button', { name: /개 등록/ }, { timeout: 3000 })).click();

    await waitFor(() => expect(createGifticon).toHaveBeenCalledTimes(2), { timeout: 3000 });

    const saved = createGifticon.mock.calls.map(([, fields]) => fields.code).sort();
    expect(saved).toEqual(['111', '222']);

    // 넣기 직전에 그 번호로 물어봤는지. 이게 마지막 문이다.
    const asked = findGifticonByCode.mock.calls.map(([, code]) => code);
    expect(asked).toContain('111');
    expect(asked).toContain('222');
  });

  // 이미 있는 번호는 넣지 않는다.
  it('이미 등록된 번호는 넣지 않는다', async () => {
    findGifticonByCode.mockImplementation(async (_family, code) => (code === '111' ? { id: 'old' } : null));

    render(<GalleryScanSheet onRegistered={() => {}} onClose={() => {}} />);
    (await screen.findByRole('button', { name: /사진 허용하고 찾기/ })).click();
    (await screen.findByRole('button', { name: /개 등록/ }, { timeout: 3000 })).click();

    await waitFor(() => expect(createGifticon).toHaveBeenCalledTimes(1), { timeout: 3000 });
    expect(createGifticon.mock.calls[0][1].code).toBe('222');
  });
});

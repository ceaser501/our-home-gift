import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

// 이 창은 사진첩(네이티브)·모델(서버)·캔버스에 기대고 있다. 셋 다 여기서는 못 돈다.
// 그래서 그 셋만 가짜로 두고, 창 자신의 코드는 진짜로 돌린다 — 지금까지 터진 곳이
// 전부 창 자신이었기 때문이다. 가짜를 창 안쪽까지 들이면 정작 볼 것이 안 남는다.

const scanGallery = vi.fn();
const deepScan = vi.fn();
const readGifticonInfo = vi.fn();
const createGifticon = vi.fn();
const findGifticonByCode = vi.fn();
const groupImages = vi.fn();

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
    groupImages: (...args) => groupImages(...args),
    candidateToFiles: vi.fn(() => [new File(['x'], 'a.jpg', { type: 'image/jpeg' })]),
    dismissImages: vi.fn(),
    undismissImages: vi.fn(),
    countSkipped: vi.fn(() => 0),
    forgetSkipped: vi.fn(),
  };
});

vi.mock('../utils/imageAnalyze', () => ({
  // 캔버스와 zxing이 도는 자리. jsdom에는 캔버스가 없다.
  // 넘겨받은 사진 수를 그대로 들고 나간다. 몇 장을 함께 보고 읽었는지가 답을 가르는
  // 자리가 있어서다 — 금액만 적힌 캡처는 혼자 보면 무엇의 금액인지 알 수 없다.
  prepareImages: vi.fn(async (files) => {
    const shots = files?.length ? files : [new File(['x'], 'a.jpg', { type: 'image/jpeg' })];
    return {
      code: null,
      codeType: null,
      barcodeCropBlob: null,
      storageFiles: shots,
      uploads: shots.map(() => ({ mediaType: 'image/jpeg', data: 'AAAA' })),
    };
  }),
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

  // 결과 화면에서 같은 이유를 되풀이해 적던 자리. 다섯 번 읽어도 새로 아는 것이 없고,
  // 그 다섯 줄이 정작 '몇 개를 넣었다'는 소식을 화면 밖으로 밀어냈다.
  it('못 넣은 것은 이유별로 한 번만 적고, 넣은 개수가 먼저 온다', async () => {
    // 하나는 들어가고 하나는 기한이 지났다.
    readGifticonInfo.mockImplementation(async (_prepared, opts) => ({
      ...info(opts?.knownCode, `상품 ${opts?.knownCode}`),
      expiresAt: opts?.knownCode === '222' ? '2020-01-01' : '2026-12-31',
    }));

    render(<GalleryScanSheet onRegistered={() => {}} onClose={() => {}} />);
    (await screen.findByRole('button', { name: /사진 허용하고 찾기/ })).click();
    (await screen.findByRole('button', { name: /1개 등록/ }, { timeout: 3000 })).click();

    expect(await screen.findByText('1개를 등록했어요', {}, { timeout: 3000 })).toBeTruthy();
    expect(screen.getByText('1개는 등록하지 못했어요')).toBeTruthy();
    // 접혀 있을 때는 이유가 요약 한 줄로만 있다.
    expect(screen.getByText('모두 사용기한이 지났어요')).toBeTruthy();
  });

  // 빠진 칸이 하나 있다고 그 건만 따로 처음부터 다시 하게 할 이유가 없다.
  // 여덟 장을 한 번에 넣으러 온 사람에게는 그게 일이 늘어난 것이다.
  it('못 읽은 칸을 직접 채우면 그 카드도 등록에 낀다', async () => {
    readGifticonInfo.mockImplementation(async (_prepared, opts) => {
      const read = info(opts?.knownCode, `상품 ${opts?.knownCode}`);
      // 111은 상품명을 못 읽었다.
      return opts?.knownCode === '111' ? { ...read, name: '' } : read;
    });

    render(<GalleryScanSheet onRegistered={() => {}} onClose={() => {}} />);
    (await screen.findByRole('button', { name: /사진 허용하고 찾기/ })).click();

    // 못 읽은 카드는 처음에는 등록에서 빠져 있다.
    expect(await screen.findByRole('button', { name: /1개 등록/ }, { timeout: 3000 })).toBeTruthy();

    // 넣을 수 없는 것은 접혀 있다. 펼쳐야 채우는 자리가 나온다.
    fireEvent.click(await screen.findByText(/정보를 못 읽었어요/));
    (await screen.findByRole('button', { name: /채우기/ })).click();
    fireEvent.change(await screen.findByPlaceholderText('예: 아이스 아메리카노 T'), {
      target: { value: '손으로 적은 상품' },
    });

    // 채우고 나면 둘 다 들어간다.
    (await screen.findByRole('button', { name: /2개 등록/ })).click();
    await waitFor(() => expect(createGifticon).toHaveBeenCalledTimes(2), { timeout: 3000 });

    const saved = createGifticon.mock.calls.map(([, f]) => f.name);
    expect(saved).toContain('손으로 적은 상품');
  });

  // 제목이 내용과 다른 말을 하면 안 된다. 기한이 지난 셋을 놓고 '정보를 못 읽었어요'라고
  // 적어두면, 읽기가 잘못된 줄 알고 사진을 다시 찍으러 간다.
  it('기한이 지난 것만 남으면 제목도 기한을 말한다', async () => {
    readGifticonInfo.mockImplementation(async (_prepared, opts) => ({
      ...info(opts?.knownCode, `상품 ${opts?.knownCode}`),
      expiresAt: '2020-01-01',
    }));

    render(<GalleryScanSheet onRegistered={() => {}} onClose={() => {}} />);
    (await screen.findByRole('button', { name: /사진 허용하고 찾기/ })).click();

    // 접은 제목에 한 번, 줄마다 한 번씩 — 셋 다 같은 사연이라 같은 말이 나온다.
    expect(await screen.findAllByText(/사용기한이 지났어요/, {}, { timeout: 3000 })).toHaveLength(3);
    expect(screen.queryByText(/정보를 못 읽었어요/)).toBeNull();
    // 채워봐야 그대로 막힌다. 채우라고 하지 않는다.
    expect(screen.queryByRole('button', { name: /채우기/ })).toBeNull();
  });

  // 하루 한도나 인터넷이 끊긴 것은 조금 뒤에 풀린다. 창을 닫고 처음부터 다시 하게
  // 할 이유가 없다.
  it('읽다가 막힌 건은 그 자리에서 다시 읽을 수 있다', async () => {
    let first = true;
    readGifticonInfo.mockImplementation(async (_prepared, opts) => {
      if (opts?.knownCode === '111' && first) {
        first = false;
        throw new Error('오늘은 여기까지예요');
      }
      return info(opts?.knownCode, `상품 ${opts?.knownCode}`);
    });

    render(<GalleryScanSheet onRegistered={() => {}} onClose={() => {}} />);
    (await screen.findByRole('button', { name: /사진 허용하고 찾기/ })).click();

    // 서버가 보낸 말이 그대로 남는다. 카드와 위쪽 안내 두 곳에 나온다.
    expect((await screen.findAllByText('오늘은 여기까지예요', {}, { timeout: 3000 })).length).toBeGreaterThan(0);

    (await screen.findByRole('button', { name: /다시 읽기/ })).click();
    expect(await screen.findByText('상품 111', {}, { timeout: 3000 })).toBeTruthy();
    expect(await screen.findByRole('button', { name: /2개 등록/ })).toBeTruthy();
  });

  // 사진을 받아 온 판. 훑기와 같은 화면을 쓰지만 사진첩을 훑지는 않아야 하고,
  // 여기가 등록하는 자리라는 것이 화면에 보여야 한다.
  it('사진을 받아 오면 훑지 않고 그 사진만 묶는다', async () => {
    groupImages.mockResolvedValue({
      candidates: [candidate('a', '111'), candidate('b', '222')],
      missed: [],
      scanned: 3,
      tally: { readFailed: 0, found: 2, alreadyHave: 0 },
    });

    const files = [new File(['x'], '1.jpg'), new File(['x'], '2.jpg'), new File(['x'], '3.jpg')];
    render(<GalleryScanSheet files={files} onRegistered={() => {}} onClose={() => {}} />);

    // 사진첩은 건드리지 않는다.
    await waitFor(() => expect(groupImages).toHaveBeenCalled(), { timeout: 3000 });
    expect(scanGallery).not.toHaveBeenCalled();

    // 목록이 아니라 등록하는 자리임이 화면에 적힌다.
    expect(await screen.findByText('기프티콘 등록')).toBeTruthy();
    expect((await screen.findAllByText(/고른 사진/)).length).toBeGreaterThan(0);

    (await screen.findByRole('button', { name: /2개 등록/ }, { timeout: 3000 })).click();
    await waitFor(() => expect(createGifticon).toHaveBeenCalledTimes(2), { timeout: 3000 });
  });

  // 못 읽은 사진은 일단 다 후보로 세워 서버에 물어본다. 답이 오면 둘로 갈린다.
  //
  // 여기는 곁가지인 쪽. 번호가 없으니 딴 물건이 아니고, 번호가 있는 후보가 하나뿐이라
  // 붙을 곳도 하나다. 그 카드에 빈칸을 채우고 사진을 옮긴 뒤 접는다.
  it('번호가 없는 사진은 하나뿐인 후보에 접어 넣는다', async () => {
    groupImages.mockResolvedValue({
      candidates: [candidate('a', '111')],
      missed: [{ id: 'm1', name: 'info.jpg', bucket: null, addedAt: 1, bars: false, data: 'BBBB' }],
      scanned: 2,
      tally: { readFailed: 0, found: 1, alreadyHave: 0, noCode: 1 },
    });
    // 원본만 혼자 보면 금액이 없고, 정보 캡처와 나란히 놓고 봐야 채워진다.
    readGifticonInfo.mockImplementation(async (prepared, opts) => {
      if (opts?.knownCode !== '111') return { ...info(null, ''), code: null, name: '', amount: '5000' };
      const together = prepared.uploads.length > 1;
      return { ...info('111', '아이스 아메리카노'), amount: together ? '5000' : null };
    });

    const files = [new File(['x'], '1.jpg'), new File(['x'], '2.jpg')];
    render(<GalleryScanSheet files={files} onRegistered={() => {}} onClose={() => {}} />);

    // 카드는 하나로 접힌다.
    (await screen.findByRole('button', { name: /1개 등록/ }, { timeout: 3000 })).click();

    await waitFor(() => expect(createGifticon).toHaveBeenCalledTimes(1), { timeout: 3000 });
    const saved = createGifticon.mock.calls[0][1];
    expect(saved.name).toBe('아이스 아메리카노');
    // 곁가지에만 있던 금액이 채워진다. 이미 읽힌 상품명은 그대로다.
    expect(saved.amount).toBe('5000');
  });

  // 같은 자리에서 갈리는 다른 쪽. 바코드 없이 번호만 인쇄된 기프티콘이 있다
  // (파인트 아이스크림 쿠폰). 서버가 번호를 읽어내면 곁가지가 아니라 딴 물건이다.
  it('번호가 나오면 별도 기프티콘으로 세운다', async () => {
    groupImages.mockResolvedValue({
      candidates: [candidate('a', '111')],
      missed: [{ id: 'm1', name: 'pint.jpg', bucket: null, addedAt: 1, bars: false, data: 'BBBB' }],
      scanned: 2,
      tally: { readFailed: 0, found: 1, alreadyHave: 0, noCode: 1 },
    });
    readGifticonInfo.mockImplementation(async (_prepared, opts) =>
      opts?.knownCode === '111' ? info('111', '아이스 아메리카노') : info('92009951402228', '파인트 아이스크림')
    );

    const files = [new File(['x'], '1.jpg'), new File(['x'], '2.jpg')];
    render(<GalleryScanSheet files={files} onRegistered={() => {}} onClose={() => {}} />);

    expect(await screen.findByText('파인트 아이스크림', {}, { timeout: 3000 })).toBeTruthy();
    (await screen.findByRole('button', { name: /2개 등록/ }, { timeout: 3000 })).click();
    await waitFor(() => expect(createGifticon).toHaveBeenCalledTimes(2), { timeout: 3000 });
  });

  // 붙일 곳이 둘이면 곁가지는 말없이 뺀다.
  //
  // 카드로 남겨두면 "바코드 번호를 못 읽었어요"가 목록에 걸려서, 사용자는 앱이 뭔가
  // 실패한 줄 안다. 실은 곁가지를 발라낸 것이다.
  it('붙일 곳이 여럿이면 곁가지 카드를 남기지 않는다', async () => {
    groupImages.mockResolvedValue({
      candidates: [candidate('a', '111'), candidate('b', '222')],
      missed: [{ id: 'm1', name: 'info.jpg', bucket: null, addedAt: 1, bars: false, data: 'BBBB' }],
      scanned: 3,
      tally: { readFailed: 0, found: 2, alreadyHave: 0, noCode: 1 },
    });
    readGifticonInfo.mockImplementation(async (_prepared, opts) =>
      opts?.knownCode ? info(opts.knownCode, `상품 ${opts.knownCode}`) : { ...info(null, ''), code: null, name: '' }
    );

    const files = [new File(['x'], '1.jpg'), new File(['x'], '2.jpg'), new File(['x'], '3.jpg')];
    render(<GalleryScanSheet files={files} onRegistered={() => {}} onClose={() => {}} />);

    expect(await screen.findByRole('button', { name: /2개 등록/ }, { timeout: 3000 })).toBeTruthy();
    expect(screen.queryByText(/바코드 번호/)).toBeNull();
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

// 막대에서 읽은 번호와 사진에 인쇄된 숫자가 갈려도 아무 말도 하지 않는다.
//
// 훑기에서는 그 경고가 구조적으로 헛경보다. 후보 자체가 막대에서 읽은 번호로 묶여서
// 만들어지므로(client/src/utils/gallery.js의 seenCodes) 인쇄된 숫자는 어디에도 쓰이지
// 않는다. 안 쓰는 값이 틀렸다고 알리는 셈이고, 헛경보가 반복되면 진짜 경고도 안 읽힌다.
describe('번호가 갈렸을 때', () => {
  it('아무 말도 하지 않는다', async () => {
    readGifticonInfo.mockImplementation(async (_prepared, opts) => ({
      ...info(opts?.knownCode || '111', '상품'),
      code: '119',
    }));

    render(<GalleryScanSheet onRegistered={() => {}} onClose={() => {}} />);
    await screen.findAllByText('상품', {}, { timeout: 3000 });

    expect(screen.queryByText(/사진과 맞는지 확인해주세요/)).toBeNull();
    expect(screen.queryByText('번호 고치기')).toBeNull();
  });
});

// 바코드 없이 정보만 있는 사진은 어느 기프티콘 것인지 알 수 없어서 뺀다. 짐작해서 붙이면
// 틀릴 때 엉뚱한 기프티콘에 남의 금액과 기한이 박힌다 — 조용히 틀리는 쪽이 훨씬 나쁘다.
// 다만 뺐다는 말은 해야 한다. 안 하면 사용자는 금액이 빈칸인 걸 보고 "왜 안 읽혔지" 한다.
describe('바코드 없는 사진을 뺐을 때', () => {
  const FILES = [new File(['x'], 'a.jpg', { type: 'image/jpeg' })];

  // tooSmall로 센다. 바코드가 없는 사진은 이제 안내에 안 적힌다 — 후보로 세워 서버에
  // 물어보고 카드가 스스로 말하기 때문이다(foldRescued).
  function grouped(tooSmall) {
    return {
      candidates: [candidate('a', '111'), candidate('b', '222')],
      missed: [],
      scanned: 3,
      tally: { readFailed: 0, found: 2, alreadyHave: 0, noCode: 0, tooSmall },
    };
  }

  it('몇 장을 왜 뺐는지 말해준다', async () => {
    groupImages.mockResolvedValue(grouped(1));

    render(<GalleryScanSheet files={FILES} onRegistered={() => {}} onClose={() => {}} />);

    expect(await screen.findByText('못 넣은 사진이 있어요', {}, { timeout: 3000 })).toBeTruthy();
    expect(screen.getByText(/바코드가 너무 작게 찍힌 사진 1장/)).toBeTruthy();
  });

  it('뺀 게 없으면 아무 말도 안 한다', async () => {
    groupImages.mockResolvedValue(grouped(0));

    render(<GalleryScanSheet files={FILES} onRegistered={() => {}} onClose={() => {}} />);
    await screen.findAllByText(/상품 /, {}, { timeout: 3000 });

    expect(screen.queryByText('못 넣은 사진이 있어요')).toBeNull();
  });
});

import { describe, expect, it, vi, beforeEach } from 'vitest';

// 기프티콘을 앱 밖으로 보내기.
//
// 여기서 보는 것은 '무엇을 보내는가'가 아니라 **무슨 일이 있었는지를 부르는 쪽이
// 알 수 있는가**다. 공유는 폰이 창을 띄우는 일이라 실제로 보내졌는지는 우리가 알 수
// 없고, 우리가 책임질 수 있는 것은 취소와 실패를 구분해 돌려주는 것까지다.
//
// 캔버스는 시험 환경에 없다. 그래서 띠를 못 그리는데, 그때 아무것도 안 보내고 멈추면
// 안 된다 — 원본이라도 나가야 한다. 그 갈래가 이 파일의 절반이다.

const share = vi.fn();
const writeFile = vi.fn();
let native = false;

vi.mock('../utils/browser', async (importOriginal) => ({
  ...(await importOriginal()),
  isNativeApp: () => native,
}));

vi.mock('@capacitor/share', () => ({ Share: { share: (...a) => share(...a) } }));
vi.mock('@capacitor/filesystem', () => ({
  Filesystem: { writeFile: (...a) => writeFile(...a) },
  Directory: { Cache: 'CACHE' },
}));

const { shareGifticonImage } = await import('../utils/shareGifticon');

const JPEG = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' });

beforeEach(() => {
  vi.clearAllMocks();
  native = false;
  // 캔버스가 없으니 composeShareImage가 null을 돌려주고, 원본을 그대로 받아온다.
  global.fetch = vi.fn().mockResolvedValue({ blob: async () => JPEG });
  writeFile.mockResolvedValue({ uri: 'file:///cache/share/1-스타벅스.jpg' });
  delete navigator.canShare;
  delete navigator.share;
});

describe('웹에서 보내기', () => {
  it('공유 창이 없는 기기에서는 unsupported를 돌려준다', async () => {
    const how = await shareGifticonImage({ url: 'https://x/a.jpg', name: '스타벅스' });
    expect(how).toBe('unsupported');
  });

  it('공유 창이 있으면 파일로 넘긴다', async () => {
    navigator.canShare = () => true;
    navigator.share = vi.fn().mockResolvedValue(undefined);

    const how = await shareGifticonImage({ url: 'https://x/a.jpg', name: '스타벅스 아메리카노' });

    expect(how).toBe('shared');
    const [{ files }] = navigator.share.mock.calls[0];
    expect(files[0].name).toBe('스타벅스 아메리카노.jpg');
  });

  it('공유 창을 그냥 닫은 것은 실패가 아니다', async () => {
    navigator.canShare = () => true;
    const abort = new Error('취소');
    abort.name = 'AbortError';
    navigator.share = vi.fn().mockRejectedValue(abort);

    await expect(shareGifticonImage({ url: 'https://x/a.jpg', name: '김' })).resolves.toBe('cancelled');
  });

  it('그 밖의 실패는 그대로 올린다', async () => {
    navigator.canShare = () => true;
    navigator.share = vi.fn().mockRejectedValue(new Error('보내지 못했어요'));

    await expect(shareGifticonImage({ url: 'https://x/a.jpg', name: '김' })).rejects.toThrow(
      '보내지 못했어요'
    );
  });
});

describe('앱에서 보내기', () => {
  beforeEach(() => {
    native = true;
  });

  it('파일로 떨군 뒤 그 경로를 넘긴다', async () => {
    share.mockResolvedValue(undefined);

    const how = await shareGifticonImage({ url: 'https://x/a.jpg', name: '스타벅스' });

    expect(how).toBe('shared');
    // 폰의 공유 창은 blob을 모른다. 경로가 가야 한다.
    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({ files: ['file:///cache/share/1-스타벅스.jpg'] })
    );
    const [{ directory, path }] = writeFile.mock.calls[0];
    expect(directory).toBe('CACHE');
    expect(path).toContain('스타벅스.jpg');
  });

  it('창을 닫은 것은 실패가 아니다', async () => {
    share.mockRejectedValue(new Error('Share canceled'));
    await expect(shareGifticonImage({ url: 'https://x/a.jpg', name: '김' })).resolves.toBe('cancelled');
  });
});

describe('파일 이름', () => {
  beforeEach(() => {
    navigator.canShare = () => true;
    navigator.share = vi.fn().mockResolvedValue(undefined);
  });

  const nameOf = async (name) => {
    await shareGifticonImage({ url: 'https://x/a.jpg', name });
    return navigator.share.mock.calls.at(-1)[0].files[0].name;
  };

  it('경로에 못 쓰는 글자를 털어낸다', async () => {
    // 받는 사람 사진첩에 남는 이름이라, 이게 깨지면 저장이 통째로 실패한다.
    expect(await nameOf('스타벅스/아메리카노*T')).toBe('스타벅스아메리카노T.jpg');
  });

  it('이름이 없으면 기프티콘으로 둔다', async () => {
    expect(await nameOf('')).toBe('기프티콘.jpg');
    expect(await nameOf(null)).toBe('기프티콘.jpg');
  });

  it('너무 긴 이름은 자른다', async () => {
    const long = '가'.repeat(80);
    const got = await nameOf(long);
    expect(got).toBe('가'.repeat(40) + '.jpg');
  });
});

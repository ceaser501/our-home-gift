import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';

// 점검 중에 등록을 막는 자리. 규칙 자체는 notices.test.js가 지키고, 여기서는 그 규칙이
// 실제로 버튼에 걸려 있는지만 본다 — 규칙이 맞아도 버튼에 안 걸려 있으면 아무 일도 안 한다.

const listNotices = vi.fn();

vi.mock('../api', () => ({
  // 한 장 넣어둔다. 빈 목록은 첫 화면(FirstRunScreen)으로 갈려서 오른쪽 아래 버튼이
  // 없는데, 이 파일이 보는 것은 그 버튼에 점검 규칙이 걸려 있는가다.
  listGifticons: vi.fn(async () => [
    { id: 1, name: '아메리카노', category: '카페', status: 'active', expires_at: '2026-12-31' },
  ]),
  updateGifticon: vi.fn(),
  deleteGifticon: vi.fn(),
  claimGifticon: vi.fn(),
  releaseGifticon: vi.fn(),
  spendVoucher: vi.fn(),
  listNotices: (...a) => listNotices(...a),
}));

vi.mock('../realtime', () => ({
  subscribeToGifticons: () => () => {},
  subscribeToFamily: () => () => {},
  subscribeToNotices: () => () => {},
}));

vi.mock('../utils/version', () => ({ hasNewVersion: vi.fn(async () => false) }));
vi.mock('../utils/shareTarget', () => ({
  hasSharedImages: () => false,
  takeSharedImages: vi.fn(async () => []),
  discardSharedImages: vi.fn(),
}));

// 훑기는 앱으로 설치했을 때만 있다. 여기서는 켠 것으로 두고 그 버튼도 막히는지 본다.
vi.mock('../utils/gallery', () => ({
  isGalleryScanSupported: () => true,
  autoScanDue: () => false,
  markAutoScanRan: () => {},
}));

vi.mock('../FamilyContext', () => ({
  useFamily: () => ({
    family: { id: 'fam-1', name: '우리가족' },
    members: [{ user_id: 'me', display_name: '아들', created_at: '2026-01-01T00:00:00Z' }],
    user: { id: 'me' },
    dataVersion: 0,
    refreshFamily: vi.fn(async () => {}),
  }),
}));

// 화면을 채우는 것들은 여기서 볼 것이 아니다. 등록 창과 훑기 창만 떴는지 알면 된다.
const stub = (name) => ({ default: () => <div data-testid={name} /> });
vi.mock('../components/Header', () => stub('header'));
vi.mock('../components/FilterBar', () => stub('filter'));
vi.mock('../components/GifticonList', () => stub('list'));
vi.mock('../components/InstallPrompt', () => stub('install'));
vi.mock('../components/NearbyBanner', () => stub('nearby'));
vi.mock('../components/PullToRefresh', () => stub('pull'));
vi.mock('../components/UploadSheet', () => stub('upload-sheet'));
vi.mock('../components/GalleryScanSheet', () => stub('scan-sheet'));
vi.mock('../components/FamilySwitcherSheet', () => stub('switcher'));

const { default: App } = await import('../App');

function notice(overrides) {
  return {
    id: 1,
    title: '점검 중이에요',
    body: '오늘 밤 서버를 손봅니다.',
    is_important: true,
    blocks_upload: true,
    starts_at: new Date(Date.now() - 60000).toISOString(),
    ends_at: null,
    ...overrides,
  };
}

async function openApp(notices) {
  listNotices.mockResolvedValue(notices);
  render(<App />);
  // 공지를 다 읽어온 뒤부터가 이 테스트의 출발점이다.
  await waitFor(() => expect(listNotices).toHaveBeenCalled());
  await act(async () => {});
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('점검 중 등록 막기', () => {
  it('평소에는 + 를 누르면 등록 창이 열린다', async () => {
    await openApp([]);
    await act(async () => screen.getByRole('button', { name: '기프티콘 추가' }).click());
    expect(screen.getByTestId('upload-sheet')).toBeTruthy();
  });

  // "점검 중"이라고 해놓고 누를 수 있으면 눌러보고 실패한다. 두 번 실망시키는 셈이다.
  it('점검 중에는 등록 창 대신 그 공지를 보여준다', async () => {
    await openApp([notice()]);
    await act(async () => screen.getByRole('button', { name: '기프티콘 추가' }).click());

    expect(screen.queryByTestId('upload-sheet')).toBeNull();
    expect(screen.getByText('점검 중이에요')).toBeTruthy();
    expect(screen.getByText('오늘 밤 서버를 손봅니다.')).toBeTruthy();
  });

  it('갤러리 훑기도 같이 막는다', async () => {
    await openApp([notice()]);
    await act(async () => screen.getByRole('button', { name: '갤러리에서 기프티콘 찾기' }).click());

    expect(screen.queryByTestId('scan-sheet')).toBeNull();
    expect(screen.getByText('점검 중이에요')).toBeTruthy();
  });

  // 유료화 안내도 중요 공지다. 그게 등록을 막으면 안 된다.
  it('중요 공지라도 점검 표시가 없으면 막지 않는다', async () => {
    await openApp([notice({ blocks_upload: false })]);
    await act(async () => screen.getByRole('button', { name: '기프티콘 추가' }).click());
    expect(screen.getByTestId('upload-sheet')).toBeTruthy();
  });

  // 바코드를 띄우러 온 사람은 공지가 있는 줄도 모르고 잘 쓰고 나가야 한다.
  // 앱을 열자마자 막아서는 창은 만들지 않는다.
  it('앱을 열자마자 막아서지는 않는다', async () => {
    await openApp([notice()]);
    expect(screen.queryByText('점검 중이에요')).toBeNull();
  });
});

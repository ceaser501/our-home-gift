import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

// 주변 매장 목록. 계산대 앞이 아니라 "어디서 쓰지"를 정하는 자리라, 여기서 잘리거나
// 안 눌리면 기프티콘이 그대로 기한을 넘긴다.

const searchNearbyStores = vi.fn();

vi.mock('../api', () => ({ searchNearbyStores: (...a) => searchNearbyStores(...a) }));
vi.mock('../utils/tmap', () => ({ openTmapRoute: vi.fn() }));
vi.mock('../components/StoreDetailSheet', () => ({
  default: ({ store }) => <div>상세: {store.name}</div>,
}));

vi.mock('../utils/geolocation', () => ({
  SIGNIFICANT_MOVE_M: 300,
  distanceBetween: () => 0,
  getFreshPosition: async () => ({ lat: 37.5, lng: 127 }),
  readCachedPosition: () => null,
  saveCachedPosition: () => {},
}));

const { default: NearbyStoresSheet } = await import('../components/NearbyStoresSheet');

function store(n, extra = {}) {
  return { id: `s${n}`, name: `매장 ${n}`, address: `서울시 어딘가 ${n}`, distance: n * 100, lat: 37.5, lng: 127, ...extra };
}

beforeEach(() => {
  vi.clearAllMocks();
});

function open() {
  return render(<NearbyStoresSheet gifticon={{ brand: '스타벅스', name: '아메리카노' }} onClose={() => {}} />);
}

describe('주변 매장', () => {
  // 세 곳에서 자르던 자리다. 집 근처·회사 근처처럼 일부러 먼 매장을 고르는 사람이
  // 갈 곳을 못 찾는다.
  it('세 곳에서 자르지 않고 끝까지 낸다', async () => {
    searchNearbyStores.mockResolvedValue([1, 2, 3, 4, 5, 6].map((n) => store(n)));

    open();

    expect(await screen.findByText('매장 6')).toBeTruthy();
  });

  // 180m / 1.2km가 잘리면 며칠까지인지를 잃는 것과 같다 — 여기 온 이유가 그 숫자다.
  it('거리가 줄바꿈되지 않는다', async () => {
    searchNearbyStores.mockResolvedValue([store(1), store(12)]);

    open();
    await screen.findByText('매장 12');

    // 시트는 포털로 그려져서 container 밖에 있다. screen으로 찾는다.
    expect(screen.getByText('1.2km').className).toContain('whitespace-nowrap');
  });

  // 첫 카드는 숫자와 단위를 세로로 쌓는다. 한 줄로 두면 'm'이 내려앉는다.
  it('첫 카드는 숫자와 단위를 따로 세운다', async () => {
    searchNearbyStores.mockResolvedValue([store(1), store(2)]);

    open();

    expect(await screen.findByText('100')).toBeTruthy();
    expect(screen.getByText('m')).toBeTruthy();
    expect(screen.getByText('가장 가까움')).toBeTruthy();
  });

  // 전화를 눌렀는데 상세까지 열리면, 통화 중에 뒤에서 창이 하나 더 뜬다.
  it('전화를 눌러도 상세가 열리지 않는다', async () => {
    searchNearbyStores.mockResolvedValue([store(1), store(2, { phone: '02-1234-5678' })]);

    open();
    fireEvent.click(await screen.findByLabelText('매장 2에 전화 걸기'));

    await waitFor(() => expect(screen.queryByText('상세: 매장 2')).toBeNull());
  });

  // 아래 목록 줄은 전화 버튼만 테두리를 갖고 있어서, 줄 전체가 눌린다는 신호가
  // 오른쪽 › 하나뿐이다. 그 한 줄이 그걸 메운다.
  it('목록 위에 안내 한 줄이 있다', async () => {
    searchNearbyStores.mockResolvedValue([store(1), store(2)]);

    open();

    expect(await screen.findByText('매장을 누르면 지도가 열려요')).toBeTruthy();
    expect(screen.getByText('가까운 순')).toBeTruthy();
  });

  // 전화번호 숫자 줄은 걷었다. 옆에 전화 버튼이 있어 눈으로 읽을 일이 없다.
  it('목록에 전화번호 숫자를 적지 않는다', async () => {
    searchNearbyStores.mockResolvedValue([store(1), store(2, { phone: '02-1234-5678' })]);

    open();
    await screen.findByText('매장 2');

    expect(screen.queryByText('02-1234-5678')).toBeNull();
  });
});

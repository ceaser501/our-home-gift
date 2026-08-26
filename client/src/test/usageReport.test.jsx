import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

// 사용 내역. 가족이 넷이면 스무 줄이 넘어가는 자리라, 사람으로 거르고 나머지는
// 접어 두는 것이 이 화면의 뼈대다.

const listUsageHistory = vi.fn();
const listGifticonStats = vi.fn(async () => []);

vi.mock('../api', () => ({
  listUsageHistory: (...a) => listUsageHistory(...a),
  listGifticonStats: (...a) => listGifticonStats(...a),
}));

vi.mock('../FamilyContext', () => ({
  useFamily: () => ({
    family: { id: 'fam-1', name: '우리가족' },
    members: [
      { user_id: 'me', display_name: '아들', tag_color: 0 },
      { user_id: 'mom', display_name: '엄마', tag_color: 1 },
      { user_id: 'dad', display_name: '아빠', tag_color: 2 },
    ],
    user: { id: 'me' },
  }),
}));

const { default: UsageReportSheet } = await import('../components/UsageReportSheet');

function used(n, who) {
  return {
    id: `u${n}`,
    name: `기프티콘 ${n}`,
    amount: 5300,
    owner: who,
    used_by_name: who,
    used_at: `2026-08-${String(10 + n).padStart(2, '0')}`,
    updated_at: `2026-08-${String(10 + n).padStart(2, '0')}`,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  listGifticonStats.mockResolvedValue([]);
});

function open() {
  return render(<UsageReportSheet onClose={() => {}} />);
}

// 라딕스 셀렉트는 pointerdown으로 열린다. click만으로는 목록이 안 나온다.
function openFilter() {
  fireEvent.pointerDown(screen.getByLabelText('누가 쓴 것만 볼까요'), {
    button: 0,
    ctrlKey: false,
    pointerType: 'mouse',
  });
}

// '2개'는 '누가 썼나요' 줄에도 있다. 제목 옆에 붙은 것만 본다.
function listedCount() {
  return screen.getByText('사용한 기프티콘').nextElementSibling.textContent;
}

describe('사용 내역', () => {
  // 이름이 '아들'이면 그게 나인지 동생인지 알 수 없다.
  it("누가 썼나요에 내 이름만 '나' 딱지가 붙는다", async () => {
    listUsageHistory.mockResolvedValue([used(1, '아들'), used(2, '엄마')]);

    open();
    await screen.findByText('누가 썼나요');

    expect(screen.getAllByText('나')).toHaveLength(1);
    // 딱지는 이름 바로 옆에 있어야 누구 것인지 이어진다.
    expect(screen.getByText('나').parentElement.textContent).toBe('아들나');
  });

  // 다섯 줄까지만 펼쳐두고 나머지는 개수를 적은 버튼 하나로 넘긴다.
  it('여섯 줄부터는 남은 개수를 적은 버튼으로 접는다', async () => {
    listUsageHistory.mockResolvedValue([1, 2, 3, 4, 5, 6, 7].map((n) => used(n, '아들')));

    open();
    await screen.findByText('기프티콘 1');

    expect(screen.queryByText('기프티콘 6')).toBeNull();
    // '더 보기'만 있으면 몇 개가 더 있는지 몰라 누를지 말지를 못 정한다.
    fireEvent.click(screen.getByRole('button', { name: /2개 더 보기/ }));

    expect(screen.getByText('기프티콘 6')).toBeTruthy();
    expect(screen.getByText('기프티콘 7')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /더 보기/ })).toBeNull();
  });

  it('다섯 줄 이하면 더 보기가 없다', async () => {
    listUsageHistory.mockResolvedValue([1, 2, 3].map((n) => used(n, '아들')));

    open();
    await screen.findByText('기프티콘 3');

    expect(screen.queryByRole('button', { name: /더 보기/ })).toBeNull();
  });

  it('사람을 고르면 그 사람 것만 남고 개수도 같이 바뀐다', async () => {
    listUsageHistory.mockResolvedValue([used(1, '아들'), used(2, '엄마'), used(3, '엄마')]);

    open();
    await screen.findByText('기프티콘 1');
    expect(listedCount()).toBe('3개');

    openFilter();
    fireEvent.click(await screen.findByRole('option', { name: '엄마' }));

    await waitFor(() => expect(screen.queryByText('기프티콘 1')).toBeNull());
    expect(screen.getByText('기프티콘 2')).toBeTruthy();
    expect(listedCount()).toBe('2개');
  });

  // 걸러서 세 줄이 됐는데 '더 보기'가 남아 있으면 눌러도 아무 일이 없다.
  it('사람을 바꾸면 펼쳐둔 것이 다시 접힌다', async () => {
    const rows = [1, 2, 3, 4, 5, 6, 7].map((n) => used(n, '아들'));
    rows.push(used(8, '엄마'));
    listUsageHistory.mockResolvedValue(rows);

    open();
    await screen.findByText('기프티콘 1');
    fireEvent.click(screen.getByRole('button', { name: /3개 더 보기/ }));
    expect(screen.getByText('기프티콘 7')).toBeTruthy();

    openFilter();
    fireEvent.click(await screen.findByRole('option', { name: '엄마' }));
    await waitFor(() => expect(listedCount()).toBe('1개'));

    openFilter();
    fireEvent.click(await screen.findByRole('option', { name: '가족 전체' }));

    await waitFor(() => expect(screen.getByRole('button', { name: /3개 더 보기/ })).toBeTruthy());
  });

  // 가족을 나간 사람의 기록만 골라 볼 길이 없어지면 안 된다.
  it('가족 명단에 없는 이름도 필터에 올라온다', async () => {
    listUsageHistory.mockResolvedValue([used(1, '아들'), used(2, '삼촌')]);

    open();
    await screen.findByText('기프티콘 2');

    openFilter();

    expect(await screen.findByRole('option', { name: '삼촌' })).toBeTruthy();
    // 아직 하나도 안 쓴 가족도 골라볼 수 있어야 한다.
    expect(screen.getByRole('option', { name: '아빠' })).toBeTruthy();
  });
});

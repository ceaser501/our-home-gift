import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';

// 탈퇴가 막힌 이유는 화면 밖에 적어야 한다.
//
// 원래는 내 메뉴 안에서 창을 띄웠는데, 탈퇴는 데이터부터 지우기 때문에 그 순간 나는
// '가족이 없는 사람'이 되고 화면이 통째로 갈아끼워진다. 창은 그 화면 안에 있었으니
// 세워지자마자 같이 사라졌다 — 눌러도 아무것도 안 남는 것처럼 보였다.
//
// 그래서 이 테스트가 보는 것은 문구의 내용이 아니라 문구가 어디에 적히느냐다.

const invoke = vi.fn();
const signOut = vi.fn();

vi.mock('../supabaseClient', () => ({
  supabase: {
    functions: { invoke: (...a) => invoke(...a) },
    auth: { signOut: (...a) => signOut(...a) },
  },
}));

const { deleteAccount, readDeleteError, DELETE_ERROR_KEY } = await import('../auth');
const { default: DeleteAccountError } = await import('../components/DeleteAccountError');

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  signOut.mockResolvedValue({ error: null });
});

function serverSaid(message, status = 500) {
  invoke.mockResolvedValue({
    data: null,
    error: { message: 'non-2xx status code', context: { status, json: async () => ({ error: message }) } },
  });
}

describe('탈퇴 실패 기록', () => {
  it('실패한 이유를 기기에 적어둔다', async () => {
    serverSaid('계정을 지우지 못했어요 — 아직 이 계정을 붙들고 있어요: storage.objects.owner 3건');

    await expect(deleteAccount()).rejects.toThrow(/storage.objects.owner 3건/);
    expect(readDeleteError().message).toContain('storage.objects.owner 3건');
  });

  // 함수를 아직 안 올린 것과 참조가 남은 것은 다음에 할 일이 다르다. 그 구분이 기록에
  // 남지 않으면 적어두는 의미가 없다.
  it('함수가 아직 없을 때도 무엇을 해야 하는지 적는다', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: { message: 'non-2xx status code', context: { status: 404, json: async () => null } },
    });

    await expect(deleteAccount()).rejects.toThrow(/delete-account/);
    expect(readDeleteError().message).toContain('delete-account 함수를 배포해주세요');
  });

  it('성공하면 예전 기록을 지운다', async () => {
    localStorage.setItem(DELETE_ERROR_KEY, JSON.stringify({ at: '2026-01-01', message: '옛날 실패' }));
    invoke.mockResolvedValue({ data: { ok: true }, error: null });

    await deleteAccount();
    expect(readDeleteError()).toBeNull();
  });
});

describe('탈퇴 실패 안내', () => {
  // 앱을 껐다 켜도 남아야 한다. 탈퇴가 도중에 멈추면 화면이 갈아끼워지는 정도가 아니라
  // 아예 다시 켜게 되는 일도 있는데, 그때 기록이 날아가면 물어볼 것이 없어진다.
  it('적혀 있으면 어느 화면 위에서든 뜬다', async () => {
    localStorage.setItem(
      DELETE_ERROR_KEY,
      JSON.stringify({ at: '2026-08-16T00:00:00Z', message: 'storage.objects.owner 3건' })
    );

    render(<DeleteAccountError />);
    expect(screen.getByText(/storage.objects.owner 3건/)).toBeTruthy();
  });

  it('아무 일도 없었으면 아무것도 안 뜬다', () => {
    const { container } = render(<DeleteAccountError />);
    expect(container.textContent).toBe('');
  });

  // 닫기는 화면에서만 치우는 게 아니라 기록까지 지운다. 화면에서만 치우면 다음에 켤 때
  // 지난번 실패가 또 떠서, 방금 것인지 예전 것인지 알 수 없게 된다.
  it('닫으면 기록도 같이 지운다', async () => {
    localStorage.setItem(DELETE_ERROR_KEY, JSON.stringify({ at: '2026-08-16', message: '남은 참조' }));

    render(<DeleteAccountError />);
    await act(async () => screen.getByText('닫기').click());

    expect(screen.queryByText(/남은 참조/)).toBeNull();
    expect(readDeleteError()).toBeNull();
  });
});

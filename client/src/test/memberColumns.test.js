import { describe, expect, it, vi, beforeEach } from 'vitest';

// 구성원 목록을 못 읽으면 앱이 통째로 안 열린다(AuthGate가 '연결이 고르지 않아요'로
// 간다). 그래서 여기서 무엇을 요구하느냐가 곧 앱이 열리느냐가 된다.
//
// 실제로 한 번 막혔다. 화면에는 email_masked를 붙여 내보냈는데 데이터베이스에는 그 칸을
// 만드는 SQL이 아직 안 돌아간 상태였고, 없는 칸을 달라고 하니 목록 읽기가 통째로
// 실패했다. 인터넷은 멀쩡한데 "연결이 고르지 않아요"만 떴다.
//
// 새 칸을 붙일 때마다 같은 일이 생길 수 있는 자리라, 규칙을 여기 붙들어둔다 —
// 있으면 쓰고, 없으면 없는 대로 연다. 진짜로 못 읽은 것은 그대로 올린다.

const calls = [];
let answer = () => ({ data: [], error: null });

vi.mock('../supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: (columns) => {
        calls.push(columns);
        const chain = {
          eq: () => chain,
          order: () => Promise.resolve(answer(columns)),
        };
        return chain;
      },
    }),
  },
}));

vi.mock('../api', () => ({ removeImages: vi.fn() }));

const { getFamilyMembers } = await import('../family');

beforeEach(() => {
  calls.length = 0;
});

describe('구성원 목록 읽기', () => {
  it('이메일 칸이 있으면 그것까지 받아온다', async () => {
    answer = () => ({ data: [{ user_id: 'me', email_masked: 'a***@b.com' }], error: null });

    const members = await getFamilyMembers('fam-1');

    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('email_masked');
    expect(members[0].email_masked).toBe('a***@b.com');
  });

  // SQL을 아직 안 돌린 데이터베이스. 이메일만 없이 열려야 한다.
  it('이메일 칸이 없으면 그것만 빼고 다시 읽는다', async () => {
    answer = (columns) =>
      columns.includes('email_masked')
        ? { data: null, error: { message: 'column family_members.email_masked does not exist' } }
        : { data: [{ user_id: 'me', display_name: '아들' }], error: null };

    const members = await getFamilyMembers('fam-1');

    expect(calls).toHaveLength(2);
    expect(calls[1]).not.toContain('email_masked');
    expect(members[0].display_name).toBe('아들');
    expect(members[0].email_masked).toBeUndefined();
  });

  // 인터넷이 끊긴 것까지 삼키면 안 된다. 그때는 '연결이 고르지 않아요'가 나와야 하는데,
  // 빈 목록으로 넘기면 "가족이 없어졌다"로 읽힌다.
  it('진짜로 못 읽은 것은 그대로 올린다', async () => {
    answer = () => ({ data: null, error: { message: 'network error' } });

    await expect(getFamilyMembers('fam-1')).rejects.toThrow('network error');
    expect(calls).toHaveLength(1);
  });
});

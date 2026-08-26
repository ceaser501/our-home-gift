import { describe, expect, it, vi, beforeEach } from 'vitest';

// 사용 내역은 기프티콘이 아니라 '쓴 사건'을 읽는다.
//
// 예전에는 사용완료인 기프티콘을 그대로 늘어놨다. 그러면 5만원권 하나가 한 줄이라,
// 엄마 3,000 · 딸 20,000 · 아들 1,500으로 나눠 쓴 것이 마지막 사람의 5만원 한 줄로
// 보였다. 앞의 세 번은 화면 어디에도 없었다.

const calls = [];
let rows = [];

function fakeQuery(table) {
  const q = {};
  for (const name of ['select', 'eq', 'is', 'neq', 'in', 'or', 'limit', 'order']) {
    q[name] = (...args) => {
      calls.push([table, name, ...args]);
      return q;
    };
  }
  q.then = (resolve) => resolve({ data: rows, error: null });
  return q;
}

const rpc = vi.fn(async () => ({ data: { ok: true, restored: 25500 }, error: null }));

vi.mock('../supabaseClient', () => ({
  supabase: {
    from: (table) => fakeQuery(table),
    rpc: (...a) => rpc(...a),
    storage: { from: () => ({ createSignedUrls: async () => ({ data: [], error: null }) }) },
  },
  GIFTICON_TABLE: 'gifticons',
  IMAGE_BUCKET: 'gifticon-images',
}));

const { listUsageHistory, undoLastUse } = await import('../api');

function use(n, name, who, amount) {
  return {
    id: n,
    gifticon_id: 900,
    gifticon_name: name,
    thumb_image_path: null,
    user_id: null,
    user_name: who,
    amount,
    used_at: `2026-08-${String(10 + n).padStart(2, '0')}`,
    created_at: `2026-08-${String(10 + n).padStart(2, '0')}T00:00:00Z`,
  };
}

beforeEach(() => {
  calls.length = 0;
  rows = [];
  rpc.mockClear();
});

describe('사용 내역을 읽어올 때', () => {
  it('쓴 사건 표에서 읽는다', async () => {
    await listUsageHistory('fam-1');

    expect(calls.some(([table]) => table === 'gifticon_uses')).toBe(true);
    // 기프티콘 표의 status='used'로 거르던 방식은 걷었다.
    expect(calls).not.toContainEqual(['gifticons', 'eq', 'status', 'used']);
  });

  // 이 파일이 지키는 것. 5만원권 하나가 세 줄로 나온다.
  it('한 장을 나눠 쓰면 쓴 사람만큼 줄이 나온다', async () => {
    rows = [use(1, '신세계상품권 5만원', '엄마', 3000), use(2, '신세계상품권 5만원', '딸', 20000)];

    const list = await listUsageHistory('fam-1');

    expect(list).toHaveLength(2);
    expect(list.map((r) => [r.used_by_name, r.amount])).toEqual([
      ['엄마', 3000],
      ['딸', 20000],
    ]);
    // 두 줄 다 같은 기프티콘이다. 이름이 같아도 사건이 둘이라 두 줄이 맞다.
    expect(new Set(list.map((r) => r.gifticon_id)).size).toBe(1);
  });

  // 화면은 표가 바뀐 것을 알 필요가 없다. 부르던 이름 그대로 온다.
  it('화면이 쓰던 이름 그대로 돌려준다', async () => {
    rows = [use(1, '아이스 아메리카노', '아들', 4500)];

    const [row] = await listUsageHistory('fam-1');

    expect(row.name).toBe('아이스 아메리카노');
    expect(row.used_by_name).toBe('아들');
    expect(row.used_at).toBe('2026-08-11');
    expect(row.thumb_url).toBeNull();
  });
});

describe('사용취소', () => {
  // 상태만 되돌리던 때는 5만원권을 취소해도 쓴 금액이 그대로 남아, 목록에는 돌아오는데
  // 잔액이 0원이라 아무것도 못 하는 카드가 됐다.
  it('서버 함수 한 번으로 끝내고 되돌린 금액을 돌려준다', async () => {
    const result = await undoLastUse(900);

    expect(rpc).toHaveBeenCalledWith('undo_last_use', { gid: 900 });
    expect(result.restored).toBe(25500);
  });
});

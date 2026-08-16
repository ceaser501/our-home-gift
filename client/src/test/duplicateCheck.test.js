import { describe, expect, it, vi, beforeEach } from 'vitest';

// 중복 검사는 목록과 같은 것을 봐야 한다.
//
// 목록은 숨겨진 기프티콘을 뺀다(올린 사람이 가족을 나가면 숨겨진다). 그런데 중복 검사는
// 그걸 그대로 세고 있었다. 그래서 "발견한 기프티콘 6개, 이미 등록된 것 1개"가 떴는데
// 목록은 비어 있었고, 다섯 개만 등록됐다. 왜 하나가 빠졌는지 알아낼 길이 사용자에게 없다.
//
// 숨겨진 기프티콘은 남은 가족 누구에게도 안 보이고 쓸 수도 없다. 없는 것과 같으니
// 다시 올리려는 사람을 막을 이유가 없다.

const calls = [];

function fakeQuery() {
  const q = {};
  for (const name of ['select', 'eq', 'is', 'neq', 'in', 'or', 'limit', 'order']) {
    q[name] = (...args) => {
      calls.push([name, ...args]);
      return q;
    };
  }
  // await 하면 빈 결과를 준다.
  q.then = (resolve) => resolve({ data: [], error: null });
  return q;
}

vi.mock('../supabaseClient', () => ({
  supabase: { from: () => fakeQuery() },
  GIFTICON_TABLE: 'gifticons',
  IMAGE_BUCKET: 'gifticon-images',
}));

const { findGifticonByCode, findLookalikeGifticon } = await import('../api');

const HIDDEN_FILTER = ['is', 'hidden_at', null];

beforeEach(() => {
  calls.length = 0;
});

describe('이미 등록됐는지 볼 때', () => {
  it('번호로 찾을 때 숨겨진 것은 세지 않는다', async () => {
    await findGifticonByCode('fam-1', '713353422322');
    expect(calls).toContainEqual(HIDDEN_FILTER);
  });

  // 번호가 한 자리 다르게 읽힌 같은 물건을 찾는 쪽. 여기서 숨겨진 것이 걸리면 "이미
  // 등록한 것 같아요"라고 묻는데, 정작 목록에는 그런 게 없어서 확인할 수가 없다.
  it('닮은 물건을 찾을 때도 숨겨진 것은 세지 않는다', async () => {
    await findLookalikeGifticon('fam-1', {
      brand: '투썸플레이스',
      name: '떠먹는 스트로베리 초콜릿 생크림 + 아메리카노 R 2잔',
      expiresAt: '2026-10-25',
    });
    expect(calls).toContainEqual(HIDDEN_FILTER);
  });

  it('가족은 여전히 걸러낸다', async () => {
    await findGifticonByCode('fam-1', '713353422322');
    expect(calls).toContainEqual(['eq', 'family_id', 'fam-1']);
  });
});

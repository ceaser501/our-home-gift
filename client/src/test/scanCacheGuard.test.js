import { describe, expect, it, beforeEach, vi } from 'vitest';

// 캐시에 든 값은 확인을 안 거치고 그대로 화면으로 간다.
//
// 상품명 재확인이 { name, why }를 주게 바뀌었을 때, 받는 쪽이 이름만 꺼내지 않아 그
// 덩어리가 통째로 name에 앉은 채로 저장됐다. 받는 쪽을 고친 뒤에도 이미 저장된 값은
// 그대로라 다음 판에도 객체가 글자 자리로 갔고, 화면이 하얗게 죽었다. 앱을 새로 깔아도
// localStorage는 남아서 "고쳤는데 그대로"로 보였다 — 실제로 그렇게 하루를 썼다.
//
// 그래서 꺼낼 때 모양을 본다. 어긋난 것은 없는 셈 친다(서버를 한 번 더 부를 뿐이다).

vi.stubEnv('VITE_TEST_TOOLS', '1');

const { readCachedInfo, writeCachedInfo, clearScanCache } = await import('../utils/scanCache');

beforeEach(() => {
  clearScanCache();
});

describe('캐시에서 꺼낼 때 모양 보기', () => {
  it('멀쩡한 값은 그대로 나온다', () => {
    writeCachedInfo('880123', { name: '떠먹는 스트로베리 케이크', brand: '배스킨라빈스', expiresAt: '2026-12-31' });

    expect(readCachedInfo('880123')?.name).toBe('떠먹는 스트로베리 케이크');
  });

  it('이름 자리에 객체가 들어 있으면 없는 셈 친다', () => {
    writeCachedInfo('880123', { name: { name: '떠먹는 스트로베리 케이크', why: null }, brand: '배스킨라빈스' });

    expect(readCachedInfo('880123')).toBe(null);
  });

  it('기한 자리가 글자가 아니어도 없는 셈 친다', () => {
    writeCachedInfo('880123', { name: '아이스 아메리카노 T', expiresAt: { at: '2026-12-31' } });

    expect(readCachedInfo('880123')).toBe(null);
  });

  // 못 읽은 항목은 원래 비어 있다. 그것까지 버리면 캐시가 통째로 무용해진다.
  it('비어 있는 항목은 멀쩡한 것으로 본다', () => {
    writeCachedInfo('880123', { name: '아이스 아메리카노 T', brand: null, expiresAt: null });

    expect(readCachedInfo('880123')?.name).toBe('아이스 아메리카노 T');
  });
});

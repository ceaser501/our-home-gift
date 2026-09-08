import { describe, expect, it, beforeEach } from 'vitest';
import { dropStaleCaches } from '../utils/staleCache';

// "업데이트해서 들어가면 이상한데 지우고 새로 까니까 된다"가 있었다. 앱을 껐다 켜도
// 그대로였다. 지우고 깔면 낫는다는 것은 폰에 남은 값 때문이라는 뜻이다.
//
// 어느 값이었는지는 못 짚었다. 그래서 하나를 고치는 대신, 판이 바뀌면 계산해둔 값을
// 버리게 했다. 여기서 지키는 것은 그 경계다 — 다시 구할 수 있는 값만 버리고,
// 사람이 손으로 정한 값은 남긴다.

const CACHES = ['nearby-banner:result', 'moacon:position', 'moacon:ui-scale'];
const SETTINGS = {
  theme: 'dark',
  'moacon:nearby-banner': '0',
  'moacon:welcome-setup:me': '1',
  'moacon:auto-scan': '1',
  'moacon:last-family:me': 'fam-1',
};

function fill() {
  for (const key of CACHES) localStorage.setItem(key, 'x');
  for (const [key, value] of Object.entries(SETTINGS)) localStorage.setItem(key, value);
}

beforeEach(() => {
  localStorage.clear();
});

describe('판이 바뀌었을 때', () => {
  it('처음 깐 폰에서는 아무것도 안 버린다', () => {
    fill();

    expect(dropStaleCaches('0.0.1 2026.09.08')).toBe(false);
    for (const key of CACHES) expect(localStorage.getItem(key)).toBe('x');
  });

  it('판이 바뀌면 계산해둔 값을 버린다', () => {
    dropStaleCaches('0.0.1 2026.09.08');
    fill();

    expect(dropStaleCaches('0.0.2 2026.09.09')).toBe(true);
    for (const key of CACHES) expect(localStorage.getItem(key)).toBeNull();
  });

  // 어두운 모드나 알림을 켜둔 것까지 없어지면, 업데이트할 때마다 다시 켜야 한다.
  it('사람이 정한 값은 남긴다', () => {
    dropStaleCaches('0.0.1 2026.09.08');
    fill();

    dropStaleCaches('0.0.2 2026.09.09');

    for (const [key, value] of Object.entries(SETTINGS)) {
      expect(localStorage.getItem(key)).toBe(value);
    }
  });

  it('같은 판을 다시 열면 아무것도 안 버린다', () => {
    dropStaleCaches('0.0.2 2026.09.09');
    fill();

    expect(dropStaleCaches('0.0.2 2026.09.09')).toBe(false);
    for (const key of CACHES) expect(localStorage.getItem(key)).toBe('x');
  });
});

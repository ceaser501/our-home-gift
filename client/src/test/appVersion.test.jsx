import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

// 「새 버전이 있어요」에서 지켜야 하는 것.
//
//   번호를 글자가 아니라 칸마다 숫자로 견줄 것 — 안드로이드는 0.0.190 같은 번호를 쓰는데,
//   글자로 견주면 0.0.190이 0.0.99보다 낮다고 나온다.
//
//   최소 버전보다 낮으면 닫을 수 없을 것(강제) — [그대로 사용하기]가 없어야 한다.
//
//   그대로 사용하기로 닫은 버전은 다시 안 띄울 것 — 매번 뜨면 닫기 버튼이 거짓말이 된다.
//   다만 강제는 닫은 적이 있어도 띄운다.

const query = { data: null, error: null };
vi.mock('../supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve(query) }) }),
    }),
  },
}));
vi.mock('../utils/useBackClose', () => ({ default: () => {} }));
vi.mock('@capacitor/app', () => ({ App: { getInfo: () => Promise.resolve({ version: '1.0.2' }) } }));

import { compareVersions, decideUpdate, checkForUpdate, installedVersion, DISMISSED_KEY } from '../utils/appVersion';
import UpdatePrompt from '../components/UpdatePrompt';

describe('compareVersions', () => {
  it('칸마다 숫자로 견준다', () => {
    expect(compareVersions('0.0.190', '0.0.99')).toBe(1);
    expect(compareVersions('1.0.2', '1.0.10')).toBe(-1);
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
    expect(compareVersions('2.0.0', '1.9.9')).toBe(1);
  });
});

describe('decideUpdate', () => {
  const row = { latest_version: '1.0.3', released_on: '2026-10-05', min_version: '0.0.0' };

  it('최신이면 띄우지 않는다', () => {
    expect(decideUpdate(row, '1.0.3', null)).toBeNull();
    expect(decideUpdate(row, '1.0.4', null)).toBeNull();
  });

  it('낮으면 닫을 수 있는 안내를 띄운다. 날짜는 점으로 적는다', () => {
    expect(decideUpdate(row, '1.0.2', null)).toEqual({ force: false, latest: '1.0.3', releasedOn: '2026.10.05' });
  });

  it('그대로 사용하기로 닫은 버전은 다시 안 띄운다', () => {
    expect(decideUpdate(row, '1.0.2', '1.0.3')).toBeNull();
    // 더 새 버전이 나오면 다시 뜬다
    expect(decideUpdate({ ...row, latest_version: '1.0.4' }, '1.0.2', '1.0.3')).not.toBeNull();
  });

  it('최소 버전보다 낮으면 강제다. 닫은 적이 있어도 띄운다', () => {
    const forced = { ...row, min_version: '1.0.3' };
    expect(decideUpdate(forced, '1.0.2', '1.0.3')).toMatchObject({ force: true });
    // 최소와 같으면 강제가 아니다
    expect(decideUpdate(forced, '1.0.3', null)).toBeNull();
  });
});

describe('checkForUpdate', () => {
  afterEach(() => {
    delete window.Capacitor;
    localStorage.clear();
    query.data = null;
  });

  it('웹에서는 묻지 않는다', async () => {
    query.data = { latest_version: '9.9.9', min_version: '9.9.9' };
    expect(await checkForUpdate()).toBeNull();
  });

  it('앱에서는 자기 플랫폼 번호로 판단하고 스토어 주소를 붙인다', async () => {
    window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios' };
    query.data = { latest_version: '1.0.3', released_on: '2026-10-05', min_version: '0.0.0' };
    expect(await checkForUpdate()).toMatchObject({
      force: false,
      latest: '1.0.3',
      storeUrl: 'https://apps.apple.com/app/id6808555980',
    });
  });

  it('앱 번호는 스토어 번호를 쓴다(웹 설정 파일의 번호가 아니다)', async () => {
    window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android' };
    expect(await installedVersion()).toBe('1.0.2');
  });
});

describe('UpdatePrompt', () => {
  beforeEach(() => {
    window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios' };
  });
  afterEach(() => {
    delete window.Capacitor;
    localStorage.clear();
    query.data = null;
  });

  async function mount() {
    await act(async () => {
      render(<UpdatePrompt />);
    });
  }

  it('버전과 날짜를 함께 보여주고, 두 버튼을 둔다', async () => {
    query.data = { latest_version: '1.0.3', released_on: '2026-10-05', min_version: '0.0.0' };
    await mount();
    expect(screen.getByText('새 버전이 있어요')).toBeTruthy();
    expect(screen.getByText('1.0.3 (2026.10.05)')).toBeTruthy();
    expect(screen.getByRole('button', { name: '업데이트 하러 가기' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '그대로 사용하기' }));
    expect(screen.queryByText('새 버전이 있어요')).toBeNull();
    expect(localStorage.getItem(DISMISSED_KEY)).toBe('1.0.3');
  });

  it('강제면 업데이트 하러 가기만 있다', async () => {
    query.data = { latest_version: '1.0.3', released_on: '2026-10-05', min_version: '1.0.3' };
    await mount();
    expect(screen.getByRole('button', { name: '업데이트 하러 가기' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '그대로 사용하기' })).toBeNull();
    expect(screen.getByText('업데이트해야 계속 쓸 수 있어요.')).toBeTruthy();
  });

  it('최신이면 아무것도 안 뜬다', async () => {
    query.data = { latest_version: '1.0.2', released_on: '2026-09-30', min_version: '0.0.0' };
    await mount();
    expect(screen.queryByText('새 버전이 있어요')).toBeNull();
  });
});

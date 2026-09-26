import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

// 사용기한 알림 시간 고르기.
//
// 2026-09-27에 규칙을 바꿨다 — 기한 7일 전부터 매일 한 번, 사람마다 고른 시각에.
// 고른 적이 없으면 오전 9시다. 발송 함수(send-expiry-notifications)의 기본값과 같아야
// 화면에 적힌 시각에 실제로 온다.

const getExpiryHour = vi.fn();
const setExpiryHour = vi.fn();
let enabled = true;

vi.mock('../push', () => ({
  isPushSupported: () => false,
  isPushEnabled: vi.fn(),
  subscribeToPush: vi.fn(),
  unsubscribeFromPush: vi.fn(),
}));
vi.mock('../nativePush', () => ({
  isNativePushSupported: () => true,
  isNativePushEnabled: async () => enabled,
  enableNativePush: vi.fn(),
  disableNativePush: vi.fn(),
}));
vi.mock('../FamilyContext', () => ({
  useFamily: () => ({ user: { id: 'me' }, family: { id: 'fam-1' } }),
}));
vi.mock('../api', () => ({
  getExpiryHour: (...a) => getExpiryHour(...a),
  setExpiryHour: (...a) => setExpiryHour(...a),
}));

const { default: NotificationToggle } = await import('../components/NotificationToggle');
const { formatHour, EXPIRY_HOURS, DEFAULT_EXPIRY_HOUR } = await import('../components/ExpiryHourSheet');

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

beforeEach(() => {
  vi.clearAllMocks();
  enabled = true;
  getExpiryHour.mockResolvedValue(9);
  setExpiryHour.mockResolvedValue();
});

describe('시각 표기', () => {
  it('오전 · 낮 · 오후로 적는다 — 24시 표기는 안 쓴다', () => {
    expect(formatHour(7)).toBe('오전 7시');
    expect(formatHour(12)).toBe('낮 12시');
    expect(formatHour(15)).toBe('오후 3시');
    expect(formatHour(22)).toBe('오후 10시');
  });

  it('고를 수 있는 것은 오전 7시부터 밤 10시까지 정시', () => {
    expect(EXPIRY_HOURS[0]).toBe(7);
    expect(EXPIRY_HOURS.at(-1)).toBe(22);
    expect(EXPIRY_HOURS).toHaveLength(16);
  });

  it('⚠️ 기본은 오전 9시 — 서버 기본값과 같아야 한다', () => {
    expect(DEFAULT_EXPIRY_HOUR).toBe(9);
  });
});

describe('알림 시간 줄', () => {
  it('알림이 켜져 있으면 지금 시각을 보여준다', async () => {
    render(<NotificationToggle asRow />);
    await flush();
    expect(screen.getByText('매일 오전 9시 · 기한 7일 전부터')).toBeTruthy();
  });

  it('알림이 꺼져 있으면 줄이 없다 — 골라도 안 오니까', async () => {
    enabled = false;
    render(<NotificationToggle asRow />);
    await flush();
    expect(screen.queryByText('알림 시간')).toBeNull();
  });

  it('시각을 누르면 저장하고 줄이 바뀐다', async () => {
    render(<NotificationToggle asRow />);
    await flush();
    fireEvent.click(screen.getByText('알림 시간'));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '오후 3시' })); });
    await flush();

    expect(setExpiryHour).toHaveBeenCalledWith('me', 15);
    expect(screen.getByText('매일 오후 3시 · 기한 7일 전부터')).toBeTruthy();
  });

  it('저장이 실패하면 창을 닫지 않고 알린다', async () => {
    setExpiryHour.mockRejectedValue(new Error('저장하지 못했어요'));
    render(<NotificationToggle asRow />);
    await flush();
    fireEvent.click(screen.getByText('알림 시간'));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '오후 3시' })); });
    await flush();

    expect(screen.getByText('저장하지 못했어요')).toBeTruthy();
    expect(screen.getByText('매일 오전 9시 · 기한 7일 전부터')).toBeTruthy();
  });
});

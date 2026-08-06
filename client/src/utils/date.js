export function daysUntil(dateStr) {
  if (!dateStr) return null;
  const target = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffMs = target.getTime() - today.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

export function formatDday(dateStr) {
  const d = daysUntil(dateStr);
  if (d === null) return '기한 없음';
  if (d === 0) return 'D-Day';
  if (d > 0) return `D-${d}`;
  return `기한 만료 (${Math.abs(d)}일 지남)`;
}

export function ddayUrgency(dateStr) {
  const d = daysUntil(dateStr);
  if (d === null) return 'none';
  if (d < 0) return 'expired';
  if (d <= 3) return 'urgent';
  if (d <= 7) return 'soon';
  return 'normal';
}

// '2026-01-31' 같은 날짜와 '2026-01-31T09:00:00+09:00' 같은 시각을 모두 받는다.
export function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(String(dateStr).includes('T') ? dateStr : `${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

// 연장은 오늘이 아니라 원래 만료일에서부터 더해진다. 8월 10일 만료를 90일 연장하면
// 11월 8일이 되지, 오늘부터 90일이 아니다.
export function addDays(dateStr, days) {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

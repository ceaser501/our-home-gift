// ⚠️ 테스트 전용. 한 번 읽은 바코드 번호의 결과를 폰에 두고, 같은 번호를 다시 만나면
// 서버(analyze-gifticon)를 부르지 않는다.
//
// 실사용 배포에는 VITE_TEST_TOOLS가 없으므로 아무 일도 일어나지 않는다 —
// client/src/sampleData.js, client/src/components/ResetAllDataButton.jsx와 같은 스위치다.
// 두 워크플로에서 그 한 줄을 지우면 셋이 함께 꺼진다.
//
// ── 왜 있나 ──────────────────────────────────────────────────────────────────
// 화면이 어떻게 나오는지 보려면 기프티콘이 여러 개 잡힌 상태를 만들어야 하는데, 그러자면
// 매번 같은 사진 여덟 장을 모델에게 다시 읽혀야 했다. 답은 늘 같은데 값은 매번 나갔고,
// 하루 한도(ANALYZE_DAILY_LIMIT)가 스물몇 번 만에 바닥났다. 화면을 보려던 일이 요금과
// 한도에 막히는 건 앞뒤가 바뀐 것이다.
//
// ── 왜 출시에는 안 들어가나 ─────────────────────────────────────────────────
// 모델이 틀리게 읽은 값이 굳는다. "떠먹는 스트로베리 케이크"를 "따먹는"으로 읽으면 그 값이
// 그대로 눌러앉아, 다음에도 그다음에도 같은 오탐이 올라온다. 자동 스캔은 사람이 고치는
// 단계 없이 바로 등록까지 가기 때문에 고쳐 쓸 자리도 없다.
//
// 그래서 이건 "읽기를 아끼는 장치"가 아니라 "화면을 반복해서 보기 위한 장치"다.
// 출시 뒤에 호출을 줄이려면 캐시가 아니라 다른 수를 써야 한다 — docs/scan-cost.md.

const KEY = 'scan-cache';
// 테스트로 쌓이는 양이라 이 정도면 넘칠 일이 없다. 그래도 상한은 둔다 — localStorage가
// 꽉 차면 앱의 다른 저장(로그인 세션 등)까지 같이 막힌다.
const MAX_ENTRIES = 300;

export function isScanCacheEnabled() {
  return Boolean(import.meta.env.VITE_TEST_TOOLS);
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    // 저장이 막혔거나 값이 깨졌다. 캐시가 없는 것과 같게 두면 된다.
    return {};
  }
}

function save(map) {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    // 자리가 없으면 캐시를 포기한다. 서버를 한 번 더 부를 뿐이다.
  }
}

// 여기 들어온 값은 확인을 안 거치고 그대로 화면으로 간다. 그래서 모양이 어긋난 것은
// 여기서 걸러야 한다.
//
// 실제로 그런 일이 있었다. 상품명 재확인이 { name, why }를 주게 바뀌었는데 받는 쪽이
// 이름만 꺼내지 않아, 그 덩어리가 통째로 name에 앉은 채로 저장됐다. 받는 쪽을 고쳐도
// 이미 저장된 값은 그대로라 다음 판에도 객체가 글자 자리로 갔고 화면이 하얘졌다.
// 앱을 새로 깔아도 localStorage는 남아서 "고쳤는데 그대로"로 보였다.
function looksSane(info) {
  if (!info || typeof info !== 'object') return false;
  return ['name', 'brand', 'expiresAt'].every((key) => info[key] == null || typeof info[key] === 'string');
}

/** 저장해둔 읽기 결과. 없으면 null. */
export function readCachedInfo(code) {
  if (!isScanCacheEnabled() || !code) return null;
  const entry = load()[code];
  const info = entry?.info || null;
  return looksSane(info) ? info : null;
}

/** 읽어낸 결과를 번호에 매달아 둔다. */
export function writeCachedInfo(code, info) {
  if (!isScanCacheEnabled() || !code || !info) return;
  const map = load();
  map[code] = { info, at: Date.now() };

  const codes = Object.keys(map);
  if (codes.length > MAX_ENTRIES) {
    // 오래된 것부터 버린다.
    codes
      .sort((a, b) => (map[a].at || 0) - (map[b].at || 0))
      .slice(0, codes.length - MAX_ENTRIES)
      .forEach((old) => delete map[old]);
  }

  save(map);
}

/** 몇 건이 들어 있나. 테스트 도구에서 보여준다. */
export function countCachedReads() {
  return Object.keys(load()).length;
}

/** 모델이 틀리게 읽은 값이 눌러앉았을 때 비운다. */
export function clearScanCache() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* 지우지 못해도 알릴 일은 아니다 */
  }
}

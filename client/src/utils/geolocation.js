// 현재 위치를 되도록 기다리지 않고 얻기 위한 도구들.
//
// 위치는 기기가 새로 잡으면 몇 초씩 걸린다. 그동안 "현재 위치를 확인하고 있어요…"만
// 보이면 앱이 멈춘 것처럼 느껴진다. 그래서 지난번 위치를 적어뒀다가 곧바로 그걸로
// 검색을 시작하고, 새 위치는 뒤에서 받아 크게 달라졌을 때만 다시 검색한다.

const STORE_KEY = 'moacon:last-position';
// 이보다 오래된 위치는 쓰지 않는다. 하루가 지나면 다른 도시에 있을 수도 있다.
const MAX_CACHE_AGE_MS = 24 * 60 * 60 * 1000;
// 저장해둔 위치와 이만큼 넘게 떨어져 있으면 매장 목록을 다시 불러온다.
export const SIGNIFICANT_MOVE_M = 300;

export function locate(options) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(Object.assign(new Error('이 기기에서는 위치를 확인할 수 없어요.'), { code: 'unsupported' }));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      reject,
      options
    );
  });
}

// 기기가 이미 알고 있는 위치가 있으면 그걸 그대로 받고(즉시), 없으면 시간을 넉넉히 주고
// 새로 잡는다. maximumAge를 무한으로 두면 나이와 상관없이 기기의 마지막 위치를 바로 준다.
export function getFreshPosition() {
  return locate({ enableHighAccuracy: false, timeout: 8000, maximumAge: Infinity }).catch((err) => {
    // 권한을 거부했으면 다시 물어봐야 소용이 없다.
    if (err?.code === 1 || err?.code === 'unsupported') throw err;
    return locate({ enableHighAccuracy: false, timeout: 20000, maximumAge: 0 });
  });
}

export function readCachedPosition() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (!saved || typeof saved.lat !== 'number' || typeof saved.lng !== 'number') return null;
    if (Date.now() - saved.at > MAX_CACHE_AGE_MS) return null;
    return { lat: saved.lat, lng: saved.lng };
  } catch {
    // 사파리 프라이빗 모드 등에서 접근이 막히면 그냥 없는 것으로 본다.
    return null;
  }
}

export function saveCachedPosition({ lat, lng }) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ lat, lng, at: Date.now() }));
  } catch {
    // 저장 못 해도 동작에는 지장 없다.
  }
}

// 두 지점 사이의 대략적인 거리(미터). 다시 검색할지 판단할 정도면 충분해서 간단히 계산한다.
export function distanceBetween(a, b) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

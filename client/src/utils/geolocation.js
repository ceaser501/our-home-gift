// 현재 위치를 되도록 기다리지 않고 얻기 위한 도구들.
//
// 위치는 기기가 새로 잡으면 몇 초씩 걸린다. 그동안 "현재 위치를 확인하고 있어요…"만
// 보이면 앱이 멈춘 것처럼 느껴진다. 그래서 지난번 위치를 적어뒀다가 곧바로 그걸로
// 검색을 시작하고, 새 위치는 뒤에서 받아 크게 달라졌을 때만 다시 검색한다.

const STORE_KEY = 'moacon:last-position';
// 이보다 오래된 위치는 쓰지 않는다. 하루가 지나면 다른 도시에 있을 수도 있다.
const MAX_CACHE_AGE_MS = 24 * 60 * 60 * 1000;
// 기기가 들고 있는 좌표를 얼마나 오래된 것까지 그대로 받을지.
//
// 한때 Infinity였다. "나이 상관없이 마지막으로 잡아둔 것을 바로 달라"는 뜻이라 기다릴
// 일이 없었는데, 대가가 컸다 — 여의도에서 앱을 켰는데 몇 시간 전 서울숲에서 잡아둔
// 좌표가 그대로 나왔다. 이동하는 내내 화면을 꺼두면 기기가 새로 잡을 일이 없어서, 그
// 옛 기억이 계속 이긴다. 앱을 껐다 켜도 마찬가지였다.
//
// 1분으로 둔다. 한 번 열었을 때 배너와 매장 찾기가 각각 물어도 같은 좌표를 나눠 쓰는
// 정도이고, 그보다 오래된 것은 새로 잡는다. enableHighAccuracy를 끄고 있어 도심에서는
// 와이파이·기지국으로 1~2초면 잡힌다 — 500m 판단에는 넘친다.
const RECENT_FIX_MS = 60 * 1000;
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

// 최근에 잡아둔 위치가 있으면 그걸 그대로 받고(즉시), 없으면 시간을 넉넉히 주고 새로 잡는다.
export function getFreshPosition() {
  return locate({ enableHighAccuracy: false, timeout: 8000, maximumAge: RECENT_FIX_MS }).catch((err) => {
    // 권한을 거부했으면 다시 물어봐야 소용이 없다.
    if (err?.code === 1 || err?.code === 'unsupported') throw err;
    return locate({ enableHighAccuracy: false, timeout: 20000, maximumAge: 0 });
  });
}

// maxAgeMs: 부르는 쪽이 얼마나 오래된 것까지 받아들일지 정한다.
//
// 자리마다 견딜 수 있는 나이가 다르다. 매장 찾기는 사용자가 직접 눌러 지도까지 보는
// 자리라 옛 위치로 먼저 보여줘도 되지만(곧 새 위치로 다시 찾는다), "지금 이 근처예요"라고
// 말하는 띠에게 하루 전 좌표는 다른 동네다.
export function readCachedPosition(maxAgeMs = MAX_CACHE_AGE_MS) {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (!saved || typeof saved.lat !== 'number' || typeof saved.lng !== 'number') return null;
    if (Date.now() - saved.at > maxAgeMs) return null;
    return { lat: saved.lat, lng: saved.lng };
  } catch {
    // 사파리 프라이빗 모드 등에서 접근이 막히면 그냥 없는 것으로 본다.
    return null;
  }
}

// 위치를 한 번이라도 잡아서 적어둔 적이 있는지. 나이는 안 본다.
//
// "이 사람이 위치 권한을 준 적이 있는가"를 아는 데 쓴다. 권한 자체를 물어볼 방법이
// 마땅치 않아서다 — 안드로이드 웹뷰에서 navigator.permissions.query는 앱 권한이 있어도
// 'prompt'를 돌려주는 일이 잦다. 크롬과 달리 웹뷰에는 사이트별 권한 설정이 없고 허용은
// 앱 권한으로 처리되기 때문이다.
//
// 적힌 것이 있다는 건 매장 찾기가 한 번은 위치를 잡았다는 뜻이고, 그건 곧 권한을 줬다는
// 뜻이다. 그러면 다시 잡아도 권한 창이 뜨지 않는다.
export function hasSavedPosition() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    return Boolean(saved && typeof saved.lat === 'number' && typeof saved.lng === 'number');
  } catch {
    return false;
  }
}

export function saveCachedPosition({ lat, lng }) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ lat, lng, at: Date.now() }));
  } catch {
    // 저장 못 해도 동작에는 지장 없다.
  }
}

// 주변 안내 띠를 켜둘까.
//
// 띠의 X는 그날 하루만 안 띄운다(NearbyBanner의 DISMISS_KEY). 매일 닫는 사람에게는
// 매일 닫는 일이 남는데, 그건 안 보겠다는 뜻을 앱이 못 알아듣는 것이다. 여기서 아예
// 끄면 다시 물어보지 않는다.
//
// 기본은 켜짐이다. 자동 찾기(사진첩을 훑는 일)와 달리 이건 이미 준 위치만 쓰고, 앱을
// 여는 이유 자체가 "지금 쓸 게 있나"라서 기본으로 도는 것이 맞다.
const NEARBY_KEY = 'moacon:nearby-banner';

// 설정에서 끈 그 순간에 띠가 사라져야 한다. 설정 창은 띠 위에 겹쳐 뜨는 것이라, 닫고
// 나서야 없어지면 방금 끈 것이 먹혔는지 알 수 없다. 두 화면이 부모-자식이 아니라서
// 상태를 내려줄 길이 없어 창으로 알린다.
export const NEARBY_BANNER_EVENT = 'moacon:nearby-banner-changed';

export function isNearbyBannerOn() {
  try {
    return localStorage.getItem(NEARBY_KEY) !== '0';
  } catch {
    return true;
  }
}

export function setNearbyBannerOn(on) {
  try {
    localStorage.setItem(NEARBY_KEY, on ? '1' : '0');
  } catch {
    // 저장이 막혀 있으면 이번 실행에만 적용된다.
  }
  try {
    window.dispatchEvent(new CustomEvent(NEARBY_BANNER_EVENT, { detail: Boolean(on) }));
  } catch {
    // 알리지 못해도 다음에 앱을 열면 반영된다.
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

import { useEffect, useRef, useState } from 'react';
import { MapPin, X } from 'lucide-react';
import { searchNearbyStores } from '../api';
import { getFreshPosition, readCachedPosition, saveCachedPosition, distanceBetween } from '../utils/geolocation';

// "지금 이 근처에서 쓸 수 있는 게 있다"를 알려주는 상단 띠.
//
// 기프티콘을 못 쓰고 버리는 진짜 이유는 기한을 몰라서가 아니라, 매장 앞을 지나가면서도
// 가진 걸 떠올리지 못해서다. 그래서 앱을 열었을 때 주변 매장과 맞춰보고, 걸어갈 만한
// 거리(500m) 안에 있는 것만 알려준다.
const RADIUS_M = 500;

// 같은 자리에서 앱을 여닫을 때마다 카카오를 다시 부르지 않는다. 검색에는 하루 상한이
// 걸려 있어서(사람당 200번), 배너가 그걸 조용히 갉아먹으면 정작 "매장" 버튼이 막힌다.
const CACHE_KEY = 'nearby-banner:result';
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MOVE_M = 300;

// 만료가 가까운 것부터 최대 세 브랜드만 찾아본다. 브랜드마다 검색이 한 번씩이라
// 다 뒤지면 요청 수가 기프티콘 수만큼 늘어난다.
const MAX_BRANDS = 3;

const DISMISS_KEY = 'nearby-banner-dismissed';

// 위치 권한을 새로 묻지 않는다. 앱을 열자마자 권한 창부터 들이밀면 거절당하기 딱 좋고,
// 한 번 거절되면 매장 찾기까지 같이 막힌다. 이미 허용된 경우에만 현재 위치를 잡고,
// 권한 상태를 알 수 없는 브라우저에서는 지난번 위치(매장 찾기를 써봤다면 남아 있다)로만 맞춰본다.
async function getPositionSilently() {
  try {
    if (navigator.permissions?.query) {
      const status = await navigator.permissions.query({ name: 'geolocation' });
      if (status.state === 'granted') {
        try {
          const fresh = await getFreshPosition();
          saveCachedPosition(fresh);
          return fresh;
        } catch {
          return readCachedPosition();
        }
      }
      if (status.state === 'denied') return null;
    }
  } catch {
    // permissions API가 없는 브라우저는 아래 지난번 위치로 이어간다.
  }
  return readCachedPosition();
}

function readCache(at) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
    if (!saved || Date.now() - saved.ts > CACHE_TTL_MS) return null;
    if (distanceBetween(saved.at, at) > CACHE_MOVE_M) return null;
    return saved;
  } catch {
    return null;
  }
}

function formatDistance(meters) {
  if (meters == null) return '';
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

// yielded: 중요 공지가 위 띠를 쓰고 있다는 뜻. 앱 맨 위 띠는 하나만 둔다 — 둘이 겹치면
// 목록이 두 줄만큼 밀린다. 급한 공지가 있는 동안에는 그쪽에 자리를 내주고, 공지가
// 끝나거나 사용자가 그 공지를 닫으면 다시 이 자리로 돌아온다.
//
// 자리를 내주는 동안에도 주변 검색은 그대로 해둔다. 공지를 닫는 순간 빈 띠가 잠깐
// 떴다가 내용이 채워지는 것보다, 이미 알아둔 것을 바로 보여주는 편이 낫다.
export default function NearbyBanner({ gifticons, onPick, yielded = false }) {
  const [best, setBest] = useState(null);
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem(DISMISS_KEY) === '1');
  // 목록은 검색어를 칠 때마다 다시 오는데, 그때마다 주변을 다시 뒤질 일은 아니다.
  // 처음 목록이 채워졌을 때 한 번만 찾는다.
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current || gifticons.length === 0) return;
    ranRef.current = true;

    let cancelled = false;

    async function run() {
      // 안 쓴 것 중 상호가 있는 것만, 만료가 가까운 브랜드부터 모은다.
      const byBrand = new Map();
      for (const g of gifticons) {
        if (g.status === 'used' || !g.brand?.trim()) continue;
        const key = g.brand.trim();
        const entry = byBrand.get(key) || { brand: key, count: 0, soonest: null };
        entry.count += 1;
        if (g.expires_at && (!entry.soonest || g.expires_at < entry.soonest)) entry.soonest = g.expires_at;
        byBrand.set(key, entry);
      }
      const brands = [...byBrand.values()]
        .sort((a, b) => (a.soonest || '9999').localeCompare(b.soonest || '9999'))
        .slice(0, MAX_BRANDS);
      if (brands.length === 0) return;

      const at = await getPositionSilently();
      if (!at || cancelled) return;

      const cached = readCache(at);
      if (cached) {
        // 캐시에 "근처에 없더라"는 결과(best: null)도 담아둔다. 없다는 걸 확인하는 데도
        // 검색이 들기 때문에, 없음도 10분간 기억해야 상한이 안 샌다.
        if (!cancelled) setBest(cached.best);
        return;
      }

      const results = await Promise.all(
        brands.map((b) => searchNearbyStores({ query: b.brand, lat: at.lat, lng: at.lng }).catch(() => []))
      );
      if (cancelled) return;

      let found = null;
      results.forEach((stores, i) => {
        const near = stores.find((s) => s.distance != null && s.distance <= RADIUS_M);
        if (near && (!found || near.distance < found.distance)) {
          found = { brand: brands[i].brand, count: brands[i].count, store: near.name, distance: near.distance };
        }
      });

      try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), at, best: found }));
      } catch {
        // 캐시를 못 남겨도 동작에는 지장 없다.
      }
      setBest(found);
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [gifticons]);

  // 찾아둔 결과는 10분간 캐시에 남는다(같은 자리에서 앱을 여닫을 때마다 매장을 다시 뒤지지
  // 않으려고). 그런데 그사이 그 브랜드 기프티콘을 다 쓰거나 지웠다면, 캐시만 믿고 "쓸 수
  // 있는 기프티콘 3개"라고 말하게 된다 — 없는 것을 있다고 하는 셈이다.
  // 그래서 띄우기 직전에 지금 목록으로 다시 세어본다. 개수도 여기서 맞춘다.
  const liveCount = best ? gifticons.filter((g) => g.status !== 'used' && g.brand?.trim() === best.brand).length : 0;

  if (!best || liveCount === 0 || dismissed || yielded) return null;

  function dismiss() {
    sessionStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  }

  return (
    // 공지 배너와 같은 차림의 상단 띠. 둘이 같이 떠도 한 덩어리로 읽힌다.
    <div className="flex w-full items-center gap-2.5 border-b border-border bg-accent/60 px-5 py-3">
      <MapPin className="size-4 shrink-0 text-primary" />
      {/* 누르면 그 브랜드로 목록을 걸러 보여준다. 여기서 새 창을 열면 목록·바코드·매장까지
          겹겹이 쌓이는데, 어차피 하려는 일은 "그 기프티콘 찾기"라 목록을 걸러주는 것으로 충분하다. */}
      <button type="button" onClick={() => onPick(best.brand)} className="min-w-0 flex-1 text-left">
        {/* 좁은 화면에서 문장이 길면 뒤가 잘리는데, 잘려도 되는 건 매장 이름 꼬리뿐이다.
            "몇 개"가 끝에 있으면 그게 먼저 잘리므로 문장을 짧게 줄인다. */}
        <span className="block truncate text-xs text-foreground">
          <b className="font-semibold">{best.store}</b>
          {` ${formatDistance(best.distance)} · 쓸 수 있는 기프티콘 `}
          <b className="font-semibold">{liveCount}개</b>
        </span>
      </button>
      <button type="button" onClick={dismiss} aria-label="주변 매장 안내 닫기" className="shrink-0 text-muted-foreground">
        <X className="size-4" />
      </button>
    </div>
  );
}

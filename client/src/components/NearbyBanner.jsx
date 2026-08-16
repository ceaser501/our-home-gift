import { useEffect, useRef, useState } from "react";
import { MapPin, MapPinOff, X } from "lucide-react";
import { searchNearbyStores } from "../api";
import {
  getFreshPosition,
  readCachedPosition,
  saveCachedPosition,
  distanceBetween,
} from "../utils/geolocation";
import { todayStr } from "../utils/date";
import { isNativeApp } from "../utils/browser";

// "지금 이 근처에서 쓸 수 있는 게 있다"를 알려주는 상단 띠.
//
// 기프티콘을 못 쓰고 버리는 진짜 이유는 기한을 몰라서가 아니라, 매장 앞을 지나가면서도
// 가진 걸 떠올리지 못해서다. 그래서 앱을 열었을 때 주변 매장과 맞춰보고, 걸어갈 만한
// 거리(500m) 안에 있는 것만 알려준다.
const RADIUS_M = 500;

// 같은 자리에서 앱을 여닫을 때마다 카카오를 다시 부르지 않는다. 검색에는 하루 상한이
// 걸려 있어서(사람당 200번), 배너가 그걸 조용히 갉아먹으면 정작 "매장" 버튼이 막힌다.
const CACHE_KEY = "nearby-banner:result";
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MOVE_M = 300;

// 만료가 가까운 것부터 최대 세 브랜드만 찾아본다. 브랜드마다 검색이 한 번씩이라
// 다 뒤지면 요청 수가 기프티콘 수만큼 늘어난다.
const MAX_BRANDS = 3;

// 닫으면 그날 하루는 안 띄운다. 날짜를 적어두고 다음 날이 되면 다시 뜬다.
//
// 처음에는 세션 단위였다(앱을 껐다 켜면 다시). 그런데 이 앱은 계산대 앞에서 열었다
// 닫았다 하는 앱이라, 열 때마다 같은 띠가 다시 뜨는 꼴이었다.
//
// 움직였으면 다시 띄울까도 했는데 접었다. 그건 앱 사정이다 — 내용이 달라졌으니 보여줘도
// 된다는 것. 겨우 한 줄짜리 띠에 X를 눌렀다는 건 안 보겠다는 뜻이고, 거기서 앱이 이기려
// 들면 안 된다. 다음 날 다시 띄우는 것으로 충분하다.
const DISMISS_KEY = "nearby-banner-dismissed-on";

// 위치 권한을 새로 묻지 않는다. 앱을 열자마자 권한 창부터 들이밀면 거절당하기 딱 좋고,
// 한 번 거절되면 매장 찾기까지 같이 막힌다. 이미 허용된 경우에만 현재 위치를 잡고,
// 권한 상태를 알 수 없는 브라우저에서는 지난번 위치(매장 찾기를 써봤다면 남아 있다)로만 맞춰본다.
// 띠가 받아들이는 지난 위치의 나이. 30분이면 걸어서 갈 만한 거리 안에 있다.
//
// 매장 찾기(하루)보다 훨씬 짧게 둔다. 그쪽은 사용자가 직접 눌러 지도를 보는 자리라
// 옛 위치로 먼저 보여주고 곧 새 위치로 고쳐도 되지만, 이 띠는 묻지도 않았는데 "이 근처에
// 쓸 게 있어요"라고 먼저 말을 거는 자리다. 틀린 채로 말을 걸면 안 하느니만 못하다.
const CACHE_MAX_AGE_MS = 30 * 60 * 1000;

// "위치를 못 잡았다"와 "위치를 안 물어봤다"는 다르다.
//
// 지하에서 잡으려다 실패한 것은 밖에 나가면 풀리는 일이라 알려줄 값어치가 있다.
// 권한을 안 준 것은 장소와 무관하고, 이 앱은 일부러 권한을 조르지 않기로 했으므로
// 여기서 그 이야기를 꺼내면 결국 조르는 것이 된다. 그래서 둘을 갈라서 돌려준다.
async function getPositionSilently() {
  try {
    if (navigator.permissions?.query) {
      const status = await navigator.permissions.query({ name: "geolocation" });
      if (status.state === "granted") {
        try {
          const fresh = await getFreshPosition();
          saveCachedPosition(fresh);
          return { at: fresh };
        } catch (err) {
          const at = readCachedPosition(CACHE_MAX_AGE_MS);
          if (at) return { at };
          // 권한은 줬는데 못 잡았다. 지하·실내·엘리베이터가 여기 든다.
          // 권한을 도로 거둔 경우(code 1)는 장소 탓이 아니라 조용히 넘어간다.
          return { at: null, unlocatable: err?.code !== 1 };
        }
      }
      if (status.state === "denied") return { at: null };
    }
  } catch {
    // permissions API가 없는 브라우저는 아래 지난번 위치로 이어간다.
  }
  // 권한을 물어본 적이 없는 자리다. 새로 묻지 않고 지난번 위치로만 맞춰본다.
  return { at: readCachedPosition(CACHE_MAX_AGE_MS) };
}

function readDismissedToday() {
  try {
    return localStorage.getItem(DISMISS_KEY) === todayStr();
  } catch {
    return false;
  }
}

function readCache(at) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(CACHE_KEY) || "null");
    if (!saved || Date.now() - saved.ts > CACHE_TTL_MS) return null;
    if (distanceBetween(saved.at, at) > CACHE_MOVE_M) return null;
    return saved;
  } catch {
    return null;
  }
}

function formatDistance(meters) {
  if (meters == null) return "";
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
  // 권한은 있는데 위치를 못 잡은 상태. 지하·실내에서 그렇다.
  const [unlocatable, setUnlocatable] = useState(false);
  const [dismissed, setDismissed] = useState(() => readDismissedToday());
  // 목록은 검색어를 칠 때마다 다시 오는데, 그때마다 주변을 다시 뒤질 일은 아니다.
  // 처음 목록이 채워졌을 때 한 번만 찾는다.
  const ranRef = useRef(false);
  // 앱이 다시 앞으로 왔을 때 쓸 최신 목록. 그때 이 효과는 이미 끝나 있어서, 그 안의
  // gifticons는 처음 값에 묶여 있다.
  const listRef = useRef(gifticons);
  listRef.current = gifticons;
  // 지금 돌고 있는 판을 멈추기 위한 손잡이. 앱을 다시 볼 때마다 새로 돈다.
  const stopRef = useRef(null);

  useEffect(() => {
    if (ranRef.current || gifticons.length === 0) return;
    ranRef.current = true;
    search();
    return () => stopRef.current?.();
    // search는 매번 새로 만들어지는 함수라 의존성에 넣으면 효과가 계속 다시 돈다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gifticons]);

  // 앱이 다시 앞으로 오면 한 번 더 찾는다.
  //
  // 이게 없으면 앱을 열 때 딱 한 번만 찾는다. 그런데 사람들은 앱을 잘 안 끈다 — 홈을
  // 누르고 주머니에 넣는다. 그러고 500m를 걸어가서 앱을 다시 봐도 아까 그 내용이 그대로
  // 있었다. "매장 앞을 지나가면서 가진 걸 떠올리지 못한다"는 게 이 기능을 만든 이유인데,
  // 정작 그 순간에 아무 일도 안 일어나고 있었던 셈이다.
  //
  // 켜둔 채로 주기적으로 돌지는 않는다. 배터리와 검색 한도를 쓰는데, 앱을 켜둔 채 걷는
  // 일은 드물다. 아래 캐시(10분·300m)가 헛도는 검색을 막아준다.
  useEffect(() => {
    if (!isNativeApp()) return undefined;

    let handle = null;
    let gone = false;

    import("@capacitor/app")
      .then(({ App }) =>
        App.addListener("appStateChange", ({ isActive }) => {
          if (!isActive || listRef.current.length === 0) return;
          search();
        }),
      )
      .then((h) => {
        if (gone) h.remove();
        else handle = h;
      })
      .catch(() => {
        // 플러그인을 못 불러오면 예전처럼 앱을 열 때만 찾는다.
      });

    return () => {
      gone = true;
      handle?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function search() {
    stopRef.current?.();
    let cancelled = false;
    stopRef.current = () => {
      cancelled = true;
    };

    const gifticons = listRef.current;

    async function run() {
      // 안 쓴 것 중 상호가 있는 것만, 만료가 가까운 브랜드부터 모은다.
      const byBrand = new Map();
      for (const g of gifticons) {
        if (g.status === "used" || !g.brand?.trim()) continue;
        const key = g.brand.trim();
        const entry = byBrand.get(key) || {
          brand: key,
          count: 0,
          soonest: null,
        };
        entry.count += 1;
        if (g.expires_at && (!entry.soonest || g.expires_at < entry.soonest))
          entry.soonest = g.expires_at;
        byBrand.set(key, entry);
      }
      const brands = [...byBrand.values()]
        .sort((a, b) =>
          (a.soonest || "9999").localeCompare(b.soonest || "9999"),
        )
        .slice(0, MAX_BRANDS);
      if (brands.length === 0) return;

      const located = await getPositionSilently();
      if (cancelled) return;
      setUnlocatable(Boolean(located.unlocatable));
      const at = located.at;
      if (!at) return;

      const cached = readCache(at);
      if (cached) {
        // 캐시에 "근처에 없더라"는 결과(best: null)도 담아둔다. 없다는 걸 확인하는 데도
        // 검색이 들기 때문에, 없음도 10분간 기억해야 상한이 안 샌다.
        if (!cancelled) setBest(cached.best);
        return;
      }

      const results = await Promise.all(
        brands.map((b) =>
          searchNearbyStores({
            query: b.brand,
            lat: at.lat,
            lng: at.lng,
          }).catch(() => []),
        ),
      );
      if (cancelled) return;

      let found = null;
      results.forEach((stores, i) => {
        const near = stores.find(
          (s) => s.distance != null && s.distance <= RADIUS_M,
        );
        if (near && (!found || near.distance < found.distance)) {
          found = {
            brand: brands[i].brand,
            count: brands[i].count,
            store: near.name,
            distance: near.distance,
          };
        }
      });

      try {
        sessionStorage.setItem(
          CACHE_KEY,
          JSON.stringify({ ts: Date.now(), at, best: found }),
        );
      } catch {
        // 캐시를 못 남겨도 동작에는 지장 없다.
      }
      setBest(found);
    }

    run();
  }

  // 찾아둔 결과는 10분간 캐시에 남는다(같은 자리에서 앱을 여닫을 때마다 매장을 다시 뒤지지
  // 않으려고). 그런데 그사이 그 브랜드 기프티콘을 다 쓰거나 지웠다면, 캐시만 믿고 "쓸 수
  // 있는 기프티콘 3개"라고 말하게 된다 — 없는 것을 있다고 하는 셈이다.
  // 그래서 띄우기 직전에 지금 목록으로 다시 세어본다. 개수도 여기서 맞춘다.
  const liveCount = best
    ? gifticons.filter(
        (g) => g.status !== "used" && g.brand?.trim() === best.brand,
      ).length
    : 0;

  // 위치를 못 잡았으면 왜 아무것도 안 뜨는지 알려준다.
  //
  // 아무 말 없이 비워두면 "이 기능이 고장 났나" 하게 된다. 지하에서는 늘 그렇고, 지하는
  // 자주 간다. 대신 X는 붙이지 않았다 — 닫으면 그날 하루 안 뜨는 규칙에 걸리는데, 지하에서
  // 한 번 닫았다고 밖에 나온 뒤 진짜 안내까지 못 받으면 손해가 훨씬 크다. 위치가 잡히는
  // 순간 저절로 사라진다.
  //
  // 쓸 기프티콘이 없으면 이 말도 하지 않는다. 찾아줄 것이 애초에 없는 사람에게 "못 찾았다"는
  // 아무 뜻도 없다.
  if (unlocatable && !best && gifticons.some((g) => g.status !== "used" && g.brand?.trim()) && !dismissed && !yielded) {
    return (
      <div className="flex w-full items-center gap-2.5 border-b border-border bg-muted/60 px-5 py-3">
        <MapPinOff className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          지금은 위치를 확인할 수 없어요. 지하나 실내에서는 안 잡힐 수 있어요.
        </span>
      </div>
    );
  }

  if (!best || liveCount === 0 || dismissed || yielded) return null;

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, todayStr());
    } catch {
      // 못 적어도 이번 화면에서는 닫힌다. 다음에 또 뜰 뿐이다.
    }
    setDismissed(true);
  }

  return (
    // 공지 배너와 같은 차림의 상단 띠. 둘이 같이 떠도 한 덩어리로 읽힌다.
    <div className="flex w-full items-center gap-2.5 border-b border-border bg-accent/60 px-5 py-3">
      <MapPin className="size-4 shrink-0 text-primary" />
      {/* 누르면 그 브랜드로 목록을 걸러 보여준다. 여기서 새 창을 열면 목록·바코드·매장까지
          겹겹이 쌓이는데, 어차피 하려는 일은 "그 기프티콘 찾기"라 목록을 걸러주는 것으로 충분하다. */}
      <button
        type="button"
        onClick={() => onPick(best.brand)}
        className="min-w-0 flex-1 text-left"
      >
        {/* 좁은 화면에서 문장이 길면 뒤가 잘리는데, 잘려도 되는 건 매장 이름 꼬리뿐이다.
            "몇 개"가 끝에 있으면 그게 먼저 잘리므로 문장을 짧게 줄인다. */}
        <span className="block truncate text-xs text-foreground">
          <b className="font-semibold">{best.store}</b>
          {` ${formatDistance(best.distance)} · 쓸 수 있는 기프티콘 `}
          <b className="font-semibold">{liveCount}개</b>
        </span>
      </button>
      <button
        type="button"
        onClick={dismiss}
        aria-label="주변 매장 안내 닫기"
        className="shrink-0 text-muted-foreground"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

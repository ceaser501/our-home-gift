import { useEffect, useRef, useState } from "react";
import { MapPin, MapPinOff, X } from "lucide-react";
import { searchNearbyStores } from "../api";
import {
  getFreshPosition,
  hasSavedPosition,
  isNearbyBannerOn,
  readCachedPosition,
  saveCachedPosition,
  distanceBetween,
  NEARBY_BANNER_EVENT,
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

// '켜기'를 눌렀는데 거절한 날. 그날은 다시 묻지 않는다.
//
// 시스템 창은 한 번뿐이라 아껴야 하지만, 우리 띠는 몇 번이든 다시 물을 수 있다. 그렇다고
// 거절한 그날 또 물으면 조르는 것이 된다. 하루 쉬고 다음 날 다시 묻는다.
const REFUSED_KEY = "nearby-permission-refused-on";

// 위치 권한을 새로 묻지 않는다. 앱을 열자마자 권한 창부터 들이밀면 거절당하기 딱 좋고,
// 한 번 거절되면 매장 찾기까지 같이 막힌다. 이미 허용된 경우에만 현재 위치를 잡고,
// 권한 상태를 알 수 없는 브라우저에서는 지난번 위치(매장 찾기를 써봤다면 남아 있다)로만 맞춰본다.
// 띠가 받아들이는 지난 위치의 나이. 30분이면 걸어서 갈 만한 거리 안에 있다.
//
// 매장 찾기(하루)보다 훨씬 짧게 둔다. 그쪽은 사용자가 직접 눌러 지도를 보는 자리라
// 옛 위치로 먼저 보여주고 곧 새 위치로 고쳐도 되지만, 이 띠는 묻지도 않았는데 "이 근처에
// 쓸 게 있어요"라고 먼저 말을 거는 자리다. 틀린 채로 말을 걸면 안 하느니만 못하다.
const CACHE_MAX_AGE_MS = 30 * 60 * 1000;

// 이 앱은 위치 권한을 새로 묻지 않는다. 앱을 열자마자 권한 창부터 들이밀면 거절당하기
// 딱 좋고, 한 번 거절되면 매장 찾기까지 같이 막힌다. 그래서 "이미 준 사람"에게만 잡는다.
//
// 문제는 "이미 줬는지"를 아는 방법이었다. 한때 navigator.permissions.query만 봤는데,
// 안드로이드 웹뷰에서는 앱 권한이 있어도 'prompt'를 돌려주는 일이 잦다 — 크롬과 달리
// 웹뷰에는 사이트별 권한 설정이 없고 허용은 앱 권한으로 처리되기 때문이다. 그래서 이 띠는
// 위치를 잡아본 적이 아예 없었고, 매장 찾기가 적어둔 옛 좌표만 계속 읽고 있었다.
// 서울숲에서 매장 찾기를 한 번 쓴 뒤로 여의도에서도 서울숲이 떴던 게 이것이다.
//
// 그래서 근거를 하나 더 둔다 — 적어둔 위치가 있으면 매장 찾기가 한 번은 잡았다는 뜻이고,
// 그건 곧 권한을 줬다는 뜻이다. 그러면 다시 잡아도 권한 창이 뜨지 않는다.
async function getPositionSilently() {
  let allowed = hasSavedPosition();

  try {
    if (navigator.permissions?.query) {
      const status = await navigator.permissions.query({ name: "geolocation" });
      // 거절은 확실하다. 이때는 잡아보지 않는다 — 권한 창을 다시 띄우게 된다.
      if (status.state === "denied") return { at: null };
      if (status.state === "granted") allowed = true;
    }
  } catch {
    // permissions API가 없으면 위의 "적어둔 위치가 있는가"로만 판단한다.
  }

  // 한 번도 위치를 준 적이 없는 사람. 여기서 시스템 창을 띄우지는 않는다 — 대신 이
  // 자리에서 우리가 먼저 물어본다(아래 '켜기' 띠).
  if (!allowed) return { at: null, needsPermission: true };

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

function readRefusedToday() {
  try {
    return localStorage.getItem(REFUSED_KEY) === todayStr();
  } catch {
    return false;
  }
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
  // 아직 위치를 준 적이 없는 상태. 이 자리에서 먼저 물어본다.
  const [needsPermission, setNeedsPermission] = useState(false);
  const [refused, setRefused] = useState(() => readRefusedToday());
  const [dismissed, setDismissed] = useState(() => readDismissedToday());
  // 설정에서 켜고 끄는 값. 꺼두면 매장을 뒤지지도 않는다 — 카카오 검색에는 하루 상한이
  // 걸려 있어서, 안 보여줄 것을 찾느라 그걸 쓰면 정작 '매장' 버튼이 막힌다.
  const [bannerOn, setBannerOn] = useState(() => isNearbyBannerOn());
  // 목록은 검색어를 칠 때마다 다시 오는데, 그때마다 주변을 다시 뒤질 일은 아니다.
  // 처음 목록이 채워졌을 때 한 번만 찾는다.
  const ranRef = useRef(false);
  // 앱이 다시 앞으로 왔을 때 쓸 최신 목록. 그때 이 효과는 이미 끝나 있어서, 그 안의
  // gifticons는 처음 값에 묶여 있다.
  const listRef = useRef(gifticons);
  listRef.current = gifticons;
  // 지금 돌고 있는 판을 멈추기 위한 손잡이. 앱을 다시 볼 때마다 새로 돈다.
  const stopRef = useRef(null);

  // 설정 창은 이 띠 위에 겹쳐 뜬다. 거기서 끄면 그 자리에서 사라져야 한다.
  useEffect(() => {
    const onChange = (e) => setBannerOn(Boolean(e.detail));
    window.addEventListener(NEARBY_BANNER_EVENT, onChange);
    return () => window.removeEventListener(NEARBY_BANNER_EVENT, onChange);
  }, []);

  useEffect(() => {
    if (!bannerOn || ranRef.current || gifticons.length === 0) return;
    ranRef.current = true;
    search();
    return () => stopRef.current?.();
    // search는 매번 새로 만들어지는 함수라 의존성에 넣으면 효과가 계속 다시 돈다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gifticons, bannerOn]);

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
          // 여기서는 저장된 값을 그때그때 읽는다. 이 리스너는 처음 한 번만 붙어서
          // 위 상태를 붙잡아 두면 껐다 켠 것을 못 따라간다.
          if (!isNearbyBannerOn()) return;
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

  // knownAt: 방금 잡은 위치. '켜기'를 눌러 허락받은 직후가 그렇다.
  //
  // 없으면 여기서 다시 판단한다. 그런데 방금 받아낸 위치를 버리고 "이 사람이 권한을 줬나"를
  // 처음부터 다시 따지면, 아직 아무 데도 안 적힌 그 순간에는 또 "안 줬다"가 나온다.
  // 손에 든 것이 있으면 그걸 쓴다.
  function search(knownAt = null) {
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

      const located = knownAt ? { at: knownAt } : await getPositionSilently();
      if (cancelled) return;
      setUnlocatable(Boolean(located.unlocatable));
      setNeedsPermission(Boolean(located.needsPermission));
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

  // 알려줄 것이 있는 사람인가. 목록이 비어 있으면 위치를 물어봐야 소용이 없고, 못 잡았다고
  // 알려줄 것도 없다.
  const hasUsable = gifticons.some((g) => g.status !== "used" && g.brand?.trim());

  // 이 자리에 무엇을 띄울지. 위에서부터 먼저 이긴다.
  if (!bannerOn || dismissed || yielded) return null;

  //   1) 찾았다 — 평소의 매장 안내
  if (best && liveCount > 0) return renderStore();

  //   2) 아직 위치를 준 적이 없다 — 시스템 창을 들이밀지 않고 여기서 먼저 묻는다
  //
  // 안드로이드 위치 권한은 되돌리기가 어렵다. 두 번째 거절은 "다시 묻지 않음"이 되어
  // 그다음부터는 시스템 설정에 들어가야 한다. 그래서 시스템 창이 첫 질문이 되면 안 된다 —
  // 앱이 뭘 하는지도 모르는 상태에서 "위치를 허용하시겠습니까?"가 뜨면 반사적으로 거절하고,
  // 그러면 띠도 매장 찾기도 영영 막힌다.
  //
  // 이 자리는 어차피 비어 있고, 누르기 전에는 시스템 창이 안 뜬다. 무시해도 잃는 것이 없다.
  // 그리고 "위치를 허용하시겠습니까?"보다 "근처에서 쓸 수 있는 걸 알려드릴까요?"가 훨씬
  // 승낙받기 쉽다 — 무엇을 위해 묻는지가 그 자리에 적혀 있어서다.
  // ①과 같은 배경(bg-accent)을 쓴다. 같은 자리에서 같은 성격이고 — 앱이 도움을 주려는
  // 것이다 — 켜기를 누르면 이 띠가 그대로 ①로 바뀐다. 높이도 같게 맞춰서(54px) 상태가
  // 바뀔 때 아래 목록이 튀지 않는다.
  if (needsPermission && hasUsable && !refused) {
    return (
      // 이 띠만 두 줄이다. 최초 한 번만 뜨는 질문이라 무게가 있어도 되고, 위치 권한은
      // 한 번 거절되면 되돌리기 어려워서 무엇을 허락하는지가 흐려지면 안 된다.
      // 아이콘 원도 그대로 둔다 — 두 줄이라 원이 높이를 정하지 않는다.
      // 대신 위아래 여백을 10 → 13px로 넓혔다. 두 줄 문장이 꽉 차서 아래 필터와 붙어 보였다.
      <div className="flex w-full items-center gap-[11px] bg-accent py-[13px] pr-3 pl-3.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-primary/12">
          <MapPin className="size-[17px] text-primary" strokeWidth={2.1} />
        </span>
        {/* '내 주변에서 쓸 수 있는 기프티콘을 알려드릴까요?'였다. 그러면 설정의
            '내 주변 안내' 스위치를 켜는 말로 읽힌다 — 그건 이미 켜져 있는데 여기서 또
            켜라고 하니, 설정이 왜 있는지 알 수 없어진다.
            여기서 켜는 것은 앱 기능이 아니라 폰의 위치 권한이다. 무엇을 켜는지를
            문장 맨 앞에 둔다. 그러면 버튼은 '켜기' 한 마디로 충분하다.

            '켜야 합니다'가 아니라 '켜면 알려드려요'다. 앞은 조건을 내미는 말이고 뒤는
            무엇을 받는지를 보여주는 말인데, 여기는 승낙을 받아야 하는 자리다.
            안드로이드는 두 번 거절당하면 다시 묻지도 못한다. */}
        <span className="min-w-0 flex-1 text-[13.5px] leading-normal font-medium break-keep text-foreground/80">
          위치 권한을 켜면 근처에서 쓸 수 있는 기프티콘을 알려드려요.
        </span>
        <button
          type="button"
          onClick={askForLocation}
          className="flex h-[34px] shrink-0 items-center rounded-[10px] bg-primary px-3.5 text-[13.5px] font-bold whitespace-nowrap text-primary-foreground"
        >
          켜기
        </button>
      </div>
    );
  }

  //   3) 허락은 받았는데 못 잡았다 — 왜 아무것도 안 뜨는지 알려준다
  //
  // 아무 말 없이 비워두면 "이 기능이 고장 났나" 하게 된다. 지하에서는 늘 그렇고, 지하는
  // 자주 간다. 대신 X는 붙이지 않았다 — 닫으면 그날 하루 안 뜨는 규칙에 걸리는데, 지하에서
  // 한 번 닫았다고 밖에 나온 뒤 진짜 안내까지 못 받으면 손해가 훨씬 크다. 위치가 잡히는
  // 순간 저절로 사라진다.
  if (unlocatable && hasUsable) {
    return (
      // ①②보다 얇고 회색이다. 알려줄 것이 없는 상태라 눈에 덜 걸리는 편이 맞다.
      // 두 문장을 하나로 줄였다 — '지금은 위치를 확인할 수 없어요'는 뒤 문장이 이미
      // 설명하고 있었고, 지우니 한 줄에 들어간다(예전에는 잘렸다).
      <div className="flex w-full items-center gap-2.5 border-b border-border bg-muted/40 px-3.5 py-[11px]">
        <MapPinOff className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-muted-foreground">
          지하나 실내에서는 위치가 안 잡힐 수 있어요
        </span>
      </div>
    );
  }

  return null;

  // '켜기'를 눌렀을 때만 시스템 창이 뜬다. 여기까지 온 사람은 무엇을 위해 묻는지 이미
  // 읽었으므로, 앱을 열자마자 들이미는 것보다 훨씬 잘 허락한다.
  async function askForLocation() {
    try {
      const fresh = await getFreshPosition();
      saveCachedPosition(fresh);
      setNeedsPermission(false);
      search(fresh);
    } catch (err) {
      if (err?.code === 1) {
        // 거절. 그날은 다시 묻지 않는다.
        try {
          localStorage.setItem(REFUSED_KEY, todayStr());
        } catch {
          // 못 적어도 이번 화면에서는 접힌다.
        }
        setRefused(true);
        setNeedsPermission(false);
        return;
      }
      // 허락은 했는데 못 잡았다. 지하·실내다.
      setNeedsPermission(false);
      setUnlocatable(true);
    }
  }

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, todayStr());
    } catch {
      // 못 적어도 이번 화면에서는 닫힌다. 다음에 또 뜰 뿐이다.
    }
    setDismissed(true);
  }

  // 평소의 매장 안내. 위 갈래에서 골라 부른다.
  function renderStore() {
    return (
    // 아이콘을 감싸던 32px 타일을 걷었다. 한 줄 띠에서는 그 원이 높이를 정해버린다 —
    // 17px 아이콘만 두면 띠가 50px에 들어온다. 안내 띠는 지나가는 말이라, 두 줄이 되면
    // 목록을 밀어내고 무게가 카드만큼 커진다.
    <div className="flex w-full items-center gap-2.5 bg-accent py-[9px] pr-2.5 pl-[13px]">
      <MapPin className="size-[17px] shrink-0 text-primary" strokeWidth={2.1} />
      {/* 누르면 그 브랜드로 목록을 걸러 보여준다. 여기서 새 창을 열면 목록·바코드·매장까지
          겹겹이 쌓이는데, 어차피 하려는 일은 "그 기프티콘 찾기"라 목록을 걸러주는 것으로 충분하다. */}
      <button
        type="button"
        onClick={() => onPick(best.brand)}
        className="flex min-w-0 flex-1 items-baseline gap-[5px] overflow-hidden text-left whitespace-nowrap"
      >
        {/* 두 줄로 나눴다가 한 줄로 되돌렸다. 두 줄로 간 이유는 "몇 개"가 잘릴까 봐였는데,
            잘리는 순서를 정하면 그 걱정이 없어진다 — 매장 이름만 min-w-0으로 줄어들고
            거리와 개수는 shrink-0이라 이름이 아무리 길어도 끝까지 남는다.
            거리를 보라로 — 이 띠에서 갈까 말까를 정하는 값이다. */}
        <span className="min-w-0 truncate text-[13.5px] font-bold tracking-[-0.01em] text-foreground">
          {best.store}
        </span>
        <span className="shrink-0 text-[13px] font-bold tabular-nums text-primary">
          {formatDistance(best.distance)}
        </span>
        {/* '쓸 수 있는 기프티콘 1개' → '사용가능 1개'. 이 띠가 뜨는 이유가 곧 '쓸 수 있는
            것이 있다'라서 그 말을 다시 적지 않아도 된다. */}
        <span className="shrink-0 text-[12.5px] font-medium text-muted-foreground">· 사용가능 {liveCount}개</span>
      </button>
      <button
        type="button"
        onClick={dismiss}
        aria-label="주변 매장 안내 닫기"
        className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground"
      >
        <X className="size-4" />
      </button>
    </div>
    );
  }
}

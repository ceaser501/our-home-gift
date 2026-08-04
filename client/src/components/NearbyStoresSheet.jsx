import { useEffect, useState } from 'react';
import { ChevronRight, Loader2, LocateFixed, MapPin, Phone } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import StoreDetailSheet from './StoreDetailSheet';
import { searchNearbyStores } from '../api';

// "이 기프티콘 어디서 쓰지?"를 보여주는 창. 현재 위치 주변의 브랜드 매장을 가까운 순으로
// 늘어놓는다. 매장을 누르면 앱 안 상세(지도·주소·거리·전화·길찾기)가 열리고,
// 영업시간·리뷰처럼 카카오가 API로 주지 않는 정보만 거기서 카카오맵으로 잇는다.

function formatDistance(meters) {
  if (meters == null) return null;
  if (meters < 1000) return `${meters}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

function locate(options) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(Object.assign(new Error('이 기기에서는 위치를 확인할 수 없어요.'), { code: 'unsupported' }));
      return;
    }
    navigator.geolocation.getCurrentPosition((pos) => resolve(pos.coords), reject, options);
  });
}

// 창을 처음 열었을 때만 위치를 못 잡고, 껐다 다시 열면 바로 잡히는 일이 있었다.
// 기기에 저장된 위치가 없으면 새로 잡느라 10초를 넘기는데 그때 실패로 끝나버렸고,
// 그 사이 기기가 잡아둔 위치 덕분에 두 번째부터는 즉시 성공한 것이다.
//
// 그래서 두 번에 나눠 물어본다. 먼저 조금 오래된 값이라도 있으면 그대로 쓰고
// (몇 분 사이에 멀리 이동하지는 않아서 주변 매장을 찾기에 충분하다),
// 없으면 시간을 넉넉히 주고 새로 잡는다.
function getPosition() {
  return locate({ enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }).catch((err) => {
    // 권한을 거부한 경우(1)는 다시 물어봐야 소용이 없다.
    if (err?.code === 1 || err?.code === 'unsupported') throw err;
    return locate({ enableHighAccuracy: false, timeout: 20000, maximumAge: 0 });
  });
}

export default function NearbyStoresSheet({ gifticon, onClose }) {
  // 상호가 없으면 상품명으로라도 찾아본다(예: 브랜드 칸을 비워두고 등록한 경우).
  const query = (gifticon.brand || '').trim() || gifticon.name;

  const [phase, setPhase] = useState('locating'); // locating | searching | done | error
  const [stores, setStores] = useState([]);
  const [error, setError] = useState(null); // { title, description, retriable }
  const [attempt, setAttempt] = useState(0);
  const [detail, setDetail] = useState(null);
  // 매장 상세에서 "내 위치 → 매장" 선을 그릴 때 쓴다.
  const [origin, setOrigin] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setPhase('locating');
      setError(null);
      try {
        const coords = await getPosition();
        if (cancelled) return;
        setOrigin({ lat: coords.latitude, lng: coords.longitude });
        setPhase('searching');
        const found = await searchNearbyStores({
          query,
          lat: coords.latitude,
          lng: coords.longitude,
        });
        if (cancelled) return;
        setStores(found);
        setPhase('done');
      } catch (err) {
        if (cancelled) return;
        // 1 = PERMISSION_DENIED: 사용자가 위치를 허용하지 않은 경우라 안내가 다르다.
        if (err?.code === 1) {
          setError({
            title: '위치 권한이 필요해요',
            description: '가까운 매장 순서로 보여드리려면 위치가 필요해요. 폰 설정에서 위치를 허용한 뒤 다시 시도해주세요.',
            retriable: true,
          });
        } else if (err?.code === 'unsupported') {
          setError({ title: err.message, description: null, retriable: false });
        } else {
          setError({
            title: '주변 매장을 찾지 못했어요',
            description: err?.message && err.code === undefined ? err.message : '잠시 뒤 다시 시도해주세요.',
            retriable: true,
          });
        }
        setPhase('error');
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [query, attempt]);


  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="max-h-[92dvh] gap-0 overflow-y-auto pb-[max(24px,env(safe-area-inset-bottom))]">
        <SheetHeader className="pr-14 pb-1">
          <SheetTitle>{query} 주변 매장</SheetTitle>
        </SheetHeader>
        <p className="m-0 px-5 pb-3 text-xs text-muted-foreground">
          현재 위치에서 가까운 순이에요. 매장을 누르면 지도와 자세한 정보가 열려요.
        </p>

        {(phase === 'locating' || phase === 'searching') && (
          <div className="flex flex-col items-center gap-2.5 px-5 py-12">
            {phase === 'locating' ? (
              <LocateFixed className="size-6 animate-pulse text-primary" />
            ) : (
              <Loader2 className="size-6 animate-spin text-primary" />
            )}
            <p className="m-0 text-sm text-muted-foreground">
              {phase === 'locating' ? '현재 위치를 확인하고 있어요…' : '주변 매장을 찾고 있어요…'}
            </p>
          </div>
        )}

        {phase === 'error' && (
          <div className="flex flex-col items-center gap-3 px-8 py-10 text-center">
            <MapPin className="size-7 text-muted-foreground" />
            <p className="m-0 text-sm font-semibold text-foreground">{error.title}</p>
            {error.description && <p className="m-0 text-xs leading-relaxed text-muted-foreground">{error.description}</p>}
            {error.retriable && (
              <Button size="sm" variant="outline" className="mt-1 rounded-xl" onClick={() => setAttempt((n) => n + 1)}>
                다시 시도
              </Button>
            )}
          </div>
        )}

        {phase === 'done' && stores.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-8 py-10 text-center">
            <MapPin className="size-7 text-muted-foreground" />
            <p className="m-0 text-sm text-muted-foreground">주변에서 '{query}' 매장을 찾지 못했어요.</p>
          </div>
        )}

        {phase === 'done' && stores.length > 0 && (
          <ul className="m-0 flex list-none flex-col p-0 px-5">
            {stores.map((store) => (
              <li key={store.id} className="flex items-center gap-2 border-b border-border py-3 last:border-b-0">
                <button type="button" onClick={() => setDetail(store)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <span className="flex w-13 shrink-0 flex-col items-center">
                    <span className="text-sm font-bold text-primary">{formatDistance(store.distance) ?? '?'}</span>
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-sm font-semibold text-foreground">{store.name}</span>
                    {store.address && <span className="truncate text-xs text-muted-foreground">{store.address}</span>}
                    {store.phone && <span className="text-xs text-muted-foreground">{store.phone}</span>}
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </button>
                {store.phone && (
                  <a
                    href={`tel:${store.phone.replace(/[^\d+]/g, '')}`}
                    aria-label={`${store.name}에 전화 걸기`}
                    className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-background text-primary"
                  >
                    <Phone className="size-4" />
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}

        {phase === 'done' && (
          <p className="m-0 px-5 pt-3 text-center text-[11px] text-muted-foreground">장소 정보 제공: 카카오</p>
        )}

        {detail && <StoreDetailSheet store={detail} origin={origin} onClose={() => setDetail(null)} />}
      </SheetContent>
    </Sheet>
  );
}

import { useEffect, useState } from 'react';
import { ChevronRight, Loader2, LocateFixed, MapPin, Phone } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { searchNearbyStores } from '../api';

// "이 기프티콘 어디서 쓰지?"를 보여주는 창. 현재 위치 주변의 브랜드 매장을 가까운 순으로
// 늘어놓는다. 매장을 누르면 카카오맵 장소 상세(지도·영업시간·전화·평점·길찾기)가 열린다.
// 지도가 있는 상세 화면을 앱 안에 또 하나 만들면 창이 겹겹이 쌓이는데(사용자도 그걸 걱정했다),
// 카카오맵 페이지가 우리가 만들 수 있는 것보다 정확하고 늘 최신이라 그쪽으로 보낸다.

function formatDistance(meters) {
  if (meters == null) return null;
  if (meters < 1000) return `${meters}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

// 위치는 최근 1분 안에 얻은 값이면 다시 재지 않는다(더 빨리 뜨고 배터리도 아낀다).
function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(Object.assign(new Error('이 기기에서는 위치를 확인할 수 없어요.'), { code: 'unsupported' }));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos.coords),
      (err) => reject(err),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  });
}

export default function NearbyStoresSheet({ gifticon, onClose }) {
  // 상호가 없으면 상품명으로라도 찾아본다(예: 브랜드 칸을 비워두고 등록한 경우).
  const query = (gifticon.brand || '').trim() || gifticon.name;

  const [phase, setPhase] = useState('locating'); // locating | searching | done | error
  const [stores, setStores] = useState([]);
  const [error, setError] = useState(null); // { title, description, retriable }
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setPhase('locating');
      setError(null);
      try {
        const coords = await getPosition();
        if (cancelled) return;
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

  function openPlace(store) {
    if (store.placeUrl) window.open(store.placeUrl, '_blank', 'noopener');
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="max-h-[92dvh] gap-0 overflow-y-auto pb-[max(24px,env(safe-area-inset-bottom))]">
        <SheetHeader className="pr-14 pb-1">
          <SheetTitle>{query} 주변 매장</SheetTitle>
        </SheetHeader>
        <p className="m-0 px-5 pb-3 text-xs text-muted-foreground">
          현재 위치에서 가까운 순이에요. 매장을 누르면 지도·영업시간이 열려요.
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
                <button type="button" onClick={() => openPlace(store)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
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
      </SheetContent>
    </Sheet>
  );
}

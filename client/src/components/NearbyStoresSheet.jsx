import { useEffect, useState } from 'react';
import { ChevronRight, Loader2, LocateFixed, MapPin, Phone } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import StoreDetailSheet from './StoreDetailSheet';
import { searchNearbyStores } from '../api';
import {
  SIGNIFICANT_MOVE_M,
  distanceBetween,
  getFreshPosition,
  readCachedPosition,
  saveCachedPosition,
} from '../utils/geolocation';
import useBackClose from '../utils/useBackClose';

// "이 기프티콘 어디서 쓰지?"를 보여주는 창. 현재 위치 주변의 브랜드 매장을 가까운 순으로
// 늘어놓는다. 매장을 누르면 앱 안 상세(지도·주소·거리·전화·길찾기)가 열리고,
// 영업시간·리뷰처럼 카카오가 API로 주지 않는 정보만 거기서 카카오맵으로 잇는다.

function formatDistance(meters) {
  if (meters == null) return null;
  if (meters < 1000) return `${meters}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

export default function NearbyStoresSheet({ gifticon, onClose }) {
  // 뒤로가기로 이 창을 닫는다. 안 그러면 설치해서 쓸 때 앱이 통째로 꺼진다.
  useBackClose(onClose);
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

    async function search(at) {
      const found = await searchNearbyStores({ query, lat: at.lat, lng: at.lng });
      if (cancelled) return;
      setOrigin(at);
      setStores(found);
      setPhase('done');
    }

    async function run() {
      setError(null);

      // 지난번 위치가 있으면 기다리지 않고 그것으로 먼저 찾아 보여준다.
      const cached = readCachedPosition();
      setPhase(cached ? 'searching' : 'locating');
      const shown = cached ? search(cached).catch(() => {}) : null;

      try {
        const fresh = await getFreshPosition();
        if (cancelled) return;
        saveCachedPosition(fresh);

        // 지난번 위치로 이미 보여준 목록이 지금 자리와 크게 어긋날 때만 다시 찾는다.
        if (cached && distanceBetween(cached, fresh) < SIGNIFICANT_MOVE_M) {
          await shown;
          if (!cancelled) setOrigin(fresh);
          return;
        }

        if (!cached) setPhase('searching');
        await search(fresh);
      } catch (err) {
        if (cancelled) return;
        // 지난번 위치로 이미 보여줬으면 새 위치를 못 잡아도 그대로 두는 게 낫다.
        if (cached) {
          await shown;
          return;
        }
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
            {/* 목록은 가까운 순으로 온다. 거리를 전부 포인트색으로 칠하면 다 같은 무게로
                보여서, 정작 "제일 가까운 데가 어디냐"를 눈이 아니라 순서로 세어야 한다.
                맨 위 하나만 색을 갖고 나머지는 물러난다. */}
            {stores.map((store, index) => (
              <li key={store.id} className="flex items-center gap-2 border-b border-border py-3 last:border-b-0">
                <button type="button" onClick={() => setDetail(store)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <span className="flex w-13 shrink-0 flex-col items-center">
                    <span className={cn('text-sm font-bold', index === 0 ? 'text-primary' : 'text-muted-foreground')}>
                      {formatDistance(store.distance) ?? '?'}
                    </span>
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

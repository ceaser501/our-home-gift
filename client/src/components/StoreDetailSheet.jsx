import { useEffect, useRef, useState } from 'react';
import { Clock, ExternalLink, MapPin, Navigation, Phone } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { loadKakaoMap } from '../utils/kakaoMap';

// 매장 하나의 상세. 지도·주소·거리·전화는 앱 안에서 바로 보여준다.
// 영업시간·평점·리뷰는 카카오가 API로 주지 않아서(카카오맵 페이지에만 있다)
// 아래 "카카오맵에서 보기" 버튼으로 잇는다.

function formatDistance(meters) {
  if (meters == null) return null;
  if (meters < 1000) return `${meters}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

export default function StoreDetailSheet({ store, onClose }) {
  const mapRef = useRef(null);
  // loading: SDK 받는 중 / ready: 지도 표시됨 / none: 키가 없거나 로드 실패(지도 없이 정보만)
  const [mapState, setMapState] = useState('loading');

  useEffect(() => {
    let cancelled = false;

    if (store.lat == null || store.lng == null) {
      setMapState('none');
      return undefined;
    }

    loadKakaoMap().then((kakao) => {
      if (cancelled) return;
      if (!kakao || !mapRef.current) {
        setMapState('none');
        return;
      }
      const center = new kakao.maps.LatLng(store.lat, store.lng);
      const map = new kakao.maps.Map(mapRef.current, { center, level: 4 });
      new kakao.maps.Marker({ map, position: center });
      setMapState('ready');
      // 시트가 아래에서 올라오는 애니메이션 중에 만들면 크기를 잘못 재서 회색으로 뜬다.
      // 자리를 잡은 뒤 한 번 다시 재고 중심을 되돌린다.
      setTimeout(() => {
        map.relayout();
        map.setCenter(center);
      }, 350);
    });

    return () => {
      cancelled = true;
    };
  }, [store]);

  const phoneHref = store.phone ? `tel:${store.phone.replace(/[^\d+]/g, '')}` : null;
  // 카카오맵 길찾기 링크. 지도 SDK 없이도 동작하고, 폰에 카카오맵 앱이 있으면 앱으로 열린다.
  const routeUrl =
    store.lat != null && store.lng != null
      ? `https://map.kakao.com/link/to/${encodeURIComponent(store.name)},${store.lat},${store.lng}`
      : null;

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="max-h-[92dvh] gap-0 overflow-y-auto pb-[max(24px,env(safe-area-inset-bottom))]">
        <SheetHeader className="pr-14 pb-1">
          <SheetTitle className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 truncate">{store.name}</span>
            {store.category && (
              <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-foreground">
                {store.category}
              </span>
            )}
          </SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-3 px-5 pt-2">
          {/* 지도를 못 그릴 때도 자리를 비워두지 않고 이유를 보여준다. 조용히 사라지면
              설정이 빠진 건지 원래 없는 건지 알 수 없어서 고치기도 어렵다. */}
          <div className="relative h-45 w-full overflow-hidden rounded-xl border border-border bg-muted">
            <div ref={mapRef} className="h-full w-full" />
            {mapState !== 'ready' && (
              <p className="absolute inset-0 m-0 flex flex-col items-center justify-center gap-1 px-6 text-center text-xs text-muted-foreground">
                {mapState === 'loading' ? (
                  '지도를 불러오는 중…'
                ) : (
                  <>
                    <span className="font-semibold text-foreground">지도를 표시할 수 없어요</span>
                    <span>
                      {store.lat == null
                        ? '매장 위치 정보가 없어요. 서버 함수(search-places)를 최신으로 다시 배포하면 나와요.'
                        : '카카오 JavaScript 키(VITE_KAKAO_JS_KEY)와 Web 플랫폼 도메인 등록이 필요해요.'}
                    </span>
                  </>
                )}
              </p>
            )}
          </div>

          <div className="flex flex-col rounded-xl border border-border">
            {store.distance != null && (
              <p className="m-0 flex items-center gap-2.5 border-b border-border px-3.5 py-2.5 text-sm">
                <Navigation className="size-4 shrink-0 text-primary" />
                <span className="text-foreground">
                  내 위치에서 <span className="font-bold text-primary">{formatDistance(store.distance)}</span>
                </span>
              </p>
            )}
            {store.address && (
              <p className="m-0 flex items-center gap-2.5 border-b border-border px-3.5 py-2.5 text-sm">
                <MapPin className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 break-keep text-foreground">{store.address}</span>
              </p>
            )}
            {store.phone && (
              <a href={phoneHref} className="m-0 flex items-center gap-2.5 border-b border-border px-3.5 py-2.5 text-sm no-underline">
                <Phone className="size-4 shrink-0 text-muted-foreground" />
                <span className="text-foreground">{store.phone}</span>
              </a>
            )}
            {/* 영업시간은 카카오가 API로 주지 않아서 앱 안에서는 보여줄 수 없다. 어디서 볼 수 있는지만 안내한다. */}
            <p className="m-0 flex items-center gap-2.5 px-3.5 py-2.5 text-sm">
              <Clock className="size-4 shrink-0 text-muted-foreground" />
              <span className="text-muted-foreground">영업시간·리뷰는 카카오맵에서 볼 수 있어요</span>
            </p>
          </div>

          <div className="flex gap-2">
            {phoneHref && (
              <Button asChild variant="outline" className="flex-1 rounded-xl">
                <a href={phoneHref}>
                  <Phone className="size-4" /> 전화
                </a>
              </Button>
            )}
            {routeUrl && (
              <Button asChild variant="outline" className="flex-1 rounded-xl">
                <a href={routeUrl} target="_blank" rel="noopener noreferrer">
                  <Navigation className="size-4" /> 길찾기
                </a>
              </Button>
            )}
            {store.placeUrl && (
              <Button asChild className="flex-1 rounded-xl">
                <a href={store.placeUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-4" /> 카카오맵
                </a>
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

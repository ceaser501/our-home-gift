import { useEffect, useRef, useState } from 'react';
import { Car, Clock, ExternalLink, Footprints, Info, MapPin, Maximize2, Minimize2, Navigation, Phone } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { fetchRoute } from '../api';
import { loadKakaoMap } from '../utils/kakaoMap';
import { openTmapRoute } from '../utils/tmap';
import useBackClose from '../utils/useBackClose';

// 매장 하나의 상세. 지도·주소·거리·전화는 앱 안에서 바로 보여준다.
// 영업시간·평점·리뷰는 카카오가 API로 주지 않아서(카카오맵 페이지에만 있다)
// 아래 "카카오맵에서 보기" 버튼으로 잇는다.

function formatDistance(meters) {
  if (meters == null) return null;
  if (meters < 1000) return `${meters}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

function formatDuration(seconds) {
  if (seconds == null) return null;
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes}분`;
  return `${Math.floor(minutes / 60)}시간 ${minutes % 60}분`;
}

// 지도를 보기 좋은 자리에 맞춘다. 경로가 그려져 있으면 경로 전체가 들어오게,
// 아니면 매장을 가운데에 둔다.
function fitTo(kakao, map, points, store) {
  if (points?.length) {
    const bounds = new kakao.maps.LatLngBounds();
    points.forEach((p) => bounds.extend(p));
    map.setBounds(bounds, 30, 30, 30, 30);
    return;
  }
  map.setLevel(4);
  map.setCenter(new kakao.maps.LatLng(store.lat, store.lng));
}

export default function StoreDetailSheet({ store, origin, onClose }) {
  // 뒤로가기로 이 창을 닫는다. 안 그러면 설치해서 쓸 때 앱이 통째로 꺼진다.
  useBackClose(onClose);
  const mapRef = useRef(null);
  // loading: SDK 받는 중 / ready: 지도 표시됨 / none: 키가 없거나 로드 실패(지도 없이 정보만)
  const [mapState, setMapState] = useState('loading');
  // null이면 경로를 감춘 상태. 'car'는 카카오, 'walk'는 티맵에서 받아온다.
  const [routeMode, setRouteMode] = useState(null);
  const [mapExpanded, setMapExpanded] = useState(false);
  // { state: 'loading' | 'done' | 'error', distance, duration, message }
  const [route, setRoute] = useState(null);

  // 지도와 SDK는 다시 그릴 때마다 필요해서 들고 있는다.
  const kakaoRef = useRef(null);
  const mapObjRef = useRef(null);
  // 경로를 켰다 껐다 할 때 지워야 하는 것들(선, 내 위치 표시).
  const routeShapesRef = useRef([]);
  // 지도 크기가 바뀌었을 때 경로 전체가 다시 들어오도록 좌표를 들고 있는다.
  const routePointsRef = useRef(null);

  const canShowRoute = store.lat != null && origin != null;

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
      kakaoRef.current = kakao;
      mapObjRef.current = map;
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

  // 내 위치에서 매장까지 길을 따라가는 경로를 그린다. 두 점을 직선으로 이으면 건물과
  // 강을 가로질러서 실제로는 쓸모가 없기 때문에, 서버에서 받아온 길 좌표를 그대로 잇는다.
  // 자동차는 카카오, 걸어가는 길은 티맵에서 받아온다(카카오는 도보를 주지 않는다).
  useEffect(() => {
    const kakao = kakaoRef.current;
    const map = mapObjRef.current;
    if (!kakao || !map) return undefined;

    routeShapesRef.current.forEach((shape) => shape.setMap(null));
    routeShapesRef.current = [];
    routePointsRef.current = null;

    if (!routeMode || !origin) {
      fitTo(kakao, map, null, store);
      return undefined;
    }

    let cancelled = false;
    setRoute({ state: 'loading' });

    fetchRoute({ mode: routeMode, origin, destination: { lat: store.lat, lng: store.lng } })
      .then((result) => {
        if (cancelled) return;
        const points = result.path.map((p) => new kakao.maps.LatLng(p.lat, p.lng));

        const line = new kakao.maps.Polyline({
          path: points,
          strokeWeight: 5,
          strokeColor: '#5b4fe8',
          strokeOpacity: 0.9,
          // 걸어가는 길은 점선으로 그려서 차로 가는 길과 한눈에 구분되게 한다.
          strokeStyle: routeMode === 'walk' ? 'shortdash' : 'solid',
        });
        line.setMap(map);

        // 매장 마커와 구분되게, 출발지(내 위치)는 파란 점으로 표시한다.
        const dot = new kakao.maps.CustomOverlay({
          position: new kakao.maps.LatLng(origin.lat, origin.lng),
          content:
            '<div style="width:14px;height:14px;border-radius:50%;background:#2f6fed;border:3px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.2)"></div>',
        });
        dot.setMap(map);

        routeShapesRef.current = [line, dot];
        routePointsRef.current = points;

        // 경로 전체가 화면에 들어오도록 범위를 맞춘다.
        fitTo(kakao, map, points, store);

        setRoute({ state: 'done', distance: result.distance, duration: result.duration });
      })
      .catch((err) => {
        if (!cancelled) setRoute({ state: 'error', message: err.message });
      });

    return () => {
      cancelled = true;
    };
  }, [routeMode, origin, store, mapState]);

  // 지도 칸의 크기가 바뀌면 카카오 지도에 다시 재라고 알려줘야 한다. 안 그러면 늘어난
  // 자리가 회색으로 비거나 보던 위치가 어긋난다. 높이 애니메이션이 끝난 뒤에 잰다.
  useEffect(() => {
    const kakao = kakaoRef.current;
    const map = mapObjRef.current;
    if (!kakao || !map) return undefined;

    const timer = setTimeout(() => {
      map.relayout();
      fitTo(kakao, map, routePointsRef.current, store);
    }, 320);
    return () => clearTimeout(timer);
  }, [mapExpanded, mapState, store]);

  const phoneHref = store.phone ? `tel:${store.phone.replace(/[^\d+]/g, '')}` : null;
  // 길안내는 티맵 앱으로 넘긴다(도보·자동차·대중교통을 거기서 고를 수 있다).
  const canOpenNavigation = store.lat != null && store.lng != null;

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
          {/* 지도를 크게 볼 때도 새 창을 띄우지 않는다. 이 창 자체가 이미 목록 위에 겹쳐
              떠 있어서, 한 겹을 더 쌓으면 어디까지 닫아야 하는지 헷갈린다. 대신 지도 칸만
              키우고 나머지 정보는 아래로 밀어 스크롤로 볼 수 있게 한다. */}
          <div
            className={cn(
              'relative w-full overflow-hidden rounded-xl border border-border bg-muted transition-[height] duration-300 ease-out',
              mapExpanded ? 'h-[58dvh]' : 'h-45'
            )}
          >
            <div ref={mapRef} className="h-full w-full" />

            {mapState === 'ready' && (
              <button
                type="button"
                onClick={() => setMapExpanded((on) => !on)}
                aria-label={mapExpanded ? '지도 작게 보기' : '지도 크게 보기'}
                className="absolute top-2 right-2 z-1 flex size-8 items-center justify-center rounded-lg border border-border bg-card/95 text-foreground shadow-sm"
              >
                {mapExpanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
              </button>
            )}
            {/* 차로 가는 길인지 걸어가는 길인지 분명히 적어둔다. 거리와 시간이 크게 달라진다. */}
            {mapState === 'ready' && routeMode && route && (
              <span className="absolute bottom-2 left-1/2 z-1 flex max-w-[92%] -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-semibold text-white">
                {route.state === 'loading' && '경로를 그리는 중…'}
                {route.state === 'done' && (
                  <>
                    {routeMode === 'walk' ? <Footprints className="size-3.5 shrink-0" /> : <Car className="size-3.5 shrink-0" />}
                    <span>
                      {routeMode === 'walk' ? '도보' : '차량'} {formatDistance(route.distance)}
                      {route.duration != null && ` · 약 ${formatDuration(route.duration)}`}
                    </span>
                  </>
                )}
                {route.state === 'error' && <span className="text-center">{route.message}</span>}
              </span>
            )}
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
              <div className="flex items-center gap-2.5 border-b border-border px-3.5 py-2.5 text-sm">
                <Navigation className="size-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1 text-foreground">
                  내 위치에서 <span className="font-bold text-primary">{formatDistance(store.distance)}</span>
                </span>
                {/* 같은 곳이라도 차로 갈 때와 걸어갈 때 길이 달라서, 눌러서 각각 볼 수 있게 한다. */}
                {canShowRoute && mapState === 'ready' && (
                  <span className="flex shrink-0 gap-1">
                    {[
                      { key: 'car', label: '차', Icon: Car },
                      { key: 'walk', label: '도보', Icon: Footprints },
                    ].map(({ key, label, Icon }) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setRouteMode((prev) => (prev === key ? null : key))}
                        aria-pressed={routeMode === key}
                        className={cn(
                          'flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors',
                          routeMode === key ? 'bg-primary text-primary-foreground' : 'bg-accent text-accent-foreground'
                        )}
                      >
                        <Icon className="size-3.5" />
                        {label}
                      </button>
                    ))}
                  </span>
                )}
              </div>
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
            <p className="m-0 flex items-center gap-2.5 border-b border-border px-3.5 py-2.5 text-sm">
              <Clock className="size-4 shrink-0 text-muted-foreground" />
              <span className="text-muted-foreground">영업시간·리뷰는 카카오맵에서 볼 수 있어요</span>
            </p>
            {/* 같은 브랜드라도 가맹점마다 받는 기프티콘이 다르다. 헛걸음하지 않도록 미리 알려준다. */}
            <p className="m-0 flex items-center gap-2.5 px-3.5 py-2.5 text-sm">
              <Info className="size-4 shrink-0 text-muted-foreground" />
              <span className="break-keep text-muted-foreground">기프티콘 사용가능여부는 매장에 확인해주세요</span>
            </p>
          </div>

          {/* 여기서 사람이 가장 먼저 해야 하는 일은 "이 기프티콘 되나요?" 확인이라, 전화를 대표로 둔다.
              카카오맵은 영업시간·리뷰를 보러 가는 보조 통로라 가장 조용하게 남긴다.
              전화번호가 없는 매장이면 길찾기가 대표가 된다. */}
          <div className="flex gap-2">
            {phoneHref && (
              <Button asChild className="flex-1 rounded-xl">
                <a href={phoneHref}>
                  <Phone className="size-4" /> 전화
                </a>
              </Button>
            )}
            {canOpenNavigation && (
              <Button
                variant={phoneHref ? 'outline' : 'default'}
                className="flex-1 rounded-xl"
                onClick={() => openTmapRoute({ name: store.name, lat: store.lat, lng: store.lng })}
              >
                <Navigation className="size-4" /> 길찾기
              </Button>
            )}
            {store.placeUrl && (
              <Button asChild variant="outline" className="flex-1 rounded-xl">
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

import { useEffect, useState } from 'react';
import { ChevronRight, Info, Loader2, LocateFixed, MapPin, Navigation, Phone } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import StoreDetailSheet from './StoreDetailSheet';
import { searchNearbyStores } from '../api';
import { openTmapRoute } from '../utils/tmap';
import { canOpenAppSettings, openAppSettings } from '../utils/gallery';
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

// 값과 단위를 나눠 돌려준다.
//
// 첫 카드는 둘을 세로로 쌓아 놓는데, 한 덩어리 문자열이면 '180' 다음에 'm'이 줄을 넘어가
// 혼자 떨어진다. 나눠두면 각각 안 잘린다.
function splitDistance(meters) {
  if (meters == null) return null;
  if (meters < 1000) return { value: String(meters), unit: 'm' };
  return { value: (meters / 1000).toFixed(1), unit: 'km' };
}

function formatDistance(meters) {
  const parts = splitDistance(meters);
  return parts ? `${parts.value}${parts.unit}` : null;
}

export default function NearbyStoresSheet({ gifticon, onClose }) {
  // 뒤로가기로 이 창을 닫는다. 안 그러면 설치해서 쓸 때 앱이 통째로 꺼진다.
  useBackClose(onClose);
  // 상호가 없으면 상품명으로라도 찾아본다(예: 브랜드 칸을 비워두고 등록한 경우).
  const query = (gifticon.brand || '').trim() || gifticon.name;

  const [phase, setPhase] = useState('locating'); // locating | searching | done | error
  const [stores, setStores] = useState([]);
  const [error, setError] = useState(null); // { title, description, denied, retriable }
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
        //
        // 제목은 사용자에게 벌어진 일로 적는다. '권한이 필요해요'는 앱의 사정이고,
        // 이 사람에게 벌어진 일은 "위치를 모른다"는 것이다.
        if (err?.code === 1) {
          setError({ title: '위치를 알 수 없어요', denied: true, retriable: true });
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

  const [first, ...rest] = stores;
  const firstDistance = first ? splitDistance(first.distance) : null;

  function openNavigation(store) {
    openTmapRoute({ name: store.name, lat: store.lat, lng: store.lng });
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="max-h-[92dvh] gap-0 overflow-y-auto pb-[var(--safe-bottom)]">
        {/* 부제 두 줄을 걷었다. 설명이 매장 하나 자리를 먹었고, "가까운 순"과 "누르면
            열린다"는 목록 바로 위에 있어야 눈이 목록과 함께 읽는다(아래 안내 한 줄). */}
        <SheetHeader className="pr-14 pb-3">
          <SheetTitle className="text-[19px] font-bold tracking-[-0.026em]">{query} 주변 매장</SheetTitle>
        </SheetHeader>

        {(phase === 'locating' || phase === 'searching') && (
          <div className="flex flex-col items-center gap-2.5 px-[18px] py-12">
            {phase === 'locating' ? (
              <LocateFixed className="size-6 animate-pulse text-primary" />
            ) : (
              <Loader2 className="size-6 animate-spin text-primary" />
            )}
            <p className="m-0 text-sm font-medium text-muted-foreground">
              {phase === 'locating' ? '현재 위치를 확인하고 있어요…' : '주변 매장을 찾고 있어요…'}
            </p>
          </div>
        )}

        {/* 위치를 못 잡았을 때. 허용을 안 한 경우에는 "설정에서 허용하세요" 대신
            실제로 눌러야 하는 길을 적는다 — 그 말만으로는 어디를 여는지 모른다. */}
        {phase === 'error' && (
          <div className="flex flex-col items-center gap-3.5 px-[26px] pt-[22px] pb-2">
            <span className="flex size-[60px] items-center justify-center rounded-full bg-warning/12">
              <MapPin className="size-7 text-warning" strokeWidth={1.9} />
            </span>

            <div className="flex flex-col items-center gap-2">
              <p className="m-0 text-[17.5px] font-bold tracking-[-0.02em]">{error.title}</p>
              {error.denied ? (
                <p className="m-0 text-center text-sm leading-relaxed font-medium break-keep text-foreground/70">
                  가까운 순으로 보여드리려면
                  <br />
                  위치 권한이 필요해요
                </p>
              ) : (
                error.description && (
                  <p className="m-0 text-center text-sm leading-relaxed font-medium break-keep text-muted-foreground">
                    {error.description}
                  </p>
                )
              )}
            </div>

            {/* 버튼이 설정 화면까지 데려다주고, 그 아래 한 줄이 거기서 무엇을 누를지
                말해준다. 버튼만 두면 설정 화면에 도착해서 또 헤매고, 글만 두면 그 화면을
                찾아가는 데서 헤맨다. 둘이 한 벌이다.
                (브라우저에는 설정 화면이 없어서 버튼이 안 뜬다 — 글만 남는다.) */}
            {error.denied && (
              <div className="flex w-full flex-col gap-1.5 rounded-[13px] bg-secondary px-[15px] py-[13px]">
                <p className="m-0 text-[13px] font-bold tracking-[-0.01em] text-foreground/80">켜는 방법</p>
                <p className="m-0 text-[13.5px] leading-relaxed font-medium break-keep text-foreground/70">
                  위치 → <b className="font-bold text-foreground">앱 사용 중에만 허용</b>
                </p>
              </div>
            )}

            <div className="flex w-full flex-col gap-2">
              {error.denied && canOpenAppSettings() && (
                <Button
                  size="lg"
                  className="h-12 w-full rounded-xl text-[15.5px] font-bold"
                  onClick={openAppSettings}
                >
                  설정 열기
                </Button>
              )}
              {error.retriable && (
                <Button
                  variant="outline"
                  className="h-11 w-full rounded-[11px] text-[14.5px] font-semibold"
                  onClick={() => setAttempt((n) => n + 1)}
                >
                  다시 시도
                </Button>
              )}
            </div>
          </div>
        )}

        {phase === 'done' && stores.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-8 py-10 text-center">
            <MapPin className="size-7 text-muted-foreground" />
            <p className="m-0 text-sm font-medium text-muted-foreground">주변에서 '{query}' 매장을 찾지 못했어요.</p>
          </div>
        )}

        {phase === 'done' && stores.length > 0 && (
          <>
            {/* 아래 목록 줄은 전화 버튼만 테두리를 갖고 있어서, 줄 전체가 눌린다는 신호가
                오른쪽 › 하나뿐이다. 그것도 회색이라 약하다. 이 한 줄이 가장 조용한
                해결책이다 — 줄마다 '지도' 버튼을 넣으면 전화와 경쟁하고, 줄 전체를 회색
                카드로 만들면 첫 카드의 연보라와 겹쳐 색이 너무 많아진다. */}
            <div className="flex items-center gap-2 px-[18px] pb-2.5">
              {/* 회색을 채운 동그라미로 두었더니 이 한 줄만 무겁고 흐렸다. 선으로 그린
                  i는 바탕이 흰색이라 옆 글자와 같은 무게로 읽힌다. */}
              <Info aria-hidden="true" className="size-[15px] shrink-0 text-muted-foreground" strokeWidth={2.2} />
              <p className="m-0 flex-1 text-[12.5px] font-medium text-muted-foreground">매장을 누르면 지도가 열려요</p>
              <p className="m-0 shrink-0 text-[12.5px] font-medium text-muted-foreground">가까운 순</p>
            </div>

            {/* 가장 가까운 한 곳만 카드로 세운다. 거리를 전부 포인트색으로 칠하면 다 같은
                무게라 "제일 가까운 데가 어디냐"를 눈이 아니라 순서로 세어야 한다. */}
            <div className="px-[18px] pb-3">
              <div className="flex flex-col gap-[11px] rounded-[15px] border-[1.5px] border-primary bg-primary/4 px-3.5 py-[13px]">
                <button
                  type="button"
                  onClick={() => setDetail(first)}
                  className="flex items-start gap-3 text-left"
                >
                  {/* 숫자와 단위를 세로로 쌓는다. 한 줄로 두면 '180' 다음에 'm'이 내려앉는다. */}
                  <span className="flex shrink-0 flex-col items-center gap-px pt-px">
                    <span className="text-[17px] leading-none font-bold tracking-[-0.02em] text-primary tabular-nums">
                      {firstDistance?.value ?? '?'}
                    </span>
                    <span className="text-[11.5px] font-semibold text-primary/75">{firstDistance?.unit ?? ''}</span>
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                    <span className="self-start rounded-[5px] bg-primary px-1.5 py-0.5 text-[11px] font-bold text-primary-foreground">
                      가장 가까움
                    </span>
                    <span className="truncate text-[15.5px] font-bold tracking-[-0.015em] text-foreground">
                      {first.name}
                    </span>
                    {first.address && (
                      <span className="truncate text-[13px] font-medium text-foreground/70">{first.address}</span>
                    )}
                  </span>
                </button>

                {/* 강조는 지도 보기 하나만. 길찾기·전화 아이콘은 보라로 둔다 — 아래 목록의
                    전화가 보라라, 여기서 회색이면 다른 기능처럼 보인다. */}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setDetail(first)}
                    className="flex h-11 flex-1 items-center justify-center gap-[7px] rounded-[11px] bg-primary text-[15px] font-bold text-primary-foreground"
                  >
                    <MapPin className="size-[17px]" strokeWidth={2.2} />
                    지도 보기
                  </button>
                  {first.lat != null && (
                    <button
                      type="button"
                      onClick={() => openNavigation(first)}
                      className="flex h-11 flex-1 items-center justify-center gap-[7px] rounded-[11px] border border-input bg-card text-[15px] font-semibold text-foreground/80"
                    >
                      <Navigation className="size-[17px] text-primary" strokeWidth={2} />
                      길찾기
                    </button>
                  )}
                  {first.phone && (
                    <a
                      href={`tel:${first.phone.replace(/[^\d+]/g, '')}`}
                      aria-label={`${first.name}에 전화 걸기`}
                      className="flex size-11 shrink-0 items-center justify-center rounded-[11px] border border-input bg-card"
                    >
                      <Phone className="size-[18px] text-primary" strokeWidth={2} />
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* 나머지는 끝까지 낸다. 세 곳에서 자르면 집 근처·회사 근처처럼 일부러 먼
                매장을 고르려는 사람이 갈 곳을 못 찾는다. */}
            {rest.length > 0 && (
              <ul className="m-0 flex list-none flex-col p-0 px-[18px]">
                {rest.map((store) => (
                  <li key={store.id} className="flex items-center gap-3 border-b border-border/50 px-1 py-3 last:border-b-0">
                    <button
                      type="button"
                      onClick={() => setDetail(store)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      {/* 폭을 고정하지 않는다. 폰 설정으로 글자를 키우면 '1.2km'가 50px을
                          넘어 옆 상호와 겹친다. 최소 폭만 잡아 줄이 세로로 맞게 둔다. */}
                      <span className="min-w-[50px] shrink-0 text-center text-[15px] font-bold whitespace-nowrap text-foreground/70 tabular-nums">
                        {formatDistance(store.distance) ?? '?'}
                      </span>
                      {/* 전화번호 숫자 줄은 걷었다. 옆에 전화 버튼이 있어 번호를 눈으로
                          읽을 일이 없고, 3줄이 2줄이 되어 목록이 그만큼 짧아진다. */}
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate text-[15.5px] font-semibold tracking-[-0.015em] text-foreground">
                          {store.name}
                        </span>
                        {store.address && (
                          <span className="truncate text-[13px] font-medium text-muted-foreground">{store.address}</span>
                        )}
                      </span>
                    </button>
                    {/* stopPropagation이 없으면 전화를 눌렀는데 상세가 함께 열린다. */}
                    {store.phone && (
                      <a
                        href={`tel:${store.phone.replace(/[^\d+]/g, '')}`}
                        aria-label={`${store.name}에 전화 걸기`}
                        onClick={(e) => e.stopPropagation()}
                        className="flex size-10 shrink-0 items-center justify-center rounded-full border border-input bg-background"
                      >
                        <Phone className="size-[17px] text-primary" strokeWidth={2} />
                      </a>
                    )}
                    {/* ›를 전화 버튼 뒤로 옮겼다. 앞에 있으면 "줄 전체 → 화살표 → 전화"로
                        읽혀서 화살표가 무엇을 가리키는지 흐려진다. 뒤에 두면 줄의 끝맺음이 된다. */}
                    <ChevronRight className="size-[17px] shrink-0 text-muted-foreground/60" strokeWidth={2.2} />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {phase === 'done' && (
          <p className="m-0 px-[18px] pt-3 text-center text-[11px] font-medium text-muted-foreground">
            장소 정보 제공: 카카오
          </p>
        )}

        {detail && <StoreDetailSheet store={detail} origin={origin} onClose={() => setDetail(null)} />}
      </SheetContent>
    </Sheet>
  );
}

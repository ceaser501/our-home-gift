// "이 기프티콘 어디서 쓰지?"에 답해주는 함수. 현재 위치 주변에서 브랜드 매장을
// 가까운 순으로 찾아온다.
//
// 장소 데이터는 카카오 로컬 API(키워드 검색)를 쓴다. 한국 매장 정보가 가장 정확하고,
// 좌표를 주면 거리(m)까지 계산해서 가까운 순으로 정렬해준다. 평점은 이 API가 주지
// 않아서 목록에는 없고, 매장을 눌러 카카오맵 상세로 가면 볼 수 있다.
//
// API 키는 브라우저에 노출되면 안 되므로 서버 비밀값으로만 보관한다:
//   supabase secrets set KAKAO_REST_API_KEY=...

import { corsFor, limitFromEnv, requireUser, tooManyMessage, withinDailyLimit } from '../_shared/guard.ts';

const MAX_RESULTS = 15;

// 카카오 키워드 검색은 상호만 보지 않는다. 카테고리와 태그까지 훑기 때문에 "BBQ"로 찾으면
// 세 종류가 섞여 나온다.
//   1) 진짜 그 브랜드      — BBQ 성수3점
//   2) 이름에 없는 남의 가게 — 호감도본 (치킨집이라 카테고리로 걸린다)
//   3) 이름에만 든 남의 가게 — 인생BBQ 양키고기, 제주옥탑 블랙BBQ점
// 기프티콘을 낼 수 있는 곳은 1)뿐이라, 나머지는 목록에 있으면 안 된다. 헛걸음을 시킨다.
//
// 프랜차이즈 상호는 거의 브랜드로 시작하므로(BBQ ○○점 · 스타벅스 ○○점) 그것만 남긴다.
// 2)는 브랜드가 아예 없어서, 3)은 앞에 다른 말이 붙어서 걸러진다.
function normalizeName(value: string): string {
  // 표기 흔들림을 없앤다. "메가 MGC 커피"와 "메가MGC커피"가 같은 것이 되도록.
  return value.replace(/[\s·・.\-_'"()]/g, '').toUpperCase();
}

function onlyBrandStores<T extends { name: string }>(stores: T[], query: string): T[] {
  const key = normalizeName(query);
  if (!key) return stores;

  const names = stores.map((store) => normalizeName(store.name));

  const byPrefix = stores.filter((_, i) => names[i].startsWith(key));
  if (byPrefix.length) return byPrefix;

  // 여기부터는 기프티콘에 적힌 브랜드와 간판이 어긋나는 경우다.
  // 이름 어딘가에 통째로 들어 있으면 그것부터 본다.
  const byPart = stores.filter((_, i) => names[i].includes(key));
  if (byPart.length) return byPart;

  // 그래도 없으면 브랜드를 뒤에서 한 글자씩 줄여가며 다시 앞을 맞춰본다.
  // "메가커피"는 간판이 "메가MGC커피 ○○점"이라 통째로는 안 맞지만 "메가"로는 맞는다.
  // 두 글자까지만 줄인다 — 더 줄이면 "파리"가 파리크라상까지 데려온다.
  for (let len = key.length - 1; len >= 2; len -= 1) {
    const head = key.slice(0, len);
    const hit = stores.filter((_, i) => names[i].startsWith(head));
    if (hit.length) return hit;
  }

  // 끝내 못 맞추면 거르지 않는다. 우리가 못 알아본 것을 "이 근처에 없다"로 알려주는
  // 편이, 남의 가게가 섞이는 것보다 나쁘다.
  return stores;
}

// 카카오가 돌려준 오류를 사람이 읽을 한국어로 바꾼다. 원문(JSON)을 그대로 내보내면
// 화면에 영어 에러가 떠서 무슨 말인지 알 수 없다. 설정 문제(관리자가 고쳐야 하는 것)와
// 일시적인 문제(다시 시도하면 되는 것)를 구분해서 알려준다.
function friendlyKakaoError(status: number, detail: string): string {
  if (detail.includes('OPEN_MAP_AND_LOCAL')) {
    return '카카오 설정이 아직 안 끝났어요. 카카오 개발자센터 → 내 애플리케이션 → 제품 설정 → 카카오맵에서 "활성화"를 켜면 바로 돼요.';
  }
  if (status === 401 || detail.includes('InvalidAppKey')) {
    return '카카오 API 키가 올바르지 않아요. KAKAO_REST_API_KEY 값을 다시 확인해주세요.';
  }
  if (status === 429) {
    return '오늘 검색할 수 있는 횟수를 다 썼어요. 내일 다시 시도해주세요.';
  }
  return `주변 매장 검색이 잠시 안 되고 있어요. 조금 뒤 다시 시도해주세요. (카카오 오류 ${status})`;
}

// 내 위치 → 매장까지 도로를 따라가는 자동차 경로. 카카오모빌리티 길찾기 API가
// 도로 좌표(vertexes)를 죽 내려주면 그대로 지도에 그린다.
// 직선으로 이어버리면 건물과 강을 가로질러서 실제로는 아무 쓸모가 없다.
// (도보 경로는 카카오가 공개 API로 주지 않아 자동차 기준으로만 그린다.)
async function handleRoute(
  body: Record<string, { lat: number; lng: number } | undefined>,
  apiKey: string,
  reply: (body: unknown, status?: number) => Response,
) {
  const { origin, destination } = body;
  if (!origin || !destination || typeof origin.lat !== 'number' || typeof destination.lat !== 'number') {
    return reply({ error: '출발지와 도착지가 필요해요.' }, 400);
  }

  const url = new URL('https://apis-navi.kakaomobility.com/v1/directions');
  // 이 API는 좌표를 경도,위도 순서로 받는다(위도,경도가 아니다).
  url.searchParams.set('origin', `${origin.lng},${origin.lat}`);
  url.searchParams.set('destination', `${destination.lng},${destination.lat}`);
  url.searchParams.set('priority', 'RECOMMEND');

  const res = await fetch(url.toString(), { headers: { Authorization: `KakaoAK ${apiKey}` } });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    if (res.status === 401 || res.status === 403) {
      return reply(
        {
          error:
            '길찾기 기능이 아직 열려 있지 않아요. 카카오 개발자센터에서 이 앱의 길찾기(카카오내비/모빌리티) API를 활성화해주세요.',
        },
        502,
      );
    }
    return reply({ error: `경로를 불러오지 못했어요. (카카오 ${res.status}) ${detail}`.trim() }, 502);
  }

  const data = await res.json();
  const route = data.routes?.[0];
  // result_code 0이 성공. 그 외에는 길이 없거나(섬 등) 좌표가 이상한 경우다.
  if (!route || route.result_code !== 0) {
    return reply({ error: route?.result_msg || '이 매장까지 가는 길을 찾지 못했어요.' }, 200);
  }

  // vertexes는 [경도, 위도, 경도, 위도, ...]로 쭉 이어진 한 줄짜리 배열이라 둘씩 끊어 읽는다.
  const path: { lat: number; lng: number }[] = [];
  for (const section of route.sections || []) {
    for (const road of section.roads || []) {
      const v = road.vertexes || [];
      for (let i = 0; i + 1 < v.length; i += 2) {
        path.push({ lng: v[i], lat: v[i + 1] });
      }
    }
  }

  if (path.length === 0) {
    return reply({ error: '이 매장까지 가는 길을 찾지 못했어요.' }, 200);
  }

  return reply({
    path,
    distance: route.summary?.distance ?? null, // 미터
    duration: route.summary?.duration ?? null, // 초
  });
}

// 내 위치 → 매장까지 걸어가는 길. 카카오는 도보 경로를 공개 API로 주지 않아서
// 이것만 티맵(SK open API)에서 받아온다. 지도와 자동차 경로는 그대로 카카오를 쓴다.
// 필요한 비밀값: supabase secrets set TMAP_APP_KEY=...
async function handleWalkRoute(
  body: Record<string, { lat: number; lng: number } | undefined>,
  reply: (body: unknown, status?: number) => Response,
) {
  const appKey = Deno.env.get('TMAP_APP_KEY');
  if (!appKey) {
    return reply({ error: '도보 경로 설정이 아직 안 됐어요. 티맵 앱키(TMAP_APP_KEY)를 등록해주세요.' }, 200);
  }

  const { origin, destination } = body;
  if (!origin || !destination || typeof origin.lat !== 'number' || typeof destination.lat !== 'number') {
    return reply({ error: '출발지와 도착지가 필요해요.' }, 400);
  }

  const res = await fetch('https://apis.openapi.sk.com/tmap/routes/pedestrian?version=1', {
    method: 'POST',
    headers: { appKey, 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      startX: origin.lng,
      startY: origin.lat,
      endX: destination.lng,
      endY: destination.lat,
      // 이름은 URL 인코딩해서 넘겨야 한다(티맵 규격).
      startName: encodeURIComponent('내 위치'),
      endName: encodeURIComponent('매장'),
      reqCoordType: 'WGS84GEO',
      resCoordType: 'WGS84GEO',
      searchOption: '0',
    }),
  });

  if (!res.ok) {
    // 티맵이 돌려준 설명을 조금 붙여준다. "키가 틀렸다"와 "이 API를 아직 쓸 수 없다"는
    // 둘 다 401/403으로 오는데, 무엇을 고쳐야 하는지가 완전히 달라서 구분이 필요하다.
    const raw = await res.text().catch(() => '');
    const detail = raw.replace(/\s+/g, ' ').slice(0, 200);

    let hint = '도보 경로를 불러오지 못했어요.';
    if (res.status === 401) {
      hint = '티맵 앱키가 아직 통하지 않아요. 키 값이 맞는지, 발급 직후라면 잠시 뒤 다시 시도해보세요.';
    } else if (res.status === 403) {
      hint =
        '이 앱키로는 보행자 경로를 쓸 수 없어요. SK open API에서 이 앱에 "경로안내" 상품이 신청돼 있는지 확인해주세요.';
    } else if (res.status === 429) {
      hint = '오늘 도보 경로를 찾을 수 있는 횟수를 다 썼어요.';
    }
    return reply({ error: `${hint} (티맵 ${res.status}${detail ? ` · ${detail}` : ''})` }, 200);
  }

  const data = await res.json();
  const features = data.features || [];

  // 걸어가는 길은 LineString 조각 여러 개로 쪼개져서 온다. 순서대로 이어 붙인다.
  const path: { lat: number; lng: number }[] = [];
  for (const feature of features) {
    if (feature?.geometry?.type !== 'LineString') continue;
    for (const [lng, lat] of feature.geometry.coordinates || []) {
      path.push({ lat, lng });
    }
  }

  if (path.length === 0) {
    return reply({ error: '이 매장까지 걸어가는 길을 찾지 못했어요.' }, 200);
  }

  // 총 거리·시간은 첫 지점(Point)에 들어 있다.
  const summary = features.find((f: { properties?: { totalDistance?: number } }) => f?.properties?.totalDistance != null);
  return reply({
    path,
    distance: summary?.properties?.totalDistance ?? null,
    duration: summary?.properties?.totalTime ?? null,
  });
}

Deno.serve(async (req) => {
  const corsHeaders = corsFor(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: jsonHeaders });

  try {
    // 카카오는 무료 쿼터가 있고 TMAP 보행경로는 하루 1,000건을 넘으면 건당 요금이다.
    // 아무나 부를 수 있으면 하룻밤 사이에 쿼터가 비고 요금이 붙는다.
    const guard = await requireUser(req);
    if (guard.error) return reply({ error: guard.error }, guard.status);

    const usage = await withinDailyLimit(
      guard.admin,
      guard.user.id,
      'places',
      limitFromEnv('PLACES_DAILY_LIMIT', 200),
      limitFromEnv('PLACES_TOTAL_DAILY_LIMIT', 3000),
    );
    if (!usage.allowed) return reply({ error: tooManyMessage(usage) }, 429);

    const apiKey = Deno.env.get('KAKAO_REST_API_KEY');
    if (!apiKey) {
      return reply({ error: '주변 매장 검색 서버 설정이 아직 완료되지 않았어요.' }, 500);
    }

    const payload = await req.json();
    if (payload?.mode === 'route') return handleRoute(payload, apiKey, reply);
    if (payload?.mode === 'walk') return handleWalkRoute(payload, reply);

    const { query, lat, lng } = payload;
    if (!query || !String(query).trim()) {
      return reply({ error: '검색할 브랜드 이름이 필요해요.' }, 400);
    }
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return reply({ error: '현재 위치가 필요해요.' }, 400);
    }

    const keyword = String(query).trim();

    const toStore = (d: Record<string, string>) => ({
      id: d.id,
      name: d.place_name,
      phone: d.phone || null,
      address: d.road_address_name || d.address_name || null,
      // 카카오가 계산해준 현재 위치와의 거리(미터). 정렬도 이 값 기준으로 이미 돼 있다.
      distance: d.distance ? Number(d.distance) : null,
      // 카카오맵 장소 상세 페이지(영업시간·평점·리뷰는 API가 안 줘서 여기서만 볼 수 있다)
      placeUrl: d.place_url || null,
      category: d.category_name ? d.category_name.split('>').pop()!.trim() : null,
      // 앱 안에서 지도를 그릴 때 쓸 좌표
      lat: d.y ? Number(d.y) : null,
      lng: d.x ? Number(d.x) : null,
    });

    // 남의 가게를 걸러내고 나면 한 쪽(15개)에서 몇 개 안 남는다 — "BBQ"는 열다섯 중 넷뿐이다.
    // 그래서 목록이 찰 때까지 다음 쪽을 더 가져온다. 카카오는 15개씩 세 쪽(45개)까지 준다.
    // 호출이 늘지만 카카오 로컬 무료 쿼터는 하루 십만 건이라 여유가 있고, 사람 쪽 한도
    // (PLACES_DAILY_LIMIT)는 이 함수를 부른 횟수로 세니 그대로다.
    const found: ReturnType<typeof toStore>[] = [];
    for (let page = 1; page <= 3; page += 1) {
      const url = new URL('https://dapi.kakao.com/v2/local/search/keyword.json');
      url.searchParams.set('query', keyword);
      url.searchParams.set('y', String(lat));
      url.searchParams.set('x', String(lng));
      url.searchParams.set('sort', 'distance');
      url.searchParams.set('size', String(MAX_RESULTS));
      url.searchParams.set('page', String(page));

      const res = await fetch(url.toString(), { headers: { Authorization: `KakaoAK ${apiKey}` } });
      if (!res.ok) {
        // 첫 쪽이 실패하면 보여줄 것이 없다. 두 번째부터는 더 못 채웠을 뿐이라 있는 것으로 답한다.
        if (page === 1) {
          const detail = await res.text().catch(() => '');
          return reply({ error: friendlyKakaoError(res.status, detail) }, 502);
        }
        break;
      }

      const data = await res.json();
      for (const document of data.documents || []) found.push(toStore(document));

      if (data.meta?.is_end !== false) break;
      if (onlyBrandStores(found, keyword).length >= MAX_RESULTS) break;
    }

    return reply({ stores: onlyBrandStores(found, keyword).slice(0, MAX_RESULTS) });
  } catch (err) {
    const message = err instanceof Error ? err.message : '매장 검색에 실패했어요.';
    return reply({ error: message }, 500);
  }
});

// "이 기프티콘 어디서 쓰지?"에 답해주는 함수. 현재 위치 주변에서 브랜드 매장을
// 가까운 순으로 찾아온다.
//
// 장소 데이터는 카카오 로컬 API(키워드 검색)를 쓴다. 한국 매장 정보가 가장 정확하고,
// 좌표를 주면 거리(m)까지 계산해서 가까운 순으로 정렬해준다. 평점은 이 API가 주지
// 않아서 목록에는 없고, 매장을 눌러 카카오맵 상세로 가면 볼 수 있다.
//
// API 키는 브라우저에 노출되면 안 되므로 서버 비밀값으로만 보관한다:
//   supabase secrets set KAKAO_REST_API_KEY=...

const MAX_RESULTS = 15;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: jsonHeaders });

  try {
    const apiKey = Deno.env.get('KAKAO_REST_API_KEY');
    if (!apiKey) {
      return reply({ error: '주변 매장 검색 서버 설정이 아직 완료되지 않았어요.' }, 500);
    }

    const payload = await req.json();
    if (payload?.mode === 'route') return handleRoute(payload, apiKey, reply);

    const { query, lat, lng } = payload;
    if (!query || !String(query).trim()) {
      return reply({ error: '검색할 브랜드 이름이 필요해요.' }, 400);
    }
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return reply({ error: '현재 위치가 필요해요.' }, 400);
    }

    const url = new URL('https://dapi.kakao.com/v2/local/search/keyword.json');
    url.searchParams.set('query', String(query).trim());
    url.searchParams.set('y', String(lat));
    url.searchParams.set('x', String(lng));
    url.searchParams.set('sort', 'distance');
    url.searchParams.set('size', String(MAX_RESULTS));

    const res = await fetch(url.toString(), { headers: { Authorization: `KakaoAK ${apiKey}` } });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return reply({ error: friendlyKakaoError(res.status, detail) }, 502);
    }

    const data = await res.json();
    const stores = (data.documents || []).map((d: Record<string, string>) => ({
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
    }));

    return reply({ stores });
  } catch (err) {
    const message = err instanceof Error ? err.message : '매장 검색에 실패했어요.';
    return reply({ error: message }, 500);
  }
});

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

    const { query, lat, lng } = await req.json();
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
      const hint = res.status === 401 ? ' KAKAO_REST_API_KEY 값을 확인해주세요.' : '';
      return reply({ error: `매장 검색에 실패했어요 (카카오 ${res.status}).${hint} ${detail}`.trim() }, 502);
    }

    const data = await res.json();
    const stores = (data.documents || []).map((d: Record<string, string>) => ({
      id: d.id,
      name: d.place_name,
      phone: d.phone || null,
      address: d.road_address_name || d.address_name || null,
      // 카카오가 계산해준 현재 위치와의 거리(미터). 정렬도 이 값 기준으로 이미 돼 있다.
      distance: d.distance ? Number(d.distance) : null,
      // 카카오맵 장소 상세 페이지(지도·영업시간·전화·평점·길찾기가 다 있다)
      placeUrl: d.place_url || null,
      category: d.category_name ? d.category_name.split('>').pop()!.trim() : null,
    }));

    return reply({ stores });
  } catch (err) {
    const message = err instanceof Error ? err.message : '매장 검색에 실패했어요.';
    return reply({ error: message }, 500);
  }
});

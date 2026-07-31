// 네이버 쇼핑 검색으로 "브랜드 + 상품명"을 찾아 최저가를 돌려주는 함수.
// 금액이 안 찍혀 나오는 상품형 기프티콘(예: 카페 음료 1개)에서, 사용자가
// "가격 검색" 버튼을 눌렀을 때만 호출된다. 네이버 API 키는 브라우저에
// 노출되면 안 되므로 이 서버(Edge Function) 쪽 비밀값으로만 갖고 있는다.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function stripHtml(text) {
  return text.replace(/<\/?b>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

  try {
    const { brand, name } = await req.json();
    if (!name || !String(name).trim()) {
      return new Response(JSON.stringify({ error: '상품명이 필요해요.' }), { status: 400, headers: jsonHeaders });
    }

    // 네이버 로그인이 쓰는 앱(NAVER_CLIENT_ID/SECRET)과는 다른, 검색 전용 앱의 키.
    const clientId = Deno.env.get('NAVER_SEARCH_CLIENT_ID');
    const clientSecret = Deno.env.get('NAVER_SEARCH_CLIENT_SECRET');
    if (!clientId || !clientSecret) {
      return new Response(JSON.stringify({ error: '네이버 API 키가 설정되지 않았어요.' }), {
        status: 500,
        headers: jsonHeaders,
      });
    }

    const query = [brand, name].filter(Boolean).join(' ').trim();
    const url = `https://openapi.naver.com/v1/search/shop.json?query=${encodeURIComponent(query)}&display=10&sort=sim`;

    const naverRes = await fetch(url, {
      headers: {
        'X-Naver-Client-Id': clientId,
        'X-Naver-Client-Secret': clientSecret,
      },
    });

    if (!naverRes.ok) {
      return new Response(JSON.stringify({ error: `네이버 검색 실패 (${naverRes.status})` }), {
        status: 502,
        headers: jsonHeaders,
      });
    }

    const data = await naverRes.json();
    const items = (data.items || [])
      .map((item) => ({
        title: stripHtml(item.title || ''),
        price: Number(item.lprice),
        mall: item.mallName,
        link: item.link,
      }))
      .filter((item) => Number.isFinite(item.price) && item.price > 0);

    if (items.length === 0) {
      return new Response(JSON.stringify({ amount: null, query, items: [] }), { headers: jsonHeaders });
    }

    items.sort((a, b) => a.price - b.price);
    const median = items[Math.floor(items.length / 2)];

    return new Response(
      JSON.stringify({
        amount: median.price,
        source: median.title,
        query,
        items: items.slice(0, 5),
      }),
      { headers: jsonHeaders }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : '알 수 없는 오류' }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});

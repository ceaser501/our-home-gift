// "가격 검색" 버튼을 눌렀을 때, 상품형 기프티콘(금액이 인쇄돼 있지 않은 것)의
// 현재 판매가를 찾아주는 함수.
//
// 예전에는 네이버 쇼핑 검색 결과 열 개의 중앙값을 썼는데, 쇼핑 검색은 기프티콘 시세를
// 위한 것이 아니라서 상품명으로 검색하면 소스·굿즈·묶음 상품이 섞여 들어왔고 그 중앙값은
// 실제 가격과 상관없는 숫자가 되곤 했다. 그래서 모델에게 웹 검색을 맡기고, 검색 결과를
// 읽어 "이 상품의 판매가"만 골라내도록 바꿨다.
//
// 필요한 비밀값: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...

import { corsFor, limitFromEnv, logAiUsage, requireUser, tooManyMessage, withinDailyLimit } from '../_shared/guard.ts';
// 검색 자체(프롬프트·웹 검색·답 읽기)는 관리자 "예상 금액 산출"과 같이 쓴다.
import { PRICE_MODEL, findPrice } from '../_shared/price-search.ts';

Deno.serve(async (req) => {
  const corsHeaders = corsFor(req);
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

  try {
    // 웹 검색까지 도는 호출이라 한 번이 꽤 비싸다. 로그인한 사람만, 그것도 하루 몇 번까지만.
    const guard = await requireUser(req);
    if (guard.error) {
      return new Response(JSON.stringify({ error: guard.error }), { status: guard.status, headers: jsonHeaders });
    }
    const usage = await withinDailyLimit(
      guard.admin,
      guard.user.id,
      'price',
      limitFromEnv('PRICE_DAILY_LIMIT', 50),
      limitFromEnv('PRICE_TOTAL_DAILY_LIMIT', 800),
      // 달 천장. analyze에는 있는데 여기만 없었다(2026-09-13에 넣었다).
      //
      // 하루 한도만 보면 늘 여유가 있어 보여서 이 구멍은 눈에 안 띈다. 800건이 30일이면
      // 24,000건이고, ai_usage_log에서 뽑은 실제 단가가 한 번에 약 $0.05다 — 웹 검색
      // 결과가 통째로 입력 토큰이 되어서 analyze 한 건($0.019)보다 비싸다. 다 채우면
      // 한 달에 $1,200가 넘는다.
      //
      // 80으로 잡은 근거는 지금 이 기능이 꺼져 있다는 것이다 —
      // client/src/components/UploadSheet.jsx:84의 SHOW_PRICE_SEARCH가 false라 화면에
      // 버튼이 안 뜬다. 그래도 이 함수는 배포된 채 살아 있어 로그인한 사람이면 직접
      // 부를 수 있으므로, 예산을 축내지 않는 선에서 막아만 둔다.
      //
      // 버튼을 되살릴 때 이 값을 같이 올린다. 안 올리면 몇 번 만에 막힌다.
      limitFromEnv('PRICE_TOTAL_MONTHLY_LIMIT', 80),
    );
    if (!usage.allowed) {
      return new Response(JSON.stringify({ error: tooManyMessage(usage) }), {
        status: 429,
        headers: jsonHeaders,
      });
    }

    const { brand, name } = await req.json();
    if (!name || !String(name).trim()) {
      return new Response(JSON.stringify({ error: '상품명이 필요해요.' }), { status: 400, headers: jsonHeaders });
    }

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: '가격 검색 서버 설정이 아직 완료되지 않았어요.' }), {
        status: 500,
        headers: jsonHeaders,
      });
    }

    const found = await findPrice(apiKey, brand, String(name));
    await logAiUsage(guard.admin, 'price', PRICE_MODEL, found.spent, found.webSearches);

    return new Response(
      JSON.stringify({
        amount: found.amount,
        source: found.source,
        query: found.query,
      }),
      { headers: jsonHeaders }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : '가격 검색에 실패했어요.';
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: jsonHeaders });
  }
});

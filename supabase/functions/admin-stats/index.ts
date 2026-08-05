// 관리자 대시보드(admin/index.html)가 부르는 통계 함수.
//
// 앱과는 연결 통로가 없다. 관리자 혼자 보는 화면이라 로그인 체계를 붙이지 않고,
// 비밀 토큰 하나로 지킨다:
//   supabase secrets set ADMIN_STATS_TOKEN=$(openssl rand -hex 32)
// 대시보드 설정 화면에 같은 값을 넣으면 요청마다 x-admin-token 헤더로 실려 온다.
//
// 숫자를 실제로 세는 일은 데이터베이스의 admin_dashboard_stats()가 한다
// (supabase/admin-stats.sql — 이 함수를 배포하기 전에 먼저 실행해야 한다).
// 여기서는 토큰을 확인하고, 비용 계산에 쓸 단가를 함께 실어 보낸다.

import { adminClient } from '../_shared/guard.ts';

// 대시보드는 정적 HTML이라 어디서 열릴지(로컬 파일, 아무 정적 호스팅) 정해져 있지 않다.
// 인증이 Origin이 아니라 토큰이므로 CORS는 전부 열어도 지켜진다.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-admin-token',
};
const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

// 문자열을 앞에서부터 비교하다 다른 글자에서 멈추면, 걸린 시간으로 몇 글자까지 맞았는지
// 새어 나간다. 해시로 바꿔 길이를 같게 만든 뒤 끝까지 비교한다.
async function tokenMatches(given: string, expected: string) {
  const digest = async (value: string) =>
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  const [a, b] = await Promise.all([digest(given), digest(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function priceFromEnv(name: string, fallback: number) {
  const raw = Number(Deno.env.get(name));
  return Number.isFinite(raw) && raw >= 0 ? raw : fallback;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const expected = Deno.env.get('ADMIN_STATS_TOKEN');
  if (!expected) {
    return new Response(JSON.stringify({ error: 'ADMIN_STATS_TOKEN이 설정되지 않았어요.' }), {
      status: 500,
      headers: jsonHeaders,
    });
  }

  const given = (req.headers.get('x-admin-token') || '').trim();
  if (!given || !(await tokenMatches(given, expected))) {
    return new Response(JSON.stringify({ error: '관리자 토큰이 올바르지 않아요.' }), {
      status: 401,
      headers: jsonHeaders,
    });
  }

  const admin = adminClient();
  if (!admin) {
    return new Response(JSON.stringify({ error: '서버 설정이 완료되지 않았어요.' }), {
      status: 500,
      headers: jsonHeaders,
    });
  }

  const { data, error } = await admin.rpc('admin_dashboard_stats');
  if (error) {
    return new Response(
      JSON.stringify({ error: `통계를 가져오지 못했어요: ${error.message} (supabase/admin-stats.sql을 실행했는지 확인해주세요)` }),
      { status: 500, headers: jsonHeaders },
    );
  }

  // 비용 계산에 쓰는 단가. 코드가 아니라 응답에 실어 보내는 이유는, 요금이 바뀌었을 때
  // 대시보드 HTML을 고칠 필요 없이 여기(또는 secrets)만 고치면 되게 하려는 것이다.
  //
  // - AI 토큰 단가: claude-haiku-4-5 기준 입력 $1 / 출력 $5 (백만 토큰당, 2026-08 기준)
  // - 웹 검색: $10 / 1,000회 (search-price가 회당 최대 4번 검색한다)
  // - 토큰 기록(ai_usage_log)이 없는 옛날 호출은 회당 어림값으로 계산한다.
  // - places(카카오 로컬·모빌리티, TMAP 보행자)와 join_attempt는 현재 무료 구간이라 0.
  //   유료 전환되면 PLACES_USD_PER_CALL만 바꾸면 된다.
  const pricing = {
    token_prices: {
      'claude-haiku-4-5': {
        input_usd_per_mtok: priceFromEnv('AI_INPUT_USD_PER_MTOK', 1),
        output_usd_per_mtok: priceFromEnv('AI_OUTPUT_USD_PER_MTOK', 5),
      },
    },
    web_search_usd_per_call: priceFromEnv('WEB_SEARCH_USD_PER_CALL', 0.01),
    estimate_usd_per_call: {
      analyze: priceFromEnv('ANALYZE_EST_USD_PER_CALL', 0.008),
      price: priceFromEnv('PRICE_EST_USD_PER_CALL', 0.05),
      places: priceFromEnv('PLACES_USD_PER_CALL', 0),
      join_attempt: 0,
    },
  };

  return new Response(JSON.stringify({ ...data, pricing }), { headers: jsonHeaders });
});

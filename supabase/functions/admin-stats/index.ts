// 관리자 대시보드(admin/index.html)가 부르는 통계 함수.
//
// 대시보드 주소는 앱과 같은 곳에 있어서 누구나 열 수 있다. 자물쇠는 여기에 있다.
//   1) 앱과 같은 로그인인지 — 토큰으로 auth 서버에 물어본다(anon key로는 통과 못 한다).
//   2) 그 사람이 관리자 명단(admin_users)에 있는지 — 앱 사용자 아무나는 통과하지 못한다.
//
// 예전에는 공유 비밀 토큰 하나(ADMIN_STATS_TOKEN)로 막았는데, 붙여넣기가 번거롭고 한 번
// 새면 값을 바꿔 재배포하기 전까지 계속 유효했다. 로그인은 사람마다 다르고, 명단에서
// 지우는 즉시 그 사람만 막힌다.
//
// 관리자 등록은 supabase/admin-stats.sql 위쪽 주석 참고.
//
// 숫자를 실제로 세는 일은 데이터베이스의 admin_dashboard_stats()가 한다.

import { adminClient } from '../_shared/guard.ts';

// 대시보드가 어디서 열릴지(Pages 주소, 로컬 파일) 정해져 있지 않다. 인증이 Origin이 아니라
// 로그인 토큰이므로 CORS는 열어도 지켜진다.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};
const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

function priceFromEnv(name: string, fallback: number) {
  const raw = Number(Deno.env.get(name));
  return Number.isFinite(raw) && raw >= 0 ? raw : fallback;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const admin = adminClient();
  if (!admin) {
    return new Response(JSON.stringify({ error: '서버 설정이 완료되지 않았어요.' }), {
      status: 500,
      headers: jsonHeaders,
    });
  }

  // 1) 로그인 확인. anon key도 형식은 JWT라 여기까지는 오지만, 그 토큰에는 사용자가 없다.
  const token = (req.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  if (!token) {
    return new Response(JSON.stringify({ error: '로그인이 필요해요.', reason: 'unauthenticated' }), {
      status: 401,
      headers: jsonHeaders,
    });
  }

  const { data: auth, error: authError } = await admin.auth.getUser(token);
  if (authError || !auth?.user) {
    return new Response(JSON.stringify({ error: '로그인이 만료됐어요. 다시 로그인해주세요.', reason: 'unauthenticated' }), {
      status: 401,
      headers: jsonHeaders,
    });
  }

  // 2) 관리자 명단 확인. 로그인만으로는 부족하다 — 앱 사용자는 누구나 로그인할 수 있다.
  const { data: row, error: adminError } = await admin
    .from('admin_users')
    .select('user_id')
    .eq('user_id', auth.user.id)
    .maybeSingle();

  if (adminError) {
    return new Response(
      JSON.stringify({ error: `관리자 확인에 실패했어요: ${adminError.message} (supabase/admin-stats.sql을 실행했는지 확인해주세요)` }),
      { status: 500, headers: jsonHeaders },
    );
  }
  if (!row) {
    // 명단에 없는 사람에게는 "명단에 없다"까지만 알린다. 누가 관리자인지는 알려주지 않는다.
    return new Response(JSON.stringify({ error: '이 계정은 관리자가 아니에요.', reason: 'not_admin' }), {
      status: 403,
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

  return new Response(JSON.stringify({ ...data, pricing, viewer: { email: auth.user.email } }), {
    headers: jsonHeaders,
  });
});

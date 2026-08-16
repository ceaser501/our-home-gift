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

  // 여기서부터는 관리자만 온다. 무엇을 볼지는 resource로 정한다.
  //   (없음) → 대시보드 통계
  //   users / gifticons / families → 관리 화면의 목록
  const url = new URL(req.url);
  const resource = url.searchParams.get('resource') || 'stats';
  const num = (name: string, fallback: number, max: number) => {
    const raw = Number(url.searchParams.get(name));
    return Number.isFinite(raw) && raw >= 0 ? Math.min(Math.floor(raw), max) : fallback;
  };

  // 공지사항: 목록은 GET, 등록/수정/삭제는 POST. notices 테이블에는 브라우저용 쓰기 정책이
  // 일부러 없어서(schema.sql), 쓰기는 반드시 여기(서비스 롤)를 거친다. 여기 들어간 공지가
  // 앱의 배너와 공지사항 화면에 그대로 나간다.
  if (resource === 'notices') {
    if (req.method === 'POST') {
      let payload: { action?: string; id?: number; notice?: Record<string, unknown> };
      try {
        payload = await req.json();
      } catch {
        return new Response(JSON.stringify({ error: '요청 형식이 올바르지 않아요.' }), { status: 400, headers: jsonHeaders });
      }

      // 화면이 보낸 값을 그대로 넣지 않고 쓸 수 있는 칸만 골라 담는다.
      const pick = (n: Record<string, unknown> | undefined) => ({
        title: String(n?.title ?? '').trim(),
        body: String(n?.body ?? '').trim() || null,
        starts_at: n?.starts_at ? String(n.starts_at) : new Date().toISOString(),
        ends_at: n?.ends_at ? String(n.ends_at) : null,
        // 꼭 봐야 하는 공지인지. 앱에서 종 옆에 알리고 알림 목록 맨 위에 고정한다.
        is_important: Boolean(n?.is_important),
        // 이 공지가 뜬 동안 기프티콘 등록을 막을지.
        //
        // is_important와 나눠 둔 이유가 있다. 유료화 안내도 꼭 봐야 하는 공지인데 그게
        // 등록을 막으면 안 된다 — "꼭 봐야 하는가"와 "지금 그 기능이 되는가"는 다른
        // 이야기다. 점검·장애 공지에만 이 표시를 붙인다.
        blocks_upload: Boolean(n?.blocks_upload),
      });

      if (payload.action === 'create') {
        const notice = pick(payload.notice);
        if (!notice.title) {
          return new Response(JSON.stringify({ error: '제목을 입력해주세요.' }), { status: 400, headers: jsonHeaders });
        }
        const { error: e } = await admin.from('notices').insert(notice);
        if (e) return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: jsonHeaders });
      } else if (payload.action === 'update' && payload.id) {
        const notice = pick(payload.notice);
        if (!notice.title) {
          return new Response(JSON.stringify({ error: '제목을 입력해주세요.' }), { status: 400, headers: jsonHeaders });
        }
        const { data: saved, error: e } = await admin.from('notices').update(notice).eq('id', payload.id).select('id');
        if (e) return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: jsonHeaders });
        if (!saved || saved.length === 0) {
          return new Response(JSON.stringify({ error: `공지(${payload.id})를 고치지 못했어요. 목록을 새로고침해주세요.` }), {
            status: 500,
            headers: jsonHeaders,
          });
        }
      } else if (payload.action === 'delete' && payload.id) {
        // .select()를 붙여 몇 줄이 지워졌는지 받아온다. 이게 없으면 한 줄도 못 지웠을 때도
        // 오류 없이 조용히 성공으로 돌아온다 — 화면에서는 "눌렀는데 그대로"가 되고,
        // 무엇이 잘못됐는지 알 길이 없다. 실제로 그렇게 한참 헤맸다.
        const { data: gone, error: e } = await admin.from('notices').delete().eq('id', payload.id).select('id');
        if (e) return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: jsonHeaders });
        if (!gone || gone.length === 0) {
          return new Response(
            JSON.stringify({
              error:
                `공지(${payload.id})를 지우지 못했어요. 이미 지워졌거나, 이 함수가 서비스 롤 키 없이 돌고 있어요 ` +
                `(SUPABASE_SERVICE_ROLE_KEY를 확인하고 supabase functions deploy admin-stats를 다시 해주세요).`,
            }),
            { status: 500, headers: jsonHeaders },
          );
        }
      } else {
        return new Response(JSON.stringify({ error: '알 수 없는 동작이에요.' }), { status: 400, headers: jsonHeaders });
      }
      return new Response(JSON.stringify({ ok: true }), { headers: jsonHeaders });
    }

    // 목록: 앱과 달리 예정/내려간 공지까지 전부 본다(관리 화면이니까).
    const { data: rows, error: e } = await admin
      .from('notices')
      // is_important를 빼면 화면에서 공지를 "수정"으로 열 때 그 값이 undefined로 와서
      // 체크가 풀린 채 보이고, 그대로 저장하면 중요 표시가 조용히 지워진다.
      .select('id, title, body, starts_at, ends_at, is_important, blocks_upload, created_at')
      .order('starts_at', { ascending: false });
    if (e) return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: jsonHeaders });
    return new Response(JSON.stringify({ rows }), { headers: jsonHeaders });
  }

  // 관리자 명단 고치기. 회원 관리 화면에서 다른 사람을 관리자로 넣고 뺀다.
  // 여기까지 온 사람은 이미 관리자다(위에서 확인했다). 자기 자신을 빼거나 마지막 한 명을
  // 빼는 것은 admin_set_admin이 막는다. 그 판단을 함수 안에 둔 이유는 admin-stats.sql 주석 참고.
  if (resource === 'admins') {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: '알 수 없는 동작이에요.' }), { status: 400, headers: jsonHeaders });
    }
    let payload: { action?: string; user_id?: string; memo?: string };
    try {
      payload = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: '요청 형식이 올바르지 않아요.' }), { status: 400, headers: jsonHeaders });
    }

    if (payload.action !== 'add' && payload.action !== 'remove') {
      return new Response(JSON.stringify({ error: '알 수 없는 동작이에요.' }), { status: 400, headers: jsonHeaders });
    }
    if (!payload.user_id) {
      return new Response(JSON.stringify({ error: '어떤 계정인지 알 수 없어요.' }), { status: 400, headers: jsonHeaders });
    }

    const { data: result, error: setError } = await admin.rpc('admin_set_admin', {
      target_id: payload.user_id,
      make_admin: payload.action === 'add',
      actor_id: auth.user.id,
      memo_text: payload.memo ?? null,
    });
    if (setError) {
      return new Response(
        JSON.stringify({ error: `관리자 명단을 고치지 못했어요: ${setError.message} (supabase/admin-stats.sql을 다시 실행했는지 확인해주세요)` }),
        { status: 500, headers: jsonHeaders },
      );
    }
    // 함수가 막은 경우(자기 자신·마지막 한 명 등)는 이유를 그대로 화면에 보여준다.
    if (!result?.ok) {
      return new Response(JSON.stringify({ error: result?.error || '관리자 명단을 고치지 못했어요.' }), { status: 400, headers: jsonHeaders });
    }
    return new Response(JSON.stringify({ ok: true, email: result.email }), { headers: jsonHeaders });
  }

  if (resource !== 'stats') {
    // 목록마다 인자가 달라서 이름을 맞춰 넘긴다. 화면이 보낸 값을 그대로 믿지 않고,
    // 한 번에 가져갈 수 있는 줄 수에 천장을 둔다(실수로 전부 끌어오는 것을 막는다).
    const q = (url.searchParams.get('q') || '').trim();
    const page_size = num('page_size', 50, 200);
    const page_offset = num('page_offset', 0, 1_000_000);

    const calls: Record<string, { fn: string; args: Record<string, unknown> }> = {
      users: { fn: 'admin_list_users', args: { q, page_size, page_offset } },
      gifticons: {
        fn: 'admin_list_gifticons',
        args: {
          q,
          status_filter: url.searchParams.get('status') || null,
          family_filter: url.searchParams.get('family_id') || null,
          page_size,
          page_offset,
        },
      },
      families: { fn: 'admin_list_families', args: { q, page_size, page_offset } },
    };

    const call = calls[resource];
    if (!call) {
      return new Response(JSON.stringify({ error: '알 수 없는 목록이에요.' }), { status: 400, headers: jsonHeaders });
    }

    const { data: list, error: listError } = await admin.rpc(call.fn, call.args);
    if (listError) {
      return new Response(
        JSON.stringify({ error: `목록을 가져오지 못했어요: ${listError.message} (supabase/admin-stats.sql을 다시 실행했는지 확인해주세요)` }),
        { status: 500, headers: jsonHeaders },
      );
    }
    return new Response(JSON.stringify(list), { headers: jsonHeaders });
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

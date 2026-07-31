// 네이버는 Supabase Auth가 기본 지원하는 로그인 제공자가 아니라서, 이 Edge Function이
// "네이버 OAuth 코드 교환 → 프로필 조회 → Supabase 로그인 세션 발급"을 대신 처리하는
// 다리 역할을 한다. 흐름:
//   1) 프론트엔드가 브라우저를 네이버 로그인 화면으로 이동시키고, state 값으로
//      로그인 후 돌아갈 우리 앱 주소(redirectTo)를 함께 실어 보낸다.
//   2) 네이버가 로그인 후 이 함수로 code와 state를 그대로 돌려준다(브라우저 리다이렉트).
//   3) 이 함수가 code를 네이버 access token으로 교환하고, 그 토큰으로 네이버 프로필
//      (이메일)을 조회한다.
//   4) Supabase 관리자 권한(service role)으로 그 이메일 사용자를 찾거나 새로 만들면서
//      로그인 링크(action_link)를 발급받아, 그 링크로 다시 리다이렉트한다.
//      이 링크는 일반 이메일 매직링크와 동일한 방식으로 세션을 만들어주기 때문에,
//      프론트엔드는 별도 처리 없이 지금 쓰는 magiclink 로그인 흐름을 그대로 재사용한다.

import { createClient } from 'npm:@supabase/supabase-js@2';

function redirectWithError(fallbackUrl, message) {
  const target = new URL(fallbackUrl);
  target.searchParams.set('login_error', message);
  return Response.redirect(target.toString(), 302);
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const naverError = url.searchParams.get('error_description') || url.searchParams.get('error');

  const redirectTo = state || Deno.env.get('NAVER_LOGIN_FALLBACK_REDIRECT');
  if (!redirectTo) {
    return new Response('로그인 후 돌아갈 주소(state)가 없어요.', { status: 400 });
  }

  if (naverError) {
    return redirectWithError(redirectTo, '네이버 로그인이 취소됐어요.');
  }
  if (!code) {
    return redirectWithError(redirectTo, '네이버 로그인 요청이 올바르지 않아요.');
  }

  // 가격검색(search-price)과 같은 네이버 애플리케이션(검색+로그인 API를 한 앱에서 같이 사용)이면
  // 같은 값을 쓰면 된다. 굳이 앱을 분리했다면 별도 시크릿 이름으로 다시 나눠도 된다.
  const clientId = Deno.env.get('NAVER_CLIENT_ID');
  const clientSecret = Deno.env.get('NAVER_CLIENT_SECRET');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!clientId || !clientSecret || !supabaseUrl || !serviceRoleKey) {
    return redirectWithError(redirectTo, '네이버 로그인 서버 설정이 아직 완료되지 않았어요.');
  }

  try {
    const tokenUrl = new URL('https://nid.naver.com/oauth2.0/token');
    tokenUrl.searchParams.set('grant_type', 'authorization_code');
    tokenUrl.searchParams.set('client_id', clientId);
    tokenUrl.searchParams.set('client_secret', clientSecret);
    tokenUrl.searchParams.set('code', code);
    tokenUrl.searchParams.set('state', state);

    const tokenRes = await fetch(tokenUrl.toString());
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      throw new Error(tokenData.error_description || '네이버 토큰 발급에 실패했어요.');
    }

    const profileRes = await fetch('https://openapi.naver.com/v1/nid/me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profileData = await profileRes.json();
    const profile = profileData.response;
    if (!profile?.email) {
      throw new Error('네이버 계정에서 이메일 정보를 가져오지 못했어요.');
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data, error } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: profile.email,
      options: {
        redirectTo,
        data: { full_name: profile.name || null, avatar_url: profile.profile_image || null, provider: 'naver' },
      },
    });

    if (error || !data?.properties?.action_link) {
      throw new Error(error?.message || '로그인 세션을 만들지 못했어요.');
    }

    return Response.redirect(data.properties.action_link, 302);
  } catch (err) {
    return redirectWithError(redirectTo, err instanceof Error ? err.message : '네이버 로그인에 실패했어요.');
  }
});

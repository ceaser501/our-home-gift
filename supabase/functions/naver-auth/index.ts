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

// state에는 base64로 { r: 돌아갈 주소, c: 브라우저가 쓴 Client ID }가 들어온다.
// 예전 버전은 돌아갈 주소를 그대로 넣었기 때문에, 파싱에 실패하면 그 형식으로 취급한다.
function parseState(rawState) {
  if (!rawState) return { redirectTo: null, browserClientId: null };
  try {
    const decoded = JSON.parse(atob(rawState));
    if (decoded && typeof decoded.r === 'string') {
      return { redirectTo: decoded.r, browserClientId: typeof decoded.c === 'string' ? decoded.c : null };
    }
  } catch {
    // 아래에서 옛 형식으로 처리한다.
  }
  return { redirectTo: rawState, browserClientId: null };
}

// state는 브라우저를 거쳐 오는 값이라 누구든 원하는 대로 채워 넣을 수 있다. 그런데 이 함수는
// 마지막에 Supabase가 발급한 action_link로 리다이렉트하는데, 그 링크는 열기만 하면 세션이
// 만들어지는 링크다. 돌아갈 주소를 검증하지 않으면 이런 일이 벌어진다:
//
//   1) 공격자가 r을 자기 사이트로 바꾼 네이버 로그인 URL을 피해자에게 보낸다
//   2) 피해자가 자기 계정으로 네이버 로그인을 한다
//   3) 이 함수가 피해자의 로그인 링크를 들고 공격자 사이트로 리다이렉트한다
//   4) 공격자가 그 링크로 피해자 계정에 들어간다
//
// 그래서 우리가 아는 주소로만 돌려보낸다. 허용 목록에 없으면 로그인을 진행하지 않는다.
// (NAVER_ALLOWED_REDIRECTS에 쉼표로 나눠 적는다. 예: https://ceaser501.github.io,http://localhost:5173)
function allowedOrigins() {
  // 예전부터 쓰던 기본 주소도 함께 허용 목록에 넣는다. 운영자가 직접 넣은 값이라 믿을 수 있고,
  // NAVER_ALLOWED_REDIRECTS를 아직 안 넣었더라도 로그인이 통째로 막히지는 않게 된다.
  const configured = [Deno.env.get('NAVER_ALLOWED_REDIRECTS'), Deno.env.get('NAVER_LOGIN_FALLBACK_REDIRECT')]
    .filter(Boolean)
    .join(',');

  const origins = configured
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      try {
        return new URL(item).origin;
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  return [...new Set(origins)];
}

function isAllowedRedirect(target, allowed) {
  if (allowed.length === 0) return false;
  try {
    return allowed.includes(new URL(target).origin);
  } catch {
    // 주소 형식이 아니면(상대 경로, 조작된 값) 받아주지 않는다.
    return false;
  }
}

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

  const { redirectTo: stateRedirect, browserClientId } = parseState(state);
  const redirectTo = stateRedirect || Deno.env.get('NAVER_LOGIN_FALLBACK_REDIRECT');
  if (!redirectTo) {
    return new Response('로그인 후 돌아갈 주소(state)가 없어요.', { status: 400 });
  }

  // 검증은 redirectTo를 쓰기 전에 한다. 오류 안내조차 이 주소로 돌려보내기 때문에,
  // 나중에 검사하면 오류 경로가 그대로 우회로가 된다.
  const allowed = allowedOrigins();
  if (allowed.length === 0) {
    return new Response(
      '네이버 로그인 설정이 끝나지 않았어요. NAVER_ALLOWED_REDIRECTS에 로그인 후 돌아갈 주소를 등록해주세요.',
      { status: 500 },
    );
  }
  if (!isAllowedRedirect(redirectTo, allowed)) {
    // 여기로 온 요청은 우리 앱에서 시작한 로그인이 아니다. 아무 데도 보내지 않고 끝낸다.
    return new Response('허용되지 않은 주소로 돌아가려고 해서 로그인을 중단했어요.', { status: 400 });
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

  // 인가 코드는 브라우저가 쓴 Client ID 앞으로 발급된다. 서버가 다른 애플리케이션의
  // ID/Secret으로 토큰을 요청하면 네이버는 "wrong client id/client secret pair"만 돌려준다.
  if (browserClientId && browserClientId !== clientId) {
    return redirectWithError(
      redirectTo,
      `네이버 Client ID가 서로 달라요. 화면 쪽 VITE_NAVER_CLIENT_ID(${browserClientId})와 서버 쪽 NAVER_CLIENT_ID(${clientId})를 같은 애플리케이션 값으로 맞춰주세요.`,
    );
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
      // 네이버가 돌려준 원인을 그대로 보여준다. 대표적으로 "wrong client id/client secret
      // pair"는 Supabase에 넣어둔 NAVER_CLIENT_SECRET이 네이버 개발자센터 값과 다를 때 난다.
      const detail = [tokenData.error, tokenData.error_description].filter(Boolean).join(': ');
      throw new Error(
        detail
          ? `네이버 토큰 발급 실패 (${detail}). Supabase의 NAVER_CLIENT_ID/NAVER_CLIENT_SECRET을 확인해주세요.`
          : '네이버 토큰 발급에 실패했어요.',
      );
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

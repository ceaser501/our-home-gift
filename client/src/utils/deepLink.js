import { supabase } from '../supabaseClient';
import { isNativeApp } from './browser';

// 앱(app/)에서 소셜 로그인을 누르면 크롬 커스텀 탭이 열리고, 로그인이 끝나면 이 주소로
// 되돌아온다. 안드로이드가 이 스킴을 우리 앱에만 넘겨주기 때문에 앱으로 복귀한다.
// 등록은 app/android/app/src/main/AndroidManifest.xml의 intent-filter에 있다.
//
// 이 주소는 세 곳에 똑같이 적혀 있어야 한다. 하나라도 다르면 로그인이 브라우저에서
// 끝나고 앱은 로그아웃 상태로 남는다:
//   1) 여기
//   2) Supabase 대시보드 → Authentication → URL Configuration → Redirect URLs
//   3) 네이버용 Edge Function 비밀값 NAVER_ALLOWED_REDIRECTS
export const NATIVE_REDIRECT_URL = 'io.github.ceaser501.moacon://login';

// 돌아온 주소에 로그인 결과가 실려 온다. 형식이 두 가지다.
//   #access_token=...&refresh_token=...   기본(implicit)
//   ?code=...                             PKCE를 켰을 때
// 어느 쪽으로 오든 받아들인다. 지금은 앞엣것으로 오지만, supabase 설정을 바꾸면
// 조용히 로그인이 안 되는 상태가 되기 때문에 둘 다 열어둔다.
async function applySession(rawUrl) {
  const url = new URL(rawUrl);
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''));

  // 실패해서 돌아오는 경우도 있다. 이때 토큰만 찾다가 조용히 넘기면 사용자는 아무 일도
  // 일어나지 않은 화면을 보게 된다.
  const failed = hash.get('error_description') || url.searchParams.get('login_error');
  if (failed) throw new Error(failed);

  const accessToken = hash.get('access_token');
  const refreshToken = hash.get('refresh_token');
  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    if (error) throw new Error(error.message);
    return;
  }

  const code = url.searchParams.get('code');
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw new Error(error.message);
    return;
  }

  throw new Error('로그인 정보를 받지 못했어요. 다시 시도해주세요.');
}

// 앱으로 돌아오는 로그인 결과를 받는다. 웹에서는 할 일이 없다.
//
// 세션을 넣으면 supabase가 onAuthStateChange로 알려주고, AuthGate가 그걸 보고 화면을
// 바꾼다. 그래서 여기서는 화면을 직접 건드리지 않는다.
export async function watchLoginRedirects({ onError } = {}) {
  if (!isNativeApp()) return () => {};

  // 웹 사용자에게는 필요 없는 코드다. 앱에서만 받아오도록 늦춰서 불러온다.
  const [{ App }, { Browser }] = await Promise.all([import('@capacitor/app'), import('@capacitor/browser')]);

  const handle = await App.addListener('appUrlOpen', async ({ url }) => {
    if (!url || !url.startsWith(NATIVE_REDIRECT_URL)) return;
    try {
      await applySession(url);
    } catch (err) {
      onError?.(err instanceof Error ? err : new Error('로그인에 실패했어요.'));
    } finally {
      // 로그인이 끝났는데 커스텀 탭이 앱 위에 그대로 남아 있으면, 돌아온 줄을 모른다.
      await Browser.close().catch(() => {});
    }
  });

  return () => handle.remove();
}

import { supabase } from './supabaseClient';
import { isNativeApp } from './utils/browser';
import { NATIVE_REDIRECT_URL } from './utils/deepLink';

// 로그인이 끝난 뒤 돌아올 주소.
//
// 웹은 보고 있던 주소로 그냥 돌아오면 된다. 앱은 다르다 — 웹 주소로 돌려보내면 로그인은
// 브라우저에서 끝나고 앱은 로그아웃 상태 그대로 남는다. 앱에서는 앱으로 되돌리는
// 딥링크를 쓴다.
function redirectTarget() {
  if (isNativeApp()) return NATIVE_REDIRECT_URL;
  return `${window.location.origin}${import.meta.env.BASE_URL}`;
}

// 로그인 화면을 어디에 띄울지.
//
// 웹은 그 주소로 이동하면 그만이다. 앱에서는 웹뷰 안에서 열 수 없다 — 구글이 앱 내장
// 웹뷰에서의 로그인을 막아뒀기 때문이다(disallowed_useragent). 크롬 커스텀 탭으로 연다.
// 커스텀 탭은 앱 위에 덮이듯 떠서, 브라우저로 튕겨 나가는 것과는 느낌이 다르다.
async function openAuthPage(url) {
  if (!isNativeApp()) {
    window.location.href = url;
    return;
  }
  const { Browser } = await import('@capacitor/browser');
  await Browser.open({ url });
}

// 소셜 로그인은 세 곳 다 흐름이 같다. 주소를 받아서 여는 것까지만 여기서 하고,
// 돌아온 뒤 처리는 client/src/utils/deepLink.js가 맡는다.
async function startOAuth(provider, failMessage) {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: redirectTarget(),
      // 앱에서는 supabase가 바로 페이지를 넘기지 않게 막고, 주소만 받아서 직접 연다.
      skipBrowserRedirect: isNativeApp(),
    },
  });
  if (error) throw new Error(error.message || failMessage);
  // 웹은 supabase가 이미 페이지를 넘겼다. 앱일 때만 우리가 연다.
  if (isNativeApp() && data?.url) await openAuthPage(data.url);
}

// 마지막으로 어떤 방법으로 들어왔는지 이 기기에 적어둔다.
//
// 단순한 편의가 아니다. 로그인 수단마다 이메일이 다르면(구글은 gmail, 네이버는 naver.com)
// Supabase가 서로 다른 계정으로 본다. 지난번과 다른 걸 누르는 순간 같은 사람이 가족
// 구성원 두 명이 되고, 기프티콘과 알림이 그 둘로 갈린다. "지난번에 뭘로 들어왔더라"를
// 잊지 않게 해주는 것이 그걸 막는 가장 싼 방법이다.
//
// 성공한 뒤가 아니라 누를 때 적는다. OAuth는 눌리는 즉시 다른 사이트로 떠나서 돌아올
// 때까지 이 코드가 실행되지 않고, 실패해서 돌아왔더라도 "이 사람이 쓰는 수단"이라는
// 사실은 그대로라 표시해두는 편이 맞다.
const LAST_METHOD_KEY = 'last-login-method';

function rememberLoginMethod(method) {
  // 사파리 시크릿 모드처럼 저장이 막힌 곳이 있다. 안내를 못 하는 것뿐이라 그냥 넘어간다.
  try {
    localStorage.setItem(LAST_METHOD_KEY, method);
  } catch {
    /* 저장 못 해도 로그인 자체는 되어야 한다 */
  }
}

export function lastLoginMethod() {
  try {
    return localStorage.getItem(LAST_METHOD_KEY);
  } catch {
    return null;
  }
}

// 메일함의 링크는 앱이 아니라 브라우저에서 열린다. 그래서 앱에서는 돌아올 주소를
// 딥링크로 준다 — 브라우저가 로그인을 확인한 뒤 그 주소로 넘기면 앱이 받아 연다.
// 다만 메일을 다른 기기(노트북 등)에서 열면 그 기기에는 앱이 없어서 열리지 않는다.
// 앱에서 로그인 링크를 요청했으면 같은 폰에서 메일을 열어야 한다.
export async function sendMagicLink(email) {
  const redirectTo = redirectTarget();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo },
  });
  if (error) {
    const usableMessage = error.message && error.message !== '{}' ? error.message : null;
    throw new Error(usableMessage || '로그인 링크 전송에 실패했어요. 이메일 발송(SMTP) 설정을 확인해주세요.');
  }
  rememberLoginMethod('email');
}

export async function signInWithKakao() {
  rememberLoginMethod('kakao');
  await startOAuth('kakao', '카카오 로그인에 실패했어요.');
}

export async function signInWithGoogle() {
  rememberLoginMethod('google');
  await startOAuth('google', '구글 로그인에 실패했어요.');
}

// 네이버는 Supabase가 기본 제공하는 로그인 제공자가 아니라서, supabase/functions/naver-auth
// Edge Function이 네이버 OAuth 코드 교환 → 세션 발급까지 대신 처리한다. 이 함수는 그 흐름을
// 시작하는 페이지 이동만 담당한다(콜백 이후 세션은 magiclink 방식과 동일하게 URL로 돌아온다).
export async function signInWithNaver() {
  const clientId = import.meta.env.VITE_NAVER_CLIENT_ID;
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!clientId) throw new Error('네이버 로그인이 아직 설정되지 않았어요.');

  rememberLoginMethod('naver');
  const redirectTo = redirectTarget();
  const callbackUrl = `${supabaseUrl}/functions/v1/naver-auth`;

  // state에는 로그인 후 돌아갈 주소와 함께, 이 화면이 쓴 Client ID도 실어 보낸다.
  // Edge Function이 가진 NAVER_CLIENT_ID와 서로 다르면 네이버가 "wrong client id/client
  // secret pair"만 돌려줘서 원인을 알기 어려운데, 미리 비교해서 알려주기 위해서다.
  const state = btoa(JSON.stringify({ r: redirectTo, c: clientId }));

  const authorizeUrl = new URL('https://nid.naver.com/oauth2.0/authorize');
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('client_id', clientId);
  authorizeUrl.searchParams.set('redirect_uri', callbackUrl);
  authorizeUrl.searchParams.set('state', state);

  await openAuthPage(authorizeUrl.toString());
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
}

// 계정 탈퇴. 가족 나가기와 달리 계정 자체가 없어진다.
// 서버가 데이터·사진·계정을 지운 뒤, 이 기기에 남은 로그인 정보를 정리한다.
export async function deleteAccount() {
  const { data, error } = await supabase.functions.invoke('delete-account');
  if (error) {
    const detail = await error.context?.json?.().catch(() => null);
    throw new Error(detail?.error || error.message || '계정을 지우지 못했어요.');
  }

  // 계정이 이미 없어서 서버에 로그아웃을 물으면 거절당한다. 이 기기 것만 지운다.
  await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
  return data;
}

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);
  return data.session;
}

export function onAuthStateChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return () => data.subscription.unsubscribe();
}

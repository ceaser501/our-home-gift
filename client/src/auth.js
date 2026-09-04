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
// 구글은 브라우저에 이미 로그인된 계정이 있으면 묻지 않고 그 계정으로 그냥 들어간다.
// 계정이 하나뿐인 사람에게는 편하지만, 여럿인 사람에게는 고를 자리가 없다 — '다른
// 계정으로 로그인'을 눌러도 화면이 그대로 돌기만 한다.
//
// 이 앱은 가족이 각자 자기 계정으로 들어오는 앱이고, 한 폰에 계정이 둘 이상인 경우가
// 흔하다(회사 계정, 예전 계정). 그래서 늘 고르게 한다.
//
// 카카오·네이버에는 이 값이 없다. 구글에만 붙인다.
const PROMPT_FOR_ACCOUNT = { google: { prompt: 'select_account' } };

async function startOAuth(provider, failMessage) {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: redirectTarget(),
      // 앱에서는 supabase가 바로 페이지를 넘기지 않게 막고, 주소만 받아서 직접 연다.
      skipBrowserRedirect: isNativeApp(),
      ...(PROMPT_FOR_ACCOUNT[provider] ? { queryParams: PROMPT_FOR_ACCOUNT[provider] } : {}),
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

// 애플 로그인.
//
// 넣은 이유는 하나다 — 소셜 로그인이 있는 앱은 애플 로그인도 함께 내야 심사를 통과한다
// (App Store 심사 지침 4.8). 그래서 아이폰 앱 안에서만 보인다. 웹과 안드로이드에는
// 띄우지 않는다.
//
// 위의 셋과 흐름이 다르다. 저쪽은 브라우저를 열어 Supabase가 주는 주소로 다녀오지만,
// 이쪽은 iOS가 직접 띄우는 시스템 창에서 끝나고 토큰만 손에 쥐어준다. 그 토큰을
// Supabase에 건네는 것이 전부라 브라우저도 딥링크도 거치지 않는다.
// 덕분에 Supabase 쪽에 넣을 것도 번들 ID 한 줄뿐이다(Client IDs).
//
// ⚠️ 애플은 「이메일 가리기」를 고르면 privaterelay.appleid.com 주소를 준다. 그 사람이
// 예전에 구글로 들어왔다면 이메일이 달라서 Supabase가 다른 계정으로 본다 — 같은 사람이
// 가족 구성원 둘이 된다. 그래서 '최근 로그인' 표시가 여기서도 중요하다.
const APPLE_CLIENT_ID = 'io.github.ceaser501.ourhomegift';

// nonce는 지금 이 화면이 시작한 로그인의 토큰이 맞는지 확인하는 값이다.
// 애플에는 해시해서 보내고, Supabase에는 원문을 준다. 둘을 맞춰보는 것은 Supabase가 한다.
async function sha256Hex(text) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function signInWithApple() {
  rememberLoginMethod('apple');

  const { SignInWithApple } = await import('@capacitor-community/apple-sign-in');

  const rawNonce = crypto.randomUUID();
  const result = await SignInWithApple.authorize({
    clientId: APPLE_CLIENT_ID,
    // 네이티브 창은 돌아올 주소가 필요 없지만 플러그인이 필수 인자로 받는다.
    redirectURI: NATIVE_REDIRECT_URL,
    scopes: 'email name',
    nonce: await sha256Hex(rawNonce),
  });

  // 사용자가 창을 닫으면 플러그인이 예외를 던진다. 여기까지 왔는데 토큰이 없으면
  // 애플이 준 답이 비어 있는 것이라 그대로 실패로 본다.
  const idToken = result?.response?.identityToken;
  if (!idToken) throw new Error('애플 로그인에 실패했어요.');

  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: idToken,
    nonce: rawNonce,
  });
  if (error) throw new Error(error.message || '애플 로그인에 실패했어요.');
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

// 탈퇴가 왜 막혔는지를 화면 밖에 적어두는 자리.
//
// 그동안 이 문구는 뜬 적이 없다. 띄우는 창이 내 메뉴 안에 있었는데, 탈퇴는 데이터부터
// 지우기 때문에 그 순간 나는 '가족이 없는 사람'이 되고 화면이 통째로 갈아끼워진다.
// 문구를 세우자마자 화면과 함께 사라진 것이다. 그래서 이유를 남기려면 화면이 아니라
// 화면 밖에 적어야 한다. 다음에 앱을 켜도 그대로 있다.
export const DELETE_ERROR_KEY = 'moacon:delete-error';

export function readDeleteError() {
  try {
    const raw = localStorage.getItem(DELETE_ERROR_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearDeleteError() {
  try {
    localStorage.removeItem(DELETE_ERROR_KEY);
  } catch {
    // 못 지워도 화면에서는 닫힌다.
  }
}

function rememberDeleteError(message) {
  try {
    localStorage.setItem(DELETE_ERROR_KEY, JSON.stringify({ at: new Date().toISOString(), message }));
  } catch {
    // 저장을 못 해도 던지는 것은 그대로 던진다.
  }
}

// 계정 탈퇴. 가족 나가기와 달리 계정 자체가 없어진다.
// 서버가 데이터·사진·계정을 지운 뒤, 이 기기에 남은 로그인 정보를 정리한다.
export async function deleteAccount() {
  const fail = (message) => {
    rememberDeleteError(message);
    return new Error(message);
  };

  const { data, error } = await supabase.functions.invoke('delete-account');
  if (error) {
    // 서버가 왜 거절했는지를 그대로 들고 온다. 여기가 뭉개지면 사용자도 우리도
    // "안 돼요"만 보게 되는데, 탈퇴가 막히는 이유는 대개 화면 밖에 있다 —
    // 함수를 아직 안 올렸거나, 지우려는 계정을 아직 무언가가 붙들고 있거나.
    const detail = await error.context?.json?.().catch(() => null);
    if (detail?.error) throw fail(detail.error);

    // 본문을 못 읽는 경우가 있다. 함수 자체가 없으면 그렇다 — 그때 supabase가 주는 말은
    // "non-2xx status code"뿐이라 읽어봐야 알 수가 없다. 무엇을 확인해야 하는지로 바꾼다.
    const status = error.context?.status;
    if (status === 404) {
      throw fail('탈퇴 기능이 서버에 아직 없어요. (delete-account 함수를 배포해주세요)');
    }
    throw fail(
      `${error.message || '계정을 지우지 못했어요.'}${status ? ` (서버 응답 ${status})` : ''}`
    );
  }

  // 여기까지 왔으면 지워진 것이다. 예전에 적어둔 실패 기록이 남아 있으면 지운다.
  clearDeleteError();

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

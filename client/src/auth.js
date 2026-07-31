import { supabase } from './supabaseClient';

export async function sendMagicLink(email) {
  const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}`;
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo },
  });
  if (error) {
    const usableMessage = error.message && error.message !== '{}' ? error.message : null;
    throw new Error(usableMessage || '로그인 링크 전송에 실패했어요. 이메일 발송(SMTP) 설정을 확인해주세요.');
  }
}

export async function signInWithKakao() {
  const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}`;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'kakao',
    options: { redirectTo },
  });
  if (error) throw new Error(error.message || '카카오 로그인에 실패했어요.');
}

export async function signInWithGoogle() {
  const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}`;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo },
  });
  if (error) throw new Error(error.message || '구글 로그인에 실패했어요.');
}

// 네이버는 Supabase가 기본 제공하는 로그인 제공자가 아니라서, supabase/functions/naver-auth
// Edge Function이 네이버 OAuth 코드 교환 → 세션 발급까지 대신 처리한다. 이 함수는 그 흐름을
// 시작하는 페이지 이동만 담당한다(콜백 이후 세션은 magiclink 방식과 동일하게 URL로 돌아온다).
export function signInWithNaver() {
  const clientId = import.meta.env.VITE_NAVER_LOGIN_CLIENT_ID;
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!clientId) throw new Error('네이버 로그인이 아직 설정되지 않았어요.');

  const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}`;
  const callbackUrl = `${supabaseUrl}/functions/v1/naver-auth`;

  const authorizeUrl = new URL('https://nid.naver.com/oauth2.0/authorize');
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('client_id', clientId);
  authorizeUrl.searchParams.set('redirect_uri', callbackUrl);
  authorizeUrl.searchParams.set('state', redirectTo);

  window.location.href = authorizeUrl.toString();
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
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

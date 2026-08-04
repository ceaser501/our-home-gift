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
  const clientId = import.meta.env.VITE_NAVER_CLIENT_ID;
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!clientId) throw new Error('네이버 로그인이 아직 설정되지 않았어요.');

  const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}`;
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

  window.location.href = authorizeUrl.toString();
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

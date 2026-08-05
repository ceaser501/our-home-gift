import { supabase } from './supabaseClient';

// 약관을 고쳐서 다시 동의를 받아야 하면 이 값을 올린다. 예전 판에 동의한 사람에게는
// 동의 화면이 다시 나타난다. 두 문서를 따로 두는 이유는, 하나만 고쳤을 때 나머지까지
// 다시 묻지 않기 위해서다.
export const TERMS_VERSION = '2026-08-05';
export const PRIVACY_VERSION = '2026-08-05';

// 지금 판에 동의한 상태인지. 아직이거나 예전 판에만 동의했으면 false.
export async function hasAgreedToCurrent(userId) {
  const { data, error } = await supabase
    .from('user_consents')
    .select('terms_version, privacy_version, is_over_14')
    .eq('user_id', userId)
    .maybeSingle();

  // 확인에 실패했다고 동의 화면을 띄우면, 이미 동의한 사람이 네트워크가 잠깐 끊겼다는
  // 이유로 다시 동의를 하게 된다. 확인이 안 되면 통과시키고 다음 기회에 다시 본다.
  if (error) return true;
  if (!data) return false;

  return data.is_over_14 && data.terms_version === TERMS_VERSION && data.privacy_version === PRIVACY_VERSION;
}

export async function agreeToCurrent(userId) {
  const { error } = await supabase.from('user_consents').upsert(
    {
      user_id: userId,
      terms_version: TERMS_VERSION,
      privacy_version: PRIVACY_VERSION,
      is_over_14: true,
      agreed_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );
  if (error) throw new Error(error.message || '동의를 저장하지 못했어요.');
}

import { supabase, GIFTICON_TABLE } from './supabaseClient';

// 가족 중 누가 기프티콘을 올리거나 고치면, 내 화면에도 새로고침 없이 바로 보이게 한다.
// Supabase가 데이터베이스 변경을 웹소켓으로 알려주고(Realtime), 우리는 그 신호를 받아
// 목록을 다시 불러온다. 바뀐 한 줄만 화면에 끼워 넣지 않고 통째로 다시 불러오는 이유는,
// 목록이 유효기한 순서로 정렬돼 있고 검색어·분류 조건도 걸려 있어서 그 자리를 화면에서
// 다시 계산하는 것보다 서버에 그대로 물어보는 편이 정확하고 단순하기 때문이다.
//
// 남의 가족 것이 오지 않는 것은 RLS가 보장한다(로그인 토큰으로 판단해서 볼 수 있는 줄만 보낸다).
export function subscribeToGifticons(familyId, onChange) {
  const forMyFamily = { schema: 'public', table: GIFTICON_TABLE, filter: `family_id=eq.${familyId}` };

  const channel = supabase
    .channel(`gifticons-${familyId}`)
    .on('postgres_changes', { event: 'INSERT', ...forMyFamily }, onChange)
    .on('postgres_changes', { event: 'UPDATE', ...forMyFamily }, onChange)
    // 삭제는 이미 지워진 뒤라 어느 가족 것이었는지 서버가 알려주지 못하고 id만 온다.
    // 그래서 가족으로 거르지 못하고 다 받되, 목록을 다시 불러오면 자연히 맞춰진다.
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: GIFTICON_TABLE }, onChange)
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

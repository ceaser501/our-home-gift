import { supabase } from './supabaseClient';
import { removeImages } from './api';

// 한 사람이 여러 가족에 속할 수 있다(연인끼리 하나, 부모님과 하나). 내가 들어가 있는
// 가족을 모두 가져온다.
//
// user_id로 걸러야 하는 이유: 내가 속한 가족의 구성원 명단은 나까지 포함해 전부 보이므로,
// 거르지 않으면 남의 가입 기록까지 섞여 들어온다.
export async function getMyFamilies(userId) {
  const { data: memberships, error } = await supabase.from('family_members').select('family_id').eq('user_id', userId);
  if (error) throw new Error(error.message);
  if (!memberships || memberships.length === 0) return [];

  const { data: families, error: familyError } = await supabase
    .from('families')
    .select('*')
    .in(
      'id',
      memberships.map((m) => m.family_id)
    )
    .order('created_at');
  if (familyError) throw new Error(familyError.message);
  return families ?? [];
}

// 구성원 목록을 못 읽으면 앱이 통째로 안 열린다(AuthGate가 '연결이 고르지 않아요'로
// 간다). 그래서 여기서 요구하는 칸은 있는지 없는지가 곧 앱이 열리느냐가 된다.
//
// email_masked를 붙였다가 실제로 그렇게 막혔다. 화면은 새것이 나갔는데 데이터베이스에는
// supabase/member-email.sql이 아직 안 돌아간 상태였고, 없는 칸을 달라고 하니 목록 읽기가
// 통째로 실패했다. 인터넷은 멀쩡한데 "연결이 고르지 않아요"만 떴다.
//
// 이메일은 있으면 좋은 값이지 없으면 못 여는 값이 아니다. 없으면 없는 대로 연다.
const MEMBER_COLUMNS = 'user_id, display_name, created_at, tag_color';

export async function getFamilyMembers(familyId) {
  const read = (columns) =>
    supabase.from('family_members').select(columns).eq('family_id', familyId).order('created_at');

  const { data, error } = await read(`${MEMBER_COLUMNS}, email_masked`);
  if (!error) return data ?? [];
  // 그 칸이 없다는 말일 때만 물러선다. 진짜로 못 읽은 것까지 삼키면 '연결이 고르지
  // 않아요'가 있어야 할 자리에 빈 목록이 뜬다.
  if (!String(error.message || '').includes('email_masked')) throw new Error(error.message);

  const { data: plain, error: plainError } = await read(MEMBER_COLUMNS);
  if (plainError) throw new Error(plainError.message);
  return plain ?? [];
}

export async function createFamily(familyName, memberName) {
  const { data, error } = await supabase.rpc('create_family', { family_name: familyName, member_name: memberName });
  if (error) throw new Error(error.message || '가족 그룹 생성에 실패했어요.');
  return data;
}

// 가족에서 나가기. 내가 등록했거나 내 앞으로 된 기프티콘은 남은 가족에게 안 보이게 감춰진다.
// 내가 마지막 한 사람이었으면 그 가족은 통째로 없어지고, 남은 사진 파일 경로가 돌아온다.
export async function leaveFamily(familyId) {
  const { data, error } = await supabase.rpc('leave_family', { fid: familyId });
  if (error) throw new Error(error.message || '가족에서 나가지 못했어요.');

  // 사진을 못 지워도 나가는 일은 이미 끝났다. 여기서 실패로 되돌리면 오히려 상태가 어긋난다.
  if (data?.image_paths?.length) {
    await removeImages(data.image_paths).catch(() => {});
  }
  return data;
}

// 내 이름 바꾸기. 기프티콘에 적힌 "받은 사람"·사용 내역의 내 이름도 서버에서 함께 옮겨진다.
export async function renameMember(familyId, newName) {
  const { error } = await supabase.rpc('rename_member', { fid: familyId, new_name: newName });
  if (error) throw new Error(error.message || '이름을 바꾸지 못했어요.');
}

// 대표가 구성원을 내보낸다. 잘못 승인해준 사람을 되돌리는 문이다.
//
// 그 사람이 올린 기프티콘은 감춰지고, 메모와 기록에서 이름도 지워진다. 무엇이 사라지는지는
// supabase/kick-member.sql에 적어뒀다.
export async function kickMember(familyId, userId) {
  const { error } = await supabase.rpc('kick_member', { fid: familyId, target: userId });
  if (error) throw new Error(error.message || '내보내지 못했어요.');
}

export async function renameFamily(familyId, newName) {
  const { error } = await supabase.rpc('rename_family', { fid: familyId, new_name: newName });
  if (error) throw new Error(error.message || '가족 이름을 바꾸지 못했어요.');
}

// 초대 코드로 가족 이름만 미리 물어본다. 링크를 눌러 온 사람에게 어느 가족인지
// 보여주려는 것이다 — 이름을 링크에 실으면 보내는 사람이 마음대로 적을 수 있다.
//
// 못 물어봐도 넘어간다(null). 아직 SQL을 안 돌렸거나 인터넷이 끊긴 경우인데, 그 한 줄
// 때문에 참여 자체가 막히면 안 된다. 그때는 이름 없이 '가족에 초대받았어요'로 연다.
export async function peekFamilyByCode(code) {
  try {
    const { data, error } = await supabase.rpc('peek_family_by_code', { code });
    if (error) return null;
    return data?.family_name || null;
  } catch {
    return null;
  }
}

// 초대 코드로 참여 신청. 코드가 맞아도 바로 들어가지지 않고, 기존 구성원이 승인해야 한다.
// { status: 'pending' | 'joined', family_id, family_name }을 돌려준다.
export async function requestJoinFamily(code, memberName) {
  const { data, error } = await supabase.rpc('request_join_family', { code, member_name: memberName });
  if (error) throw new Error(error.message || '참여 신청을 하지 못했어요.');

  // 신청이 들어온 걸 알려주지 않으면, 승인해줄 사람이 앱을 열어볼 때까지 계속 기다리게 된다.
  // 알림이 안 가더라도 신청 자체는 이미 접수됐으니 여기서 실패로 되돌리지는 않는다.
  if (data?.status === 'pending') {
    await supabase.functions.invoke('notify-join-request', { body: { familyId: data.family_id } }).catch(() => {});
  }
  return data;
}

// 이 가족에 들어오려고 기다리는 사람들.
export async function listPendingJoinRequests(familyId) {
  const { data, error } = await supabase
    .from('family_join_requests')
    .select('id, user_id, display_name, created_at, email_masked')
    .eq('family_id', familyId)
    .eq('status', 'pending')
    .order('created_at');
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function approveJoinRequest(requestId) {
  const { error } = await supabase.rpc('approve_join_request', { request_id: requestId });
  if (error) throw new Error(error.message || '승인하지 못했어요.');
}

export async function rejectJoinRequest(requestId) {
  const { error } = await supabase.rpc('reject_join_request', { request_id: requestId });
  if (error) throw new Error(error.message || '거절하지 못했어요.');
}

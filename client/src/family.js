import { supabase } from './supabaseClient';

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

export async function getFamilyMembers(familyId) {
  const { data, error } = await supabase
    .from('family_members')
    .select('user_id, display_name, created_at, tag_color')
    .eq('family_id', familyId)
    .order('created_at');
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createFamily(familyName, memberName) {
  const { data, error } = await supabase.rpc('create_family', { family_name: familyName, member_name: memberName });
  if (error) throw new Error(error.message || '가족 그룹 생성에 실패했어요.');
  return data;
}

// 가족에서 나가기. 내가 등록했거나 내 앞으로 된 기프티콘은 남은 가족에게 안 보이게 감춰진다.
export async function leaveFamily(familyId) {
  const { error } = await supabase.rpc('leave_family', { fid: familyId });
  if (error) throw new Error(error.message || '가족에서 나가지 못했어요.');
}

// 내 이름 바꾸기. 기프티콘에 적힌 "받은 사람"·사용 내역의 내 이름도 서버에서 함께 옮겨진다.
export async function renameMember(familyId, newName) {
  const { error } = await supabase.rpc('rename_member', { fid: familyId, new_name: newName });
  if (error) throw new Error(error.message || '이름을 바꾸지 못했어요.');
}

export async function renameFamily(familyId, newName) {
  const { error } = await supabase.rpc('rename_family', { fid: familyId, new_name: newName });
  if (error) throw new Error(error.message || '가족 이름을 바꾸지 못했어요.');
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
    .select('id, user_id, display_name, created_at')
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

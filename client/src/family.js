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

export async function joinFamily(code, memberName) {
  const { data, error } = await supabase.rpc('join_family', { code, member_name: memberName });
  if (error) throw new Error(error.message || '초대 코드로 참여하지 못했어요.');
  return data;
}

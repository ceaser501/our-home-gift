import { supabase } from './supabaseClient';

export async function getMyFamily() {
  const { data: memberships, error } = await supabase.from('family_members').select('family_id, display_name').limit(1);
  if (error) throw new Error(error.message);
  if (!memberships || memberships.length === 0) return null;

  const { family_id } = memberships[0];

  const [{ data: family, error: familyError }, { data: members, error: membersError }] = await Promise.all([
    supabase.from('families').select('*').eq('id', family_id).single(),
    supabase
      .from('family_members')
      .select('user_id, display_name, created_at, tag_color')
      .eq('family_id', family_id)
      .order('created_at'),
  ]);
  if (familyError) throw new Error(familyError.message);
  if (membersError) throw new Error(membersError.message);

  return { family, members };
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

-- 대표가 구성원을 내보낸다. Supabase SQL Editor에서 실행하세요.
--
-- ── 왜 ────────────────────────────────────────────────────────────────────────
--
-- 초대 코드는 여섯 자리라 단톡방에 잘못 붙거나 새어 나갈 수 있고, 승인 버튼은 한 번
-- 누르면 그것으로 끝이었다. 잘못 들인 사람을 다시 내보낼 길이 없었다.
--
-- 한 번 들어오면 그 가족의 기프티콘을 다 보고 메모도 남긴다. 되돌릴 수 없는 결정에
-- 되돌리는 문이 없으면, 승인 자체가 무서운 일이 된다.
--
-- ── 누가 ──────────────────────────────────────────────────────────────────────
--
-- 대표만. 대표는 "가장 먼저 들어온 사람"이다(client/src/family.js가 created_at 순으로
-- 가져오고 화면은 첫 줄에 '대표'를 붙인다). 여기서도 같은 규칙으로 정한다 — 화면과
-- 서버가 다른 사람을 대표로 알면, 화면에 버튼이 보이는데 눌러도 안 되는 일이 생긴다.
--
-- 자기 자신은 못 내보낸다. 그건 '가족 나가기'가 하는 일이고(leave_family), 마지막
-- 사람이 나갈 때 가족을 지우는 처리가 거기 있다.
--
-- ── 무엇이 사라지나 ───────────────────────────────────────────────────────────
--
-- 가족 나가기와 같은 자리는 같게 둔다 — 그 사람이 올린 기프티콘은 감추고(hidden_at),
-- 찜해둔 것은 풀어준다. 지우지 않고 감추는 이유는 잘못 눌렀을 때 되돌릴 수 있어서다.
--
-- 나가기보다 더 지우는 것이 셋 있다. 스스로 나간 사람과 내보내진 사람은 사정이 다르다 —
-- 후자는 애초에 여기 있으면 안 되던 사람이라, 이름이 남아 있는 것 자체가 문제다.
--
--   메모        — 남의 기프티콘에 적어둔 글. 지운다.
--   알림 기록   — '○○님이 등록했어요' 같은 줄. 지운다.
--   사용 기록   — 결산에 이름이 남는다. 지운다.
--
-- 알림(푸시)은 따로 지울 것이 없다. 보낼 사람은 family_members로 정하므로, 구성원에서
-- 빠지는 순간 이 가족 알림은 끊긴다.

create or replace function public.kick_member(fid uuid, target uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  leader uuid;
  target_name text;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요해요.';
  end if;
  if target = auth.uid() then
    raise exception '스스로는 내보낼 수 없어요. 가족 나가기를 써주세요.';
  end if;

  -- 가장 먼저 들어온 사람이 대표다. 같은 시각에 둘이 들어온 경우가 없도록 user_id로
  -- 한 번 더 가른다 — 화면도 같은 순서를 받아서 첫 줄에 '대표'를 붙인다.
  select user_id into leader
  from public.family_members
  where family_id = fid
  order by created_at, user_id
  limit 1;

  if leader is null then
    raise exception '가족을 찾을 수 없어요.';
  end if;
  if leader <> auth.uid() then
    raise exception '대표만 내보낼 수 있어요.';
  end if;

  select display_name into target_name
  from public.family_members
  where family_id = fid and user_id = target;

  if target_name is null then
    raise exception '이 가족의 구성원이 아니에요.';
  end if;

  delete from public.family_members where family_id = fid and user_id = target;

  -- 그 사람 것으로 되어 있는 기프티콘을 감춘다. 등록한 사람이거나 받는 사람이거나.
  -- 이름으로도 보는 이유는, 가족이 대신 올려준 것이 그 사람 이름으로 남아 있어서다.
  update public.gifticons
  set hidden_at = now()
  where family_id = fid
    and hidden_at is null
    and (created_by = target or owner = target_name);

  -- 찜을 풀어준다. 나간 사람이 쓰러 갈 리 없는데 표시만 남아 있으면, 남은 가족이
  -- "저건 누가 쓰기로 했나 보다" 하고 계속 비켜 간다.
  update public.gifticons
  set claimed_by = null, claimed_by_name = null, claimed_at = null
  where family_id = fid and claimed_by = target;

  -- 남의 기프티콘에 적어둔 메모를 지운다. 감춘 기프티콘은 어차피 안 보이지만, 메모는
  -- 남아 있는 기프티콘 위에 그대로 뜬다.
  update public.gifticons
  set memo = null, memo_by = null, memo_by_name = null, memo_at = null
  where family_id = fid and memo_by = target;

  delete from public.activities where family_id = fid and actor_id = target;
  delete from public.gifticon_uses where family_id = fid and user_id = target;
  -- 신청 기록이 남아 있으면 승인 화면에 다시 뜬다.
  delete from public.family_join_requests where family_id = fid and user_id = target;

  return json_build_object('display_name', target_name);
end;
$$;

revoke all on function public.kick_member(uuid, uuid) from public;
grant execute on function public.kick_member(uuid, uuid) to authenticated;

-- 확인:
--   select user_id, display_name, created_at from public.family_members
--    where family_id = '<가족 id>' order by created_at;

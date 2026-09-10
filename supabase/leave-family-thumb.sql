-- 가족이 통째로 없어질 때 썸네일도 함께 지운다.
--
-- ── 무엇이 새고 있었나 ──────────────────────────────────────────────────────
--
-- 마지막 한 사람이 가족을 나가면 그 가족과 기프티콘은 여기서 지워진다. 그런데 사진
-- 파일은 SQL이 못 지운다 — 스토리지는 다른 곳에 있다. 그래서 이 함수는 지울 경로만
-- 모아 돌려주고, 실제로 지우는 일은 부르는 쪽이 한다(client/src/family.js:88).
--
-- 그 목록에 썸네일이 빠져 있었다. 원본과 바코드만 걷었다. 목록에 없으면 아무도 안
-- 지우므로, 가족이 사라질 때마다 썸네일이 한 장씩 남았다.
--
-- 주인 없는 폴더 13개에 266장이 쌓인 뒤에 알았다(2026-09-10). 그중 상당수는 개발하며
-- SQL로 직접 지운 흔적이라 이 버그만의 몫은 아니지만, 새는 자리인 것은 맞다.
--
-- 남은 사진에는 **살아 있는 바코드 번호**가 찍혀 있다. 용량보다 그쪽이 문제다.
--
-- ── 돌리는 법 ───────────────────────────────────────────────────────────────
--
-- Supabase SQL Editor에 그대로 붙여넣는다. 함수만 바꾸므로 데이터는 건드리지 않는다.
-- 이미 쌓인 266장은 이 파일이 안 지운다 — 그건 대시보드 Storage에서 폴더째 지운다.

drop function if exists public.leave_family(uuid);
create or replace function public.leave_family(fid uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  my_name text;
  orphan_paths text[] := '{}';
  family_deleted boolean := false;
begin
  select display_name into my_name
  from public.family_members
  where family_id = fid and user_id = auth.uid();

  if my_name is null then
    raise exception '이 가족의 구성원이 아니에요.';
  end if;

  delete from public.family_members where family_id = fid and user_id = auth.uid();

  if exists (select 1 from public.family_members where family_id = fid) then
    update public.gifticons
    set hidden_at = now()
    where family_id = fid
      and hidden_at is null
      and (created_by = auth.uid() or owner = my_name);

    -- 내가 찜해둔 것은 풀어준다. 나간 사람이 쓰러 갈 리 없는데 표시만 남아 있으면
    -- 남은 가족이 "저건 누가 쓰기로 했나 보다" 하고 계속 비켜 간다.
    update public.gifticons
    set claimed_by = null, claimed_by_name = null, claimed_at = null
    where family_id = fid and claimed_by = auth.uid();
  else
    -- 세 자리를 다 걷는다. 원본·바코드·썸네일이다.
    --
    -- 새 이미지 칸을 만들면 이 목록에도 넣는다. 안 넣으면 조용히 샌다.
    -- purge_my_data()는 처음부터 셋을 다 걷고 있었다(schema.sql) — 여기만 빠져 있었다.
    select coalesce(array_agg(p), '{}') into orphan_paths
    from (
      select unnest(image_paths) as p from public.gifticons where family_id = fid
      union all
      select barcode_image_path from public.gifticons where family_id = fid and barcode_image_path is not null
      union all
      select thumb_image_path from public.gifticons where family_id = fid and thumb_image_path is not null
    ) t;

    delete from public.gifticons where family_id = fid;
    -- family_members / family_join_requests / push_subscriptions는 따라서 지워진다.
    delete from public.families where id = fid;
    family_deleted := true;
  end if;

  return json_build_object('family_deleted', family_deleted, 'image_paths', orphan_paths);
end;
$$;

grant execute on function public.leave_family(uuid) to authenticated;

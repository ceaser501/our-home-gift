-- 스토리지가 새고 있는지 본다. 읽기만 하고 아무것도 안 지운다.
--
-- ── 왜 필요한가 ─────────────────────────────────────────────────────────────
--
-- 사진 파일은 SQL이 못 지운다. 스토리지는 다른 곳에 있어서, 지우는 일은 늘 앱이나
-- Edge Function이 한다 — DB에서 줄을 지우는 것과 파일을 지우는 것이 두 걸음이다.
-- 두 걸음 사이가 벌어지면 조용히 샌다. 아무도 안 보는 파일이라 티가 안 난다.
--
-- 실제로 주인 없는 폴더 13개에 266장이 쌓인 적이 있다(2026-09-10에 치웠다).
-- 원인은 둘이었다:
--   1) leave_family가 지울 경로를 모을 때 썸네일을 빠뜨렸다 — 고쳤다
--      (supabase/leave-family-thumb.sql)
--   2) 개발하며 SQL로 가족을 직접 지웠다 — 앱을 안 거치니 사진을 지울 사람이 없다
--
-- 2번은 앞으로도 생긴다. SQL로 데이터를 손볼 때마다 이 파일을 한 번 돌려본다.
--
-- ── 어떻게 읽나 ─────────────────────────────────────────────────────────────
--
-- 셋 다 0이면 깨끗한 것이다.
--
--   주인 없는 파일   가족이 없어졌는데 사진만 남은 것. 지워야 할 것
--   깨진 사진        DB는 가리키는데 파일이 없는 것. 화면에서 사진이 안 뜬다
--   남는 파일        파일은 있는데 아무도 안 가리키는 것. 용량만 먹는다
--
-- 0이 아니면 아래 두 번째 질의로 어느 폴더인지 뽑아, **대시보드 Storage에서**
-- 폴더째 지운다. storage.objects에서 SQL로 줄만 지우면 파일은 그대로 남아 더 나쁘다.

with used as (
  select unnest(coalesce(image_paths, '{}')) as p from public.gifticons
  union select barcode_image_path from public.gifticons where barcode_image_path is not null
  union select thumb_image_path  from public.gifticons where thumb_image_path  is not null
)
select '스토리지 파일' as 항목, count(*)::text as 개수,
       pg_size_pretty(coalesce(sum((metadata->>'size')::bigint), 0)) as 용량
  from storage.objects where bucket_id = 'gifticon-images'
union all
select 'DB가 가리키는 경로', count(*)::text, '' from used
union all
select '주인 없는 파일', count(*)::text,
       pg_size_pretty(coalesce(sum((o.metadata->>'size')::bigint), 0))
  from storage.objects o
 where o.bucket_id = 'gifticon-images'
   and not exists (select 1 from public.families f where f.id = split_part(o.name, '/', 1)::uuid)
union all
select '깨진 사진', count(*)::text, ''
  from used u
 where not exists (select 1 from storage.objects o
                    where o.bucket_id = 'gifticon-images' and o.name = u.p)
union all
select '남는 파일', count(*)::text,
       pg_size_pretty(coalesce(sum((o.metadata->>'size')::bigint), 0))
  from storage.objects o
 where o.bucket_id = 'gifticon-images'
   and not exists (select 1 from used u where u.p = o.name);


-- 0이 아닐 때만 본다. 지울 폴더 목록이다.
--
-- 폴더 이름은 가족 id다. 여기 뜬 것은 그 가족이 이미 없다는 뜻이라 통째로 지워도 된다.
--
-- select split_part(o.name, '/', 1) as 폴더,
--        count(*) as 장수,
--        pg_size_pretty(sum((o.metadata->>'size')::bigint)) as 용량
--   from storage.objects o
--  where o.bucket_id = 'gifticon-images'
--    and not exists (select 1 from public.families f where f.id = split_part(o.name, '/', 1)::uuid)
--  group by 1 order by 2 desc;

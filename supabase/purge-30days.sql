-- 알림 보관 기간을 60일에서 30일로 줄입니다.
--
-- 60일은 너무 길었습니다. 종 아이콘을 눌렀을 때 두 달 전 기록까지 쌓여 있으면
-- 오늘 무슨 일이 있었는지가 그 아래로 밀립니다.
--
-- 두 가지를 합니다.
--   1) purge_old_activities()가 30일을 자르도록 다시 정의합니다.
--   2) 그 자리에서 한 번 돌려, 이미 쌓여 있는 30~60일치를 지웁니다.
--      예약(purge-cron.sql)은 하루 한 번 새벽에만 도니, 지금 반영하려면 여기서 한 번
--      불러줘야 합니다.
--
-- Supabase SQL Editor에 그대로 붙여넣고 실행하시면 됩니다. 채울 값은 없습니다.
-- 예약을 다시 걸 필요도 없습니다 — 크론은 함수 이름을 부를 뿐이라, 함수만 바꾸면
-- 다음 새벽부터 새 기준으로 돕니다.

create or replace function public.purge_old_activities()
returns integer
language sql
security definer
set search_path = public
as $$
  with gone as (
    delete from public.activities where created_at < now() - interval '30 days' returning 1
  )
  select count(*)::integer from gone;
$$;

-- 지금 한 번 지웁니다. 결과 숫자가 이번에 지운 개수입니다.
select public.purge_old_activities() as 지운_개수;

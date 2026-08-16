-- 오래된 알림 기록을 하루 한 번 지우도록 예약하는 SQL입니다.
--
-- `purge_old_activities()`는 schema.sql에 이미 있는데 부르는 곳이 없었습니다.
-- 60일 지난 기록을 지우는 함수라, 아무도 부르지 않으면 `activities`가 계속 자랍니다.
-- 앱 화면에는 "60일이 지난 알림은 자동으로 지워져요"라고 적혀 있으니 그 말이 사실이
-- 되게 해야 합니다.
--
-- push-cron.sql과 달리 채울 값이 없습니다. 함수가 데이터베이스 안에 있어서 밖으로
-- 나가지 않기 때문입니다 — Supabase SQL Editor에서 그대로 실행하시면 됩니다.
--
-- 실행 전에 Supabase 대시보드 Database → Extensions에서 pg_cron을 켜주세요.
-- (푸시 예약을 이미 걸어두셨다면 켜져 있습니다.)

-- 이미 예약돼 있으면 지우고 다시 만듭니다.
select cron.unschedule('purge-old-activities')
where exists (select 1 from cron.job where jobname = 'purge-old-activities');

-- 한국시간 새벽 4시 = UTC 19시(전날). 사람이 가장 안 쓰는 시간에 돌립니다.
-- 지우는 양이 많지 않아 오래 걸릴 일은 없지만, 굳이 낮에 돌릴 이유도 없습니다.
select cron.schedule(
  'purge-old-activities',
  '0 19 * * *',
  $$ select public.purge_old_activities(); $$
);

-- 확인: select jobname, schedule from cron.job;
-- 실행 기록: select * from cron.job_run_details order by start_time desc limit 10;
--   return_message에 지운 개수가 찍힙니다.

-- 만료 알림을 정해둔 시각에 딱 한 번 보내본다. Supabase SQL Editor에서 실행하세요.
--
-- 정기 발송은 하루 두 번(오전 9시·오후 3시 한국시간, supabase/push-cron.sql)이라,
-- 그걸 기다리면 반나절이 간다. 이 파일은 그 사이에 한 번을 더 끼워 넣는 것이다.
--
-- ── 채울 곳 둘 ────────────────────────────────────────────────────────────────
--   <프로젝트ref>   Supabase 프로젝트 URL의 xxxxxxxx 부분
--   <CRON_SECRET>   supabase/push-cron.sql에 넣었던 것과 같은 값
--
-- ── 시각 ──────────────────────────────────────────────────────────────────────
-- 아래 '0 12 27 8 *'는 8월 27일 12시 00분 UTC, 곧 한국시간 밤 9시다.
-- 분 시 일 월 요일 순서이고 UTC로 돈다. 한국시간에서 9를 빼면 UTC다.
--   밤 9시 → 12시 UTC     밤 10시 → 13시 UTC     자정 → 15시 UTC(전날)
-- 날짜와 달을 박아뒀으니 올해 그날 한 번만 돈다. 확인이 끝나면 아래 3)으로 지운다.

-- 1) 예약한다.
select cron.unschedule('send-expiry-notifications-test')
where exists (select 1 from cron.job where jobname = 'send-expiry-notifications-test');

select cron.schedule(
  'send-expiry-notifications-test',
  '0 12 27 8 *',
  $$
  select net.http_post(
    url := 'https://<프로젝트ref>.supabase.co/functions/v1/send-expiry-notifications',
    headers := '{"Content-Type": "application/json", "x-cron-secret": "<CRON_SECRET>"}'::jsonb
  );
  $$
);

-- 2) 보낼 것이 있는지 미리 본다. 여기 안 나오면 알림도 안 온다.
--
-- 세 가지를 다 만족해야 발송 대상이다(supabase/functions/send-expiry-notifications):
--   · 아직 안 쓴 것(status = 'unused')
--   · 유효기한이 오늘부터 49일 안
--   · 아직 이 기프티콘으로 안 알린 것(expiry_notified = false)
--
--   select id, name, brand, expires_at, expiry_notified,
--          (expires_at::date - current_date) as 남은일수
--     from public.gifticons
--    where status = 'unused'
--      and expires_at is not null
--      and expires_at::date between current_date and current_date + 49
--    order by expires_at;
--
-- 한 번 알린 기프티콘은 expiry_notified가 true로 바뀌어 다시 안 알린다. 같은 것으로
-- 또 시험하려면 그 표시를 내린다:
--
--   update public.gifticons set expiry_notified = false where id = <그 id>;
--
-- 폰이 알림을 받을 준비가 됐는지도 같이 본다. 여기가 비어 있으면 보낼 곳이 없다:
--
--   select user_id, created_at from public.push_subscriptions order by created_at desc;

-- 3) 확인이 끝나면 지운다. 안 지우면 내년 같은 날에 한 번 더 돈다.
--
--   select cron.unschedule('send-expiry-notifications-test');

-- 확인: select jobname, schedule, active from cron.job;
-- 실행 기록: select jobname, status, start_time, return_message
--              from cron.job_run_details
--              join cron.job using (jobid)
--             order by start_time desc limit 10;

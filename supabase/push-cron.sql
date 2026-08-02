-- 유효기한 임박 푸시 알림을 하루 두 번(오전 9시 / 오후 3시, 한국시간) 자동으로
-- 보내도록 예약하는 SQL입니다. schema.sql과 달리 이 파일은 프로젝트마다 값이
-- 달라서(프로젝트 URL, CRON_SECRET) 자동 실행 대상이 아니에요 — 아래 두 곳을
-- 직접 채운 뒤 Supabase SQL Editor에서 실행하세요.
--   1) <프로젝트ref> → Supabase 프로젝트 URL의 xxxxxxxx 부분
--   2) <CRON_SECRET>  → 아무 값이나 정해서 여기 넣고, 동일한 값을
--      `supabase secrets set CRON_SECRET=그값`으로도 등록해야 합니다.
--
-- 실행 전에 Supabase 대시보드 Database → Extensions에서 pg_cron, pg_net을 켜주세요.
-- 한국시간(KST, UTC+9) 오전 9시 = UTC 0시, 오후 3시 = UTC 6시라서 아래처럼 씁니다.

select cron.schedule(
  'send-expiry-notifications-morning',
  '0 0 * * *',
  $$
  select net.http_post(
    url := 'https://<프로젝트ref>.supabase.co/functions/v1/send-expiry-notifications?token=<CRON_SECRET>',
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  $$
);

select cron.schedule(
  'send-expiry-notifications-afternoon',
  '0 6 * * *',
  $$
  select net.http_post(
    url := 'https://<프로젝트ref>.supabase.co/functions/v1/send-expiry-notifications?token=<CRON_SECRET>',
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  $$
);

-- 확인: select * from cron.job;
-- 삭제(재설정하고 싶을 때): select cron.unschedule('send-expiry-notifications-morning');
--                          select cron.unschedule('send-expiry-notifications-afternoon');

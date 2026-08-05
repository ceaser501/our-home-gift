-- 유효기한 임박 푸시 알림을 하루 두 번(오전 9시 / 오후 3시, 한국시간) 자동으로
-- 보내도록 예약하는 SQL입니다. schema.sql과 달리 이 파일은 프로젝트마다 값이
-- 달라서(프로젝트 URL, CRON_SECRET) 자동 실행 대상이 아니에요 — 아래 두 곳을
-- 직접 채운 뒤 Supabase SQL Editor에서 실행하세요.
--   1) <프로젝트ref> → Supabase 프로젝트 URL의 xxxxxxxx 부분
--   2) <CRON_SECRET>  → 아무 값이나 정해서 여기 넣고, 동일한 값을
--      `supabase secrets set CRON_SECRET=그값`으로도 등록해야 합니다.
--
-- ⚠️ CRON_SECRET은 다른 어떤 값과도 겹치지 않는 새 값이어야 합니다. 특히 RESET_TOKEN과
--    같은 값을 쓰면 안 됩니다. RESET_TOKEN은 브라우저 번들에 들어가는 공개된 값이라,
--    같은 값을 쓰면 이 자물쇠의 열쇠를 공개해두는 것과 같습니다.
--    새 값 만들기 예: openssl rand -hex 32
--
-- 실행 전에 Supabase 대시보드 Database → Extensions에서 pg_cron, pg_net을 켜주세요.
-- 한국시간(KST, UTC+9) 오전 9시 = UTC 0시, 오후 3시 = UTC 6시라서 아래처럼 씁니다.

-- 이미 예약돼 있으면 지우고 다시 만듭니다(토큰을 바꿀 때도 이 파일을 다시 실행하면 됩니다).
select cron.unschedule('send-expiry-notifications-morning')
where exists (select 1 from cron.job where jobname = 'send-expiry-notifications-morning');

select cron.unschedule('send-expiry-notifications-afternoon')
where exists (select 1 from cron.job where jobname = 'send-expiry-notifications-afternoon');

-- 비밀값은 주소가 아니라 헤더로 보냅니다. 주소에 붙이면 함수 호출 기록과 cron.job
-- 테이블에 그대로 남아서, 로그를 볼 수 있는 사람에게 비밀값이 흘러갑니다.
select cron.schedule(
  'send-expiry-notifications-morning',
  '0 0 * * *',
  $$
  select net.http_post(
    url := 'https://<프로젝트ref>.supabase.co/functions/v1/send-expiry-notifications',
    headers := '{"Content-Type": "application/json", "x-cron-secret": "<CRON_SECRET>"}'::jsonb
  );
  $$
);

select cron.schedule(
  'send-expiry-notifications-afternoon',
  '0 6 * * *',
  $$
  select net.http_post(
    url := 'https://<프로젝트ref>.supabase.co/functions/v1/send-expiry-notifications',
    headers := '{"Content-Type": "application/json", "x-cron-secret": "<CRON_SECRET>"}'::jsonb
  );
  $$
);

-- 확인: select jobname, schedule from cron.job;
-- 실행 기록: select * from cron.job_run_details order by start_time desc limit 10;

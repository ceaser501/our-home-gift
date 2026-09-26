-- 유효기한 임박 푸시 알림을 매시 정각에 부르도록 예약하는 SQL입니다.
-- Supabase SQL Editor에서 **그대로** 실행하세요 — 고쳐 넣을 곳이 없습니다.
--
-- 매시간 부르는 것은 사람마다 알림 받을 시각(오전 7시~밤 10시, 기본 9시)을 고르기
-- 때문이다. 함수가 "지금이 이 사람의 시각인가, 오늘 이미 받았나"를 가려서 하루 한 번만
-- 보낸다. 받을 사람이 없는 시각에는 조회 몇 번 하고 끝난다.
--
-- ── ⚠️ 먼저 한 번만 — 비밀값을 Vault에 넣는다 ─────────────────────────────────
-- 발송 함수(send-expiry-notifications)는 x-cron-secret 헤더가 Edge Function 비밀값
-- CRON_SECRET과 같을 때만 보냅니다. 그 값을 여기서는 Vault에서 꺼내 씁니다.
--
--   1) 새 값을 만든다 (맥 터미널):   openssl rand -hex 32
--   2) Edge Function 비밀값에 CRON_SECRET 이름으로 그 값을 넣는다
--   3) SQL Editor에서 한 번:        select vault.create_secret('그값', 'cron_secret');
--      (값을 바꿀 때는 vault.update_secret. 이 줄은 저장소에 적지 않는다)
--
-- 둘이 다르면 함수가 401로 돌려보내고, 알림은 안 나갑니다.
--
-- ── 왜 Vault인가 ─────────────────────────────────────────────────────────────
-- 예전 이 파일은 <프로젝트ref>와 <CRON_SECRET>을 손으로 바꿔 넣고 돌리는 것이었다.
-- 그런데 바꾸지 않은 채로 돌아가서, 2026-08-17부터 9-26까지 82번이 전부
-- "invalid URL https://<프로젝트ref>..."로 실패했다 — 만료 알림이 한 번도 안 나갔다.
-- 고쳐 넣을 곳이 있는 SQL은 언젠가 안 고친 채로 돈다. 그래서 고칠 곳을 없앴다.
--
-- 주소는 비밀이 아니다(앱에도 들어 있다). 비밀값만 Vault에 두고, 크론이 돌 때마다
-- 꺼내 쓴다. cron.job 테이블에는 비밀값이 아니라 '꺼내 오는 문장'만 남는다.
--
-- 실행 전에 Supabase 대시보드에서 pg_cron, pg_net 확장이 켜져 있어야 합니다.
-- 이미 예약돼 있으면 지우고 다시 만듭니다.

select cron.unschedule(jobname)
from cron.job
where jobname in (
  'send-expiry-notifications',
  -- 하루 두 번(9시·15시) 돌던 예전 예약 둘과, push-test-once.sql로 끼워 넣었던 한 번짜리
  'send-expiry-notifications-morning',
  'send-expiry-notifications-afternoon',
  'send-expiry-notifications-test'
);

select cron.schedule(
  'send-expiry-notifications',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://uxgaipzhlhyzwfegnrrj.supabase.co/functions/v1/send-expiry-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    )
  );
  $$
);

-- 확인:     select jobname, schedule from cron.job;
-- 실행 기록: select status, return_message, start_time from cron.job_run_details
--             order by start_time desc limit 10;
--   succeeded여도 함수가 401을 돌려줬을 수 있다(크론은 '요청을 보냈다'까지만 본다).
--   함수 쪽 응답은: select status_code, content from net._http_response
--                    order by created desc limit 5;

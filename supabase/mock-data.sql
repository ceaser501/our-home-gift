-- 유효기한 임박 푸시 알림을 확인해보기 위한 가짜 기프티콘 한 건입니다.
-- Supabase SQL Editor에서 그대로 실행하세요. 가족 그룹(families)이 하나는 있어야 하고,
-- 아래는 그중 가장 먼저 만든 가족으로 등록됩니다.
--
-- 유효기한을 오늘(실행일) 기준 5일 뒤로 넣어서, 알림 대상(49일 이내)에 들어가고
-- 목록에서도 "D-5"로 눈에 띄게 했습니다.
--
-- 예전에 이 파일로 넣었던 가짜 데이터는 앞의 delete 문이 먼저 정리합니다.
-- (바코드 값이 9000111122로 시작하는 것만 지우므로 진짜 기프티콘은 건드리지 않습니다.)

delete from public.gifticons where code like '9000111122%';

insert into public.gifticons
  (family_id, name, category, brand, amount, owner, code, code_type, expires_at, status)
values
  ((select id from public.families order by created_at limit 1),
   '아이스 아메리카노 T', '카페', '스타벅스', 4500,
   (select display_name from public.family_members
     where family_id = (select id from public.families order by created_at limit 1)
     order by created_at limit 1),
   '9000111122223', 'CODE_128', current_date + 5, 'unused');

-- 알림은 같은 기프티콘을 한 번만 보내도록 expiry_notified로 표시해둡니다.
-- 예약 발송(하루 2번)을 다시 테스트하고 싶으면 아래를 실행해서 표시를 지우세요.
--   update public.gifticons set expiry_notified = false where code like '9000111122%';

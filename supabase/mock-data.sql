-- 유효기한이 임박한 가짜 기프티콘 한 건입니다. Supabase SQL Editor에서 그대로 실행하세요.
-- 가족 그룹(families)이 하나는 있어야 하고, 그중 가장 먼저 만든 가족으로 등록됩니다.
--
-- 유효기한을 실행일 기준 5일 뒤로 넣어서 두 가지를 한 번에 확인할 수 있습니다.
--   1) 목록에서 "D-5"가 붉은 칩으로 뜨는지 (일주일 이내만 색을 가집니다)
--   2) 유효기한 임박 푸시 알림 대상(49일 이내)에 들어가는지
--
-- 날짜가 실행 시점 기준이라, 예전에 실행해두고 시간이 지났다면 그때 넣은 건 이미 만료됐을 수
-- 있습니다. 그럴 때는 이 파일을 다시 실행하면 오늘 기준으로 새로 만들어집니다.
--
-- 예전에 이 파일로 넣었던 가짜 데이터는 앞의 delete 문이 먼저 정리합니다.
-- (바코드 값이 9000111122로 시작하는 것만 지우므로 진짜 기프티콘은 건드리지 않습니다.)

delete from public.gifticons where code like '9000111122%';

with target as (
  select
    f.id as family_id,
    (select fm.user_id from public.family_members fm where fm.family_id = f.id order by fm.created_at limit 1) as member_id,
    (select fm.display_name from public.family_members fm where fm.family_id = f.id order by fm.created_at limit 1) as member_name
  from public.families f
  order by f.created_at
  limit 1
)
insert into public.gifticons
  (family_id, name, category, brand, amount, owner, created_by, code, code_type, expires_at, status)
select
  target.family_id, '아이스 아메리카노 T', '카페', '스타벅스', 4500,
  target.member_name, target.member_id,
  '9000111122223', 'CODE_128', current_date + 5, 'unused'
from target;

-- 알림은 같은 기프티콘을 한 번만 보내도록 expiry_notified로 표시해둡니다.
-- 예약 발송(하루 2번)을 다시 테스트하고 싶으면 아래를 실행해서 표시를 지우세요.
--   update public.gifticons set expiry_notified = false where code like '9000111122%';

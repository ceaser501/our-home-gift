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

-- ===================== 샘플 공지 =====================
--
-- 공지 배너와 "공지사항" 화면이 어떻게 보이는지 확인하는 가짜 공지 두 건입니다.
-- 하나는 지금 떠 있는 공지(배너에 뜸), 하나는 이미 끝난 공지("지난 공지"로만 보임)입니다.
-- 실제 공지를 낼 때는 이 파일이 아니라 SQL Editor에서 직접 넣으세요:
--
--   insert into public.notices (title, body) values ('제목', '본문');
--   -- 기간을 두려면: values ('제목', '본문', now(), now() + interval '7 days');
--   -- 미리 써두고 예약하려면 starts_at을 앞날로 두면 그때부터 보입니다.
--
-- 제목 앞의 [샘플]로 알아보고 지우므로, 진짜 공지는 건드리지 않습니다.

delete from public.notices where title like '[샘플]%';

insert into public.notices (title, body, starts_at, ends_at) values
  (
    '[샘플] 모아콘에 오신 걸 환영해요',
    E'기프티콘 사진을 올리면 상품명·금액·유효기한을 자동으로 읽어드려요.\n유효기한을 넣어두시면 만료 전에 알림을 보내드립니다.\n\n가족을 초대하려면 위쪽 가족 이름 옆의 사람 아이콘을 눌러 초대코드를 알려주세요.',
    now(),
    null
  ),
  (
    '[샘플] 지난 연휴 안내',
    E'이미 끝난 공지는 배너에 뜨지 않고, 공지사항 화면에서 "지난 공지"로만 보입니다.',
    now() - interval '14 days',
    now() - interval '7 days'
  );

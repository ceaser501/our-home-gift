-- 유효기한 임박 푸시 알림 기능을 테스트하기 위한 가짜 기프티콘 데이터입니다.
-- Supabase SQL Editor에서 그대로 실행하세요. 이미 만들어둔 가족 그룹(families)이
-- 있어야 하고, 아래는 그중 가장 먼저 만든 가족으로 등록됩니다.
--
-- 유효기한을 오늘(실행일) 기준 상대값으로 넣어뒀습니다:
--   D-5, D-20, D-45  → 7주(49일) 이내라서 다음 알림 발송 때 푸시 대상이 됩니다.
--   D-90              → 49일보다 많이 남아서 아직 알림 대상이 아닙니다(비교용).
--   이미 사용 완료 1건 → 사용 완료 상태는 알림 대상에서 제외되는지 확인용.

insert into public.gifticons
  (family_id, name, category, brand, amount, owner, code, code_type, expires_at, status, used_at)
values
  ((select id from public.families order by created_at limit 1),
   '아이스 아메리카노 T', '카페', '스타벅스', 4500, '태수', '9000111122223', 'CODE_128', current_date + 5, 'unused', null),

  ((select id from public.families order by created_at limit 1),
   '치즈케이크 조각', '베이커리', '스타벅스', 6500, '보연', '9000111122224', 'CODE_128', current_date + 20, 'unused', null),

  ((select id from public.families order by created_at limit 1),
   '후라이드+양념 반반 세트', '외식/배달', 'bhc', 23000, '태수', '9000111122225', 'CODE_128', current_date + 45, 'unused', null),

  ((select id from public.families order by created_at limit 1),
   '영화 관람권', '문화/영화', 'CGV', 12000, '보연', '9000111122226', 'CODE_128', current_date + 90, 'unused', null),

  ((select id from public.families order by created_at limit 1),
   '핫도그 세트', '외식/배달', '롯데리아', 7000, '태수', '9000111122227', 'CODE_128', current_date - 3, 'used', current_date - 1);

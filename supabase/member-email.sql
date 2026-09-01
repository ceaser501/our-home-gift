-- 구성원 목록에도 가려진 이메일을 둔다. Supabase SQL Editor에서 실행하세요.
--
-- ── 왜 ────────────────────────────────────────────────────────────────────────
--
-- 참여 신청 화면에는 이미 있다(supabase/join-request-email.sql). 이름은 신청자가 직접
-- 적는 값이라 '딸'이라고만 적혀 있으면 내 딸인지 남인지 가릴 수가 없어서, 바꿀 수 없는
-- 값을 하나 옆에 두려고 붙인 것이다.
--
-- 그런데 정작 그 판단이 더 무거운 자리는 내보내기다. 승인은 잘못해도 되돌릴 수 있지만
-- (그러라고 내보내기를 만들었다) 내보내기는 그 사람의 기프티콘과 메모를 함께 걷어낸다.
-- 이름만 보고 누를 자리가 아니다.
--
-- ── 어떻게 ────────────────────────────────────────────────────────────────────
--
-- 줄이 만들어질 때 트리거가 채운다. 구성원이 되는 길이 여럿이라(가족 만들기, 참여 승인)
-- 길마다 적어 넣으면 언젠가 한 길을 빠뜨린다. 들어오는 문이 하나면 그럴 일이 없다.
--
-- 가리는 규칙은 mask_email 하나를 같이 쓴다. 신청 화면과 구성원 목록이 같은 사람을
-- 다르게 가리면, 승인하고 나서 같은 사람인지 알아볼 수가 없다.

begin;

alter table public.family_members
  add column if not exists email_masked text;

commit;

-- 구성원이 될 때 채운다.
create or replace function public.family_members_fill_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select public.mask_email(email) into new.email_masked
  from auth.users
  where id = new.user_id;
  return new;
end;
$$;

drop trigger if exists family_members_fill_email on public.family_members;
create trigger family_members_fill_email
  before insert on public.family_members
  for each row execute function public.family_members_fill_email();

-- 이미 들어와 있는 사람들을 채운다. 가리는 규칙이 바뀌었을 때 갈아 끼우기도 한다.
update public.family_members m
   set email_masked = public.mask_email(u.email)
  from auth.users u
 where u.id = m.user_id
   and m.email_masked is distinct from public.mask_email(u.email);

-- 확인:
--   select display_name, email_masked from public.family_members order by created_at;

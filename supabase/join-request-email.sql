-- 참여 신청자의 이메일을 가려서 보여준다. Supabase SQL Editor에서 실행하세요.
--
-- ── 왜 ────────────────────────────────────────────────────────────────────────
--
-- 승인 화면에 뜨는 이름(display_name)은 신청자가 직접 적는 값이다. '딸'이라고 적혀
-- 있어도 내 딸인지 남인지 가릴 방법이 없다.
--
-- 초대 코드는 여섯 자리라 단톡방에 잘못 붙거나 새어 나갈 수 있고, 그때 승인을 눌러버리는
-- 자리가 여기다. 한 번 들어오면 그 가족의 기프티콘을 다 본다.
--
-- 그래서 신청자가 바꿀 수 없는 값을 하나 옆에 둔다 — 로그인한 계정의 이메일이다.
--
-- ── 왜 화면에서 자르지 않나 ───────────────────────────────────────────────────
--
-- auth의 이메일은 본인만 읽을 수 있어서 화면 쪽 쿼리로는 남의 주소를 가져올 수 없다.
-- 서버 함수(security definer)만 읽을 수 있다.
--
-- 그리고 가린 값을 서버에서 만들어 내려야 한다. 화면에서 자르면 원본이 응답에 그대로
-- 실려 오고, 개발자도구를 열면 보인다. 가리는 일은 보내기 전에 끝나야 한다.
--
-- ── 가리는 규칙 ───────────────────────────────────────────────────────────────
--
--   90tsk***@gmail.com     뒤 세 글자만 덮고 나머지는 그대로
--
-- 처음에는 앞 세 글자만 남겼는데(dau****@gmail.com) 너무 많이 가려서 누구인지 알아볼
-- 수가 없었다. 가리는 목적은 '아는 사람인지 가려내되 주소를 통째로 넘기지 않는 것'이라,
-- 알아볼 수 없으면 가리는 의미가 없다.
--
-- 도메인도 남긴다. 그게 없으면 아는 주소인지 알아볼 근거가 또 하나 사라진다.

begin;

alter table public.family_join_requests
  add column if not exists email_masked text;

commit;

-- 가리는 함수. 한 군데 두어야 규칙이 갈라지지 않는다.
create or replace function public.mask_email(addr text)
returns text
language sql
immutable
as $$
  select case
    when addr is null or position('@' in addr) = 0 then null
    -- 짧은 주소는 가릴 것이 적다. 첫 글자만 남기고 덮는다.
    when length(split_part(addr, '@', 1)) <= 4
      then left(split_part(addr, '@', 1), 1)
           || repeat('*', greatest(length(split_part(addr, '@', 1)) - 1, 1))
           || '@' || split_part(addr, '@', 2)
    -- 뒤 세 글자만 덮는다. 앞이 다 보여야 아는 주소인지 알아본다.
    else left(split_part(addr, '@', 1), length(split_part(addr, '@', 1)) - 3)
         || '***@' || split_part(addr, '@', 2)
  end;
$$;

-- 이미 들어와 있는 신청 건을 다시 만든다. 비어 있는 것을 채우기도 하고, 가리는 규칙이
-- 바뀌었을 때 예전 값을 새 규칙으로 갈아 끼우기도 한다.
update public.family_join_requests r
   set email_masked = public.mask_email(u.email)
  from auth.users u
 where u.id = r.user_id
   and r.email_masked is distinct from public.mask_email(u.email);

-- 신청을 만들 때 함께 적는다.
--
-- 바뀌는 것은 insert 한 곳뿐이고, 나머지는 supabase/schema.sql의 request_join_family
-- 그대로다. 여기서 통째로 다시 적는 이유는, 함수는 일부만 고칠 수가 없어서다.
create or replace function public.request_join_family(code text, member_name text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  found_family public.families;
  clean_name text := btrim(member_name);
  my_email text;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요해요.';
  end if;
  if clean_name = '' then
    raise exception '이름을 입력해주세요.';
  end if;
  if char_length(clean_name) > 20 then
    raise exception '이름은 20자까지 쓸 수 있어요.';
  end if;

  -- 초대 코드는 6자리라, 계속 넣어보면 언젠가는 맞는 코드를 찾을 수 있다. 맞혀도 승인이
  -- 있어야 들어오지만, 남의 가족에 참여 신청을 마구 보내는 것만으로도 성가신 일이 된다.
  -- 그래서 코드가 맞는지 확인하기 전에 시도 횟수부터 센다(틀린 시도도 세야 의미가 있다).
  if not (public.bump_api_usage(auth.uid(), 'join_attempt', 20)->>'allowed')::boolean then
    raise exception '초대 코드를 너무 여러 번 시도했어요. 내일 다시 시도해주세요.';
  end if;

  select * into found_family from public.families where invite_code = upper(btrim(code));
  if not found then
    raise exception '초대 코드를 찾을 수 없어요.';
  end if;

  -- 이미 그 가족이면 이름만 갱신하고 끝낸다.
  if exists (select 1 from public.family_members where family_id = found_family.id and user_id = auth.uid()) then
    update public.family_members set display_name = clean_name
    where family_id = found_family.id and user_id = auth.uid();
    return json_build_object('status', 'joined', 'family_id', found_family.id, 'family_name', found_family.name);
  end if;

  -- 예전에는 "구성원이 0명이면 승인해줄 사람이 없으니 그냥 들여보낸다"는 예외가 있었다.
  -- 그런데 가족을 나가도 가족은 남아 있었기 때문에, 다들 나가고 빈 껍데기만 남은 가족은
  -- 코드를 아는 사람이면 누구나 승인 없이 들어가는 문이 됐다. 지금은 마지막 사람이 나가면
  -- 가족을 통째로 지우므로(leave_family) 구성원 0명인 가족은 아예 존재하지 않는다.
  -- 만에 하나 남아 있더라도 승인 없이 들여보내지는 않는다.
  if not exists (select 1 from public.family_members where family_id = found_family.id) then
    raise exception '이 가족에는 아무도 없어서 승인해줄 사람이 없어요. 새 가족을 만들어주세요.';
  end if;

  -- 승인하는 사람이 누구인지 가릴 근거. 원본은 안 적는다 — 적어두면 가족 구성원이
  -- 읽을 수 있는 표에 남의 주소가 통째로 들어간다.
  select public.mask_email(email) into my_email from auth.users where id = auth.uid();

  insert into public.family_join_requests (family_id, user_id, display_name, email_masked)
  values (found_family.id, auth.uid(), clean_name, my_email)
  on conflict (family_id, user_id) do update
    set display_name = excluded.display_name,
        email_masked = excluded.email_masked,
        status = 'pending',
        created_at = now(),
        decided_at = null,
        decided_by = null;

  return json_build_object('status', 'pending', 'family_id', found_family.id, 'family_name', found_family.name);
end;
$$;

-- 확인:
--   select display_name, email_masked, status from public.family_join_requests order by created_at desc;

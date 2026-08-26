-- 관리자 명단을 이메일 기준으로 바꾼다. Supabase SQL editor에서 그대로 실행하세요.
--
-- ── 왜 ────────────────────────────────────────────────────────────────────────
--
-- 관리자 명단(admin_users)이 계정 uuid를 열쇠로 쓰고 있었고, 그 uuid는 auth.users를
-- on delete cascade로 참조했다. 그래서 계정이 지워지면 관리자 자격이 함께 사라진다.
--
-- 계정이 지워지는 길이 셋이다.
--   1. 전체 초기화(reset-all-data) — 관리자는 남기게 해뒀지만, 명단을 못 읽으면 못 남긴다
--   2. 계정 삭제(delete-account)   — 내 메뉴에서 스스로 지우는 길. 관리자를 안 본다
--   3. Supabase 대시보드에서 손으로 지우기
--
-- 게다가 다시 로그인하면 **새 uuid**가 생긴다. 같은 이메일, 같은 사람인데 명단에는
-- 없는 사람이 된다. "또 날아갔다"가 이것이다.
--
-- 이 앱에서 사람을 가리키는 값은 원래 이메일이다 — 카카오·네이버·구글 어느 쪽으로
-- 들어와도 이메일이 같으면 같은 계정으로 본다(supabase/functions/naver-auth 참고).
-- 관리자도 같은 기준으로 둔다. "90tskim@gmail.com은 관리자다"는 사람에 대한 말이지
-- uuid에 대한 말이 아니다.
--
-- ── 무엇이 바뀌나 ─────────────────────────────────────────────────────────────
--
--   · 계정을 지워도 명단이 남는다. 다시 로그인하면 그대로 관리자다.
--   · uuid는 편의값이 된다(누구인지 화면에 보여줄 때 쓴다). 없어도 된다.
--   · 이메일 하나에 한 줄. 대소문자와 앞뒤 공백은 무시한다.

begin;

-- 1) uuid에 매달린 것을 푼다.
--
-- 열쇠와 참조를 함께 걷는다. 참조만 걷고 열쇠를 두면 uuid가 비어 있는 줄을 못 넣는다 —
-- 아직 한 번도 로그인한 적 없는 사람을 미리 명단에 올릴 수 없게 된다.
alter table public.admin_users drop constraint if exists admin_users_user_id_fkey;
alter table public.admin_users drop constraint if exists admin_users_pkey;
alter table public.admin_users alter column user_id drop not null;

-- 2) 이메일을 열쇠로 세운다.
--
-- 견줄 때 쓰는 값은 따로 둔다. 사람이 적는 email 칸은 대문자가 섞이거나 앞뒤에 공백이
-- 붙을 수 있는데, 그대로 견주면 'A@b.com'과 'a@b.com'이 다른 사람이 된다.
alter table public.admin_users
  add column if not exists email_key text generated always as (lower(btrim(email))) stored;

-- 이메일이 비어 있는 줄은 누구인지 알 수 없어 쓸 데가 없다.
delete from public.admin_users where btrim(coalesce(email, '')) = '';

create unique index if not exists admin_users_email_key_idx on public.admin_users (email_key);

commit;

-- 3) 지금 이 계정을 관리자로 되돌린다.
--
-- ⚠️ 아래 이메일을 본인 것으로 바꿔서 실행하세요.
--    한 번이라도 로그인한 적이 있으면 uuid까지 함께 채워지고, 없어도 명단에는 올라간다.
insert into public.admin_users (user_id, email, memo)
select u.id, '90tskim@gmail.com', '최초 관리자'
  from (select '90tskim@gmail.com' as e) t
  left join auth.users u on lower(u.email) = t.e
on conflict (email_key) do update
  set user_id = coalesce(excluded.user_id, public.admin_users.user_id);

-- 4) 명단을 이메일로 확인하는 함수. Edge Function이 이걸 부른다.
--
-- 함수로 두는 이유는 RLS다. admin_users는 정책이 하나도 없어서(=아무도 못 읽는다)
-- 서버 열쇠로만 읽히는데, 열쇠를 쥔 쪽에서 매번 소문자로 맞춰 견주는 것보다
-- 규칙을 한 군데 두는 편이 갈라지지 않는다.
create or replace function public.is_admin_email(check_email text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_users
    where email_key = lower(btrim(check_email))
  );
$$;

revoke all on function public.is_admin_email(text) from public;
revoke all on function public.is_admin_email(text) from anon;
revoke all on function public.is_admin_email(text) from authenticated;
grant execute on function public.is_admin_email(text) to service_role;

-- 5) 관리자 화면에서 넣고 빼는 함수도 이메일 기준으로 맞춘다.
create or replace function public.admin_set_admin(
  target_id uuid,
  make_admin boolean,
  actor_id uuid,
  memo_text text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  target_email text;
  actor_email text;
  remaining int;
begin
  select email into target_email from auth.users where id = target_id;
  if target_email is null then
    return json_build_object('ok', false, 'error', '그런 계정이 없어요.');
  end if;

  if make_admin then
    insert into public.admin_users (user_id, email, memo)
    values (target_id, target_email, coalesce(nullif(btrim(memo_text), ''), '관리자 화면에서 추가'))
    on conflict (email_key) do update
      set user_id = excluded.user_id, email = excluded.email;
    return json_build_object('ok', true, 'email', target_email);
  end if;

  -- 자기 자신은 뺄 수 없다. 실수로 스스로를 빼면 화면으로는 다시 들어올 길이 없고
  -- SQL 편집기를 열어야 한다.
  select email into actor_email from auth.users where id = actor_id;
  if lower(btrim(target_email)) = lower(btrim(coalesce(actor_email, ''))) then
    return json_build_object('ok', false, 'error', '자기 자신은 관리자에서 뺄 수 없어요.');
  end if;

  -- 마지막 한 명은 남긴다. 명단이 비면 아무도 관리자 화면에 못 들어온다.
  select count(*) into remaining from public.admin_users;
  if remaining <= 1 then
    return json_build_object('ok', false, 'error', '관리자가 한 명뿐이라 뺄 수 없어요.');
  end if;

  delete from public.admin_users where email_key = lower(btrim(target_email));
  return json_build_object('ok', true, 'email', target_email);
end;
$$;

revoke all on function public.admin_set_admin(uuid, boolean, uuid, text) from public;
revoke all on function public.admin_set_admin(uuid, boolean, uuid, text) from anon;
revoke all on function public.admin_set_admin(uuid, boolean, uuid, text) from authenticated;
grant execute on function public.admin_set_admin(uuid, boolean, uuid, text) to service_role;

-- 6) 사용자 목록의 '관리자' 표시도 이메일로 본다.
--
-- uuid로 보면, 계정을 지웠다 다시 만든 관리자가 목록에서 관리자가 아닌 것으로 나온다.
-- 바뀌는 것은 마지막 exists 한 줄뿐이고 나머지는 supabase/admin-stats.sql 그대로다.
create or replace function public.admin_list_users(
  q text default null,
  page_size int default 50,
  page_offset int default 0
)
returns json
language sql
security definer
set search_path = public
stable
as $$
  with base as (
    select u.id, u.email, u.created_at, u.last_sign_in_at,
           coalesce(u.raw_app_meta_data->>'provider', 'email') as provider
    from auth.users u
    where q is null or q = '' or u.email ilike '%' || q || '%'
  ),
  counted as (select count(*) as total from base),
  page as (
    select * from base order by created_at desc limit page_size offset page_offset
  )
  select json_build_object(
    'total', (select total from counted),
    'rows', coalesce((
      select json_agg(row)
      from (
        select
          p.id, p.email, p.created_at, p.last_sign_in_at, p.provider,
          coalesce((
            select json_agg(json_build_object('family_id', f.id, 'family_name', f.name,
                                              'display_name', fm.display_name, 'invite_code', f.invite_code)
                            order by fm.created_at)
            from public.family_members fm join public.families f on f.id = fm.family_id
            where fm.user_id = p.id
          ), '[]'::json) as families,
          (select count(*) from public.gifticons g where g.created_by = p.id) as uploaded,
          (select count(*) from public.gifticons g where g.used_by = p.id) as used,
          (select count(*) from public.push_subscriptions s where s.user_id = p.id) as push_devices,
          exists (select 1 from public.user_consents c where c.user_id = p.id) as agreed,
          -- 여기만 바뀐다. a.user_id = p.id 였다.
          exists (select 1 from public.admin_users a where a.email_key = lower(btrim(p.email))) as is_admin
        from page p
      ) row
    ), '[]'::json)
  );
$$;

revoke all on function public.admin_list_users(text, int, int) from public;
revoke all on function public.admin_list_users(text, int, int) from anon;
revoke all on function public.admin_list_users(text, int, int) from authenticated;
grant execute on function public.admin_list_users(text, int, int) to service_role;

-- 지금 명단 보기:
--   select email, memo, user_id, created_at from public.admin_users order by created_at;

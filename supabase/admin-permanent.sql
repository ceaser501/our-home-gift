-- 최초 관리자를 영구로 고정한다. Supabase SQL editor에서 그대로 실행하세요.
--
-- ── 왜 ────────────────────────────────────────────────────────────────────────
--
-- 관리자 명단에서 90tskim@gmail.com이 또 사라졌다. 세 번째다.
--
-- 그동안 고친 것들은 전부 "지우지 않는다"는 약속이었다 — 계정 삭제는 명단을 건드리지
-- 않고(supabase/functions/delete-account/index.ts:60), 전체 초기화는 관리자를 남기고,
-- 명단은 uuid가 아니라 이메일을 열쇠로 쓴다(supabase/admin-by-email.sql).
--
-- 약속은 지키는 쪽이 하나라도 어긋나면 깨진다. 그리고 관리자 화면은 단독이라, 깨졌을 때
-- 돌아올 길이 SQL editor뿐이다. 약속 대신 자물쇠를 단다 — 표 자체가 그 줄을 못 지우게
-- 한다. 어느 코드가 무슨 짓을 해도 DB에서 막힌다.
--
-- ── 무엇이 바뀌나 ─────────────────────────────────────────────────────────────
--
--   · permanent 표시가 붙은 줄은 delete가 아예 안 된다(트리거가 막는다)
--   · 그 줄의 이메일도 못 바꾸고, permanent 표시도 못 뗀다
--   · 계정을 지웠다 다시 로그인하면 새 uuid가 저절로 채워진다
--   · 관리자 화면에서 빼려 하면 "영구 관리자예요" 한 줄로 거절한다
--
-- 이 파일은 혼자서 돌아간다. admin-stats.sql이나 admin-by-email.sql을 안 돌렸어도,
-- 이미 돌렸어도, 여러 번 다시 돌려도 결과가 같다.

-- ⚠️ 영구로 둘 이메일. 바꾸려면 여기 한 곳만 고치면 된다.
--    (아래 3)과 검증 쿼리에도 같은 값이 들어간다)

begin;

-- 1) 표가 없으면 만든다.
create table if not exists public.admin_users (
  user_id uuid,
  email text,
  memo text,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

-- 2) uuid에 매달린 것을 푼다.
--
-- admin-stats.sql로 만든 표는 user_id가 열쇠이고 auth.users를 on delete cascade로
-- 참조한다. 그러면 계정이 지워질 때 명단이 함께 사라진다 — 자물쇠를 달아도 cascade는
-- 트리거보다 먼저 도는 길이 있어서, 이 참조부터 걷어야 한다.
--
-- 이름을 찍어서 지우지 않고 찾아서 지운다. 표를 만든 방식에 따라 제약 이름이 다를 수
-- 있는데, 어긋나면 'if exists'가 조용히 넘어가고 다음 줄에서 막힌다.
do $$
declare
  con record;
begin
  for con in
    select c.conname
      from pg_constraint c
     where c.conrelid = 'public.admin_users'::regclass
       and c.contype in ('p', 'f')
  loop
    execute format('alter table public.admin_users drop constraint %I', con.conname);
  end loop;
end $$;

alter table public.admin_users alter column user_id drop not null;

alter table public.admin_users add column if not exists email text;
alter table public.admin_users add column if not exists memo text;

-- 견줄 때 쓰는 값은 따로 둔다. 사람이 적는 email 칸에는 대문자나 앞뒤 공백이 섞인다.
alter table public.admin_users
  add column if not exists email_key text generated always as (lower(btrim(email))) stored;

-- 이 파일이 다는 자물쇠. 기본은 꺼짐이라, 이미 있는 관리자들은 예전처럼 넣고 뺄 수 있다.
alter table public.admin_users
  add column if not exists permanent boolean not null default false;

-- 이메일이 비어 있는 줄은 누구인지 알 수 없어 쓸 데가 없다.
delete from public.admin_users where btrim(coalesce(email, '')) = '';

create unique index if not exists admin_users_email_key_idx on public.admin_users (email_key);

commit;

-- 3) 최초 관리자를 넣고 영구로 표시한다.
--
-- 한 번이라도 로그인한 적이 있으면 uuid까지 채워지고, 없어도 명단에는 올라간다.
insert into public.admin_users (user_id, email, memo, permanent)
select u.id, t.e, '최초 관리자 (영구)', true
  from (select '90tskim@gmail.com' as e) t
  left join auth.users u on lower(btrim(u.email)) = t.e
on conflict (email_key) do update
  set permanent = true,
      user_id = coalesce(excluded.user_id, admin_users.user_id),
      memo = coalesce(admin_users.memo, excluded.memo);

-- 4) 자물쇠. 영구 관리자는 지울 수도, 이름을 바꿀 수도, 표시를 뗄 수도 없다.
--
-- 표에 다는 이유는 여기가 마지막 문이어서다. Edge Function도 RPC도 SQL 한 줄도 결국
-- 이 표를 거쳐야 하고, 그 전에 무엇을 잘못 짜뒀든 여기서 막힌다.
create or replace function public.admin_users_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.permanent then
      raise exception '영구 관리자는 명단에서 뺄 수 없어요 (%). supabase/admin-permanent.sql을 보세요.', old.email;
    end if;
    return old;
  end if;

  -- update. 표시를 떼는 것과 이메일을 바꾸는 것 둘 다 곧 '빼는 것'이라 같이 막는다.
  if old.permanent and not coalesce(new.permanent, false) then
    raise exception '영구 관리자 표시는 뗄 수 없어요 (%).', old.email;
  end if;
  if old.permanent and lower(btrim(coalesce(new.email, ''))) is distinct from old.email_key then
    raise exception '영구 관리자의 이메일은 바꿀 수 없어요 (%).', old.email;
  end if;
  return new;
end $$;

drop trigger if exists admin_users_guard on public.admin_users;
create trigger admin_users_guard
  before delete or update on public.admin_users
  for each row execute function public.admin_users_guard();

-- 5) 계정을 지웠다 다시 로그인하면 uuid를 저절로 채운다.
--
-- 명단은 이메일로 보지만 uuid를 쓰는 자리가 아직 남아 있다(전체 초기화가 남길 계정을
-- 고를 때). 다시 로그인하면 새 uuid가 생기는데, 그때 손으로 SQL을 여는 일이 없게 한다.
create or replace function public.admin_users_link_uuid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.admin_users
     set user_id = new.id
   where email_key = lower(btrim(coalesce(new.email, '')))
     and user_id is distinct from new.id;
  return new;
end $$;

drop trigger if exists admin_users_link_uuid on auth.users;
create trigger admin_users_link_uuid
  after insert or update of email on auth.users
  for each row execute function public.admin_users_link_uuid();

-- 6) 관리자 화면에서 빼려 할 때는 한 줄로 거절한다.
--
-- 4)의 트리거만 있어도 못 빠지지만, 그때 화면에 뜨는 것은 데이터베이스 오류 문구다.
-- 여기서 먼저 걸러 사람이 읽을 말을 돌려준다. 나머지는 supabase/admin-by-email.sql 그대로다.
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

  -- 영구 관리자. 표에서도 막히지만, 여기서 먼저 사람이 읽을 말로 돌려준다.
  if exists (
    select 1 from public.admin_users
     where email_key = lower(btrim(target_email)) and permanent
  ) then
    return json_build_object('ok', false, 'error', '이 계정은 영구 관리자라 뺄 수 없어요.');
  end if;

  -- 자기 자신은 뺄 수 없다. 실수로 스스로를 빼면 화면으로는 다시 들어올 길이 없다.
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

-- ── 확인 ──────────────────────────────────────────────────────────────────────
--
-- 지금 명단:
--   select email, permanent, memo, user_id from public.admin_users order by created_at;
--
-- 자물쇠가 걸렸는지(막히면 성공이다. '영구 관리자는 명단에서 뺄 수 없어요'가 떠야 한다):
--   delete from public.admin_users where email_key = '90tskim@gmail.com';

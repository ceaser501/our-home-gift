-- 관리자 명단. 표 · 자물쇠 · 넣고 빼는 함수가 여기 다 있다.
-- Supabase SQL editor에서 그대로 실행하세요. 여러 번 다시 돌려도 결과가 같습니다.
--
-- supabase/admin-permanent.sql을 이 파일이 대신합니다. 그것을 이미 돌렸어도 그대로
-- 돌리면 되고, 안 돌렸어도 이 파일 하나로 끝납니다.
--
-- ── 무엇을 푸는가 ─────────────────────────────────────────────────────────────
--
-- 관리자 자격이 세 번 날아갔다. 원인은 늘 같았다 — 명단이 계정(auth.users)에 매달려
-- 있었다. 계정을 지우면 명단이 따라 지워지고, 다시 로그인하면 uuid가 새로 생겨서 같은
-- 사람인데도 명단에 없는 사람이 됐다.
--
-- 이 앱에서 사람을 가리키는 값은 원래 이메일이다 — 카카오·네이버·구글 어느 쪽으로
-- 들어와도 이메일이 같으면 같은 계정으로 본다(supabase/functions/naver-auth). 관리자도
-- 같은 기준을 쓴다. "90tskim@gmail.com은 관리자다"는 사람에 대한 말이지 uuid에 대한
-- 말이 아니다.
--
-- 그래서 계정과의 연결고리를 끊는다. uuid 칸은 남지만 그건 편의값이다 — 누구인지 화면에
-- 보여줄 때 쓰고, 없어도 명단은 그대로다. 모아콘에서 계정을 지워도 관리자로 남는다.
--
-- ── 두 가지 표시 ──────────────────────────────────────────────────────────────
--
--   owner      명단을 고칠 수 있는 사람. 관리자 관리 화면이 이 계정에만 보인다.
--   permanent  명단에서 뺄 수 없는 사람. 지우려 하면 표가 막는다.
--
-- 주인은 둘 다 갖는다. 나머지 관리자는 둘 다 없다 — 들어올 수는 있고, 주인이 뺄 수 있다.

-- ⚠️ 주인 계정. 이 명단을 고칠 수 있는 사람은 여기 적힌 이메일 하나뿐이다.
--    바꾸려면 아래 3)의 이메일을 고치고 다시 실행하세요.

begin;

-- 1) 표가 없으면 만든다.
create table if not exists public.admin_users (
  user_id uuid,
  email text,
  memo text,
  created_at timestamptz not null default now()
);

-- 사용자가 직접 볼 일도 고칠 일도 없다. 정책을 하나도 만들지 않아서(RLS가 켜져 있고
-- 정책이 없으면 아무것도 통과하지 못한다) 서버 열쇠로만 다룬다. 특히 "내가 관리자인지"
-- 조차 앱에서 물어볼 수 없어야 한다 — 명단이 읽히면 누구를 노려야 하는지 알려주는 셈이다.
alter table public.admin_users enable row level security;

-- 2) 계정에 매달린 것을 푼다.
--
-- admin-stats.sql로 만든 표는 user_id가 열쇠이고 auth.users를 on delete cascade로
-- 참조한다. 그 참조가 살아 있으면 계정이 지워질 때 명단이 함께 사라진다 — 아래 자물쇠를
-- 달아도 cascade는 그보다 먼저 도는 길이 있어서, 이것부터 걷어야 한다.
--
-- 이름을 찍어서 지우지 않고 찾아서 지운다. 표를 만든 방식에 따라 제약 이름이 다를 수
-- 있는데, 어긋나면 'if exists'가 조용히 넘어가고 다음 줄에서 막힌다(열쇠가 살아 있으면
-- not null을 못 푼다). 그러면 왜 안 되는지 알기 어렵다.
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

alter table public.admin_users add column if not exists permanent boolean not null default false;
alter table public.admin_users add column if not exists owner boolean not null default false;

-- 이메일이 비어 있는 줄은 누구인지 알 수 없어 쓸 데가 없다.
delete from public.admin_users where btrim(coalesce(email, '')) = '';

create unique index if not exists admin_users_email_key_idx on public.admin_users (email_key);

commit;

-- 3) 주인과 관리자를 넣는다.
--
-- 한 번이라도 로그인한 적이 있으면 uuid까지 채워지고, 없어도 명단에는 올라간다.
-- 아직 계정을 안 만든 사람을 미리 올려둘 수 있다는 뜻이다.
insert into public.admin_users (user_id, email, memo, permanent, owner)
select u.id, t.e, t.m, t.p, t.o
  from (values
    ('90tskim@gmail.com',   '주인 (뺄 수 없음)', true,  true),
    ('6oston.ivy@gmail.com', '개발자',           false, false)
  ) as t(e, m, p, o)
  left join auth.users u on lower(btrim(u.email)) = t.e
on conflict (email_key) do update
  set user_id = coalesce(excluded.user_id, admin_users.user_id),
      memo = coalesce(admin_users.memo, excluded.memo),
      -- 주인 표시는 올리기만 한다. 이미 주인인 사람을 이 줄이 내리면 안 된다.
      permanent = admin_users.permanent or excluded.permanent,
      owner = admin_users.owner or excluded.owner;

-- 4) 자물쇠. permanent가 붙은 줄은 지울 수도, 이름을 바꿀 수도, 표시를 뗄 수도 없다.
--
-- 표에 다는 이유는 여기가 마지막 문이어서다. Edge Function도 RPC도 SQL 한 줄도 결국
-- 이 표를 거치고, 그 전에 무엇을 잘못 짜뒀든 여기서 막힌다.
create or replace function public.admin_users_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.permanent then
      raise exception '영구 관리자는 명단에서 뺄 수 없어요 (%). supabase/admin-users.sql을 보세요.', old.email;
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
-- 고를 때). 그때마다 손으로 SQL을 여는 일이 없게 한다.
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

-- ── 화면이 부르는 함수들 ──────────────────────────────────────────────────────
--
-- 모두 이메일로 받는다. Edge Function이 토큰에서 꺼낸 값을 그대로 넘기므로, 화면이
-- 보낸 값으로 자기를 주인이라고 우길 수 없다.
--
-- 함수로 두는 이유는 RLS다. admin_users는 정책이 없어 서버 열쇠로만 읽히는데, 열쇠를
-- 쥔 쪽에서 매번 소문자로 맞춰 견주는 것보다 규칙을 한 군데 두는 편이 갈라지지 않는다.

-- 명단에 있는가.
create or replace function public.is_admin_email(check_email text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.admin_users
    where email_key = lower(btrim(check_email))
  );
$$;

-- 명단을 고칠 수 있는가.
create or replace function public.is_admin_owner(check_email text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.admin_users
    where email_key = lower(btrim(check_email)) and owner
  );
$$;

-- 관리자 관리 화면이 그리는 명단.
--
-- 계정이 있는지(joined)와 마지막 로그인을 같이 준다. 계정을 지운 관리자도 명단에는
-- 남아 있어야 하는데, 그걸 화면에서 구분할 수 있어야 "왜 uuid가 비었지"를 안 묻는다.
create or replace function public.admin_roster()
returns json
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((
    select json_agg(row order by row->>'sort_key')
    from (
      select json_build_object(
        'email', a.email,
        'memo', a.memo,
        'owner', a.owner,
        'permanent', a.permanent,
        'created_at', a.created_at,
        'joined', u.id is not null,
        'last_sign_in_at', u.last_sign_in_at,
        -- 주인이 맨 위, 그다음은 넣은 순서.
        'sort_key', case when a.owner then '0' else '1' end || to_char(a.created_at, 'YYYYMMDDHH24MISS')
      ) as row
      from public.admin_users a
      left join auth.users u on lower(btrim(u.email)) = a.email_key
    ) rows
  ), '[]'::json);
$$;

-- 넣기. 계정이 없는 이메일도 올릴 수 있다 — 그 사람이 나중에 로그인하면 5)의 트리거가
-- uuid를 채운다.
create or replace function public.admin_add(
  actor_email text,
  target_email text,
  memo_text text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  target text := lower(btrim(coalesce(target_email, '')));
begin
  if not public.is_admin_owner(actor_email) then
    return json_build_object('ok', false, 'error', '관리자를 넣고 뺄 수 있는 건 주인 계정뿐이에요.');
  end if;
  -- 모양만 본다. 진짜 쓰는 주소인지는 그 사람이 로그인해봐야 안다.
  if target !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return json_build_object('ok', false, 'error', '이메일 주소가 아닌 것 같아요.');
  end if;
  if exists (select 1 from public.admin_users where email_key = target) then
    return json_build_object('ok', false, 'error', '이미 명단에 있어요.');
  end if;

  insert into public.admin_users (user_id, email, memo)
  select u.id, target, nullif(btrim(coalesce(memo_text, '')), '')
    from (select 1) t
    left join auth.users u on lower(btrim(u.email)) = target;

  return json_build_object('ok', true, 'email', target);
end $$;

-- 빼기. 주인과 영구 관리자는 못 뺀다 — 4)의 자물쇠가 막지만, 여기서 먼저 걸러
-- 사람이 읽을 말을 돌려준다.
create or replace function public.admin_drop(actor_email text, target_email text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  target text := lower(btrim(coalesce(target_email, '')));
  row_found public.admin_users%rowtype;
begin
  if not public.is_admin_owner(actor_email) then
    return json_build_object('ok', false, 'error', '관리자를 넣고 뺄 수 있는 건 주인 계정뿐이에요.');
  end if;

  select * into row_found from public.admin_users where email_key = target;
  if not found then
    return json_build_object('ok', false, 'error', '명단에 없어요.');
  end if;
  if row_found.permanent or row_found.owner then
    return json_build_object('ok', false, 'error', '주인 계정은 뺄 수 없어요.');
  end if;

  delete from public.admin_users where email_key = target;
  return json_build_object('ok', true, 'email', target);
end $$;

-- 사용자 목록의 '관리자' 표시도 이메일로 본다. uuid로 보면 계정을 지웠다 다시 만든
-- 관리자가 목록에서 관리자가 아닌 것으로 나온다.
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
          exists (select 1 from public.admin_users a where a.email_key = lower(btrim(p.email))) as is_admin
        from page p
      ) row
    ), '[]'::json)
  );
$$;

-- 서버 열쇠를 쥔 쪽(Edge Function)만 부를 수 있다. 앱에서는 어느 것도 못 부른다.
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.is_admin_email(text)',
    'public.is_admin_owner(text)',
    'public.admin_roster()',
    'public.admin_add(text, text, text)',
    'public.admin_drop(text, text)',
    'public.admin_list_users(text, int, int)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;

-- 예전에 쓰던 uuid 기준 함수. 이제 화면이 부르지 않는다.
drop function if exists public.admin_set_admin(uuid, boolean, uuid, text);

-- ── 확인 ──────────────────────────────────────────────────────────────────────
--
-- 지금 명단:
--   select email, owner, permanent, memo, user_id from public.admin_users order by owner desc, created_at;
--
-- 자물쇠가 걸렸는지(막히면 성공이다):
--   delete from public.admin_users where email_key = '90tskim@gmail.com';

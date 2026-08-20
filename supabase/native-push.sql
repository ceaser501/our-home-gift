-- 앱(안드로이드) 알림용 FCM 토큰 저장.
--
-- 웹은 브라우저 구독(push_subscriptions)으로 알림을 받지만, 앱 웹뷰에는 웹푸시가
-- 없습니다. 앱은 파이어베이스(FCM) 토큰으로 받습니다 — 이 표가 그 토큰을 담습니다.
--
-- Supabase SQL Editor에 그대로 붙여넣고 실행하시면 됩니다. 채울 값은 없습니다.

create table if not exists public.native_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  family_id uuid references public.families(id) on delete set null,
  token text not null unique,
  created_at timestamptz not null default now()
);

alter table public.native_push_tokens enable row level security;

drop policy if exists "native_push_tokens manage own" on public.native_push_tokens;
create policy "native_push_tokens manage own" on public.native_push_tokens
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and (family_id is null or public.is_family_member(family_id)));

-- 표에 직접 넣지 않고 이 함수를 거칩니다. 같은 폰에서 다른 계정으로 로그인하면 같은
-- 토큰이 예전 계정 소유로 남아 있는데, 그 줄은 RLS가 지금 사람에게 안 보여줘서 넣기가
-- 통째로 막힙니다. 함수 안에서 예전 줄을 지우고 새로 적습니다 —
-- save_push_subscription과 같은 사정입니다.
create or replace function public.save_native_push_token(
  p_token text,
  p_family_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception '로그인이 필요해요.';
  end if;

  -- security definer라 RLS를 지나가므로, 정책이 하던 확인을 여기서 직접 합니다.
  if p_family_id is not null and not public.is_family_member(p_family_id) then
    raise exception '이 가족의 구성원이 아니에요.';
  end if;

  delete from public.native_push_tokens where token = p_token;

  insert into public.native_push_tokens (user_id, family_id, token)
  values (auth.uid(), p_family_id, p_token);
end;
$$;

revoke all on function public.save_native_push_token(text, uuid) from public;
grant execute on function public.save_native_push_token(text, uuid) to authenticated;

-- 내가 넣어둔 참여 신청 목록.
--
-- ── 왜 필요한가 ──────────────────────────────────────────────────────────────
--
-- 초대 코드로 신청하고 나면 승인이 날 때까지 아무 데도 안 보였다. 가족 바꾸기 창에는
-- 이미 들어간 가족만 나오고, 신청은 어디에도 흔적이 없다. 그래서 신청한 사람은 자기가
-- 신청을 했는지, 했는데 아직 안 됐는지, 거절당한 것인지 알 방법이 없었다.
--
-- 이제 그 창에 '승인 대기중'으로 함께 보여준다. 이 함수가 그 줄을 만든다.
--
-- ── 왜 함수여야 하나 ─────────────────────────────────────────────────────────
--
-- 신청 줄(family_join_requests)은 본인이 읽을 수 있다. 그런데 화면에 적어야 하는 것은
-- 가족 '이름'이고, 그 이름은 families에 있다. 아직 그 가족의 구성원이 아니니 RLS가
-- 막는다 — 당연한 일이고, 막혀야 맞다.
--
-- 그래서 security definer 로 이름만 꺼내온다. 돌려주는 것은 내가 넣은 신청뿐이라
-- (where user_id = auth.uid()) 남의 가족을 엿볼 수 있는 자리가 되지 않는다.
--
-- 초대 코드는 돌려주지 않는다. 그건 이 가족에 사람을 부를 수 있는 값이라, 아직
-- 들어가지도 않은 사람이 들고 있을 이유가 없다.

create or replace function public.list_my_join_requests()
returns table (
  id uuid,
  family_id uuid,
  family_name text,
  status text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select r.id, r.family_id, f.name, r.status, r.created_at
  from public.family_join_requests r
  join public.families f on f.id = r.family_id
  where r.user_id = auth.uid()
    and r.status = 'pending'
  order by r.created_at;
$$;

revoke all on function public.list_my_join_requests() from public;
grant execute on function public.list_my_join_requests() to authenticated;

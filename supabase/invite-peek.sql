-- 초대 코드로 가족 이름만 미리 물어본다. Supabase SQL Editor에서 실행하세요.
--
-- ── 왜 ────────────────────────────────────────────────────────────────────────
--
-- 링크를 눌러 들어온 사람에게 「'우리집' 가족에 초대받았어요」라고 말하려면, 신청을
-- 넣기 전에 가족 이름을 알아야 한다. 지금은 request_join_family가 신청을 마친 뒤에야
-- 이름을 돌려준다.
--
-- 이름을 링크에 실어 보낼 수도 있었다. 그런데 그 값은 보내는 사람이 마음대로 적을 수
-- 있어서, 남의 링크에 '우리집'이라고 써두면 화면이 거짓말을 하게 된다. 화면에 적히는
-- 이름은 서버가 아는 이름이어야 한다.
--
-- ── 무엇까지 알려주나 ─────────────────────────────────────────────────────────
--
-- 이름 하나다. 구성원도, 기프티콘도, 몇 명인지도 알려주지 않는다. 코드가 틀리면 아무
-- 것도 안 준다(null) — '그런 가족은 없다'와 '있는데 못 준다'를 가르지 않는다.
--
-- 코드를 계속 넣어보며 남의 가족 이름을 긁어모으는 것을 막아야 해서, 신청과 같은 횟수
-- 제한을 건다(bump_api_usage의 join_attempt). 여기서 세는 것이 신청 쪽 몫까지 함께
-- 깎이는 것은 일부러다 — 둘 다 '코드를 맞혀보는 일'이라 한 통으로 세는 것이 맞다.
--
-- 로그인한 사람만 부를 수 있다. 링크는 누구나 열 수 있지만, 이 물음은 로그인 뒤에 온다.

create or replace function public.peek_family_by_code(code text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  found_name text;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요해요.';
  end if;

  if not (public.bump_api_usage(auth.uid(), 'join_attempt', 20)->>'allowed')::boolean then
    raise exception '초대 코드를 너무 여러 번 시도했어요. 내일 다시 시도해주세요.';
  end if;

  select name into found_name
  from public.families
  where invite_code = upper(btrim(code));

  return json_build_object('family_name', found_name);
end;
$$;

revoke all on function public.peek_family_by_code(text) from public;
grant execute on function public.peek_family_by_code(text) to authenticated;

-- 확인:
--   select public.peek_family_by_code('C62DE4');

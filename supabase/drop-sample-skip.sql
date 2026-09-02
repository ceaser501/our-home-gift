-- 목데이터를 알림에서 건너뛰던 줄을 걷어낸다.
--
-- 기프티콘 번호가 9000111122로 시작하면 활동 기록을 남기지 않던 가지가 있었다.
-- 앱이 채워 넣은 샘플이라 "태수님이 ○○ 올렸어요"가 아홉 줄씩 쌓이는 것을 막으려던 것이다.
--
-- 그 샘플을 만들던 코드(client/src/sampleData.js)를 지웠으므로 저 번호로 시작하는
-- 기프티콘은 이제 생기지 않는다. 즉 이 가지는 이미 아무 일도 하지 않는다.
-- 그래도 걷어내는 이유는 하나다 — 남겨두면 "특정 번호대의 기프티콘은 기록에 안 남는다"가
-- 코드에 그대로 살아 있고, 언젠가 진짜 그 번호로 시작하는 기프티콘이 오면 조용히 빠진다.
--
-- 안 돌려도 앱은 그대로 돈다. 급한 것이 아니다.
--
-- 아래는 supabase/schema.sql의 log_gifticon_activity를 그 가지만 빼고 그대로 옮긴 것이다.

create or replace function public.log_gifticon_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  what text;
  who text;
  spent integer := null;
begin
  if TG_OP = 'INSERT' then
    what := 'created';
  elsif new.status is distinct from old.status then
    what := case when new.status = 'used' then 'used' else 'unused' end;
    -- 금액권을 마지막 한 번에 다 써서 사용완료로 넘어간 경우, 그 마지막 금액도 함께 적는다.
    if new.spent_amount > coalesce(old.spent_amount, 0) then
      spent := new.spent_amount - coalesce(old.spent_amount, 0);
    end if;
  elsif new.spent_amount > coalesce(old.spent_amount, 0) then
    -- 금액권을 조금 썼다. 아직 잔액이 남아서 상태는 그대로다.
    what := 'spent';
    spent := new.spent_amount - coalesce(old.spent_amount, 0);
  else
    -- 이름이나 금액만 고친 것은 알릴 일이 아니다. 쓴 금액이 줄어든 것(사용취소)도
    -- 여기로 온다 — undo_last_use가 이미 줄을 지웠으므로 할 일이 없다.
    return new;
  end if;

  select display_name into who
  from public.family_members
  where family_id = new.family_id and user_id = auth.uid();

  -- 쓴 사건을 gifticon_uses에 한 줄.
  if what in ('used', 'spent') and new.family_id is not null then
    insert into public.gifticon_uses (
      family_id, gifticon_id, gifticon_name, thumb_image_path,
      user_id, user_name, amount, used_at
    )
    values (
      new.family_id, new.id, new.name, new.thumb_image_path,
      auth.uid(),
      coalesce(who, new.used_by_name, new.owner, '알 수 없음'),
      coalesce(spent, nullif(new.amount, 0)),
      coalesce(new.used_at, (now() at time zone 'Asia/Seoul')::date)
    );
  end if;

  -- 가족에서 나간 사람의 기프티콘은 목록에 안 보이므로 알릴 것도 없다.
  if new.family_id is null or new.hidden_at is not null then
    return new;
  end if;

  insert into public.activities (family_id, kind, actor_id, actor_name, gifticon_id, gifticon_name, amount)
  values (new.family_id, what, auth.uid(), coalesce(who, new.used_by_name, new.owner), new.id, new.name, spent);

  return new;
end;
$$;

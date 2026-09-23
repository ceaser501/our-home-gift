-- 원팀 행사(원데이 클래스, 6조) 선호도 조사 — oneteam/index.html 이 쓰는 표.
-- Supabase SQL Editor에 통째로 붙여넣어 실행한다. 여러 번 실행해도 안전하다.
--
-- 앱(기프티콘)과는 아무 관계가 없다. 같은 Supabase 프로젝트를 빌려 쓸 뿐이라
-- 행사가 끝나면 맨 아래 drop 한 줄로 흔적 없이 지운다.
--
-- 로그인 없이 QR로 들어와 투표하는 페이지라 anon 키로 읽고 쓴다. 그래서
--   - 이름은 14명 명단 안에서만 받는다(check). 아무 이름이나 쌓이지 않게.
--   - 한 사람당 한 줄(primary key). 다시 투표하면 덮어쓴다.
-- 남의 이름으로 덮어쓰는 것까지 막지는 않는다. 14명 사내 설문에 그 정도 장치는 과하다.

create table if not exists public.oneteam_votes (
  name        text primary key check (name in (
                '최주열','금봉수','박선애','차슬기','김은화','오영문','전승훈',
                '김태수','김동훈','박순영','김인규','김수연','성우현','최재훈')),
  dates       text[] not null default '{}',   -- 'YYYY-MM-DD'
  regions     text[] not null default '{}',
  classes     text[] not null default '{}',   -- 1지망부터 순서대로
  memo        text   check (char_length(memo) <= 300),
  updated_at  timestamptz not null default now()
);

alter table public.oneteam_votes enable row level security;

drop policy if exists oneteam_read   on public.oneteam_votes;
drop policy if exists oneteam_insert on public.oneteam_votes;
drop policy if exists oneteam_update on public.oneteam_votes;
create policy oneteam_read   on public.oneteam_votes for select to anon, authenticated using (true);
create policy oneteam_insert on public.oneteam_votes for insert to anon, authenticated with check (true);
create policy oneteam_update on public.oneteam_votes for update to anon, authenticated using (true) with check (true);
-- delete 정책은 두지 않는다. 페이지에서 남의 표를 지울 수 없게.

grant select, insert, update on public.oneteam_votes to anon, authenticated;

-- 결과 화면이 새로고침 없이 바뀌도록 실시간 알림에 올린다.
do $$
begin
  alter publication supabase_realtime add table public.oneteam_votes;
exception when duplicate_object then null;
end $$;

-- 행사가 끝나면:
-- drop table public.oneteam_votes;

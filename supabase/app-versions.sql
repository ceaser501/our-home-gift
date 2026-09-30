-- 「새 버전이 있어요」 안내가 읽는 값. Supabase SQL Editor에 그대로 붙여넣고 실행하세요.
-- 여러 번 실행해도 안전합니다(이미 있는 줄은 건드리지 않습니다).
--
-- ── 무엇을 하나 ───────────────────────────────────────────────────────────────
--
-- 앱이 켜질 때 이 표에서 자기 플랫폼 줄을 읽는다.
--   · 깔린 버전 < latest_version → "새 버전이 있어요" (그대로 사용하기로 닫을 수 있다)
--   · 깔린 버전 < min_version    → 같은 창인데 닫을 수 없다(강제)
--
-- 아이폰과 안드로이드는 스토어 번호가 따로 간다(아이폰 1.0.2, 안드로이드 0.0.190).
-- 그래서 플랫폼마다 한 줄이다.
--
-- ── 강제 여부 칸을 따로 두지 않는다 ────────────────────────────────────────────
--
-- "모두 강제"는 min_version = latest_version 과 같다. 켜고 끄는 칸을 따로 두면 둘이 어긋날
-- 수 있다(강제는 켰는데 최소 버전은 낮은 채로 남는 식). 최소 버전 하나로만 판단하면 그런 일이
-- 없고, "1.0.2 아래만 막기"처럼 옛 버전 일부만 막는 것도 된다. 관리자 화면의 「모두 강제」
-- 스위치는 저장할 때 최소 버전을 최신 버전과 같게 채우는 것뿐이다.
--
-- ── 누가 읽고 누가 고치나 ──────────────────────────────────────────────────────
--
-- 읽기는 누구나(로그인 전 화면에서도 떠야 한다 — 강제 업데이트는 로그인보다 앞선다).
-- 쓰는 정책은 두지 않는다. 고치는 것은 관리자 화면 → admin-stats 함수(서비스 롤)뿐이고,
-- 그 함수가 주인 계정인지 다시 확인한다. 공지사항(notices)과 같은 방식이다.

create table if not exists public.app_versions (
  platform text primary key check (platform in ('ios', 'android')),
  latest_version text not null,
  -- 안내 창에 "1.0.2 (2026.09.30)"으로 함께 보여준다.
  released_on date,
  -- 이보다 낮으면 강제. 평소에는 아주 낮게 둔다.
  min_version text not null default '0.0.0',
  updated_at timestamptz not null default now(),
  -- 누가 마지막으로 고쳤는지(이메일). 관리자 화면에만 보인다.
  updated_by text
);

alter table public.app_versions enable row level security;

drop policy if exists "app_versions read all" on public.app_versions;
create policy "app_versions read all" on public.app_versions
  for select to anon, authenticated
  using (true);

-- 처음 줄. 이미 있으면 그대로 둔다(관리자 화면에서 고친 값을 덮지 않는다).
--
-- 아이폰은 1.0.2가 스토어에 나가 있다(2026-09-30).
-- 안드로이드는 프로덕션 검토 중이라 아직 0.0.0으로 둔다 — 스토어에 없는 버전으로 보내면
-- 사람들이 "업데이트가 없다"는 Play 화면만 본다. 공개되면 관리자 화면에서 고친다.
insert into public.app_versions (platform, latest_version, released_on, min_version)
values
  ('ios', '1.0.2', '2026-09-30', '0.0.0'),
  ('android', '0.0.0', null, '0.0.0')
on conflict (platform) do nothing;

-- 지금 값 보기:
--   select * from public.app_versions order by platform;

# 모아콘 관리자 대시보드

앱과 연결 통로가 없는, 관리자 혼자 보는 웹 화면입니다. 빌드 도구 없이 HTML 파일 하나로
동작합니다 — 브라우저에서 그냥 열거나, 아무 정적 호스팅에 올리면 됩니다.

```
admin/
├── index.html        실동작 대시보드 (admin-stats Edge Function에 연결)
├── mockups/          디자인 시안 5종 (모의 데이터로 동작하는 미리보기)
│   ├── 01-clean-light.html    클린 라이트 — 여백·헤어라인 위주의 미니멀 ← 채택
│   ├── 02-dark-console.html   다크 콘솔 — 켜두는 상황판 느낌
│   ├── 03-moacon-brand.html   모아콘 브랜드 — 앱의 보라·둥근 카드
│   ├── 04-data-dense.html     데이터 고밀도 — 스크롤 없이 한눈에
│   └── 05-soft-pastel.html    소프트 파스텔 — 사이드바 SaaS 스타일
└── README.md

index.html은 시안 1(클린 라이트)에 사이드바를 더한 구성입니다. 사이드바는 공지사항 입력
같은 관리 화면이 붙을 자리(지금은 대시보드만 동작)이고, 콘텐츠 폭은 시안 1과 같은
1180px를 유지합니다.
```

## 보여주는 지표

- 가족 수 · 구성원 수 · 가족당 평균 인원
- 총 사용자 수 · 신규 가입 추이 · 푸시 구독 기기 수
- 업로드된 기프티콘 수(미사용/사용완료/기간만료) 와 각 총액
- 기프티콘 등록·사용 추이, 카테고리별 분포, 브랜드 Top 10
- API 종류별 호출 건수(AI 이미지 인식 / AI 가격 검색 / 주변 매장 / 초대 코드 시도)
- AI·API 비용(USD) — 호출별 토큰 실사용 기준
- 만료 임박(7일/30일), 대기 중 참여 신청, 등록→사용 평균 소요일 등

호출·비용·추이 차트는 상단 토글로 **일별(최근 30일) / 월별 / 연도별**을 전환합니다.

## 누가 들어올 수 있나

주소는 공개돼 있지만, 통계를 보려면 **두 가지를 모두** 만족해야 합니다.

1. 앱과 같은 계정으로 **로그인**했을 것
2. 그 계정이 **`admin_users` 명단**에 있을 것

둘 다 서버(`admin-stats` Edge Function)가 확인합니다. 링크가 어디에 노출돼도 남들은
로그인 화면만 보고, 앱 사용자가 우연히 들어와도 "관리자가 아니에요"에서 막힙니다.
외우거나 붙여넣을 비밀번호·토큰은 없습니다.

**같은 브라우저에서 앱에 로그인해 뒀다면 주소만 치면 바로 열립니다.** 관리자 페이지가
앱과 같은 도메인에 있어서 로그인 상태를 그대로 물려받기 때문입니다.

## 처음 켜는 순서

1. **통계 SQL 실행** — Supabase SQL editor에서 `supabase/admin-stats.sql` 내용을 그대로
   실행합니다. `admin_users`(관리자 명단), `ai_usage_log`, `admin_dashboard_stats()`가
   만들어집니다. 여러 번 실행해도 안전합니다.

2. **본인을 관리자로 등록** — 같은 SQL editor에서 이메일만 본인 것으로 바꿔 실행하세요.
   (앱에 한 번이라도 로그인한 계정이어야 합니다.)

   ```sql
   insert into public.admin_users (user_id, email, memo)
   select id, email, '최초 관리자' from auth.users where email = '여기에@본인이메일.com'
   on conflict (user_id) do nothing;
   ```

   나중에 관리자를 더하거나 뺄 때도 이 표만 고치면 됩니다. 뺀 사람은 그 즉시 막힙니다.

   ```sql
   -- 지금 명단 보기
   select email, memo, created_at from public.admin_users order by created_at;
   -- 빼기
   delete from public.admin_users where email = '뺄사람@이메일.com';
   ```

3. **로그인 링크가 돌아올 주소 등록** — Supabase 대시보드 → Authentication → URL
   Configuration → **Redirect URLs**에 아래를 추가합니다. 이게 없으면 메일의 링크를 눌러도
   관리자 페이지로 돌아오지 못합니다.

   ```
   https://ceaser501.github.io/our-home-gift/admin/
   ```

4. **함수 배포**

   ```sh
   supabase functions deploy admin-stats
   # 아래 둘은 재배포하면 그때부터 AI 호출의 토큰 사용량이 기록되어 비용이 '계산'으로 나옵니다.
   supabase functions deploy analyze-gifticon
   supabase functions deploy search-price
   ```

5. **대시보드 열기**

   ```
   https://ceaser501.github.io/our-home-gift/admin/
   ```

   로그인돼 있으면 바로 통계가 뜨고, 아니면 이메일을 넣고 로그인 링크를 받으면 됩니다.

## 배포

main에 푸시하면 GitHub Actions가 앱을 빌드해 Pages에 올리면서 `admin/index.html`도
`/admin/`에 함께 올립니다(`.github/workflows/deploy-pages.yml`). 이때 앱이 쓰는 것과 같은
Supabase URL·anon key를 파일에 넣어줍니다(둘 다 브라우저에 공개되는 값이라 비밀이 아니고,
그것만으로는 아무 데이터도 읽히지 않습니다). 시안(`mockups/`)은 고르기 위한 미리보기라
배포하지 않습니다.

검색에 걸리지 않도록 `noindex`를 걸어뒀습니다. 로컬 파일(`admin/index.html`)로 직접 열 수도
있는데, 그때는 값이 채워져 있지 않아 Supabase URL과 anon key를 한 번 입력하는 화면이 뜹니다.

## 비용은 어떻게 계산하나

- `ai_usage_log`에 호출별 모델·입출력 토큰·웹 검색 횟수가 쌓입니다(3번 재배포 이후부터).
  이 기록이 있는 날은 **토큰 × 단가**로 계산합니다.
  - claude-haiku-4-5: 입력 $1 / 출력 $5 (백만 토큰당) · 웹 검색 $10/1,000회 (2026-08 기준)
- 기록이 없는 날(도입 이전)은 **호출 수 × 어림 단가**로 보여줍니다.
- 주변 매장(카카오 로컬·모빌리티, TMAP)은 현재 무료 구간이라 0으로 계산합니다.
- 단가가 바뀌면 코드를 고칠 필요 없이 secrets로 덮어쓸 수 있습니다:
  `AI_INPUT_USD_PER_MTOK`, `AI_OUTPUT_USD_PER_MTOK`, `WEB_SEARCH_USD_PER_CALL`,
  `ANALYZE_EST_USD_PER_CALL`, `PRICE_EST_USD_PER_CALL`, `PLACES_USD_PER_CALL`

## 디자인 바꾸기

`admin/mockups/`의 다섯 파일이 각각 완결된 시안입니다(모의 데이터로 차트까지 동작).
다른 시안으로 바꾸고 싶으면 `index.html`의 `<style>` 안 "디자인 토큰" 블록을 해당 시안의
것으로 교체하면 됩니다 — 데이터/차트 코드는 공통이라 스타일만 바꾸면 끝납니다.

## 알아두기

- `admin_dashboard_stats()`와 `admin_users`는 service_role 전용이라 브라우저에서 직접
  읽을 수 없습니다. 항상 admin-stats 함수를 거칩니다.
- 누군가를 막아야 하면 `admin_users`에서 지우면 끝입니다. 재배포도, 다른 관리자의 재설정도
  필요 없습니다.
- API 호출 건수의 하루 경계는 UTC(집계 원본이 그렇게 적혀 있음), 나머지 앱 데이터는
  한국 시간 기준입니다. 추이를 보는 데는 지장이 없습니다.
- `supabase/schema.sql`을 다시 실행해도 이제 `api_usage_total`(호출 이력 원본)은 지우지
  않도록 바꿔두었습니다. 사람별 한도 기록(`api_usage`)만 30일 지나면 정리됩니다.

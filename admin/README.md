# 모아콘 관리자 대시보드

앱과 연결 통로가 없는, 관리자 혼자 보는 웹 화면입니다. 빌드 도구 없이 HTML 파일 하나로
동작합니다 — 브라우저에서 그냥 열거나, 아무 정적 호스팅에 올리면 됩니다.

```
admin/
├── index.html        실동작 대시보드 (admin-stats Edge Function에 연결)
├── mockups/          디자인 시안 5종 (모의 데이터로 동작하는 미리보기)
│   ├── 01-clean-light.html    클린 라이트 — 여백·헤어라인 위주의 미니멀
│   ├── 02-dark-console.html   다크 콘솔 — 켜두는 상황판 느낌
│   ├── 03-moacon-brand.html   모아콘 브랜드 — 앱의 보라·둥근 카드 (현재 index.html 기본)
│   ├── 04-data-dense.html     데이터 고밀도 — 스크롤 없이 한눈에
│   └── 05-soft-pastel.html    소프트 파스텔 — 사이드바 SaaS 스타일
└── README.md
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

## 처음 켜는 순서

1. **통계 SQL 실행** — Supabase SQL editor에서 `supabase/admin-stats.sql` 내용을 그대로 실행합니다.
   (`ai_usage_log` 테이블과 `admin_dashboard_stats()` 함수가 만들어집니다. 여러 번 실행해도 안전합니다.)

2. **관리자 토큰 만들기**

   ```sh
   supabase secrets set ADMIN_STATS_TOKEN=$(openssl rand -hex 32)
   ```

   출력된 값(또는 직접 정한 긴 무작위 문자열)을 어딘가 적어두세요. 대시보드에 넣을 값입니다.

3. **함수 배포**

   ```sh
   supabase functions deploy admin-stats
   # 아래 둘은 재배포하면 그때부터 AI 호출의 토큰 사용량이 기록되어 비용이 '계산'으로 나옵니다.
   supabase functions deploy analyze-gifticon
   supabase functions deploy search-price
   ```

4. **대시보드 열기** — `admin/index.html`을 브라우저에서 엽니다. 처음 한 번 설정 화면에서

   - Functions URL: `https://<프로젝트 ref>.supabase.co/functions/v1`
   - 관리자 토큰: 2에서 만든 값

   을 넣으면 그 브라우저에 저장됩니다. 파일을 정적 호스팅(예: 앱과 같은 곳의 `/admin/`)에
   올려도 되고, 로컬 파일로 열어도 됩니다.

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
마음에 드는 시안이 정해지면 `index.html`의 `<style>` 안 "디자인 토큰" 블록을 해당 시안의
것으로 교체하면 됩니다 — 데이터/차트 코드는 공통이라 스타일만 바꾸면 끝납니다.

## 알아두기

- `admin_dashboard_stats()`는 service_role 전용이고, 브라우저는 항상 admin-stats 함수를
  거칩니다. 토큰이 새면 통계 전체가 노출되므로, 의심되면 `ADMIN_STATS_TOKEN`을 새 값으로
  다시 set 하고 함수를 재배포하세요.
- API 호출 건수의 하루 경계는 UTC(집계 원본이 그렇게 적혀 있음), 나머지 앱 데이터는
  한국 시간 기준입니다. 추이를 보는 데는 지장이 없습니다.
- `supabase/schema.sql`을 다시 실행해도 이제 `api_usage_total`(호출 이력 원본)은 지우지
  않도록 바꿔두었습니다. 사람별 한도 기록(`api_usage`)만 30일 지나면 정리됩니다.

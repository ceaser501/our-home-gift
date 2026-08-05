# 모아콘 작업 규칙

## 답변에서 파일을 가리킬 때

파일을 언급할 때는 저장소 기준 전체 경로로 적는다. 터미널에서 그대로 눌러 열 수 있다.
줄까지 짚을 때는 `경로:줄번호` 형식을 쓴다.

- `supabase/schema.sql` (O)
- `supabase/functions/analyze-gifticon/index.ts:64` (O)
- "schema.sql 다시 실행해주세요" (X — 어느 파일인지 눌러서 열 수 없다)

특히 직접 실행하거나 배포해야 하는 파일(SQL, Edge Function)은 반드시 이렇게 적는다.
그게 사용자가 다음에 할 일이라서, 찾아 헤매지 않고 바로 열 수 있어야 한다.

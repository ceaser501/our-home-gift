# 모아콘 (기프티콘 모아보기)

가족끼리 함께 쓰는 기프티콘 관리 사이트. 카카오톡/문자로 받은 기프티콘 이미지를 업로드하면
바코드·QR·이름·금액·유효기한을 자동으로 인식해 채워주고, 만료일이 얼마 안 남은 순서로 목록을 보여줍니다.
이메일 로그인 + 초대 코드로 만든 "가족 그룹" 단위로 데이터가 격리되어서, 초대 코드를 아는
가족끼리만 같은 목록을 보게 됩니다.

## 구조

```
client/     React(Vite) 프론트엔드 — GitHub Pages로 배포되는 정적 사이트
supabase/   Supabase(DB + 이미지 스토리지) 초기 설정 SQL
```

스타일은 Tailwind CSS + [shadcn/ui](https://ui.shadcn.com)로 되어 있습니다. shadcn 컴포넌트는
`client/src/components/ui/`에 소스 그대로 들어있어서 자유롭게 고칠 수 있고, 필요하면
`npx shadcn@latest add <컴포넌트>`로 더 추가할 수 있습니다.

백엔드 서버 없이, 프론트엔드가 [Supabase](https://supabase.com)를 직접 호출해서 로그인·기프티콘
데이터·이미지를 저장합니다. 로그인 후 가족 그룹을 만들거나 초대 코드로 참여하면, 같은 가족
그룹에 속한 사람들끼리만 기프티콘 목록을 공유해서 보게 됩니다(Row Level Security로 강제됩니다).

## 처음 한 번만: Supabase 설정

1. https://supabase.com 에서 무료 프로젝트 생성
2. 프로젝트의 **SQL Editor**에서 `supabase/schema.sql` 내용을 그대로 붙여넣고 실행
   (기프티콘 테이블 + 이미지용 `gifticon-images` 스토리지 버킷이 만들어집니다)
3. **Project Settings → API**에서 `Project URL`과 `anon public` 키를 확인
4. 이 값을 다음 두 곳에 넣어야 합니다:
   - **로컬 개발용**: `client/.env.example`을 `client/.env`로 복사하고 값 채우기
   - **GitHub Pages 배포용**: 저장소 `Settings → Secrets and variables → Actions`에서
     `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` 리포지토리 시크릿 등록

## 처음 한 번만: 로그인 켜기

1. Supabase 대시보드 **Authentication → Sign In / Providers → Email**에서 Email 로그인이
   켜져 있는지 확인합니다(기본값으로 켜져 있어요). "Confirm email"은 꺼도 되고 켜도 됩니다 —
   이 앱은 비밀번호 없이 매직 링크(이메일로 온 링크를 누르면 로그인)만 사용합니다.
2. **Authentication → URL Configuration**에서 로그인 링크가 되돌아올 주소를 등록합니다:
   - **Site URL**: `https://<GitHub 사용자명>.github.io/our-home-gift/`
   - **Redirect URLs**에 위 주소와, 로컬 개발용 `http://localhost:5173/`도 함께 추가
   (등록 안 된 주소로는 로그인 링크가 리다이렉트되지 않아요.)
3. `supabase/schema.sql`을 실행하면 `families`(가족 그룹) / `family_members`(가족 구성원)
   테이블과, 기프티콘을 가족 단위로만 볼 수 있게 막는 RLS 정책이 함께 만들어집니다.

가입 절차는 앱 안에서 이뤄집니다: 이메일 입력 → 메일함의 로그인 링크 클릭 → 처음 로그인한
사람은 "가족 만들기"로 그룹을 만들고 뜨는 6자리 초대 코드를 가족에게 알려주면, 가족은
"초대 코드로 참여"에 그 코드를 입력해서 같은 그룹에 들어옵니다. 초대 코드는 헤더의
"가족 이름 · 초대코드 XXXXXX"에서 언제든 다시 확인할 수 있습니다.

### 기존에 로그인 없이 쓰던 데이터가 있다면

로그인 기능을 붙이기 전부터 쓰던 기프티콘 데이터는 `family_id`가 비어 있어서, RLS가 켜진
뒤에는 아무 가족에도 속하지 않아 화면에 보이지 않습니다. 가족 그룹을 만든 뒤 아래 SQL을
Supabase **SQL Editor**에서 한 번만 실행해서 기존 데이터를 그 가족 소유로 옮겨주세요
(가족의 id는 `select id, name, invite_code from families;`로 확인할 수 있어요):

```sql
update gifticons set family_id = '<위에서 확인한 families.id>' where family_id is null;
```

## 처음 한 번만: 소셜 로그인(구글/네이버) 켜기

이메일 매직 링크 외에 구글·네이버로도 로그인할 수 있습니다(둘 다 선택 사항, 안 켜도 이메일
로그인은 그대로 동작). 카카오 버튼은 화면에 있지만 비활성화 상태예요 — 카카오는 이메일
동의항목이 "비즈니스 인증"(사업자등록 필요)을 받은 앱에만 열려 있어서, 지금은 붙일 수 없습니다.

### 구글 로그인

Supabase가 기본 지원하는 제공자라 어렵지 않습니다.

1. [Google Cloud Console](https://console.cloud.google.com) → 프로젝트 생성(또는 기존 프로젝트 사용)
2. **APIs & Services → OAuth consent screen**: User Type은 **External**로, 앱 이름/이메일만
   채우면 됩니다. 게시 상태를 "Testing"으로 둘 거면 **Test users**에 로그인할 가족 이메일을
   추가해야 로그인이 허용됩니다(가족 몇 명뿐이라면 이 상태로 충분).
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**: Application type
   **Web application** 선택 → **Authorized redirect URIs**에
   `https://<Supabase 프로젝트ref>.supabase.co/auth/v1/callback` 추가 → 생성 후 **Client ID/Secret** 확인
4. Supabase 대시보드 **Authentication → Providers → Google**에서 활성화하고 위 Client ID/Secret 입력

### 네이버 로그인

네이버는 Supabase가 기본 지원하지 않아서, `supabase/functions/naver-auth` Edge Function이
네이버 OAuth 코드 교환부터 로그인 세션 발급까지 대신 처리하도록 만들어져 있습니다.

> 아래 "가격 검색 기능"과 같은 네이버 애플리케이션을 그대로 씁니다 — 사용 API에
> **네이버 로그인**과 **검색**을 둘 다 등록해두면 Client ID/Secret 하나를 두 기능이
> 같이 씁니다. (검색 API는 애플리케이션 수정 화면에서 바로 추가되지 않고, 아래
> "가격 검색 기능"에 있는 것처럼 검색 API 전용 신청 페이지를 거쳐야 합니다.)

1. [네이버 개발자센터](https://developers.naver.com) → 애플리케이션 → 사용 API에
   **네이버 로그인** 체크 → 제공 정보 선택에서 **이메일**을 필수(또는 선택)로 체크
   → **로그인 오픈 API 서비스 환경**에 PC/모바일 웹 등록하고, **Callback URL**에
   `https://<Supabase 프로젝트ref>.supabase.co/functions/v1/naver-auth` 입력
2. 저장소 루트에서 Edge Function 배포 (JWT 검증은 `supabase/config.toml`에서 이미 꺼둠):
   ```bash
   supabase functions deploy naver-auth
   supabase secrets set NAVER_CLIENT_ID=발급받은값 NAVER_CLIENT_SECRET=발급받은값
   ```
3. 프론트엔드 쪽에도 Client ID(비밀 아님)를 알려줘야 합니다:
   - **로컬 개발용**: `client/.env`에 `VITE_NAVER_CLIENT_ID=발급받은값` 추가
   - **GitHub Pages 배포용**: 저장소 `Settings → Secrets and variables → Actions`에
     `VITE_NAVER_CLIENT_ID` 리포지토리 시크릿 등록

이 값들을 안 채워두면 "네이버로 로그인" 버튼을 눌렀을 때 설정이 안 됐다는 안내만 뜨고,
나머지 로그인 방식(이메일, 구글)에는 영향이 없습니다.

## 처음 한 번만: GitHub Pages 켜기

저장소 `Settings → Pages → Build and deployment → Source`를 **GitHub Actions**로 설정하면,
이후로는 `main` 브랜치에 푸시할 때마다 `.github/workflows/deploy-pages.yml`이 자동으로
빌드해서 배포합니다. 배포된 주소는 `https://ceaser501.github.io/our-home-gift/` 입니다.

## 처음 한 번만: 가격 검색 기능(선택) 켜기

금액이 안 찍혀 나오는 상품형 기프티콘(예: 카페 음료 1개)은 자동으로 가격을 못 채우는데,
그럴 때 "가격 검색" 버튼을 누르면 네이버 쇼핑 검색으로 대략적인 가격을 찾아 채워줍니다.
이 기능은 선택 사항이고, 안 켜도 나머지 기능은 그대로 동작합니다.

> 검색 API는 애플리케이션을 수정하는 화면에서 바로 추가할 수 없고, 아래 전용 신청
> 페이지를 거쳐야 합니다. 신청할 때 기존 "네이버 로그인"용 애플리케이션에 검색 API를
> 추가하는 형태로 진행하면, Client ID/Secret 하나를 두 기능이 같이 씁니다.

1. [네이버 검색 API 신청 페이지](https://developers.naver.com/products/service-api/search/search.md)로 이동
   → 페이지 아래 **"오픈 API 이용 신청"** 버튼 클릭 → 기존 애플리케이션에
   검색 API 추가 → 웹 서비스 URL에 배포 주소(`https://ceaser501.github.io/our-home-gift/`) 입력
2. [Supabase CLI](https://supabase.com/docs/guides/cli) 설치 (`npm install -g supabase` 또는 `brew install supabase/tap/supabase`)
3. 저장소 루트에서:
   ```bash
   supabase login
   supabase link --project-ref <Supabase 프로젝트 ref>
   supabase functions deploy search-price
   supabase secrets set NAVER_CLIENT_ID=발급받은값 NAVER_CLIENT_SECRET=발급받은값
   ```
   (네이버 로그인 때 이미 등록해뒀다면 이 명령은 다시 안 해도 됩니다 — 같은 값이니까요.)
   `<Supabase 프로젝트 ref>`는 Supabase 대시보드 URL(`app.supabase.com/project/xxxxxxxx`)의
   `xxxxxxxx` 부분입니다. **Client ID/Secret은 절대 코드나 `.env`에 넣지 말고, 이 명령어로만
   전달하세요** — Edge Function 안에서만 비밀값으로 보관되고 브라우저에는 노출되지 않습니다.
4. Edge Function을 다시 배포할 때(코드 수정 시)는 3번의 `functions deploy` 줄만 다시 실행하면
   됩니다. 시크릿은 한 번만 설정하면 유지돼요.

검색으로 채운 가격은 "공식 정가"가 아니라 검색 결과에서 가져온 값이라 100% 정확하지 않을 수
있어요. 저장 전에 확인/수정할 수 있습니다.

## 처음 한 번만: 유효기한 임박 푸시 알림(선택) 켜기

사용 전 기프티콘 중에 유효기한이 오늘부터 7주(49일) 이내로 남은 게 있으면, 하루 두 번
(오전 9시 / 오후 3시, 한국시간) 그 가족 구성원들의 브라우저로 푸시 알림을 보냅니다. 같은
기프티콘은 한 번만 알려주고(수정해서 유효기한이 바뀌면 다시 알려줌), 안 켜도 나머지 기능은
그대로 동작합니다.

1. **VAPID 키**(웹푸시 발신자 인증용, 한 쌍만 있으면 됨)는 이미 만들어서 공개키는
   `client/src/push.js`에 코드로 박아뒀어요. 개인키는 절대 코드에 넣으면 안 되는 값이라
   저와 대화로만 전달받으셨을 거예요 — 그 값으로 아래 명령을 실행하세요.
2. 저장소 루트에서 Edge Function 배포 + 시크릿 등록 (JWT 검증은 `supabase/config.toml`에서
   이미 꺼둠):
   ```bash
   supabase functions deploy send-expiry-notifications
   supabase secrets set VAPID_PUBLIC_KEY=공개키값 VAPID_PRIVATE_KEY=개인키값 CRON_SECRET=아무거나_정한_비밀값
   ```
   `CRON_SECRET`은 이 함수를 외부에서 아무나 못 부르게 막는 용도로, 원하는 문자열을 직접
   정해서 넣으면 됩니다(예: 긴 랜덤 문자열).
3. Supabase 대시보드 **Database → Extensions**에서 **pg_cron**, **pg_net** 확장 켜기
4. `supabase/push-cron.sql` 파일을 열어서 `<프로젝트ref>`와 `<CRON_SECRET>`을 위에서 정한
   값으로 바꾼 뒤, 그 내용을 SQL Editor에서 실행 (하루 두 번 자동 호출되도록 예약됨)
5. `supabase/schema.sql`을 다시 실행 (`push_subscriptions` 테이블과
   `gifticons.expiry_notified` 컬럼이 이번에 추가됨)

설정이 끝나면 앱 헤더의 종 모양 아이콘을 눌러서 알림을 켤 수 있어요. **아이폰(사파리)은
"홈 화면에 추가"로 설치해서 그 아이콘으로 실행했을 때만 푸시가 옵니다** — 사파리 탭으로 그냥
열어서 쓰면 알림이 안 와요. 안드로이드는 이런 제약 없이 바로 됩니다.

### 테스트용 가짜 데이터

`supabase/mock-data.sql`을 SQL Editor에서 실행하면, 유효기한이 각각 D-5/D-20/D-45(알림
대상)와 D-90(비교용, 대상 아님)인 가짜 기프티콘 몇 개가 만들어져요. `send-expiry-notifications`
함수를 Supabase 대시보드에서 수동으로 한 번 실행(Invoke)해보면 예약 시간을 안 기다리고
바로 테스트할 수 있습니다.

## 로컬 실행

```bash
npm run install:all
npm run dev
```

`http://localhost:5173` 접속 (모바일 폭 기준으로 디자인되어 있어 개발자도구의 모바일
뷰포트로 보는 것을 추천). `client/.env`에 Supabase 값이 있어야 목록이 정상적으로 뜹니다.

## 주요 기능

- **로그인 + 가족 그룹**: 이메일 매직 링크, 구글, 네이버로 로그인하고(카카오는 비즈니스 인증
  전이라 버튼만 있고 비활성화), 가족 그룹을 만들거나 초대 코드로 참여합니다. 같은 가족
  그룹에 속한 사람들끼리만 서로의 기프티콘을 보고 관리할 수 있습니다.
- **이미지 업로드(여러 장 가능) + 자동 인식**: 갤러리에서 기프티콘 이미지를 한 장 이상 선택하면
  브라우저에서 `@zxing/browser`로 바코드/QR 값을 읽고, `tesseract.js`(OCR)로 텍스트를 읽어
  카테고리·브랜드·이름·금액·유효기한을 추정해 폼에 미리 채워줍니다. 업체마다 기프티콘 디자인이
  달라서 상품명은 첫 화면, 금액·기한은 다른 화면에 있는 경우가 많은데, 이미지를 여러 장 올리면
  각 이미지에서 찾은 정보를 필드별로 합쳐서 채워줍니다. 자동 인식은 100% 정확하지 않으므로
  저장 전에 항상 확인/수정할 수 있게 되어 있습니다.
- **목록 정렬**: 사용 전 기프티콘은 유효기한이 임박한 순서로 위에, 사용 완료된 기프티콘은
  아래로 내려갑니다.
- **검색 / 카테고리 필터 / 상태 탭**: 이름·브랜드·메모로 검색, 카테고리 칩으로 필터링,
  전체/사용 전/사용 완료 탭 전환.
- **바코드·QR 보기**: 원본 스크린샷을 그대로 보여주는 대신, 상호·상품명 텍스트와 함께
  바코드를 보여줍니다. 바코드가 인식된 이미지에서는 zxing이 알려주는 위치를 기준으로
  바코드와 그 아래 숫자만 잘라낸 사진을 보여주고, 잘라내지 못한 경우에는 인식된 값으로
  깨끗한 바코드/QR을 다시 그려서 보여줍니다.
- **사용 완료 처리**: "사용완료" 버튼으로 상태와 사용일자를 기록하고, "사용취소"로 되돌릴 수
  있습니다.
- **가격 검색(선택 기능)**: 금액이 자동으로 안 채워지면 "가격 검색" 버튼으로 네이버 쇼핑
  검색 결과의 최저가를 가져와 채웁니다. Supabase Edge Function 설정이 필요합니다
  (아래 "가격 검색 기능 켜기" 참고).

## 알아두면 좋은 점

- 기프티콘 데이터(테이블 행)는 RLS로 가족 단위 접근 제한이 걸려 있지만, 이미지 파일 자체는
  지금도 공개 버킷의 공개 URL로 제공됩니다. URL 안에 임의의 파일명이 섞여 있어 추측하긴
  어렵지만, 완전히 비공개는 아니라는 점은 참고해주세요.
- OCR(텍스트 자동 인식)은 최초 실행 시 tesseract 엔진/언어 데이터를 CDN에서 내려받습니다.
  인터넷이 안 되는 환경에서는 텍스트 자동 인식만 실패하고, 바코드/QR 인식과 수동 입력은
  그대로 동작합니다.
- 카테고리 자동 분류는 브랜드명 키워드 매칭 방식이라 완벽하지 않습니다. 목록/키워드는
  `client/src/constants.js`에서 조정할 수 있습니다.

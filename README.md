# 모아콘 (기프티콘 모아보기)

가족끼리 함께 쓰는 기프티콘 관리 사이트. 카카오톡/문자로 받은 기프티콘 이미지를 업로드하면
바코드·QR·이름·금액·유효기한을 자동으로 인식해 채워주고, 만료일이 얼마 안 남은 순서로 목록을 보여줍니다.
이메일 로그인 + 초대 코드로 만든 "가족 그룹" 단위로 데이터가 격리되어서, 초대 코드를 아는
가족끼리만 같은 목록을 보게 됩니다.

## 구조

```
client/     React(Vite) 프론트엔드 — GitHub Pages로 배포되는 정적 사이트
app/        Capacitor 안드로이드 앱 껍데기 — 위 사이트를 그대로 띄운다
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
   - 안드로이드 앱을 쓴다면 **`io.github.ceaser501.moacon://login`도 함께 추가**합니다.
     앱에서 로그인이 끝난 뒤 앱으로 돌아오는 주소예요. 없으면 로그인이 브라우저에서
     끝나고 앱은 로그아웃 상태로 남습니다(→ [docs/app-release.md](docs/app-release.md)).
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

> 네이버 애플리케이션은 **로그인 용도로만** 씁니다. 가격 검색은 더 이상 네이버 검색 API를
> 쓰지 않으므로, 애플리케이션에 검색 API를 추가로 신청할 필요가 없습니다.
>
> 애플리케이션을 새로 만들어 갈아탈 때 확인할 것: ①Callback URL 재등록, ②Supabase 시크릿
> (`NAVER_CLIENT_ID`/`NAVER_CLIENT_SECRET`)과 ③GitHub Actions 시크릿(`VITE_NAVER_CLIENT_ID`)을
> **셋 다** 새 값으로 교체. 기존 사용자는 이메일로 계정을 찾기 때문에 Client ID가 바뀌어도
> 같은 계정으로 로그인되고 데이터도 그대로입니다.

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

#### `wrong client id/client secret pair` 오류가 뜬다면

네이버 토큰 발급 단계에서 보낸 Client ID와 Secret이 한 애플리케이션의 짝이 아닐 때 나는
메시지입니다. 아래 순서로 확인하세요.

1. **네이버 개발자센터 → 애플리케이션 → 내 애플리케이션 → 개요**에서 Client ID와
   Client Secret을 다시 확인합니다(Secret은 재발급하면 값이 바뀝니다).
2. Supabase에 들어간 값과 같은지 확인합니다.
   ```bash
   supabase secrets list   # 이름과 해시만 보이므로, 의심되면 그냥 다시 설정하세요
   supabase secrets set NAVER_CLIENT_ID=발급받은값 NAVER_CLIENT_SECRET=발급받은값
   ```
   복사할 때 앞뒤 공백이나 줄바꿈이 섞이면 같은 오류가 납니다. 여러 Supabase 프로젝트를
   쓰고 있다면 `supabase link` 된 프로젝트가 Edge Function을 배포한 그 프로젝트인지도
   확인하세요.
3. **화면 쪽 `VITE_NAVER_CLIENT_ID`가 같은 애플리케이션 값인지** 확인합니다
   (로컬은 `client/.env`, 배포는 저장소 Actions 시크릿). 인가 코드는 화면이 보낸 Client ID
   앞으로 발급되기 때문에, 서버가 다른 애플리케이션의 ID/Secret으로 토큰을 요청하면 같은
   오류가 납니다. 이 경우에는 로그인 화면에 어느 값이 서로 다른지 안내가 표시됩니다.
   시크릿을 바꿨다면 GitHub Actions에서 배포를 다시 돌려야 반영됩니다.
4. 값을 고쳤으면 `supabase functions deploy naver-auth`로 함수를 다시 배포합니다.

## 처음 한 번만: GitHub Pages 켜기

저장소 `Settings → Pages → Build and deployment → Source`를 **GitHub Actions**로 설정하면,
이후로는 `main` 브랜치에 푸시할 때마다 `.github/workflows/deploy-pages.yml`이 자동으로
빌드해서 배포합니다. 배포된 주소는 `https://ceaser501.github.io/our-home-gift/` 입니다.

## 처음 한 번만: 이미지 자동 인식 + 가격 검색 켜기

기프티콘 이미지를 올리면 **상품명·상호·금액·유효기간을 자동으로 채워주고**, 금액이 안 찍혀
나오는 상품형 기프티콘(예: 카페 음료 1개)은 "가격 검색" 버튼으로 현재 판매가를 찾아줍니다.
두 기능 모두 Edge Function이 [Anthropic API](https://console.anthropic.com)를 호출해서
처리하고, 키를 안 넣으면 자동 채우기만 안 되고 나머지 기능은 그대로 동작합니다.

> 바코드/QR은 여전히 브라우저에서 직접 읽습니다(서버로 안 보냄). 서버로는 글자를 읽기 위한
> 축소본(긴 변 1400px JPEG)만 올라갑니다.

1. [Anthropic 콘솔](https://console.anthropic.com)에서 API 키 발급 (`sk-ant-...`)
2. [Supabase CLI](https://supabase.com/docs/guides/cli) 설치 (`npm install -g supabase` 또는 `brew install supabase/tap/supabase`)
3. 저장소 루트에서:
   ```bash
   supabase login
   supabase link --project-ref <Supabase 프로젝트 ref>
   supabase functions deploy analyze-gifticon
   supabase functions deploy search-price
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
   ```
   `<Supabase 프로젝트 ref>`는 Supabase 대시보드 URL(`app.supabase.com/project/xxxxxxxx`)의
   `xxxxxxxx` 부분입니다. **API 키는 절대 코드나 `.env`에 넣지 말고 이 명령어로만 전달하세요** —
   Edge Function 안에서만 비밀값으로 보관되고 브라우저에는 노출되지 않습니다.
4. Edge Function을 다시 배포할 때(코드 수정 시)는 `functions deploy` 줄만 다시 실행하면
   됩니다. 시크릿은 한 번만 설정하면 유지돼요.

쓰는 모델은 `claude-haiku-4-5`이고, 두 함수 모두 각자 `index.ts` 맨 위 `MODEL` 상수 한 줄로
바꿀 수 있습니다(더 정확하게 하고 싶으면 `claude-sonnet-5`, `claude-opus-5`).
비용은 이미지 한 장당 몇 원, 가격 검색 한 번에 수십 원 수준입니다.

검색으로 채운 가격은 "공식 정가"가 아니라 검색 결과에서 가져온 값이라 100% 정확하지 않을 수
있어요. 저장 전에 확인/수정할 수 있습니다.

## 처음 한 번만: 주변 매장 찾기(카카오, 선택) 켜기

기프티콘 카드의 📍 버튼을 누르면 현재 위치 주변에서 그 브랜드 매장을 가까운 순으로
보여줍니다(매장명·거리·주소·전화, 누르면 카카오맵 상세로 이동). 장소 데이터는
카카오 로컬 API를 쓰고, 키를 안 넣으면 이 버튼만 안 되고 나머지는 그대로 동작합니다.

1. [카카오 개발자센터](https://developers.kakao.com) → 내 애플리케이션 → **애플리케이션 추가하기**
   (앱 이름/회사명은 아무거나, 카테고리는 라이프스타일 정도면 됩니다)
2. 만든 앱의 **앱 키** 페이지에서 **REST API 키**를 복사
3. 저장소 루트에서:
   ```bash
   supabase functions deploy search-places
   supabase secrets set KAKAO_REST_API_KEY=복사한값
   ```
   위의 이미지 인식 설정을 이미 했다면 `login`/`link`는 다시 할 필요 없습니다.
   **키는 절대 코드나 `.env`에 넣지 말고 이 명령어로만 전달하세요.**

카카오맵 무료 쿼터는 계정에서 **첫 번째로 카카오맵을 활성화한 앱 하나**에만 붙습니다.
다른 앱이 이미 차지하고 있으면 그 앱의 카카오맵을 비활성화(제품 설정 → 카카오맵 → OFF)한
뒤에 이 앱에서 활성화하세요(반영에 시간이 걸릴 수 있음). 가족끼리 쓰는 규모에서는 무료
쿼터로 충분합니다. 위치 권한을 거부하면 목록 대신 안내 문구가 나옵니다.

### 매장 상세의 지도(선택)

매장을 누르면 앱 안에서 지도·주소·거리·전화·길찾기가 열립니다. 이 지도를 띄우려면
**JavaScript 키**(REST 키와 별개, 같은 앱 키 페이지에 있음)가 하나 더 필요합니다:

1. 카카오 개발자센터 → 모아콘 앱 → **앱 설정 → 플랫폼 → Web 플랫폼 등록**:
   `https://<GitHub 사용자명>.github.io` 와 `http://localhost:5173` 추가
   (JavaScript 키는 여기 등록한 도메인에서만 동작해서, 노출돼도 남이 못 씁니다)
2. **앱 키** 페이지에서 **JavaScript 키** 복사
3. 두 곳에 등록:
   - 로컬 개발용: `client/.env`에 `VITE_KAKAO_JS_KEY=복사한값`
   - 배포용: 저장소 `Settings → Secrets and variables → Actions`에 `VITE_KAKAO_JS_KEY` 추가

키를 안 넣으면 상세에서 지도만 빠지고 나머지(주소·거리·전화·길찾기)는 그대로 동작합니다.
평점·영업시간·리뷰는 카카오가 API로 제공하지 않아서, 상세의 "카카오맵" 버튼으로 볼 수 있어요.

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
  브라우저에서 `@zxing/browser`로 바코드/QR 값을 읽고, 이미지는 `analyze-gifticon` Edge
  Function으로 보내 상품명·상호·금액·유효기한·카테고리를 받아 폼에 미리 채워줍니다. 업체마다
  기프티콘 디자인이 달라서 상품명은 첫 화면, 금액·기한은 다른 화면에 있는 경우가 많은데,
  여러 장을 올리면 한 번에 같이 보고 합쳐서 채워줍니다. 자동 인식은 100% 정확하지 않으므로
  저장 전에 항상 확인/수정할 수 있게 되어 있습니다.
- **공유로 등록(안드로이드)**: 홈 화면에 설치해두면 카카오톡·갤러리의 "공유" 목록에 모아콘이
  뜹니다. 기프티콘 이미지를 공유하면 앱이 열리면서 등록 창에 그 사진이 이미 들어가 있고
  자동 인식이 바로 돌아갑니다. 앱을 먼저 열고 + 를 누를 필요가 없습니다.
  자세한 동작은 아래 "공유로 등록은 어떻게 동작하나" 참고.
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
- **가격 검색(선택 기능)**: 금액이 자동으로 안 채워지면 "가격 검색" 버튼으로 웹 검색을 돌려
  현재 판매가를 찾아 채웁니다. Supabase Edge Function 설정이 필요합니다
  (위 "이미지 자동 인식 + 가격 검색 켜기" 참고).

## 처음 한 번만: 안드로이드 앱 배포 켜기

앱은 웹을 대체하지 않는다. `app/capacitor.config.json`의 `server.url`이 GitHub Pages 주소를
가리키고 있어서, **앱은 그 사이트를 그대로 띄우는 껍데기**다. 화면 코드를 고치면 웹 배포만으로
앱에도 그대로 반영되고, 앱을 다시 나눠줄 필요가 없다. APK를 새로 뿌려야 하는 건 앱 껍데기나
갤러리 스캔 같은 네이티브 부분을 고쳤을 때뿐이다.

대신 앱은 인터넷이 없으면 열리지 않는다. 웹을 띄우는 구조라 어쩔 수 없는 맞바꿈이다.

> 아래는 요약이다. 앱 배포가 처음이라면 **[docs/app-release.md](docs/app-release.md)**에
> 개념(서명 키·versionCode·설치 출처)부터 받는 사람이 겪는 화면까지 자세히 적어뒀다.

### 1. 서명 키 만들기 (딱 한 번, 그리고 절대 잃어버리면 안 됨)

안드로이드는 서명된 앱만 설치된다. 스토어에 올리지 않아도 키는 필요한데, 애플과 달리
**내가 만든 키를 그대로 쓰면 된다**(승인 절차도, 비용도 없다).

```bash
keytool -genkeypair -v \
  -keystore moacon.keystore \
  -alias moacon \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -storetype PKCS12
```

> ⚠️ **이 파일을 잃어버리면 되돌릴 방법이 없다.** 다른 키로 서명한 APK는 이미 깔린 앱 위에
> 덮어쓰기가 안 되고, 쓰던 사람 전부가 앱을 지우고 다시 깔아야 한다(자료는 서버에 있어서
> 남지만 다시 로그인해야 한다). 저장소에는 넣지 말고, 비밀번호와 함께 따로 백업해둔다.

### 2. GitHub 시크릿 4개 등록

저장소 `Settings → Secrets and variables → Actions`에 넣는다.

| 이름 | 값 |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 moacon.keystore` 결과 (맥은 `-w0` 빼고) |
| `ANDROID_KEYSTORE_PASSWORD` | 위에서 정한 비밀번호 |
| `ANDROID_KEY_ALIAS` | `moacon` |
| `ANDROID_KEY_PASSWORD` | 비밀번호 (PKCS12는 위와 같은 값) |

### 3. 배포하기

태그를 밀면 `.github/workflows/build-android-apk.yml`이 APK를 만들어 Release에 붙인다.

```bash
git tag app-v1.0.0
git push origin app-v1.0.0
```

끝나면 `https://github.com/ceaser501/our-home-gift/releases` 에 `.apk`가 올라온다. **그 링크를
카카오톡으로 보내주면 된다.** 받는 사람은 링크를 눌러 받아 설치한다.

시험 삼아 빌드만 해보고 싶으면 Actions 탭에서 이 워크플로를 수동 실행한다. 그때는 Release를
만들지 않고 실행 결과에 APK만 첨부한다.

### 나눠줄 때 알아둘 것

- **APK 파일을 카톡으로 직접 보내지 않는다.** 카톡에 올린 파일은 일정 기간이 지나면 만료돼서
  나중에 받은 사람이 못 받는다. Gmail은 아예 `.apk` 첨부를 막는다. **링크로 주는 게 맞다.**
- **설치할 때 경고가 두세 번 뜬다.** "이런 유형의 파일은 위험할 수 있습니다" → "이 출처의 앱
  설치 허용" → Play Protect의 "무시하고 설치". 웹 링크와 달리 이 과정이 있다는 걸 미리
  알려주는 편이 좋다. Release 설명에 이 순서를 적어두게 해뒀다.
- **갤럭시는 "보안 위험 자동 차단"이 켜져 있으면 아예 설치가 안 된다.** 위 허용 토글까지
  잠긴다. `설정 → 보안 및 개인 정보 보호 → 보안 위험 자동 차단`을 끄고 설치해야 한다.
  설치가 안 된다는 연락이 오면 대개 이것이다.
- **자동 업데이트가 없다.** 다만 화면은 웹에서 오므로, 대부분의 수정은 앱을 다시 깔지 않아도
  반영된다.
- **아이폰은 이 APK를 쓸 수 없다.** 지금처럼 사이트를 홈 화면에 추가해서 쓰면 된다.
- **2027년부터 사이드로딩에도 개발자 인증이 필요해진다**([Android developer
  verification](https://developer.android.com/developer-verification)). 20대까지는 무료 계정으로
  가능하고, 그보다 많이 뿌리게 되면 25달러짜리 계정이 필요하다.

### 앱 아이콘을 다시 만들려면

`assets/app-icons/`의 원본에서 안드로이드용 아이콘을 다시 뽑는다.

```bash
cd app
mkdir -p .assets-src
cp ../assets/app-icons/store/icon-1024.png .assets-src/icon.png
cp ../assets/app-icons/android/android-adaptive-foreground.png .assets-src/icon-foreground.png
cp ../assets/app-icons/android/android-adaptive-background.png .assets-src/icon-background.png
npx @capacitor/assets generate --android --assetPath .assets-src
rm -rf .assets-src
```

## 공유로 등록은 어떻게 동작하나

`client/public/manifest.json`의 `share_target`이 "이 앱은 이미지를 받을 수 있다"고 알려주면,
안드로이드가 공유 목록에 모아콘을 넣어줍니다. 공유를 누르면 브라우저가 이미지를
`/our-home-gift/share-target`으로 POST하는데, 배포처가 GitHub Pages(정적 호스팅)라
이 POST를 받아줄 서버가 없습니다. 그래서 `client/public/sw.js`의 서비스워커가 이 요청을
가로채 이미지를 캐시에 넣어두고, 앱을 `?share=1`로 다시 엽니다. 앱이 뜨면
`client/src/utils/shareTarget.js`가 캐시에서 사진을 꺼내 등록 창으로 넘깁니다.

알아둘 점:

- **아이폰에서는 공유 목록에 뜨지 않습니다.** iOS 사파리가 공유 대상을 지원하지 않아서인데,
  아무것도 깨지지는 않고 아이폰은 지금처럼 앱에서 직접 올리면 됩니다.
- **홈 화면에 설치해야 동작합니다.** 브라우저 탭으로 열어둔 것만으로는 공유 목록에 안 뜹니다.
- **이미 설치해서 쓰던 사람은 조금 늦게 나타납니다.** 크롬이 설치된 앱의 manifest를 다시 읽는
  데 하루 정도 걸릴 수 있습니다. 급하면 지웠다가 다시 설치하면 바로 뜹니다.
- 서비스워커는 이제 알림을 켜지 않은 사람에게도 앱을 열 때 항상 등록됩니다
  (`client/src/main.jsx`). 서비스워커가 없으면 위 POST가 그대로 GitHub Pages로 나가서
  오류 화면이 뜨기 때문입니다.

## 알아두면 좋은 점

- 기프티콘 데이터(테이블 행)는 RLS로 가족 단위 접근 제한이 걸려 있지만, 이미지 파일 자체는
  지금도 공개 버킷의 공개 URL로 제공됩니다. URL 안에 임의의 파일명이 섞여 있어 추측하긴
  어렵지만, 완전히 비공개는 아니라는 점은 참고해주세요.
- 글자 자동 인식은 서버(`analyze-gifticon`)에서 처리합니다. API 키를 안 넣었거나 인터넷이
  안 되면 자동 채우기만 실패하고, 바코드/QR 인식과 수동 입력은 그대로 동작합니다.
- 카테고리 목록은 `client/src/constants.js`에서 조정할 수 있고, 그 목록이 그대로 자동 분류의
  후보로 서버에 전달됩니다.
- 이름표(카드 오른쪽 위 이름) 색은 가족에 들어올 때 한 번 정해지고 그 뒤로 바뀌지 않습니다.
  색은 여섯 가지이고, 일곱 번째 사람부터는 다시 처음 색부터 돌려씁니다.

# 우리집 기프티콘

나와 와이프가 함께 쓰는 기프티콘 관리 사이트. 카카오톡/문자로 받은 기프티콘 이미지를 업로드하면
바코드·QR·이름·금액·유효기한을 자동으로 인식해 채워주고, 만료일이 얼마 안 남은 순서로 목록을 보여줍니다.

## 구조

```
client/     React(Vite) 프론트엔드 — GitHub Pages로 배포되는 정적 사이트
supabase/   Supabase(DB + 이미지 스토리지) 초기 설정 SQL
```

백엔드 서버 없이, 프론트엔드가 [Supabase](https://supabase.com)를 직접 호출해서 기프티콘
데이터와 이미지를 저장합니다. 나와 와이프가 같은 사이트 링크에 접속하면 같은 Supabase
프로젝트를 보게 되므로 목록이 자동으로 공유됩니다.

## 처음 한 번만: Supabase 설정

1. https://supabase.com 에서 무료 프로젝트 생성
2. 프로젝트의 **SQL Editor**에서 `supabase/schema.sql` 내용을 그대로 붙여넣고 실행
   (기프티콘 테이블 + 이미지용 `gifticon-images` 스토리지 버킷이 만들어집니다)
3. **Project Settings → API**에서 `Project URL`과 `anon public` 키를 확인
4. 이 값을 다음 두 곳에 넣어야 합니다:
   - **로컬 개발용**: `client/.env.example`을 `client/.env`로 복사하고 값 채우기
   - **GitHub Pages 배포용**: 저장소 `Settings → Secrets and variables → Actions`에서
     `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` 리포지토리 시크릿 등록

## 처음 한 번만: GitHub Pages 켜기

저장소 `Settings → Pages → Build and deployment → Source`를 **GitHub Actions**로 설정하면,
이후로는 `main` 또는 `claude/gifticon-management-app-7ft5l9` 브랜치에 푸시할 때마다
`.github/workflows/deploy-pages.yml`이 자동으로 빌드해서 배포합니다.
배포된 주소는 `https://ceaser501.github.io/our-home-gift/` 입니다.

## 로컬 실행

```bash
npm run install:all
npm run dev
```

`http://localhost:5173` 접속 (모바일 폭 기준으로 디자인되어 있어 개발자도구의 모바일
뷰포트로 보는 것을 추천). `client/.env`에 Supabase 값이 있어야 목록이 정상적으로 뜹니다.

## 주요 기능

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
- **바코드·QR 보기**: 카드의 "바코드 보기"를 누르면 인식된 값으로 깨끗한 바코드/QR을
  다시 그려서 크게 보여줍니다(인식 실패 시 원본 이미지를 보여줍니다).
- **사용 완료 처리**: "사용완료" 버튼으로 상태와 사용일자를 기록하고, "사용취소"로 되돌릴 수
  있습니다.

## 알아두면 좋은 점

- 지금은 로그인/권한이 없습니다. Supabase 테이블의 Row Level Security도 꺼둔 상태라
  링크와 Supabase anon 키를 아는 사람은 누구나 읽고 쓸 수 있어요. 나중에 실사용 배포처가
  정해지면 인증을 붙이는 걸 권장합니다.
- OCR(텍스트 자동 인식)은 최초 실행 시 tesseract 엔진/언어 데이터를 CDN에서 내려받습니다.
  인터넷이 안 되는 환경에서는 텍스트 자동 인식만 실패하고, 바코드/QR 인식과 수동 입력은
  그대로 동작합니다.
- 카테고리 자동 분류는 브랜드명 키워드 매칭 방식이라 완벽하지 않습니다. 목록/키워드는
  `client/src/constants.js`에서 조정할 수 있습니다.

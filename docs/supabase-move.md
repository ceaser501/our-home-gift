# Supabase를 서울로 옮기기

지금 프로젝트는 `ap-northeast-1`(도쿄)에 있다. 그래서 개인정보처리방침에 **보관 국가가
일본**이라고 적힌다. 사실 그대로지만 쓰는 사람에게 걸린다.

**Supabase는 리전을 나중에 못 바꾼다.** 프로젝트를 만들 때 정하고 끝이라, 옮기려면
서울(`ap-northeast-2`)로 새 프로젝트를 만들어 갈아타야 한다.

- 정리 시점: 2026-09-02
- 데이터는 전부 테스트용이라 **버리고 새로 시작한다**. 옮기지 않는다

## 시작 전에

- **데이터가 전부 사라진다.** 가족·구성원·기프티콘·사용내역·알림 설정. 되돌릴 수 없다
- **기프티콘 사진은 폰에 그대로 있다.** 사진첩 자동 찾기로 다시 올리면 된다
- **중간에 웹과 앱이 안 되는 시간이 있다.** 새 주소로 배포될 때까지 몇 분
- **앱은 새로 빌드해서 다시 깔아야 한다.** 접속 주소가 빌드 시점에 번들에 박히기 때문이다
- 옛 프로젝트는 **다 끝나고 확인까지 마친 뒤에** 지운다. 먼저 지우면 돌아갈 자리가 없다

지금 프로젝트의 시크릿 값들을 **먼저 적어둔다.** 대부분 그대로 다시 쓴다
(Project Settings → Edge Functions → Secrets).

---

## 1. 새 프로젝트 만들기

Supabase 대시보드 → New project

| | |
|---|---|
| Region | **Northeast Asia (Seoul)** — `ap-northeast-2` |
| Name | 아무거나 (`moacon` 등) |
| Database Password | 새로 정하고 적어둔다 |

만들어지면 **Project URL**과 **anon key**를 적어둔다
(Project Settings → API). 뒤에서 여러 번 쓴다.

## 2. 확장 켜기

Database → Extensions에서 둘을 켠다. 크론 예약이 이것을 쓴다.

- `pg_cron`
- `pg_net`

## 3. SQL 돌리기 — 순서대로

SQL Editor에서 아래 순서로 실행한다. **순서가 중요하다** — 뒤엣것이 앞엣것을 딛고 선다.

| 순서 | 파일 | 무엇 |
|---|---|---|
| 1 | `supabase/schema.sql` | 표·정책·함수·트리거·스토리지 버킷 전부 |
| 2 | `supabase/admin-stats.sql` | 관리자 대시보드용 통계 |
| 3 | `supabase/admin-users.sql` | 관리자 명단(표·자물쇠·넣고 빼는 함수) |
| 4 | `supabase/admin-by-email.sql` | 명단 열쇠를 uuid에서 이메일로 |

**돌리지 않는 것들.** `mock-data.sql`·`push-test-once.sql`은 테스트용이고,
`drop-sample-skip.sql`·`gifticon-uses.sql`·`invite-peek.sql`·`join-request-email.sql`·
`kick-member.sql`·`member-email.sql`·`native-push.sql`·`purge-30days.sql`은 이미
`schema.sql`에 들어 있다(옛 프로젝트에 나중에 얹으려고 따로 둔 파일들이다).

크론 두 개(`push-cron.sql`·`purge-cron.sql`)는 8번에서 돌린다 — 시크릿이 먼저 있어야 한다.

## 4. 로그인 제공자 켜기 + 콜백 주소

**제공자를 켜는 일과 그 콜백 주소를 바깥 콘솔에 넣는 일은 한 덩어리다.** Supabase가
제공자를 켤 때 콜백 주소를 만들어주고, 그 주소를 구글·카카오에 넣어야 짝이 맞는다.
따로 떼면 왔다 갔다 하게 된다.

주소로 바로 간다: `https://supabase.com/dashboard/project/<새ref>/auth/providers`

### Google

1. Google 제공자를 켜고 화면의 **Callback URL**을 복사한다
   (`https://<새ref>.supabase.co/auth/v1/callback`)
2. [Google Cloud Console → 사용자 인증 정보](https://console.cloud.google.com/apis/credentials)
   → OAuth 2.0 클라이언트 ID(웹 애플리케이션) → **승인된 리디렉션 URI에 1번을 추가**
3. 거기 있는 **클라이언트 ID·보안 비밀번호**를 Supabase에 넣고 저장

### Kakao

같은 순서다. 카카오 개발자센터 → 카카오 로그인 → **Redirect URI**에 콜백 주소를 추가하고,
**REST API 키**를 Client ID에, **보안 → Client Secret**을 Client Secret에 넣는다.

### Email

기본으로 켜져 있다. 매직 링크라 손댈 것이 없다.

### 넣는 값은 옛것 그대로다

Client ID·Secret은 **구글·카카오에 등록된 앱의 값**이지 Supabase의 값이 아니다.
Supabase가 바뀌어도 안 바뀐다. 바뀌는 것은 반대 방향 하나뿐이다 — 콜백 주소를
바깥 콘솔에 추가하는 것.

옛 Supabase의 같은 화면에 Client ID가 이미 들어 있으니 거기서 복사하는 편이 빠르다.
Secret이 가려져 있으면 구글·카카오 콘솔에서 가져온다.

**옛 주소는 지우지 말고 새 주소를 나란히 추가한다.** 확인이 끝난 뒤에 지우면 중간에
틀어져도 돌아갈 자리가 있다.

### Redirect URLs

Authentication → URL Configuration → Redirect URLs. **네 개를 각각 「Add URL」로 넣는다.**
한 칸에 몰아 쓰는 것이 아니라 항목 넷이다.

| URL | 없으면 |
|---|---|
| `https://ceaser501.github.io/our-home-gift/` | 웹 로그인이 안 된다 |
| `https://ceaser501.github.io/our-home-gift/admin/` | **관리자 대시보드 로그인이 안 된다.** 경로가 달라 따로 필요하다 |
| `http://localhost:5173/` | 로컬에서 `npm run dev` 할 때 로그인이 안 된다 |
| `io.github.ceaser501.moacon://login` | 앱에서 로그인이 브라우저에서 끝난다 |

Site URL은 `https://ceaser501.github.io/our-home-gift/`.

마지막 줄이 앱이 로그인을 마치고 돌아오는 주소다. **앱 패키지명은
`io.github.ceaser501.ourhomegift`로 바뀌었지만 이 스킴은 일부러 `moacon` 그대로 뒀다** —
바꾸면 Supabase와 네이버 시크릿을 동시에 고쳐야 해서 그사이 로그인이 깨진다.
둘이 다른 것이 맞다(`app/android/…/res/values/strings.xml`에 같은 메모).

> **이 목록보다 옛 프로젝트 화면이 진짜다.** 여기 적힌 것은 2026-09-02 기준이고, 그 뒤에
> 늘어난 주소가 있을 수 있다. 옛 프로젝트의 URL Configuration을 나란히 띄워놓고 베끼는
> 편이 확실하다. 실제로 이 문서는 처음에 둘만 적었다가 admin과 localhost를 빠뜨렸다.

**네이버는 여기 없다.** Supabase 제공자가 아니라 Edge Function으로 직접 만든 것이라,
함수가 올라간 뒤인 7번에서 한다.

## 5. Edge Function 시크릿 넣기

Project Settings → Edge Functions → Secrets. **옛 프로젝트 화면을 나란히 띄워놓고
그대로 베낀다.** 값은 전부 그대로 쓴다.

| 이름 | 비고 |
|---|---|
| `ANTHROPIC_API_KEY` | 그대로 |
| `ANALYZE_MODEL` · `ANALYZE_VERIFY_MODEL` | 그대로 |
| `KAKAO_REST_API_KEY` | 그대로 |
| `TMAP_APP_KEY` | 그대로 |
| `NAVER_CLIENT_ID` · `NAVER_CLIENT_SECRET` | 그대로 |
| `NAVER_ALLOWED_REDIRECTS` · `NAVER_LOGIN_FALLBACK_REDIRECT` | 그대로 (우리 쪽 주소라 안 바뀐다) |
| `VAPID_PUBLIC_KEY` · `VAPID_PRIVATE_KEY` · `VAPID_SUBJECT` | 그대로. 웹 푸시 구독은 어차피 다 새로 생긴다 |
| `FCM_SERVICE_ACCOUNT` | 그대로. 파이어베이스 프로젝트는 안 바뀐다 |
| `ALLOWED_ORIGINS` | 그대로 |
| `CRON_SECRET` | 그대로 쓰거나 새로 만든다(`openssl rand -hex 32`). 8번과 같은 값이어야 한다 |

**`SUPABASE_URL`·`SUPABASE_ANON_KEY`·`SUPABASE_SERVICE_ROLE_KEY`는 넣지 않는다.**
Supabase가 함수에 알아서 넣어준다. 손으로 넣으면 옛 프로젝트를 가리키는데, 에러도 안 나고
조용히 옛 데이터를 읽는다. 옛 목록에 그 셋이 보이면 건너뛴다.

## 6. Edge Function 배포

새 프로젝트에 연결한 뒤 아홉 개를 올린다.

```
supabase link --project-ref <새ref>
supabase functions deploy
```

`verify_jwt`를 꺼야 하는 함수들(naver-auth·send-expiry-notifications·admin-stats)은
`supabase/config.toml`에 적혀 있어서 따로 손댈 것이 없다.

올라간 것: `admin-stats` `analyze-gifticon` `delete-account` `naver-auth`
`notify-join-request` `search-places` `search-price` `send-expiry-notifications`
`send-test-notification`

## 7. 네이버 콜백 주소

네이버는 Supabase 제공자를 거치지 않고 **우리 함수로 직접 돌아온다.** 그래서 함수가
올라간 뒤에 한다.

네이버 개발자센터 → 내 애플리케이션 → API 설정 → **Callback URL**에 추가한다.

```
https://<새ref>.supabase.co/functions/v1/naver-auth
```

옛 주소는 그대로 두고 나란히 넣는다.

## 8. 크론 예약

SQL Editor에서 둘을 돌린다.

| 파일 | 채울 것 |
|---|---|
| `supabase/push-cron.sql` | `<프로젝트ref>` → 새 ref, `<CRON_SECRET>` → 5번에서 정한 값 |
| `supabase/purge-cron.sql` | 없다. 그대로 실행 |

확인: `select jobname, schedule from cron.job;`

## 9. GitHub 시크릿 교체

저장소 → Settings → Secrets and variables → Actions

- `VITE_SUPABASE_URL` → 새 Project URL
- `VITE_SUPABASE_ANON_KEY` → 새 anon key

나머지 시크릿(카카오·네이버·안드로이드 서명·FCM)은 손대지 않는다.

## 10. 다시 내보내기

```
git commit --allow-empty -m "Supabase 새 프로젝트로" && git push origin HEAD:main
```

웹이 새 주소로 다시 나간다(`.github/workflows/deploy-pages.yml`). 관리자 대시보드도
같은 워크플로가 새 값으로 심어 내보낸다.

**앱은 따로 빌드해야 한다.** 접속 주소가 빌드 시점에 번들로 들어가기 때문이다.

```
npm run release
```

## 11. 관리자 명단에 나를 넣기

`admin-by-email.sql`이 만든 함수로 넣는다. 이메일 기준이라 다시 로그인해도 안 날아간다.
자세한 것은 그 파일 안에 적혀 있다.

## 12. 확인

- [ ] 웹에서 **구글** 로그인
- [ ] 웹에서 **카카오** 로그인
- [ ] 웹에서 **네이버** 로그인 ← 7번을 놓치면 여기서 걸린다
- [ ] 이메일 매직 링크
- [ ] 가족 만들기 → 초대 코드 → 다른 계정으로 참여 신청 → 승인
- [ ] 기프티콘 등록(사진 올리기) — 스토리지와 자동 인식을 한 번에 본다
- [ ] 사진첩에서 찾기 (앱)
- [ ] 매장 찾기 (카카오·TMAP)
- [ ] 알림 켜기 → `supabase/push-test-once.sql`로 한 번 받아보기
- [ ] 관리자 대시보드(`/admin/`) 로그인
- [ ] **앱**에서 로그인 → 딥링크로 돌아오는지

## 13. 마지막

- 개인정보처리방침의 보관 국가를 **일본(도쿄) → 대한민국(서울)**로 (`client/public/privacy.html`)
- 맨 위 안내문에서 일본 관련 문장을 고친다. 미국(Anthropic)은 그대로 남는다
- 확인이 다 끝나면 **옛 프로젝트를 지운다.** 그 전에는 두 개가 다 살아 있어도 문제없다
- 옛 프로젝트를 지우기 전에 4번·7번에서 나란히 넣어둔 옛 주소들도 함께 지운다

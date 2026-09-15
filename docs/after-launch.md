# 출시 뒤에 할 일

**심사가 끝나기 전에는 손대지 않는다.** 심사 중인 빌드와 스토어 등록정보를 건드리면
심사가 흔들린다. 아래는 전부 출시 뒤 업데이트로 올릴 것들이다.

순서는 급한 것부터다. 위 둘은 날짜가 정해져 있고, 아래는 여유가 있다.

---

## 1. 오래 전에 쓴 것의 원본 사진을 지운다 ⏰ 넉 달

**제일 급하다.** 스토리지 무료 티어가 차는 날이 정해져 있어서다.

기프티콘 한 건이 124KB를 쓰고 무료 1GB에 약 8,400건이 담긴다. 기준으로 잡은 월
2,000건이면 **넉 달 뒤 찬다.** 그다음은 Supabase Pro $25 = 월 35,000원이라 예산의
절반이 한 번에 날아간다. **AI 요금보다 이쪽이 먼저 문제가 된다.**

무엇이 자리를 차지하는지 재어봤다(2026-09-14, 37건 기준).

| | 파일 | 크기 | 비중 |
|---|---|---|---|
| **원본** | 39장 | 3,266 KB | **71%** |
| 썸네일 | 22장 | 681 KB | 15% |
| 바코드 크롭 | 33장 | 647 KB | 14% |

원본을 지우면 한 건이 **124KB → 36KB**, 무료 티어가 **8,400건 → 29,000건**이 된다.

### 왜 지워도 되나

**바코드가 사진에 매여 있지 않다.** 계산대에서 보여주는 막대는 원본 사진이 아니라
`code`와 `code_type`으로 그 자리에서 다시 그린다
(`client/src/components/BarcodeModal.jsx:107`, JsBarcode/QRCode).
`barcode_image_path`는 그리기가 실패했을 때만 쓰는 예비고, 그것도 안 지운다.

없어지는 것은 바코드 창의 **「원본 사진」 탭** 하나뿐이다
(`client/src/components/BarcodeModal.jsx:133`). 석 달 전에 쓴 기프티콘의 원본을 다시
볼 일이 없다.

### 지우는 조건 — 셋 다 맞아야 한다

```sql
status = 'used'
and used_at < (current_date - interval '3 months')
and thumb_image_path is not null
```

**셋째 줄이 핵심이다.** 목록 카드는 썸네일이 없으면 첫 원본을 대신 쓴다
(`client/src/components/GifticonCard.jsx:123`의
`gifticon.thumb_image_url || gifticon.image_url`). 썸네일 기능이 생기기 전에 올린
것들이 그렇고, 2026-09-14 기준 37건 중 **15건**이 해당한다. 이 조건을 빼면 그 카드들이
목록에서 빈 네모가 된다.

**석 달로 잡은 이유.** 한 달도 되지만 잘못 눌러 되돌리는 것 말고도 매장에서 시비가
붙는 경우가 있다. 석 달이어도 아끼는 양은 거의 같다 — 오래된 것일수록 어차피 안 본다.

금액권은 걱정하지 않아도 된다. 잔액이 남아 있는 동안은 `status`가 `used`가 아니라
조건에 안 걸린다.

### ⚠️ SQL로는 못 지운다

**스토리지 파일은 SQL이 건드릴 수 없다.** 이건 `leave_family`에서 이미 부딪힌 벽이고,
그래서 그 함수는 지울 경로를 돌려주기만 하고 실제 삭제는 부르는 쪽이 한다
(`supabase/schema.sql:288`).

그러니 **Edge Function이어야 한다.** 서비스 롤로 스토리지를 지우고 DB를 고친다.

### 만드는 법

`supabase/functions/purge-used-originals/index.ts`를 새로 만든다. 짝이 되는 것이
이미 있으니 그대로 베낀다 — `send-expiry-notifications`가 같은 모양이다
(pg_cron이 부르고, `CRON_SECRET` 헤더로 잠그고, 서비스 롤로 돈다).

하는 일은 셋이다.

1. 위 조건으로 `id`, `image_paths`를 뽑는다
2. `supabase.storage.from(버킷).remove(경로들)`
3. 그 행의 `image_paths`를 `'{}'`로 비운다

**순서를 바꾸지 않는다.** DB를 먼저 비우면 경로를 잃어버려서 파일이 영영 주인 없이
남는다 — 266개를 그렇게 흘린 적이 있다(`supabase/storage-orphans.sql`으로 찾아냈다).

한 번에 다 지우지 말고 500건씩 끊는다. 처음 도는 날에는 몇 달 치가 한꺼번에 걸린다.

예약은 `supabase/purge-cron.sql`과 같은 자리에 붙인다. 하루 한 번 새벽이면 충분하다.

올린 다음 `supabase/storage-orphans.sql`을 한 번 돌려서 주인 없는 파일이 늘지 않았는지
본다. 늘었으면 2번과 3번 사이에서 무언가 실패한 것이다.

- [ ] Edge Function 만들기
- [ ] `purge-cron.sql`에 예약 붙이기
- [ ] 첫날 돈 뒤 `storage-orphans.sql`로 확인

---

## 2. AI 하루 한도를 실사용에 맞춘다 ⏰ 첫 달 지나고

달 한도는 2026-09-14에 넣었다(`ANALYZE_TOTAL_MONTHLY_LIMIT` 2,000,
`VERIFY_TOTAL_MONTHLY_LIMIT` 2,000). **하루 한도는 아직 개발할 때 값 그대로다.**

| | 지금 | 생각해둔 값 |
|---|---|---|
| 1인 하루 | 30 | 10 |
| 전체 하루 | 500 | 200 |

시크릿만 바꾸면 된다 — 배포가 필요 없다.

```
supabase secrets set ANALYZE_DAILY_LIMIT=10 ANALYZE_TOTAL_DAILY_LIMIT=200
```

**지금 바로 내리지 않는다.** 1인 하루 10은 처음 쓰는 사람의 첫날에 모자랄 수 있다.
자동 스캔은 찾은 기프티콘마다 한 번씩 부르므로 사진첩에 15개가 있으면 첫 스캔에서
15건이 나간다. 예전에 같은 이유로 50까지 올렸다가 30으로 내린 적이 있다
(`supabase/functions/_shared/guard.ts` 주석).

**한 달쯤 실제 쓰임을 보고 정한다.** `ai_usage_log`에 1인당 하루 몇 건이 실제로
나가는지 쌓인다. 달 한도가 이미 천장을 잡고 있어서 급하지 않다.

- [ ] 한 달 치 `ai_usage_log`로 1인 하루 분포 뽑기
- [ ] 값 정하고 시크릿 바꾸기

---

## 3. 저장소를 private으로 돌린다 + Cloudflare Pages

보안 때문이 아니다. RLS·스토리지·Edge Function 인증은 이미 걸려 있고, Supabase anon key는
원래 공개되는 값이다(앱 안에도 들어 있다). 자산 관리 때문이다.

**둘은 한 몸이다.** 무료 계정은 private 저장소에서 GitHub Pages를 못 쓴다. 먼저 옮기고
닫는다.

스토어에 올라간 뒤에는 웹이 정책·소개 페이지로 줄어드니 그때가 맞다.

⚠️ **개인정보처리방침은 어떤 경우에도 공개 URL로 남는다** — 두 스토어 모두 심사 항목이다.

- [ ] Cloudflare Pages로 옮기기
- [ ] 저장소 private
- [ ] 두 스토어의 개인정보처리방침 URL이 살아 있는지 확인

---

## 4. 도메인과 App Links / Universal Links

**출시 필수가 아니다.** 지금 GitHub Pages 주소로도 스토어가 요구하는 URL은 다 된다.
딥링크를 커스텀 스킴에서 App Links로 올리려면 루트(`/.well-known/`)가 필요한데,
`ceaser501.github.io`라는 이름의 저장소를 따로 만들면 공짜로도 된다.

도메인은 **영구 구매가 아니라 매년 갱신**이다(`.com` 연 1.5~2만원, 첫 해 특가 말고
갱신가를 본다). 갱신을 놓치면 남이 가져가고 App Links 소유 증명이 깨져 로그인이
망가진다. 사면 자동 갱신을 켠다.

- [ ] 도메인을 살지 정하기
- [ ] `.well-known/` 올리고 App Links / Universal Links로 승격

---

## 5. 아이폰 사진첩 훑기 (「설정 열기」가 여기 딸려 온다)

안드로이드에만 있는 기능이다. 만드는 방향은 **[ios-gallery.md](ios-gallery.md)에 따로
정리했다** — 플러그인 다섯 메서드, 폴더 대신 기간, 권한 두 갈래, 심사에서 고칠 것까지.

「설정 열기」(`client/src/utils/gallery.js:449`의 `canOpenAppSettings()`)도 그 작업에
딸려 온다. 같은 플러그인에 들어간다.

- [ ] [ios-gallery.md](ios-gallery.md)의 9번 순서대로

---

## 6. 상표 — 연락이 오면

「모아콘」도 「기프티콘」도 남의 등록상표다. 알고 쓰기로 정했고 근거는
[store-release.md](store-release.md) 6장에 적어뒀다.

**미리 할 일은 없다.** 연락이 오면 그때 화면에 뜨는 이름 한 줄을 갈고 업데이트를
내면 된다. 앱 식별자를 이름에서 떼어놔서(`io.github.ceaser501.ourhomegift`) 이름을
바꿔도 같은 앱으로 남는다 — 사용자가 다시 깔 필요가 없다.

---

## 7. 초대 링크의 Play 주소 ⏰ 프로덕션 열리는 날

`client/public/invite.html:136`이 비어 있다.

```js
var STORE_URL_ANDROID = '';
```

**지금 채우면 안 된다.** Play가 비공개 테스트라 테스트 참여자가 아닌 사람에게는
「찾을 수 없는 페이지」가 뜬다. 지금은 웹으로 보내는 것이 맞다.

프로덕션이 열리는 날 바로 윗줄의 주석을 푼다.

```js
var STORE_URL_ANDROID = 'https://play.google.com/store/apps/details?id=' + PACKAGE;
```

**웹이라 main에 밀어야 나간다**(`.github/workflows/deploy-pages.yml`). 태그만
따서는 안 바뀐다.

- [ ] Play 프로덕션 열린 뒤 한 줄 채우기
- [ ] main에 밀기
- [ ] 안드로이드 폰에서 앱을 지우고 초대 링크를 눌러 Play로 가는지 보기

---

## 8. 문자로 보낸 초대는 앱을 안 연다

카톡 공유는 다리 페이지를 타는데(`client/public/kakao-share.html:89`) **문자·메일
공유는 안 탄다.** `inviteUrl()`(`client/src/utils/inviteLink.js:38`)이 웹 주소를
그대로 돌려준다.

| 보내는 곳 | 링크 | 다리 |
|---|---|---|
| 앱에서 카톡 공유 | `invite.html?join=…` | ✅ |
| 웹에서 카톡 공유 (`inviteLink.js:225`) | `/?join=…` | ❌ |
| 문자·메일·기타 (`inviteLink.js:267`) | `/?join=…` | ❌ |

받는 사람이 앱을 깔았어도 웹이 열린다. 앱이 있다는 것을 모르고 지나간다 — 다리
페이지를 만든 이유가 그것이었다.

`inviteUrl()`이 `invite.html?join=…`을 돌려주게 하면 셋이 하나가 된다. 다만
`client/src/test/inviteLink.test.js:68`이 주소를 문자열로 박고 있어서 같이 고친다.

`family`는 문자 쪽에 없다. 다리 페이지가 없으면 「가족 초대를 받았어요」로 뜨는데
그것으로 충분하다.

- [ ] `inviteUrl()`을 다리 페이지로 돌리기
- [ ] 테스트 고치기
- [ ] 문자로 보내 앱이 열리는지 보기

---

## 9. 바깥 서비스 사용량 알림

카카오·TMAP는 무료 쿼터 안이고 코드가 그 앞에서 막는다
(`supabase/functions/search-places/index.ts:240`). 요금이 나갈 일은 없지만, 쿼터에
가까워지면 기능이 조용히 멈추므로 알림은 걸어둔다.

- [ ] 카카오 개발자센터 사용량 알림
- [ ] TMAP 사용량 알림
- [ ] Supabase 스토리지·대역폭 알림 (1번이 늦어질 때의 안전망)

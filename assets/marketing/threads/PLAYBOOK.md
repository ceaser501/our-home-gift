# 모아콘 스레드 — 매일 아침 글

태수님이 스레드(Threads)에 올릴 글을 매일 아침 하나씩 만들어 보낸다.
**스레드에 직접 올리지 않는다.** 글과 이미지를 만들어 보내면 태수님이 보고 올린다.

- 받는 곳: `moacon.support@gmail.com` (Gmail로 보낸다)
- 이미지·영상 보관: https://claude.ai/artifact/HwvqFTrnMPoV2XEVuvqFvT (「모아콘 스레드」 페이지)
- 시간: 매일 아침 9시(한국) 전에 도착

## 순서

1. 이 브랜치의 파일을 쓴다: `git fetch origin claude/gifticon-auto-register-app-cjjgpf && git checkout -B threads-work FETCH_HEAD`
   (로컬에서만. **커밋·푸시하지 않는다.**)
2. 지난 글 읽기: Artifact `read`로 위 페이지를 읽고, `path: "posts.json"`으로 지난 글 목록을 받는다.
3. 오늘 주제 정하기 — 아래 「주제」의 순서에서 마지막 글 다음 것.
4. 글 쓰기 → 이미지(가끔 영상) 만들기
5. 페이지 갱신 → 메일 보내기

## 주제 (번갈아)

`AI스레드` → `바이브코딩` → `1인개발` → 다시 `AI스레드` …

스레드는 글 하나에 주제 태그가 하나만 걸린다. 그 주제를 태그로 쓴다. 해시태그를 본문에 줄줄이 달지 않는다.

| 주제 | 무엇을 쓰나 |
|---|---|
| AI스레드 | AI가 이 앱에서 실제로 하는 일, 해보니 된 것/안 된 것, 비용 |
| 바이브코딩 | AI랑 같이 만들면서 겪은 일 — 막힌 곳, 고친 버그, 의외로 오래 걸린 것 |
| 1인개발 | 혼자 출시·운영하며 겪은 일 — 스토어 심사, 가족 테스터, 작은 결정들 |

## 글 쓰는 법

- **사실만.** 근거는 이 저장소에 있다: `git log`(커밋 메시지가 자세하다), `README.md`, `docs/`,
  `supabase/functions/*` 주석, `CLAUDE.md`. 숫자를 지어내지 않는다. 확인 못 한 숫자는 빼고 쓴다.
- 지난 글(`posts.json`의 `angle`)과 같은 이야기를 다시 하지 않는다. 각도가 달라야 한다.
- 반말 개발일지 말투. 지난 글을 보고 맞춘다. 4~10줄, 400자 안쪽(스레드 한도 500자).
- 홍보는 마지막 한 줄로 가볍게. "모아콘 만들면서 생긴 일" 정도. 링크는 본문에 넣지 않고 첫 댓글로 단다
  (`tip`에 적는다: `https://ceaser501.github.io/our-home-gift/app.html`).
- 이모지는 없거나 하나.
- 쓰면 안 되는 것: 실제 바코드 번호, 사용자 이름·이메일·가족 정보, 관리자 비밀번호·키, 매출이나
  사용자 수처럼 저장소에 없는 운영 숫자.

## 이미지 (1~5장)

1080×1350(4:5) 카드. `kit/`에 재료가 있다.

- `kit/base.css` — 색·글꼴·바탕(`.dark`, `.light`), 폰 틀(`.ph`), 아래 로고(`.brand`)
- `kit/img/screen-*.png` — 실제 앱 화면(바코드는 가짜로 바꾼 것): list scan form barcode push map invite stats
- `kit/img/icon.png`, `badge-apple.svg`, `badge-google.svg`
- `kit/render.mjs` — 카드 HTML을 PNG로 찍는다

만드는 법: 작업 폴더(스크래치패드)에 `cards.html`을 쓴다. `<section id="s1">`, `s2` … 한 장에 하나.
`kit/base.css`는 절대 경로 `file://`로 불러온다. 2026-10-06 글의 카드가 본보기다(이 폴더의 `example/`).

```
cd assets/marketing/threads/kit && npm i --no-save playwright-core
node render.mjs <cards.html> <out-dir> <장 수>
```

찍은 PNG를 JPEG(quality 90)로 바꿔 `moacon-MMDD-N.jpg`로 이름 짓는다.

- 첫 장은 글의 첫 줄을 크게. 숫자가 있으면 숫자를 크게.
- 마지막 장 하나쯤은 실제 앱 화면을 넣는다.
- 날마다 똑같은 틀만 쓰지 않는다. 영수증, 대화창, 전후 비교, 메모 같은 모양을 글에 맞춰 고른다.
- 글자는 크게. 한 장에 한 가지 말.

## 영상 (가끔)

글에 맞을 때만, 서너 번에 한 번쯤. 소리는 없어도 된다.

- `kit/video/family-chat-42s.mp4` — 가족 단톡방에서 기프티콘 찾다 기한 놓치는 광고
- `kit/video/feature-30s.mp4` — 기능 소개 광고
- 이걸 잘라 쓰거나(ffmpeg), 카드 몇 장을 넘기는 짧은 영상을 만든다. 30초 안, mp4(H.264).
- ffmpeg: `pip install --target /tmp/pylib imageio-ffmpeg` 뒤
  `/tmp/pylib/imageio_ffmpeg/binaries/ffmpeg-*`

## 페이지 갱신

페이지 소스는 `page/index.html`(+ `page/icon.png`). 같은 URL로 다시 올린다.

1. `posts.json` 맨 앞에 오늘 글을 넣는다(지난 글은 그대로 둔다).
   ```json
   { "date": "2026-10-07", "label": "10월 7일 (수)", "topic": "바이브코딩",
     "angle": "한 줄 요약 — 다음 날 겹치지 않게 보는 용도",
     "text": "본문(줄바꿈은 \\n)", "tip": "첫 댓글에 달 링크 안내",
     "media": [{ "type": "image", "path": "days/2026-10-07/moacon-1007-1.jpg", "alt": "…" },
               { "type": "video", "path": "days/2026-10-07/moacon-1007-2.mp4" }] }
   ```
2. Artifact `publish`: `url`은 위 페이지, `file_path`는 `page/index.html`,
   `files`에 `posts.json`과 오늘 `days/<날짜>/…` 파일만 넣는다(나머지는 그대로 남는다).
   `capabilities`는 넘기지 않는다(저장 기능이 그대로 유지된다).

## 메일

Gmail `send_message`로 `moacon.support@gmail.com`에 보낸다. 첨부는 하지 않는다(이미지는 페이지에 있다).

- 제목: `[모아콘 스레드] 10/7 (수) · 바이브코딩`
- 본문(일반 텍스트, 마크다운 쓰지 않는다):

```
주제: 바이브코딩

[본문]
(올릴 글 그대로)

[첫 댓글]
https://ceaser501.github.io/our-home-gift/app.html

[이미지 3장]
여기서 저장해서 이 순서대로 올려주세요.
https://claude.ai/artifact/HwvqFTrnMPoV2XEVuvqFvT#2026-10-07
```

## 하지 않는 것

- 스레드에 직접 올리지 않는다.
- 저장소에 커밋·푸시하지 않는다. main은 건드리지 않는다.
- 앱·웹 배포, Supabase 변경을 하지 않는다.
- 메일은 하루 한 통. 실패하면 다시 보내기 전에 보낸편지함을 확인한다.

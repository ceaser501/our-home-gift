# 모아콘 홍보 브로셔

처음에는 사용 안내서로 쓰다가, 너무 세세해져서 **홍보용 브로셔**로 방향을 바꿨습니다.
A부터 Z까지 설명하지 않습니다 — 무엇이 좋은지와, 시작하는 데 꼭 필요한 것만 담습니다.
(먼저 만든 `docs/manual/`은 참고용으로 그대로 둡니다.)

| 파일 | 쓰임 |
| --- | --- |
| `docs/guide/guide.src.html` | **고치는 파일.** 글·배치가 다 여기 있습니다. |
| `docs/guide/shots/` | 화면 사진. 가로 600px, JPEG 품질 82~86. |
| `docs/guide/build.py` | src에 shots/를 박아 넣어 `guide.html`을 만듭니다. |
| `docs/guide/guide.html` | **띄우는 파일.** 손으로 고치지 않습니다 — 돌릴 때마다 덮어써집니다. |

```
python3 docs/guide/build.py
```

## 왜 둘로 나눠 두었나

브로셔는 웹으로 띄우는데, 거기서는 바깥 주소로 그림을 못 불러옵니다. 그림이 파일 안에
통째로 들어가 있어야 해요. 그런데 그만큼의 긴 문자열이 박힌 파일은 열어서 고칠 수가
없습니다. 그래서 **고치는 파일과 띄우는 파일을 나눕니다.**

## 짜임새

**폰으로 여는 사람이 대부분이다.** 그래서 폰 화면(390px)을 먼저 짜고, 넓은 화면은 그걸 옆으로
펼친 것으로 둔다. 2026-10-04에 이 방향으로 다시 짰다.

| 자리 | 무엇 | 쓰는 모양 |
| --- | --- | --- |
| 표지 | 「기프티콘, 또 날렸어요?」 + 스토어 배지 + 목록 화면 | `.hero` (짙은 보라 판) |
| 이런 적 | 기프티콘이 잊히는 세 가지 | `.pains` |
| 등록 | 사진첩 찾기 · 알아서 채우기 | `.feature` + `.pair` |
| 기한 알림 | 급한 것부터 · 7일 전부터 알림 | `.feature` + `.pair` |
| 매장에서 | 바코드 · 지도 | `.feature` + `.pair` |
| 가족과 함께 | 카톡 초대 · 사용 내역 | `.feature` + `.pair` |
| 시작 | 세 걸음 | `.steps` |
| 안심 | 가족 것은 가족만 | `.safe` |
| 맺음 | 스토어 배지 + 웹 링크 | `.closing` (짙은 보라 판) |

제목 문구는 광고 영상과 같은 말을 쓴다(「사진첩에서 알아서 찾고,」「기한이 다가오면 먼저
알려줘요.」 …). 브로셔와 영상이 같은 목소리여야 본 사람이 같은 앱으로 알아본다.

폰에서는 화면 두 장이 나란히라 글자가 작다. **화면을 누르면 한 장이 화면 가득 뜬다**(페이지 맨 아래 스크립트).

## 쓸 때 지키는 것

- **매리트를 먼저, 사용법은 최소한만.** 안내서가 아닙니다. "어떻게 누르는지"보다
  "무엇이 좋아지는지"를 앞에 둡니다
- 읽는 사람이 20대부터 아버지 세대까지입니다. **본문 18px**, 한 항목은 **제목 한 줄 +
  설명 두세 줄**
- 기능 이름 말고 하는 일로 씁니다 — "찜 기능"(X) → "내가 쓸게요 표시"(O)
- 화면에 적힌 글자는 `<span class="ui">사용완료</span>`처럼 그대로 인용합니다
- **실명을 넣지 않습니다.** 가족은 `우리 가족`, 사람은 `아빠 / 엄마 / 아들 / 딸`
- **브랜드 로고는 쓰지 않습니다.** 상호는 화면 안의 글자로만 나오고, 맨 아래 고지문으로
  제휴가 아님을 밝힙니다

## 화면 사진

**스토어에 올린 실제 화면을 그대로 쓴다** — `assets/marketing/screenshots/raw/ios/`의 8장.
지어낸 화면이 아니라 폰에서 찍은 것이고, 바코드와 번호만 스토어 올릴 때 가짜로 바꿨다.
아이폰판을 고른 이유는 사진첩 찾기(2번)가 아이폰 화면이라서다.

스토어 화면을 다시 찍으면 아래를 돌려 `shots/`를 새로 만든다(가로 600px, JPEG 84).

```
python3 - <<'PY'
from PIL import Image
src='assets/marketing/screenshots/raw/ios/'
for a,b in [('01-list','list'),('02-scan','scan'),('03-form','form'),('04-barcode','barcode'),
            ('05-push','push'),('06-map','map'),('07-invite','invite'),('08-stats','stats')]:
    im=Image.open(src+a+'.png').convert('RGB'); im=im.resize((600,round(im.height*600/im.width)),Image.LANCZOS)
    im.save(f'docs/guide/shots/{b}.jpg',quality=84,optimize=True,progressive=True)
PY
python3 docs/guide/build.py
```

스토어 배지(`badge-apple.svg`, `badge-google.svg`)는 애플·구글이 내준 공식 파일이다
(`assets/marketing/reel/feature/assets/`에서 가져옴). 손대지 않는다.

## 띄운 곳

- 우리 웹: https://ceaser501.github.io/our-home-gift/brochure.html — `client/public/brochure.html`.
  `build.py`가 같이 만든다. 카톡·인스타 미리보기에 모아콘 그림이 뜨는 쪽이라 **밖에 나눠줄 때는 이 주소**를 쓴다.
  main에 반영해야 바뀐다.
- claude.ai: https://claude.ai/artifact/HeQprS16rbQbwxSchFLYAa — `guide.html`을 다시 만들면 이 주소에도 다시 올린다.
  미리보기 그림은 Claude 로고로 고정이다.

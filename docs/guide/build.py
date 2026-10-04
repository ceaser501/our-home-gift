# 안내서를 배포본으로 굽는다. guide.src.html → guide.html, client/public/brochure.html
#
#   python3 docs/guide/build.py
#
# 하는 일은 하나뿐이다. src에서 shots/xxx.jpg를 가리키는 <img src>를 그 파일의
# data: URI로 바꿔 넣는다.
#
# 왜 나눠야 하는가: 안내서는 Artifact로 띄우는데, 거기서는 바깥 주소로 이미지를
# 못 불러온다(CSP). 그림이 파일 안에 통째로 들어가 있어야 한다. 그런데 9장까지
# 가면 화면이 마흔 장 가까이 되고, base64 덩어리 마흔 개가 박힌 파일은 사람이
# 열어서 고칠 수가 없다. 그래서 고치는 파일(src)과 띄우는 파일(guide.html)을
# 나눈다. 고칠 때는 src만 보고, 다 고치면 이걸 한 번 돌린다.

import base64
import mimetypes
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).parent
SRC = HERE / 'guide.src.html'
OUT = HERE / 'guide.html'
# 우리 웹에도 같은 것을 띄운다. 카톡·인스타에 링크를 붙이면 미리보기 그림과 문구가 모아콘 것으로
# 뜨게 하려고(claude.ai 주소는 Claude 그림이 뜬다). 머리에 미리보기 태그만 더 붙인다.
WEB = HERE.parent.parent / 'client/public/brochure.html'
WEB_HEAD = '''<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="사진첩에서 알아서 찾고, 기한 전에 먼저 알려줘요. 가족이 함께 쓰는 기프티콘 서랍.">
<meta property="og:type" content="website">
<meta property="og:title" content="모아콘 — 우리 가족 기프티콘 서랍">
<meta property="og:description" content="사진첩에서 알아서 찾고, 기한 전에 먼저 알려줘요.">
<meta property="og:image" content="https://ceaser501.github.io/our-home-gift/og-1200x630.png">
<meta property="og:url" content="https://ceaser501.github.io/our-home-gift/brochure.html">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="./icon-192.png">
<link rel="apple-touch-icon" href="./icon-192.png">
</head>
<body>
'''


def inline(match):
    rel = match.group(1)
    path = HERE / rel
    if not path.exists():
        sys.exit(f'없는 그림을 가리키고 있어요: {rel}')
    mime = mimetypes.guess_type(path.name)[0] or 'image/jpeg'
    data = base64.b64encode(path.read_bytes()).decode()
    return f'src="data:{mime};base64,{data}"'


def main():
    html = SRC.read_text(encoding='utf-8')
    html, n = re.subn(r'src="(shots/[^"]+)"', inline, html)
    OUT.write_text(html, encoding='utf-8')
    WEB.write_text(WEB_HEAD + html + '\n</body>\n</html>\n', encoding='utf-8')
    size = OUT.stat().st_size / 1024 / 1024
    print(f'그림 {n}장을 넣어 {OUT.name}을 만들었어요 · {size:.2f}MB')
    # Artifact는 16MB까지 받는다. 그 앞에서 미리 알려준다.
    if size > 14:
        print('⚠️ 16MB에 가까워요. shots/의 그림을 더 줄이세요.')


if __name__ == '__main__':
    main()

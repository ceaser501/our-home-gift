# 안내서를 배포본으로 굽는다. guide.src.html → guide.html
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
    size = OUT.stat().st_size / 1024 / 1024
    print(f'그림 {n}장을 넣어 {OUT.name}을 만들었어요 · {size:.2f}MB')
    # Artifact는 16MB까지 받는다. 그 앞에서 미리 알려준다.
    if size > 14:
        print('⚠️ 16MB에 가까워요. shots/의 그림을 더 줄이세요.')


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""잠금화면 사진의 배경만 눌러 조용하게 만든다.

    python3 scripts/calm-lockscreen.py <찍어온 사진> <내보낼 곳>

── 왜 ──────────────────────────────────────────────────────────────────────

푸시 스크린샷은 알림 두 개를 보여주는 장인데, 아이폰 기본 배경화면이 분홍·청록에 흰
덩어리까지 있어서 시선을 다 가져갔다. 갤럭시는 흐린 회색 배경이라 알림만 보였다.
여덟 장을 나란히 놓으면 이 한 장만 튄다.

배경화면을 바꿔 끼고 다시 찍는 것이 제일 깔끔하지만, 알림이 뜬 순간을 다시 만들어야
해서 쉽지 않다. 그래서 찍어둔 사진에서 배경만 누른다.

── 무엇을 하나 ─────────────────────────────────────────────────────────────

1. 색을 뺀다. 분홍과 청록이 없어지는 것만으로 절반은 조용해진다.
2. 명암을 가운데로 좁힌다. 흰 덩어리와 검은 구석이 같이 눌린다.
3. 글자와 알림 카드가 있는 띠만 빼고 흐린다. 읽혀야 하는 자리는 그대로 둔다.
4. MOA 아이콘만 제 색으로 되돌린다.

4번이 없으면 아이콘까지 회색이 되는데, 알림에서 눈이 먼저 가는 자리가 거기다.
무슨 앱이 보낸 알림인지 한눈에 안 들어오면 이 장은 할 일을 못 한다.

── 띠 자리는 사진마다 다시 재야 한다 ───────────────────────────────────────

아래 KEEP과 ICONS는 828×1792 한 장을 보고 잰 값이다. 다른 폰이나 다른 알림 개수로
다시 찍으면 자리가 달라진다. 눌러놓고 글자가 흐려졌으면 그 띠를 다시 잰다.
"""

import sys

from PIL import Image, ImageDraw, ImageFilter

# 흐리지 않고 남길 가로 띠 (y 시작, y 끝)
KEEP = [(0, 95), (175, 445), (935, 1530), (1545, 1700), (1725, 1792)]

# 제 색으로 되돌릴 앱 아이콘 (왼, 위, 오른, 아래)
ICONS = [(54, 1220, 132, 1298), (54, 1394, 132, 1472)]

GREY_KEEP = 0.45  # 명암을 얼마나 남길지. 낮을수록 납작해진다
GREY_MID = 118  # 눌러서 모을 회색. 알림 카드가 이 위로 떠야 읽힌다
BLUR = 22


def calm(src):
    w, h = src.size

    lut = [max(0, min(255, round(GREY_MID + (v - 128) * GREY_KEEP))) for v in range(256)]
    base = src.convert("L").convert("RGB").point(lut * 3)

    mask = Image.new("L", (w, h), 255)
    draw = ImageDraw.Draw(mask)
    for y0, y1 in KEEP:
        draw.rectangle([0, y0, w, y1], fill=0)
    mask = mask.filter(ImageFilter.GaussianBlur(26))

    out = Image.composite(base.filter(ImageFilter.GaussianBlur(BLUR)), base, mask)

    for box in ICONS:
        bw, bh = box[2] - box[0], box[3] - box[1]
        m = Image.new("L", (bw, bh), 0)
        ImageDraw.Draw(m).rounded_rectangle([0, 0, bw - 1, bh - 1], radius=round(bw * 0.24), fill=255)
        out.paste(src.crop(box), (box[0], box[1]), m.filter(ImageFilter.GaussianBlur(1.2)))

    return out


def main():
    if len(sys.argv) != 3:
        print(__doc__.strip().splitlines()[2].strip())
        return 1
    calm(Image.open(sys.argv[1]).convert("RGB")).save(sys.argv[2])
    print("만들었습니다:", sys.argv[2])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""잠금화면 사진에 사용기한 알림 카드를 한 장 더 붙인다.

    python3 scripts/add-expiry-push.py <찍어온 사진> <내보낼 곳>

── 왜 ──────────────────────────────────────────────────────────────────────

푸시 스크린샷은 알림 두 종류를 보여주는 장이다. 참여 신청은 누가 신청하면 바로 뜨지만,
사용기한 알림은 그 순간을 붙잡아야 찍을 수 있어서 마음대로 만들 수가 없다.

그래서 찍힌 카드를 그대로 한 장 더 깔고 글자만 다시 쓴다. 카드 모양·색·아이콘·간격이
전부 실물이라 손으로 그린 티가 안 난다. 갤럭시 것도 같은 방법으로 만들었다.

**글자는 지어내지 않는다.** supabase/functions/send-expiry-notifications/index.ts:151이
실제로 보내는 형식 그대로다 — 가족 이름 · 제목, 상호 · 상품명, 기한과 남은 날.
그 문구를 고치면 이 그림도 같이 고쳐야 한다.

── 어떻게 ──────────────────────────────────────────────────────────────────

알림이 하나뿐인 사진은 그 하나가 아래쪽에 앉아 있다. 두 장을 넣으려면 위로 자리를
만들어야 해서, 「알림 센터」 줄과 원래 카드를 한 칸(PITCH)씩 올리고 빈 자리에 새 카드를
놓는다. 지운 자리는 그 줄의 배경색으로 메운다 — 잠금화면 배경이 단색 그라데이션일 때만
깨끗하게 된다(무늬 있는 배경화면이면 자국이 남는다).

새 카드가 아래로 가는 이유는 iOS가 새 알림을 위에 쌓기 때문이다. 참여 신청이 「지금」이고
사용기한 알림은 아침에 왔으므로 그 아래가 맞다.
"""

import io
import os
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT_DIR = os.path.join(ROOT, "client/src/fonts")

CARD = (28, 1354, 800, 1512)  # 찍힌 카드 자리
PITCH = 174  # 카드 한 장이 차지하는 세로 (카드 158 + 사이 16)
LABEL = (0, 1255, 828, 1348)  # 「알림 센터」 줄과 X 버튼
WIPE = (1240, 1530)  # 지우고 다시 그릴 세로 구간

# 글자 자리는 '카드 안' 기준이다. 화면에서 잰 값(157, 766)에서 카드 왼쪽(28)을 뺐다.
# 한 번 빼는 것을 잊어서 새 글자만 28px 오른쪽으로 밀려 났다.
TITLE_XY = (129, 27)
BODY_X, BODY_Y = (129, 64), 36  # 첫 줄 자리와 줄 간격
TIME_RIGHT = 738
WIPE_LEFT = 106  # 아이콘(27..103) 바로 오른쪽부터 지운다
SIZE = 30

# 보낼 문구. 실제 형식과 같아야 한다.
TITLE = "우리집 · 유효기한이 곧 만료돼요"
BODY = ["스타벅스 · 아이스 시그니처 초콜릿T", "9월 14일까지 · 3일 남았어요"]
WHEN = "오전 9:00"


def load_font(weight, size):
    from fontTools.ttLib import TTFont

    f = TTFont(os.path.join(FONT_DIR, f"Pretendard-{weight}.subset.woff2"))
    f.flavor = None
    buf = io.BytesIO()
    f.save(buf)
    buf.seek(0)
    return ImageFont.truetype(buf, size)


def row_colors(im):
    """줄마다의 배경색. 좌우 바깥에서 재어 가로로 이어준다."""
    px = im.load()
    return [(px[6, y], px[im.width - 7, y]) for y in range(im.height)]


def wipe(im, y0, y1, rows=None):
    px = im.load()
    rows = rows or row_colors(im)
    for y in range(y0, y1):
        a, b = rows[y]
        for x in range(im.width):
            t = x / (im.width - 1)
            px[x, y] = tuple(round(p + (q - p) * t) for p, q in zip(a, b))


def sample(im, box):
    """카드 바탕색과 글자색. 사진마다 밝기가 달라서 재서 쓴다."""
    px = im.load()
    base = px[box[2] - 40, box[1] + 18]
    ink = min(
        (px[x, y] for y in range(box[1] + 27, box[1] + 55) for x in range(160, 480)),
        key=sum,
    )
    return base, ink


def make_expiry_card(im):
    """찍힌 카드를 베껴 글자만 새로 쓴다."""
    card = im.crop(CARD)
    base, ink = sample(im, CARD)
    draw = ImageDraw.Draw(card)

    # 글자만 지운다. 아이콘은 남겨야 해서 그 오른쪽부터 건드린다.
    draw.rectangle([WIPE_LEFT, 14, card.width - 6, 145], fill=base)

    bold = load_font("SemiBold", SIZE)
    plain = load_font("Regular", SIZE)
    faint = tuple(round(i + (b - i) * 0.45) for i, b in zip(ink, base))

    draw.text(TITLE_XY, TITLE, font=bold, fill=ink)
    draw.text((TIME_RIGHT - draw.textlength(WHEN, font=plain), TITLE_XY[1] + 3), WHEN, font=plain, fill=faint)
    for i, line in enumerate(BODY):
        draw.text((BODY_X[0], BODY_X[1] + i * BODY_Y), line, font=plain, fill=ink)
    return card


def shift_strip(strip, rows, src_y, dst_y):
    """띠를 다른 높이로 옮길 때 배경 밝기를 그 자리에 맞춘다.

    잠금화면 배경은 위아래로 밝기가 변한다. 「알림 센터」 줄을 그냥 오려 옮기면 원래
    있던 높이의 밝기를 데리고 와서, 새 자리에 옅은 네모 띠로 남는다. 줄마다 원래 자리와
    갈 자리의 배경색 차이만큼 더해주면 그 자국이 없어진다.
    """
    out = strip.copy()
    p = out.load()
    for y in range(strip.height):
        sa, sb = rows[src_y + y]
        da, db = rows[dst_y + y]
        for x in range(strip.width):
            t = x / (strip.width - 1)
            src = (round(sa[i] + (sb[i] - sa[i]) * t) for i in range(3))
            dst = (round(da[i] + (db[i] - da[i]) * t) for i in range(3))
            p[x, y] = tuple(
                max(0, min(255, v + d - s)) for v, s, d in zip(p[x, y], src, dst)
            )
    return out


def card_mask(size, radius=40):
    """카드를 붙일 때 쓰는 둥근 마스크.

    없이 붙이면 네모로 오려낸 구석의 옛 배경이 같이 따라와, 새 자리에서 희미한
    네모 자국으로 남는다.
    """
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], radius, fill=255)
    return m.filter(__import__("PIL.ImageFilter", fromlist=["ImageFilter"]).GaussianBlur(0.8))


def build(src_path, dst_path):
    im = Image.open(src_path).convert("RGB")
    rows = row_colors(im)
    card = im.crop(CARD)
    label = im.crop(LABEL)
    expiry = make_expiry_card(im)

    wipe(im, *WIPE)
    mask = card_mask(card.size)
    im.paste(shift_strip(label, rows, LABEL[1], LABEL[1] - PITCH), (LABEL[0], LABEL[1] - PITCH))
    im.paste(card, (CARD[0], CARD[1] - PITCH), mask)
    im.paste(expiry, (CARD[0], CARD[1]), mask)
    im.save(dst_path)
    return dst_path


def main():
    if len(sys.argv) != 3:
        print("쓰는 법: python3 scripts/add-expiry-push.py <찍어온 사진> <내보낼 곳>")
        return 1
    print("만들었습니다:", build(sys.argv[1], sys.argv[2]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

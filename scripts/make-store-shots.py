#!/usr/bin/env python3
"""스토어 스크린샷에 문구를 얹는다.

    python3 scripts/make-store-shots.py            # raw/ 에 있는 것만 다시 만든다
    python3 scripts/make-store-shots.py 01 06      # 그중 골라서

── 왜 이 파일이 있나 ────────────────────────────────────────────────────────

한 번 만들고 대화 밖 임시 폴더에 두었다가 잃어버렸다. 그래서 폰을 다시 찍을 때마다
문구 얹는 일을 처음부터 다시 해야 했다. 판을 눈으로 맞추는 일이라 시간도 오래 걸린다.

이번에는 저장소에 둔다. 폰을 다시 찍으면 raw/ 에 넣고 이 파일을 돌리면 끝이다.

── 판은 어떻게 정했나 ──────────────────────────────────────────────────────

2026-09-02에 만든 여덟 장에서 픽셀을 재서 되살렸다. 지어낸 값이 아니다.

    큰 글씨   Bold 66px, 자간 -2, rgb(23,19,65), 글자 윗줄이 y=101
    작은 글씨 Medium 35px, 자간 -0.6, rgb(99,95,134), 글자 윗줄이 y=195
    폰 화면   x 60..1020 (너비 960), 위 y=340, 모서리 40, 아래는 화면 밖으로 흘린다

글자를 '윗줄 기준'으로 놓는 이유는, 문구마다 받침이 있고 없고가 달라서다. 기준선으로
놓으면 받침 없는 줄이 한두 픽셀 떠 보인다. 여덟 장을 나란히 놓으면 그게 보인다.

── 02와 05는 여기서 안 만든다 ──────────────────────────────────────────────

02(사진첩 훑는 중)와 05(푸시)는 2026-09-02 것을 그대로 쓴다. 05는 알림 카드를 손으로
오려 붙인 합성이라 raw가 없고, 02는 그때 찍은 것이 더 낫다(8/17이라 진행 막대가 절반쯤
찬다). 판이 같은 자리에서 나왔으므로 나머지 여섯 장과 나란히 놓아도 어긋나지 않는다.
"""

import io
import os
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "assets/marketing/screenshots/raw")
OUT = os.path.join(ROOT, "assets/marketing/screenshots")
FONT_DIR = os.path.join(ROOT, "client/src/fonts")

# 아래 값은 모두 폭 1080을 기준으로 잰 것이다. 아이폰은 판이 더 크고 비율도 달라서,
# 폭으로 배율을 내어 그만큼 늘린다(scaled 함수).
BASE_W = 1080

# 큰 글씨 / 작은 글씨
TITLE = dict(weight="Bold", size=66, track=-2.0, top=101, fill=(23, 19, 65))
SUB = dict(weight="Medium", size=35, track=-0.6, top=195, fill=(99, 95, 134))

# 폰 화면이 앉는 자리
CARD_X, CARD_W, CARD_TOP, CARD_R = 60, 960, 340, 40

# 배경은 그리지 않고 떠온 것을 쓴다(plate.png).
#
# 처음에는 세로 그라데이션에 왼쪽 위 빛을 얹어 흉내 냈는데, 오른쪽 위가 9단계쯤 밝게
# 나왔다. 예전 배경은 단순한 그라데이션이 아니어서(가운데는 좌우 대칭인데 위쪽만
# 오른쪽으로 짙어진다) 식으로 맞출 수가 없었다.
#
# 그래서 2026-09-02 완성본에서 배경만 떠냈다 — 글자가 앉았던 두 띠는 위아래 줄로
# 세로로 메우고, 폰과 그림자가 덮은 자리는 좌우 여백 값으로 가로로 이어붙였다.
# 눈에 남는 것은 어차피 좌우·위 여백뿐이라 그것으로 충분하다.
PLATE = os.path.join(OUT, "plate.png")

# 문구. docs/store-listing.md의 표와 같은 말이다 — 고치면 두 곳을 같이 고친다.
SHOTS = {
    "01-list": ("기한이 급한 것부터 위로", "며칠 남았는지 한눈에 보여요"),
    "02-scan": ("찾는 것부터 앱이 합니다", "사진첩을 훑어 기프티콘만 골라내요"),
    "03-form": ("사진만 올리면 끝", "상품명 · 금액 · 유효기한이 저절로"),
    "04-barcode": ("매장에선 대기만 하면 돼요", "금액권은 쓴 만큼 잔액이 계산돼요"),
    "05-push": ("중요한 건 푸시알림으로 알려드려요", "기한 만료 · 가족 참여 신청"),
    "06-map": ("쓸 수 있는 곳을 지도에서", "길찾기 · 전화까지 바로"),
    "07-invite": ("가족이 같은 서랍을 봅니다", "카카오톡 링크 하나로 초대"),
    "08-stats": ("우리 집이 얼마나 아꼈나", "누가 언제 썼는지 그대로 남아요"),
}


def load_font(weight, size):
    """저장소의 woff2를 그대로 쓴다. 앱 화면과 같은 글꼴이라야 얹은 티가 안 난다."""
    path = os.path.join(FONT_DIR, f"Pretendard-{weight}.subset.woff2")
    from fontTools.ttLib import TTFont

    f = TTFont(path)
    f.flavor = None
    buf = io.BytesIO()
    f.save(buf)
    buf.seek(0)
    return ImageFont.truetype(buf, size)


def scaled(size):
    """1080 기준으로 잰 값을 이 판 크기에 맞춰 늘린다."""
    return size[0] / BASE_W


def background(size):
    """떠온 배경을 이 판 크기로 늘린다. 부드러운 그라데이션이라 늘려도 티가 안 난다."""
    plate = Image.open(PLATE).convert("RGB")
    return plate if plate.size == size else plate.resize(size, Image.LANCZOS)


def draw_line(img, text, spec):
    """가운데 맞춰 한 줄 그린다. 글자 윗줄을 spec['top']에 댄다.

    자간을 주려면 한 글자씩 놓아야 해서 textlength로 직접 센다.
    """
    k = scaled(img.size)
    font = load_font(spec["weight"], round(spec["size"] * k))
    track = spec["track"] * k
    top = spec["top"] * k
    W = img.width
    draw = ImageDraw.Draw(img)
    widths = [draw.textlength(ch, font=font) for ch in text]
    total = sum(widths) + track * (len(text) - 1)

    # 한 번 그려보고 글자가 실제로 어디서 시작하는지 재서, 그만큼 올려 놓는다.
    probe = Image.new("L", (W, round(400 * k)), 0)
    pd = ImageDraw.Draw(probe)
    x = 100.0
    for ch, w in zip(text, widths):
        pd.text((x, 100), ch, font=font, fill=255)
        x += w + track
    box = probe.getbbox()
    lift = box[1] - 100

    x = (W - total) / 2
    for ch, w in zip(text, widths):
        draw.text((x, top - lift), ch, font=font, fill=spec["fill"])
        x += w + track


def rounded_mask(size, radius):
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], radius, fill=255)
    return mask


def paste_phone(bg, shot):
    """폰 화면을 얹는다. 아래는 화면 밖으로 흘려보낸다 — 잘린 카드가 '더 있다'를 말한다."""
    k = scaled(bg.size)
    card_w, card_x, card_top, card_r = (round(v * k) for v in (CARD_W, CARD_X, CARD_TOP, CARD_R))
    phone = shot.resize((card_w, round(shot.height * card_w / shot.width)), Image.LANCZOS)

    # 모서리를 둥글린다. 아래는 화면 밖이라 둥글릴 필요가 없어서, 마스크를 아래로 늘려
    # 잡고 화면 높이만큼만 쓴다.
    mask = rounded_mask((phone.width, phone.height + card_r), card_r).crop(
        (0, 0, phone.width, phone.height)
    )

    # 옅은 그림자. 폰이 배경에서 살짝 떠 보이게 하는 정도만.
    from PIL import ImageFilter

    shadow = Image.new("RGBA", bg.size, (0, 0, 0, 0))
    sd = Image.new("L", (phone.width, phone.height), 0)
    ImageDraw.Draw(sd).rounded_rectangle(
        [0, 0, phone.width - 1, phone.height - 1], card_r, fill=46
    )
    shadow.paste((60, 50, 120, 255), (card_x, card_top + round(10 * k)), sd)
    shadow = shadow.filter(ImageFilter.GaussianBlur(18 * k))
    bg.paste(Image.alpha_composite(bg.convert("RGBA"), shadow).convert("RGB"), (0, 0))

    bg.paste(phone, (card_x, card_top), mask)


def build(name, raw_dir, out_dir, canvas):
    src = os.path.join(raw_dir, f"{name}.png")
    if not os.path.exists(src):
        return None
    shot = Image.open(src).convert("RGB")

    # 판 크기는 정해둔 값이지 찍어온 사진 크기가 아니다.
    #
    # 한 번 사진 크기를 그대로 따라가게 했다가 갤럭시 판이 2160에서 2093으로 줄었다.
    # 폰이 내놓는 세로는 상태바를 어떻게 자르느냐에 따라 조금씩 다른데, 여덟 장이
    # 제각각이면 스토어에서 크기가 섞인다. 넘치는 세로는 어차피 화면 밖으로 흘린다.
    img = background(canvas)
    paste_phone(img, shot)
    title, sub = SHOTS[name]
    draw_line(img, title, TITLE)
    draw_line(img, sub, SUB)

    os.makedirs(out_dir, exist_ok=True)
    dst = os.path.join(out_dir, f"{name}.png")
    img.save(dst)
    return dst


# 갤럭시는 raw/ 에, 아이폰은 raw/ios/ 에 넣는다. 나오는 자리도 그렇게 갈린다.
#
# 아이폰 판은 App Store Connect가 업로드 칸에 적어준 크기다(6.5 디스플레이):
#
#     1242 × 2688  또는  1284 × 2778
#
# 찍어온 사진은 828×1792(아이폰 XR·11)라 그대로는 안 받는다. 다행히 828×1792는
# 1242×2688의 정확히 2/3라 비율이 같다 — 잘리는 곳 없이 키우기만 하면 된다.
#
# 얹는 글자는 이 큰 판에서 새로 그리므로 또렷하다. 흐려지는 것은 폰 화면뿐이고,
# 그것도 1.33배(828 → 1104)라 견딜 만하다. 더 또렷하게 하려면 1242×2688을 그대로
# 내놓는 기기나 시뮬레이터(아이폰 11 Pro Max)에서 다시 찍는다.
SETS = [
    ("갤럭시", RAW, OUT, (1080, 2160)),
    ("아이폰", os.path.join(RAW, "ios"), os.path.join(OUT, "ios"), (1242, 2688)),
]


def main():
    want = sys.argv[1:]
    names = [n for n in SHOTS if not want or any(n.startswith(w) for w in want)]
    made = []
    for label, raw_dir, out_dir, canvas in SETS:
        for name in names:
            dst = build(name, raw_dir, out_dir, canvas)
            if dst:
                made.append((label, os.path.relpath(dst, ROOT)))
    if not made:
        print(f"raw 사진이 없습니다. {os.path.relpath(RAW, ROOT)}/ 에 넣어주세요.")
        print("아이폰은 그 밑 ios/ 에 넣습니다.")
        print("이름은 " + ", ".join(f"{n}.png" for n in SHOTS))
        return 1
    for label, m in made:
        print(f"만들었습니다 [{label}]", m)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

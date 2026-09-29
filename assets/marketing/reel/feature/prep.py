"""녹화에서 쓸 구간을 뽑아, 가릴 것을 가리고, 화면 크기로 줄여 둔다.

- 상태 표시줄(맨 위 0~100px)은 바로 아래 색으로 덮는다. 시계·배터리는 영상에서 새로 그린다.
- 내비게이션 바(아래 2195px부터)는 잘라낸다.
- 바코드 번호 칸, 초대 코드, 신청자 이메일은 원본에서 떠낸 모양을 찾아 가짜로 바꾸거나 지운다.
"""
import os, subprocess, sys, random
import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'src')
OUT = os.path.join(HERE, 'shots')
FF = os.environ.get('FFMPEG', 'ffmpeg')  # libx264가 든 ffmpeg
FONT = os.path.join(HERE, 'assets', 'Pretendard-Regular.ttf')
FONT_M = os.path.join(HERE, 'assets', 'Pretendard-Medium.ttf')
CUT_H = 2195
W_OUT = 720

SHOTS = {
    'scan': ('rec1', 1.0, 10.6),
    'fill': ('rec1', 25.0, 30.8),
    'list': ('rec1', 36.0, 44.0),
    'map': ('rec1', 69.0, 84.0),
    'stats': ('rec1', 91.0, 94.5),
    'invite': ('rec1', 99.0, 103.5),
    'approve': ('rec2', 24.5, 30.2),
}


def gray(im):
    return np.asarray(im.convert('L'), dtype=np.float32)


def patch(path, box):
    return gray(Image.open(path)).__getitem__((slice(box[1], box[3]), slice(box[0], box[2])))


# 찾을 모양: (이름, 원본, 자리, 가짜 글자, 글자 크기, 글자 간격)
TEMPLATES = [
    ('digits', 'key/r1-29.png', (96, 1575, 483, 1607), '882049173650281', 44, None),
    ('code', 'key/r1-100.5.png', (107, 1131, 462, 1195), 'MOA7K2', 88, 21),
    ('mail', 'key/r2-25.5.png', (307, 866, 669, 900), None, 0, None),
]
TPL = []
for name, path, box, fake, size, pitch in TEMPLATES:
    t = patch(os.path.join(SRC, path), box)
    TPL.append((name, box, t, fake, size, pitch))


def corr(a, b):
    a = a - a.mean(); b = b - b.mean()
    d = np.sqrt((a * a).sum() * (b * b).sum())
    return float((a * b).sum() / d) if d else 0.0


def find(g, box, t):
    """같은 x 자리에서 세로로만 찾는다(창은 위아래로만 움직인다)."""
    x0, _, x1, _ = box
    h = t.shape[0]
    band = g[:, x0:x1]
    # 줄마다 어두운 정도로 먼저 추리고, 가장 비슷한 몇 곳만 2차원으로 견준다.
    sig_t = (t < t.mean()).sum(1).astype(np.float32)
    sig = (band < band.mean(1, keepdims=True) - 20).sum(1).astype(np.float32)
    n = band.shape[0] - h
    if n <= 0:
        return None
    win = np.lib.stride_tricks.sliding_window_view(sig, h)
    cost = ((win - sig_t) ** 2).sum(1)
    best = None
    for y in np.argsort(cost)[:12]:
        c = corr(band[y:y + h], t)
        if best is None or c > best[0]:
            best = (c, int(y))
    return best if best and best[0] > 0.75 else None


def paint(im, g, name, box, t, fake, size, pitch, y):
    x0, _, x1, _ = box
    h = t.shape[0]
    d = ImageDraw.Draw(im)
    bg = im.getpixel((max(0, x0 - 10), y + h // 2))
    region = np.asarray(im.crop((x0, y, x1, y + h)))
    lum = region.sum(2)
    ink = tuple(int(v) for v in region.reshape(-1, 3)[lum.reshape(-1).argmin()])
    d.rectangle([x0 - 6, y - 6, x1 + 6, y + h + 6], fill=bg)
    if not fake:
        return
    font = ImageFont.truetype(FONT if name != 'code' else FONT_M, size)
    top = y + h / 2
    if pitch:
        # 원본처럼 글자와 글자 사이의 빈틈을 똑같이 둔다(원본은 약 21px).
        # 칸 간격을 맞추면 M처럼 넓은 글자는 붙고 7처럼 좁은 글자는 떨어져 보인다.
        x = x0
        for ch in fake:
            l, _, r, _ = font.getbbox(ch, anchor='lm')
            d.text((x - l, top), ch, font=font, fill=ink, anchor='lm')
            x += (r - l) + pitch
    else:
        d.text((x0, top), fake, font=font, fill=ink, anchor='lm')


# 내용이 상태 표시줄 밑으로 스크롤되는 장면은 매 장 색을 뽑으면 깜빡인다. 한 색으로 고정한다.
BAR = {'list': (255, 255, 255)}


def clean(im, bar=None):
    im = im.convert('RGB')
    bar = bar or im.getpixel((540, 104))
    ImageDraw.Draw(im).rectangle([0, 0, im.width, 100], fill=bar)
    im = im.crop((0, 0, im.width, CUT_H))
    g = gray(im)
    for name, box, t, fake, size, pitch in TPL:
        hit = find(g, box, t)
        if hit:
            paint(im, g, name, box, t, fake, size, pitch, hit[1])
    return im


def fake_barcode():
    """바코드 크게 보기 한 장. 막대와 숫자를 가짜로 다시 그린다."""
    im = Image.open(os.path.join(SRC, 'key/r1-55.5.png')).convert('RGB')
    im = clean(im)
    d = ImageDraw.Draw(im)
    d.rectangle([100, 1290, 980, 1628], fill=(255, 255, 255))
    d.rectangle([150, 1688, 742, 1752], fill=(255, 255, 255))
    rnd = random.Random(7)
    x = 116
    while x < 950:
        w = rnd.choice([4, 4, 8, 12, 16])
        d.rectangle([x, 1304, x + w - 1, 1562], fill=(0, 0, 0))
        x += w + rnd.choice([4, 8, 8, 12, 16])
    f1 = ImageFont.truetype(FONT, 42)
    f2 = ImageFont.truetype(FONT, 54)
    d.text((540, 1600), '8820491736502811', font=f1, fill=(20, 20, 20), anchor='mm')
    d.text((480, 1720), '8820  4917  3650  2811', font=f2, fill=(30, 30, 30), anchor='mm')
    os.makedirs(os.path.join(OUT, 'barcode'), exist_ok=True)
    im.resize((W_OUT, round(CUT_H * W_OUT / 1080)), Image.LANCZOS).save(os.path.join(OUT, 'barcode', '00000.jpg'), quality=92)


# 장면마다 제자리에 붙은 것. 사용 내역 뒤로 비치는 내 메뉴의 이메일.
STATIC_MASKS = {'stats': [(250, 486, 662, 536)]}


def shot(name):
    rec, a, b = SHOTS[name]
    tmp = os.path.join(HERE, 'tmp', name)
    os.makedirs(tmp, exist_ok=True)
    for f in os.listdir(tmp):
        os.remove(os.path.join(tmp, f))
    subprocess.run([FF, '-loglevel', 'error', '-ss', str(a), '-to', str(b), '-i', os.path.join(SRC, rec + '.mp4'),
                    '-vf', 'fps=30', '-q:v', '2', os.path.join(tmp, '%05d.jpg')], check=True)
    out = os.path.join(OUT, name)
    os.makedirs(out, exist_ok=True)
    hits = 0
    files = sorted(os.listdir(tmp))
    for i, f in enumerate(files):
        im = clean(Image.open(os.path.join(tmp, f)), BAR.get(name))
        for box in STATIC_MASKS.get(name, []):
            ImageDraw.Draw(im).rectangle(box, fill=im.getpixel((box[0] - 8, (box[1] + box[3]) // 2)))
        im.resize((W_OUT, round(CUT_H * W_OUT / 1080)), Image.LANCZOS).save(os.path.join(out, '%05d.jpg' % i), quality=90)
    print(name, len(files))


if __name__ == '__main__':
    names = sys.argv[1:] or list(SHOTS) + ['barcode']
    for n in names:
        fake_barcode() if n == 'barcode' else shot(n)

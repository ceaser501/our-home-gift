from PIL import Image, ImageDraw, ImageFilter
import os
SRC='/root/.claude/uploads/9312984b-ae8b-58ab-9a1a-c6078e16d96c'
OUT='docs/images'

# gallery.js의 looksLikeBarcode와 같은 규칙이다. 밝기가 자주 뒤집히는 가로줄이 세로로
# 연달아 있고, 뒤집히는 자리가 위아래로 거의 같아야 막대다. 글자 줄도 자주 뒤집히지만
# 줄마다 자리가 달라서 여기서 갈린다 — 뒤집힘 횟수만 세면 글자에 속는다.
MIN_EDGES=18; MATCH=0.85

def edges_of_row(px,w,y):
    row=[px[x,y] for x in range(w)]
    mean=sum(row)/w
    out=[]; dark=row[0]<mean
    for x in range(1,w):
        n=row[x]<mean
        if n!=dark: out.append(x); dark=n
    return out

def overlap(a,b):
    if not a or not b: return 0
    s=set(b); return sum(1 for x in a if x in s)/len(a)

def dark_band(im,w=360):
    """어두운 픽셀이 몰려 있는 가로 구간. QR처럼 네모난 코드를 잡는다.

    막대는 줄 하나가 가늘어서 뒤집힘으로 찾지만(band), QR은 네모라 그 방식으로는
    가운데 몇 줄만 걸린다 — 실제로 QR의 위아래가 그대로 드러났다. 여기서는 잉크가
    얼마나 몰려 있는지로 본다."""
    h=max(1,round(im.height*w/im.width))
    g=im.convert('L').resize((w,h)); px=g.load()
    # 좌우 끝은 여백이라 가운데만 본다.
    x0,x1=round(w*0.25),round(w*0.75)
    ratio=[sum(1 for x in range(x0,x1) if px[x,y]<128)/(x1-x0) for y in range(h)]
    runs=[]; start=None
    for y,r in enumerate(ratio):
        if r>=0.20:
            if start is None: start=y
        elif start is not None:
            runs.append((start,y-1)); start=None
    if start is not None: runs.append((start,h-1))
    # QR은 줄마다 잉크 양이 들쭉날쭉해서 중간에 끊긴다. 가까운 구간은 이어 붙인다.
    merged=[]
    for r in runs:
        if merged and r[0]-merged[-1][1] <= round(h*0.03): merged[-1]=(merged[-1][0], r[1])
        else: merged.append(r)
    runs=[r for r in merged if r[1]-r[0]>=round(h*0.02)]
    if not runs: return None
    top,bottom=max(runs,key=lambda r:r[1]-r[0])
    return top,bottom,h

def band(im,w=360):
    h=max(1,round(im.height*w/im.width))
    g=im.convert('L').resize((w,h)); px=g.load()
    prev=None; runs=[]; start=None
    for y in range(h):
        e=edges_of_row(px,w,y)
        dense=len(e)>=MIN_EDGES
        aligned=dense and prev is not None and overlap(e,prev)>=MATCH
        if aligned:
            if start is None: start=y-1
        else:
            if start is not None: runs.append((start,y-1)); start=None
        prev=e if dense else None
    if start is not None: runs.append((start,h-1))
    runs=[r for r in runs if r[1]-r[0]>=4]
    if not runs: return None
    top,bottom=max(runs,key=lambda r:r[1]-r[0])

    # 잉크가 몰린 구간과 겹치면 그쪽까지 넓힌다. QR은 이 손질이 없으면 위아래가 드러난다.
    dark=dark_band(im,w)
    if dark and not (dark[1]<top or dark[0]>bottom):
        top=min(top,dark[0]); bottom=max(bottom,dark[1])

    bottom=min(h-1,bottom+round(h*0.10)); top=max(0,top-round(h*0.012))
    return round(top*im.height/h), round((bottom+1)*im.height/h), (bottom-top)/h

def mask(name,src,note,extra=None):
    im=Image.open(os.path.join(SRC,src)).convert('RGB')
    b=band(im); boxes=[]
    if b and b[2]<0.4: boxes.append((b[0],b[1]))
    if extra: boxes.append((round(im.height*extra[0]),round(im.height*extra[1])))
    for top,bottom in boxes:
        crop=im.crop((0,top,im.width,bottom))
        im.paste(crop.filter(ImageFilter.GaussianBlur(radius=max(8,im.width//25))),(0,top))
        ImageDraw.Draw(im).rectangle([0,top,im.width-1,bottom-1],outline=(220,60,60),width=max(2,im.width//200))
    t=300; im=im.resize((t,round(im.height*t/im.width)),Image.LANCZOS)
    p=os.path.join(OUT,f'{name}.png'); im.save(p,optimize=True)
    print(f'{name:20} {str(b and (b[0],b[1])):16} {os.path.getsize(p)//1024}KB {note}')

mask('kakao-original','430a73de-65832.png','카카오 원본', extra=(0.845,0.90))
mask('giftishow-square','bd6a10eb-65833.jpg','기프티쇼 450')
mask('baskin-shrunk','4041a131-65664.jpg','배스킨 404')
mask('gift-screenshot','33e29b62-65828.jpg','선물하기 캡처')

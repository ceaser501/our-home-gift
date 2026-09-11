# 폰에서 찍은 원본

문구를 얹기 전의 날것을 여기 둔다. 이름은 얹은 뒤 파일과 같게 맞춘다.

```
01-list.png  02-scan.png  03-form.png  04-barcode.png
05-push.png  06-map.png   07-invite.png  08-stats.png
```

넣고 나서:

```
python3 scripts/make-store-shots.py          # 여기 있는 것만 다시 만든다
python3 scripts/make-store-shots.py 01 06    # 골라서
```

폭은 아무거나 된다 — 960으로 맞춰 넣는다. 세로는 길어도 되고, 넘치는 만큼은
화면 밖으로 흘러나가 잘린다. 그게 "아래 더 있다"를 말해준다.

02와 05는 2026-09-02 것을 그대로 쓰고 있어서 원본이 없다. 다시 찍으면 여기 넣으면 된다.

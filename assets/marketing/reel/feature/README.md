# 기능 소개 릴스 (30초, A 어두운 / B 흰)

외부 홍보용. 스토어에 올리는 것이 아니다. 확정본: 2026-09-29.

## 다시 굽기

1. `src/`에 원본 녹화를 둔다: `rec1.mp4`, `rec2.mp4` (갤럭시 화면 녹화), `src/key/`에 기준 장면 PNG.
   **저장소에 올리지 않는다** — 실제 바코드, 이메일, 초대코드가 찍혀 있다.
2. `assets/`에 Pretendard 글꼴(Regular, Medium, SemiBold, Bold .ttf)을 둔다.
3. 순서대로:

```
pip install numpy pillow
python3 prep.py            # src → shots/ (가릴 것 가리고 720px로)
npm i playwright-core
./build.sh                 # → moacon-feature-a-30s.mp4, moacon-feature-b-30s.mp4
```

`FFMPEG`(libx264 포함)와 `CHROME`(크로미움 경로)은 환경 변수로 줄 수 있다.

## 파일

- `reel.html` — 장면, 카메라, 문구가 모두 여기 있다. `?theme=a|b&v=30`
- `prep.py` — 녹화에서 구간을 떠내고 가린다. 바코드 번호, 초대코드(가짜 MOA7K2), 신청자 이메일, 내 메뉴 이메일.
- `render.mjs` / `build.sh` — 한 장씩 그려 MP4로.
- `preview.mjs` — 몇 시점만 정지 화면으로.
- `assets/badge-*.svg` — Apple·Google 공식 배지(영어판). 손대지 않는다.

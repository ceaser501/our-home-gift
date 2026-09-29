#!/usr/bin/env bash
# A(어두운)·B(흰) 30초 두 편을 굽는다. 먼저 prep.py로 shots/를 만들어 둘 것.
set -e
cd "$(dirname "$0")"
FF=${FFMPEG:-ffmpeg}
for th in a b; do
  node render.mjs $th 30
  $FF -y -loglevel error -framerate 30 -i frames/$th-30/%05d.jpg -c:v libx264 -preset slow -crf 17 -pix_fmt yuv420p -movflags +faststart moacon-feature-$th-30s.mp4
  rm -rf frames/$th-30
done
ls -la moacon-feature-*.mp4

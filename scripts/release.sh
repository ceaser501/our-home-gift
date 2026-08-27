#!/usr/bin/env bash
#
# 원격에서 받아오고, 다음 버전 태그를 달아 밀어 앱 빌드를 띄운다.
#
# 어느 폴더에서 쳐도 된다 — 이 파일 위치를 보고 저장소로 옮겨간다.
#
#   npm run release            0.0.34 다음이면 0.0.35
#   npm run release -- --minor 0.0.34 다음이면 0.1.0
#   npm run release -- --major 0.0.34 다음이면 1.0.0
#   npm run release -- 0.2.7   직접 정한다
#   npm run release -- --dry   무엇을 할지만 보여주고 아무것도 하지 않는다
#   npm run release -- --allow-dirty  고쳐둔 것을 빼고 나간다
#
# ── 왜 이 파일이 있나 ────────────────────────────────────────────────────────
# 다음 번호를 사람이 세다가 여러 번 틀렸다. 원인은 늘 같았다 — 손에 있는 태그
# 목록이 낡은 것이었다. 원격에는 35가 있는데 이쪽 목록에는 33까지만 있으면,
# 아무리 세어봐도 34가 나온다. 그러고 밀면 "이미 있다"는 말을 듣는다.
#
# 그래서 세는 일을 사람에게 맡기지 않는다. 늘 원격을 먼저 받아오고, 거기에 있는
# 가장 큰 번호에서 하나를 올린다.
#
# 겸사겸사 밀기 전에 막아야 할 것들을 여기서 막는다. 태그는 한 번 밀면 그것으로
# 빌드가 나가고 사람들이 받는다. 되돌리기가 비싸다.
set -euo pipefail

cd "$(dirname "$0")/.."

PREFIX='app-v'
bump='patch'
explicit=''
dry=''
allow_dirty=''

for arg in "$@"; do
  case "$arg" in
    --major) bump='major' ;;
    --minor) bump='minor' ;;
    --patch) bump='patch' ;;
    --dry|--dry-run) dry='1' ;;
    --allow-dirty) allow_dirty='1' ;;
    -h|--help)
      sed -n '3,11p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    [0-9]*) explicit="$arg" ;;
    *)
      echo "모르는 옵션: $arg" >&2
      exit 1
      ;;
  esac
done

say() { printf '%s\n' "$*"; }
die() { printf '\n✗ %s\n' "$*" >&2; exit 1; }

branch="$(git rev-parse --abbrev-ref HEAD)"
head="$(git rev-parse HEAD)"

# ── 밀 수 있는 상태인지 ─────────────────────────────────────────────────────

# 커밋하지 않은 것이 있으면 태그가 가리키는 것과 손에 있는 것이 달라진다. 빌드는
# 태그를 받아서 도므로, 방금 고친 것이 안 들어간 APK가 나온다.
#
# 다만 막을 것과 알려주기만 할 것을 나눈다. 처음에는 둘을 같이 막았더니, supabase의
# 임시 폴더와 맥이 만든 중복 파일 때문에 배포가 멈췄다. 그건 애초에 빌드에 들어갈
# 것이 아니라서, 막아봐야 사람을 세워두기만 한다.
#
#   저장소가 아는 파일이 고쳐졌다 — 막는다. 진짜 작업일 수 있다.
#   저장소가 모르는 파일이 생겼다 — 알려만 준다.
tracked_dirty="$(git status --porcelain --untracked-files=no)"
untracked="$(git ls-files --others --exclude-standard)"

if [ -n "$untracked" ]; then
  say "저장소가 모르는 파일이 있습니다. 빌드에는 안 들어갑니다:"
  printf '%s\n' "$untracked" | sed 's/^/    /' | head -8
  count="$(printf '%s\n' "$untracked" | wc -l | tr -d ' ')"
  [ "$count" -gt 8 ] && say "    … 그리고 $((count - 8))개 더"
  say ""
fi

if [ -n "$tracked_dirty" ] && [ -z "$allow_dirty" ]; then
  printf '%s\n' "$tracked_dirty" | sed 's/^/  /'

  # 고쳐진 것이 package-lock.json뿐이면 대개 진짜 작업이 아니다.
  #
  # npm install은 lockfile을 그때 그 환경에 맞춰 다시 쓴다. 리눅스에서 라이브러리를
  # 하나 넣으면 모든 플랫폼의 바이너리 목록이 적히고, 그걸 맥에서 npm install 하면
  # 맥에 필요 없는 줄을 걷어낸다. 내용이 달라진 게 아니라 환경이 달라서 나는 차이다.
  #
  # 커밋하면 다음 사람이 반대 방향으로 또 고치게 되고, --allow-dirty로 밀면 빌드가
  # 쓰는 파일을 빼고 나가는 셈이다. 되돌리는 것이 맞다 — 무엇을 하면 되는지 여기서
  # 그대로 적어준다. 이 말을 몰라서 매번 물어보게 되는 자리였다.
  locks_only=1
  while IFS= read -r line; do
    case "${line#???}" in
      *package-lock.json) ;;
      *) locks_only=0 ;;
    esac
  done <<EOF
$tracked_dirty
EOF

  if [ "$locks_only" = 1 ]; then
    paths="$(printf '%s\n' "$tracked_dirty" | awk '{print $2}' | tr '\n' ' ')"
    die "고쳐진 것이 package-lock.json뿐입니다. 대개 npm install이 이 기기에 맞춰
   다시 쓴 것이지, 진짜 작업이 아닙니다. 되돌리고 다시 해주세요:

     git checkout -- $paths
     npm run release

   다음부터는 npm ci 를 쓰시면 이 파일이 안 바뀝니다(적힌 그대로 설치합니다).
   npm install 은 라이브러리를 새로 넣을 때만 쓰면 됩니다."
  fi

  die "위 파일이 고쳐진 채로 커밋되지 않았습니다. 빌드는 태그만 보므로 이대로 밀면 빠집니다.
   커밋하고 다시 하시거나, 정말 빼고 나가려면 --allow-dirty 를 주세요:
     npm run release -- --allow-dirty"
fi

if [ -n "$tracked_dirty" ]; then
  say "⚠ 고쳐진 채로 커밋되지 않은 파일이 있지만 --allow-dirty 라서 그냥 갑니다."
  say ""
fi

say "원격에서 받아옵니다…"
# --force: 원격에서 태그를 옮겼을 때 이쪽 낡은 것을 그대로 두지 않는다.
git fetch --tags --force --quiet origin "$branch"

# 원격에 새 커밋이 있으면 여기서 당겨온다.
#
# 늘 "받아오고 → 태그를 단다"였는데, 받아오는 것을 잊거나 엉뚱한 폴더에서 치는 바람에
# 배포가 여러 번 걸렸다. 두 걸음이 늘 붙어 다닌다면 한 걸음이어야 한다.
#
# 다만 갈라진 경우에는 손대지 않는다. 이쪽에도 저쪽에도 새 커밋이 있으면 어느 것을
# 살릴지는 사람이 정할 일이고, 여기서 합쳐버리면 무엇이 나가는지 모른 채 태그가 붙는다.
if git rev-parse --verify --quiet "origin/$branch" >/dev/null; then
  behind="$(git rev-list --count "HEAD..origin/$branch")"
  ahead="$(git rev-list --count "origin/$branch..HEAD")"

  if [ "$behind" -gt 0 ] && [ "$ahead" -gt 0 ]; then
    die "원격과 갈라져 있습니다 (이쪽 $ahead개, 원격 $behind개).
   어느 것을 살릴지 정한 뒤에 다시 해주세요:
     git pull --rebase origin $branch"
  fi

  if [ "$behind" -gt 0 ]; then
    say "원격에 ${behind}개가 더 있습니다. 당겨옵니다:"
    git log --oneline "HEAD..origin/$branch" | sed 's/^/    /'
    git merge --ff-only "origin/$branch" --quiet
    head="$(git rev-parse HEAD)"
    say ""
  fi
fi

# 같은 커밋에 이미 태그가 있으면 같은 것을 두 번 빌드하는 셈이다.
existing="$(git tag --points-at "$head" --list "${PREFIX}*" | head -1)"
if [ -n "$existing" ]; then
  die "이 커밋에는 이미 $existing 이(가) 달려 있습니다. 새로 고친 것이 있다면 먼저 커밋해주세요."
fi

# 태그를 다는 커밋이 원격에 없으면 빌드가 그것을 받아올 수 없다.
if [ -z "$(git branch -r --contains "$head" 2>/dev/null)" ]; then
  die "지금 커밋이 아직 원격에 없습니다. 먼저 밀어주세요:
    git push -u origin $branch"
fi

# ── 다음 번호 ───────────────────────────────────────────────────────────────

# sort -V는 맥의 sort에 없을 수 있어 쓰지 않는다. 점으로 끊어 숫자로 센다.
latest="$(git tag --list "${PREFIX}*" \
  | sed "s/^${PREFIX}//" \
  | grep -E '^[0-9]+\.[0-9]+\.[0-9]+$' \
  | sort -t. -k1,1n -k2,2n -k3,3n \
  | tail -1)"

if [ -z "$latest" ]; then
  latest='0.0.0'
  say "지금까지 달린 태그가 없습니다. 0.0.0에서 셉니다."
else
  say "가장 큰 태그: ${PREFIX}${latest} ($(git rev-parse --short "${PREFIX}${latest}"))"
fi

major="${latest%%.*}"
rest="${latest#*.}"
minor="${rest%%.*}"
patch="${rest#*.}"

if [ -n "$explicit" ]; then
  next="$explicit"
  case "$next" in
    [0-9]*.[0-9]*.[0-9]*) ;;
    *) die "버전은 1.2.3 꼴로 적어주세요: $next" ;;
  esac
else
  case "$bump" in
    major) next="$((major + 1)).0.0" ;;
    minor) next="${major}.$((minor + 1)).0" ;;
    patch) next="${major}.${minor}.$((patch + 1))" ;;
  esac
fi

tag="${PREFIX}${next}"

if git rev-parse -q --verify "refs/tags/$tag" >/dev/null; then
  die "$tag 은(는) 이미 있습니다. --minor 나 직접 번호를 주세요."
fi

say ""
say "  브랜치   $branch"
say "  커밋     $(git rev-parse --short HEAD)  $(git log -1 --pretty=%s)"
say "  새 태그  $tag"
say ""

if [ -n "$dry" ]; then
  say "--dry 라서 여기까지만 합니다."
  exit 0
fi

git tag "$tag" "$head"

# 네트워크가 한 번씩 끊긴다. 몇 번 다시 해본다.
delay=2
for attempt in 1 2 3 4; do
  if git push origin "$tag"; then
    say ""
    say "✓ $tag 을(를) 밀었습니다. 빌드가 돌기 시작합니다."
    say "  진행: https://github.com/ceaser501/our-home-gift/actions"
    say "  설치: https://github.com/ceaser501/our-home-gift/releases/tag/$tag"
    exit 0
  fi
  say "밀지 못했습니다. ${delay}초 뒤에 다시 해봅니다… ($attempt/4)"
  sleep "$delay"
  delay=$((delay * 2))
done

# 태그가 이쪽에만 남아 있으면 다음 번 셈이 어긋난다. 치우고 끝낸다.
git tag -d "$tag" >/dev/null
die "네 번 다 밀지 못했습니다. 방금 만든 태그는 지웠으니 그대로 다시 시도하시면 됩니다."

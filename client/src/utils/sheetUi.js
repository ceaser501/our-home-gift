// 시트 아래에 놓이는 버튼 두 종류. 03 명세에서 정한 치수를 한 군데 모아둔다.
//
// 반지름은 13 이었는데 rounded-lg 로 옮겼다. 같은 시트 안의 안내 상자·입력칸이 모두
// 같은 이름을 쓰는데 버튼만 임의값이면 나중에 한 곳을 고칠 때 여기만 남는다.
//
// 높이는 여기서 걷었다. 시트 주 버튼은 size="xl"(52)이 맡는다 — 한때 size="lg"(44)를
// 쓰면서 className 으로 h-[52px] 를 덮어썼는데, lg 를 쓰면서 lg 의 값을 안 믿는
// 셈이었다. 52 인 까닭은 그 위 입력칸이 52 라서다.
//
// 주 버튼과 보조 버튼은 같은 높이(xl · 52)로 선다. 한때 52 : 48 로 갈라 두었는데,
// 4px 은 위계로 안 읽히고 그냥 어긋나 보였다 — 나란히 놓인 둘의 아래가 안 맞는다.
//
// 위계는 채움이 낸다. 보라로 채운 것과 테두리만 두른 것은 색이 아니라 밝기가 갈리므로,
// 색을 잘 못 가르는 사람에게도 어느 쪽이 먼저인지 보인다.
//
// 크기는 임의값(15.5 · 14.5)에서 스케일로 옮겼다 — callout(16)과 body(14)다.
// 0.5px 차이라 눈에는 안 잡히는데, 그 0.5 를 위해 스케일 밖의 값을 둘이나 들고
// 있을 일은 아니었다.
//
// 자간을 준다. 16px 을 굵게 쓰는 자리라 획이 두꺼워진 만큼 사이를 돌려주는 것이다.
// 「2026.12.11까지로 바꾸기」처럼 숫자가 든 글이 특히 몰려 붙어 보였다.
// 고정폭(tabular-nums)으로 푸는 길도 있었는데 그건 세로로 줄 맞출 때 쓰는 것이고,
// 버튼 글자는 문장이다 — 1 이 0 과 같은 칸을 쓰면 그 둘레가 오히려 휑해진다.
export const PRIMARY_BUTTON =
  "w-full rounded-lg text-callout font-bold tracking-button";
export const SECONDARY_BUTTON =
  "w-full rounded-lg text-body font-semibold tracking-button text-foreground/80";

// 확정·취소 짝은 나란히 둔다. 되돌릴 수 있는 선택이라 눈이 한 번에 훑고 고르는 편이 낫고,
// 세로로 쌓으면 취소가 화면 아래를 한 줄 더 먹는다(시트 높이 352 → 296).
//
// 주 버튼이 오른쪽이다(row-reverse). 오른손 엄지가 먼저 닿는 자리다.
//
// 나란히 놓으면 높이로 위계를 낼 수 없다 — 같은 줄에서 높이가 다르면 아래가 어긋나 보인다.
// 그 일은 채움이 한다. 저장은 보라로 채우고 취소는 테두리만 둘러서, 색을 잘 못 가르는
// 사람에게도 밝기 차이로 갈린다.
//
// 되돌릴 수 없는 선택(삭제)은 이 짝을 쓰지 않는다. 거기서는 AlertDialog 가 세로로 쌓아
// 손가락이 한 번에 못 닿게 한다 — 일부러 한 박자 늦추는 자리다.
export const ACTION_ROW = "flex flex-row-reverse gap-2 [&>*]:flex-1";
// flex-1 은 ACTION_ROW 가 준다. 여기 박아 두면 세로로 쌓을 때 축이 바뀌어
// 높이를 나눠 갖게 되고 52 가 무너진다(39 · 41 로 줄었다).
export const ACTION_PRIMARY =
  "w-full rounded-lg text-callout font-bold tracking-button";
export const ACTION_CANCEL =
  "w-full rounded-lg text-callout font-semibold tracking-button text-foreground/80";

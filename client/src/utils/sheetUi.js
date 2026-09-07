// 시트 아래에 놓이는 버튼 두 종류. 03 명세에서 정한 치수를 한 군데 모아둔다.
//
// 주 버튼과 보조 버튼의 무게 차이는 색이 아니라 높이가 낸다(52 : 48). 색만 다르고 크기가
// 같으면, 색을 잘 못 가르는 사람에게는 둘이 그냥 나란한 버튼 둘이다.
export const PRIMARY_BUTTON = 'h-[52px] w-full rounded-[13px] text-[15.5px] font-bold';
export const SECONDARY_BUTTON = 'h-12 w-full rounded-xl text-[14.5px] font-semibold text-foreground/80';

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
export const ACTION_ROW = 'flex flex-row-reverse gap-2';
export const ACTION_PRIMARY = 'h-[52px] flex-1 rounded-[13px] text-[15.5px] font-bold';
export const ACTION_CANCEL = 'h-[52px] flex-1 rounded-[13px] text-[15.5px] font-semibold text-foreground/80';

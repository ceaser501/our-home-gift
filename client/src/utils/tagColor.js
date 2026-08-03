// 이름표 색 팔레트. 색 번호(tag_color)는 가족에 들어올 때 정해져서 바뀌지 않는다.
// 색 개수는 supabase/schema.sql의 next_tag_color()와 맞춰야 한다.
export const OWNER_TAG_PALETTE = [
  'bg-[#4b7bec]',
  'bg-[#e0559f]',
  'bg-[#16a35a]',
  'bg-[#e69008]',
  'bg-[#0891b2]',
  'bg-[#c026d3]',
];

export function tagColorClass(colorIndex) {
  if (colorIndex === null || colorIndex === undefined || colorIndex < 0) return null;
  return OWNER_TAG_PALETTE[colorIndex % OWNER_TAG_PALETTE.length];
}

export function memberTagColorClass(member) {
  return tagColorClass(member?.tag_color);
}

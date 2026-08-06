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

// 지금 가족에 없는 이름의 색. 이름만 남아 있는 경우가 있다 — 가족에서 나간 사람이
// 올려둔 기프티콘, 또는 사람 수보다 이름이 많은 목데이터.
//
// 예전에는 이런 이름을 전부 같은 회색 점으로 뭉갰다. 그러면 목록에서 누구 것인지
// 구분이 사라진다. 이름 글자에서 번호를 뽑아 쓰면 색이 사람마다 갈리고, 같은 이름은
// 언제 봐도 같은 색이라 목록을 다시 열어도 자리가 흔들리지 않는다.
export function nameTagColorClass(name) {
  const clean = String(name || '').trim();
  if (!clean) return null;

  let sum = 0;
  for (let i = 0; i < clean.length; i += 1) sum += clean.charCodeAt(i);
  return OWNER_TAG_PALETTE[sum % OWNER_TAG_PALETTE.length];
}

export function memberTagColorClass(member) {
  return tagColorClass(member?.tag_color);
}

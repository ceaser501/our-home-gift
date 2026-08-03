// 카테고리 목록. 이미지에서 어떤 카테고리인지 고르는 일은 서버(analyze-gifticon)에서
// 모델이 하고, 여기 있는 key 목록을 그대로 후보로 넘겨준다.
export const CATEGORIES = [
  { key: '카페', label: '☕ 카페/디저트' },
  { key: '외식/배달', label: '🍔 외식/배달' },
  { key: '뷰티', label: '💄 뷰티' },
  { key: '백화점/상품권', label: '🎁 백화점/상품권' },
  { key: '편의점', label: '🏪 편의점' },
  { key: '마트', label: '🛒 마트' },
  { key: '문화/영화', label: '🎬 문화/영화' },
  { key: '기타', label: '🎫 기타' },
];

export const CATEGORY_KEYS = CATEGORIES.map((c) => c.key);

// '베이커리'는 '카페/디저트'로 합쳤다. 이미 저장된 기프티콘에는 예전 값이 남아 있어서,
// 목록에 뿌릴 때와 카테고리로 거를 때 이 표를 거쳐 같은 카테고리로 취급한다.
export const LEGACY_CATEGORIES = { 베이커리: '카페' };

export function normalizeCategory(key) {
  return LEGACY_CATEGORIES[key] || key || '기타';
}


export const STATUS_TABS = [
  { key: 'all', label: '전체' },
  { key: 'unused', label: '사용 전' },
  { key: 'used', label: '사용 완료' },
];

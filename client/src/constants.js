import { Clapperboard, Coffee, Gift, ShoppingCart, SprayCan, Store, Ticket, Utensils } from 'lucide-react';

// 카테고리 목록. 이미지에서 어떤 카테고리인지 고르는 일은 서버(analyze-gifticon)에서
// 모델이 하고, 여기 있는 key 목록을 그대로 후보로 넘겨준다.
//
// key는 DB에 들어가 있는 값이라 건드리지 않는다. 바꾸는 것은 화면에 보이는 label과
// 칩에 붙는 아이콘뿐이다.
//
// 이모지를 뺀 이유: 컬러 이모지는 회색 칩 안에서 혼자 튀어서 글자보다 먼저 읽힌다.
// 글자와 같은 굵기(1.9)의 선 아이콘은 한 덩어리로 읽힌다. '/'를 '·'로 바꾼 것과
// 라벨을 줄인 것은 폭 때문이다 — 아이콘이 들어간 만큼 글자를 줄여야 네 번째 칩까지
// 화면에 들어온다.
export const CATEGORIES = [
  { key: '카페', label: '카페·디저트', Icon: Coffee },
  { key: '외식/배달', label: '외식·배달', Icon: Utensils },
  { key: '편의점', label: '편의점', Icon: Store },
  { key: '마트', label: '마트', Icon: ShoppingCart },
  { key: '뷰티', label: '뷰티', Icon: SprayCan },
  { key: '백화점/상품권', label: '백화점·상품권', Icon: Gift },
  { key: '문화/영화', label: '영화·문화', Icon: Clapperboard },
  { key: '기타', label: '기타', Icon: Ticket },
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

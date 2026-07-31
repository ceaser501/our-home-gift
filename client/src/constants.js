export const CATEGORIES = [
  { key: '카페', label: '☕ 카페', keywords: ['스타벅스', '이디야', '투썸', '커피빈', '폴바셋', '메가커피', '커피', '카페', '컴포즈', '빽다방', '탐앤탐스', '할리스'] },
  { key: '베이커리', label: '🥐 베이커리/디저트', keywords: ['파리바게뜨', '뚜레쥬르', '던킨', '베이커리', '도넛', '빵', '설빙', '배스킨라빈스', '아이스크림'] },
  { key: '외식/배달', label: '🍔 외식/배달', keywords: ['배달의민족', '배민', '요기요', '쿠팡이츠', '교촌', 'bhc', 'bbq', '맘스터치', '버거킹', '맥도날드', '롯데리아', '피자', '치킨', '식당', '외식', 'kfc', '서브웨이'] },
  { key: '뷰티', label: '💄 뷰티', keywords: ['올리브영', '이니스프리', '뷰티', '화장품', '네이처리퍼블릭', '미샤', '더페이스샵', '에뛰드'] },
  { key: '백화점/상품권', label: '🎁 백화점/상품권', keywords: ['백화점', '상품권', '신세계', '롯데', '현대백화점', '갤러리아', '모바일상품권'] },
  { key: '편의점', label: '🏪 편의점', keywords: ['gs25', 'cu', '세븐일레븐', '이마트24', '편의점'] },
  { key: '마트', label: '🛒 마트', keywords: ['이마트', '홈플러스', '롯데마트', '마트', '코스트코'] },
  { key: '문화/영화', label: '🎬 문화/영화', keywords: ['cgv', '롯데시네마', '메가박스', '영화', '문화상품권'] },
  { key: '기타', label: '🎫 기타', keywords: [] },
];

export const CATEGORY_KEYS = CATEGORIES.map((c) => c.key);

export const OWNERS = ['태수', '보연'];

export const STATUS_TABS = [
  { key: 'all', label: '전체' },
  { key: 'unused', label: '사용 전' },
  { key: 'used', label: '사용 완료' },
];

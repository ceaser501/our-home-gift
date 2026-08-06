import { createGifticon, listGifticons } from './api';
import { makeSampleThumb } from './sampleThumbs';

// ⚠️ 테스트 전용. 가족마다 상태가 제각각인 샘플 기프티콘을 갖게 한다.
//
// "전체 데이터 초기화"는 가족과 계정까지 모두 지운다. 기프티콘은 가족에 속해야만 존재할 수
// 있어서(그 가족의 구성원에게만 보인다) 초기화를 견디는 기프티콘은 만들 수 없다. 대신 앱을
// 열 때마다 "이 가족에 샘플이 있나?"를 보고 없으면 넣어주면, 누가 언제 들어와도 늘 보인다.
//
// 실사용 배포에는 VITE_RESET_TOKEN이 없으므로 아무 일도 일어나지 않는다.

// 샘플은 이 번호로 시작한다. supabase/mock-data.sql이 지울 때 쓰는 기준과 같아서,
// SQL로 넣어둔 것과 여기서 넣은 것을 함께 정리할 수 있다.
export const SAMPLE_PREFIX = '9000111122';

// 예전에 하나만 넣던 시절의 번호. 이미 이걸 가진 가족은 나머지만 채워 넣으면 된다.
export const SAMPLE_CODE = '9000111122223';

function dateAfter(days) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 화면에서 갈라지는 상태를 하나씩 맡는다. 하나만 넣어두면 "기한이 급한 카드"만 보여서,
// 연장 안내·결산의 놓친 것·기한 미입력 같은 것이 실제로 어떻게 보이는지 확인할 수 없다.
//
// 받은 사람은 아빠·엄마·아들·딸 넷으로 흩어놓는다. 안내서에 넣을 화면을 찍어야 하는데,
// 전부 한 사람 이름이면 "가족이 같은 목록을 본다"는 게 그림으로 드러나지 않는다.
// 실제 이름을 쓰면 그대로 배포물에 남으므로 호칭으로 둔다.
const SAMPLES = [
  {
    code: SAMPLE_CODE,
    name: '아이스 아메리카노 T',
    owner: '엄마',
    thumb: 'coffee',
    category: '카페',
    brand: '스타벅스',
    amount: 4500,
    // 일주일 안이라 붉은 칩. 눌러서 연장 안내가 열린다.
    days: 5,
    memo: '테스트용으로 자동으로 넣어둔 샘플이에요.',
  },
  {
    code: '9000111122001',
    name: '허니콤보 + 콜라 1.25L',
    owner: '아빠',
    thumb: 'chicken',
    category: '외식/배달',
    brand: 'BBQ',
    amount: 26000,
    // 내일까지. 목록 맨 위에 오는 가장 급한 것.
    days: 1,
  },
  {
    code: '9000111122002',
    name: 'GS25 모바일교환권 5,000원',
    owner: '아들',
    thumb: 'store',
    category: '편의점',
    brand: 'GS25',
    amount: 5000,
    // 딱 일주일. 붉은 칩이 되는 경계값이라 색이 제대로 갈리는지 볼 수 있다.
    days: 7,
  },
  {
    code: '9000111122003',
    name: '뚜레쥬르 초코 생크림 케이크',
    owner: '딸',
    thumb: 'cake',
    category: '카페',
    brand: '뚜레쥬르',
    amount: 32000,
    // 이미 지난 것. 결산의 "놓친 것"에 잡히고, 칩을 누르면 90% 환불 안내가 열린다.
    days: -6,
  },
  {
    code: '9000111122010',
    name: '포테이토 피자 L + 콜라',
    owner: '아들',
    thumb: 'pizza',
    category: '외식/배달',
    brand: '도미노피자',
    amount: 28900,
    // 두 주쯤 남은 것. 급하지도 넉넉하지도 않은 가운데 값이라 목록에 층이 생긴다.
    days: 14,
  },
  {
    code: '9000111122004',
    name: '메가커피 아메리카노',
    owner: '딸',
    thumb: 'coffee',
    category: '카페',
    brand: '메가MGC커피',
    amount: 2000,
    // 기한을 안 적은 것. 목록 위 "유효기간이 없는 기프티콘" 안내가 뜬다.
    days: null,
  },
  {
    code: '9000111122005',
    name: 'CGV 영화관람권',
    owner: '아빠',
    thumb: 'movie',
    category: '문화/영화',
    brand: 'CGV',
    amount: 14000,
    // 넉넉한 것. 회색 칩이라 눌리지 않는다 — 급한 것과 대비된다.
    days: 120,
  },
  // 금액권 둘. 한 번에 다 쓰지 않고 쓴 만큼 깎아 나가는 것들이라, 잔액 관리를 만들 때
  // 실제로 어떻게 보이는지 볼 수 있어야 한다. 액수를 다르게 둬서 한쪽은 큰 금액권
  // (여러 번에 나눠 쓰는 쪽), 한쪽은 작은 금액권으로 잡았다.
  //
  // 번호가 006·007이 아니라 008·009인 이유: 앞의 둘은 is_voucher가 저장되지 않던 때
  // 들어가서 일반 기프티콘으로 남았다. 같은 번호로 두면 "이미 있다"고 판단해 고쳐지지
  // 않으므로, 새 번호로 다시 넣는다(예전 둘은 supabase/mock-data.sql로 지운다).
  {
    code: '9000111122008',
    name: '신세계상품권 5만원권',
    owner: '엄마',
    thumb: 'voucher',
    category: '백화점/상품권',
    brand: '신세계백화점',
    amount: 50000,
    is_voucher: true,
    days: 45,
  },
  {
    code: '9000111122009',
    name: '스타벅스 금액권 1만원',
    owner: '딸',
    thumb: 'voucher',
    category: '카페',
    brand: '스타벅스',
    amount: 10000,
    is_voucher: true,
    days: 20,
  },
];

export function isSampleDataEnabled() {
  return Boolean(import.meta.env.VITE_RESET_TOKEN);
}

// 테스트 도구에서 목데이터를 지웠다는 표시. 이게 없으면 앱을 열 때마다 자동으로 다시
// 채워 넣어서, 지워도 새로고침 한 번에 되살아난다. "지웠다"는 뜻을 기기에 기억해둔다.
// 다시 넣기를 누르면 이 표시가 풀린다.
const OPT_OUT_KEY = 'sample-data-opt-out';

export function setSampleOptOut(optedOut) {
  try {
    if (optedOut) localStorage.setItem(OPT_OUT_KEY, '1');
    else localStorage.removeItem(OPT_OUT_KEY);
  } catch {
    /* 저장이 막힌 곳에서는 자동 채우기가 그대로 도는 것뿐이라 넘어간다 */
  }
}

function isSampleOptedOut() {
  try {
    return localStorage.getItem(OPT_OUT_KEY) === '1';
  } catch {
    return false;
  }
}

// 하나라도 새로 넣었으면 true. 이미 다 있거나 테스트 빌드가 아니면 false.
// force: 테스트 도구에서 직접 "추가"를 누른 경우. 지웠다는 표시를 무시하고 넣는다.
export async function ensureSampleGifticon({ familyId, ownerName, userId, force = false }) {
  if (!isSampleDataEnabled() || !familyId) return false;
  if (!force && isSampleOptedOut()) return false;

  try {
    // 샘플이 여섯이라 하나씩 물어보면 왕복이 여섯 번이다. 목록을 한 번만 읽고 맞춰본다.
    const existing = await listGifticons({ familyId });
    const have = new Set(existing.map((g) => g.code).filter(Boolean));

    const missing = SAMPLES.filter((s) => !have.has(s.code));
    if (missing.length === 0) return false;

    for (const sample of missing) {
      await createGifticon(familyId, {
        name: sample.name,
        category: sample.category,
        brand: sample.brand,
        amount: sample.amount,
        is_voucher: Boolean(sample.is_voucher),
        owner: sample.owner || ownerName || null,
        code: sample.code,
        code_type: 'CODE_128',
        expires_at: sample.days === null ? null : dateAfter(sample.days),
        memo: sample.memo || null,
        memo_by: sample.memo ? userId : null,
        memo_by_name: sample.memo ? ownerName || null : null,
        created_by: userId,
      }, [], { thumbCropFile: await makeSampleThumb(sample.thumb) });
    }
    return true;
  } catch {
    // 샘플은 없어도 그만이라, 실패해도 화면 동작을 막지 않는다.
    return false;
  }
}

// 지울 때 쓰라고 내보낸다(관리자 화면 등). 번호 앞자리로 샘플만 골라낸다.
export function isSampleCode(code) {
  return Boolean(code) && code.startsWith(SAMPLE_PREFIX);
}

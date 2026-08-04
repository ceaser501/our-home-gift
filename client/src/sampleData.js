import { createGifticon } from './api';

// ⚠️ 테스트 전용. 가족을 새로 만들 때 유효기한이 임박한 샘플 기프티콘을 하나 넣어준다.
//
// "전체 데이터 초기화"는 가족과 계정까지 모두 지운다. 기프티콘은 가족에 속해야만 존재할 수
// 있어서(그 가족의 구성원에게만 보인다) 초기화를 견디는 기프티콘은 만들 수 없다. 대신
// 가족을 다시 만드는 순간 이걸 넣어주면, 초기화할 때마다 SQL을 다시 실행할 필요가 없다.
//
// 실사용 배포에는 VITE_RESET_TOKEN이 없으므로 아무 일도 일어나지 않는다.

// 오늘부터 이만큼 뒤에 만료된다. 일주일 안이라 목록에서 붉은 칩으로 보이고,
// 유효기한 임박 알림(49일 이내) 대상에도 들어간다.
const EXPIRES_IN_DAYS = 5;

function dateAfter(days) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function isSampleDataEnabled() {
  return Boolean(import.meta.env.VITE_RESET_TOKEN);
}

export async function seedSampleGifticon({ familyId, ownerName, userId }) {
  if (!isSampleDataEnabled()) return;

  try {
    await createGifticon(familyId, {
      name: '아이스 아메리카노 T',
      category: '카페',
      brand: '스타벅스',
      amount: 4500,
      owner: ownerName,
      code: '9000111122223',
      code_type: 'CODE_128',
      expires_at: dateAfter(EXPIRES_IN_DAYS),
      memo: '테스트용으로 자동으로 넣어둔 샘플이에요. 지워도 됩니다.',
      created_by: userId,
    });
  } catch {
    // 샘플은 없어도 그만이라, 실패해도 가족 만들기를 막지 않는다.
  }
}

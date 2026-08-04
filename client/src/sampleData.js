import { createGifticon, findGifticonByCode } from './api';

// ⚠️ 테스트 전용. 가족마다 유효기한이 임박한 샘플 기프티콘을 하나 갖게 한다.
//
// "전체 데이터 초기화"는 가족과 계정까지 모두 지운다. 기프티콘은 가족에 속해야만 존재할 수
// 있어서(그 가족의 구성원에게만 보인다) 초기화를 견디는 기프티콘은 만들 수 없다. 대신 앱을
// 열 때마다 "이 가족에 샘플이 있나?"를 보고 없으면 넣어주면, 누가 언제 들어와도 늘 보인다.
//
// 실사용 배포에는 VITE_RESET_TOKEN이 없으므로 아무 일도 일어나지 않는다.

// 이 바코드 값으로 샘플인지 알아본다. supabase/mock-data.sql이 넣는 값과 같아서,
// SQL로 이미 넣어둔 가족에는 새로 만들지 않는다.
export const SAMPLE_CODE = '9000111122223';

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

// 샘플을 새로 넣었으면 true. 이미 있거나 테스트 빌드가 아니면 false.
export async function ensureSampleGifticon({ familyId, ownerName, userId }) {
  if (!isSampleDataEnabled() || !familyId) return false;

  try {
    if (await findGifticonByCode(familyId, SAMPLE_CODE)) return false;

    await createGifticon(familyId, {
      name: '아이스 아메리카노 T',
      category: '카페',
      brand: '스타벅스',
      amount: 4500,
      owner: ownerName || null,
      code: SAMPLE_CODE,
      code_type: 'CODE_128',
      expires_at: dateAfter(EXPIRES_IN_DAYS),
      memo: '테스트용으로 자동으로 넣어둔 샘플이에요.',
      created_by: userId,
    });
    return true;
  } catch {
    // 샘플은 없어도 그만이라, 실패해도 화면 동작을 막지 않는다.
    return false;
  }
}

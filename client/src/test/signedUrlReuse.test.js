import { describe, expect, it, vi, beforeEach } from 'vitest';

// 목록을 다시 읽어도 사진 주소는 그대로여야 한다.
//
// 이게 "목록이 빤짝빤짝한다"였다. 저장소 주소는 발급받을 때마다 새 글자가 나온다.
// 같은 사진인데 <img src>가 달라지니 브라우저는 처음 보는 사진으로 알고 다시 받아왔고,
// 받아오는 동안 그 자리가 비었다가 채워졌다. 화면 틀은 그대로인데 목록만 깜빡였다.
//
// 목록을 다시 읽는 일은 잦다 — 가족이 기프티콘을 올리거나, 누가 가족에 들어오거나,
// 앱이 다시 앞으로 나올 때마다다. 가족 초대를 받고 기프티콘을 올리는 동안 그 신호가
// 잇달아 오면서 대여섯 번을 내리 깜빡였다.
//
// 눈으로만 잡을 수 있는 버그라 되돌아오기 쉽다. 여기서 붙들어둔다.

let signCalls = [];
let counter = 0;

function fakeQuery(rows) {
  const q = {
    select: () => q,
    eq: () => q,
    is: () => q,
    or: () => q,
    in: () => q,
    order: () => q,
    then: (resolve) => resolve({ data: rows, error: null }),
  };
  return q;
}

let listRows = [];

vi.mock('../supabaseClient', () => ({
  supabase: {
    from: () => fakeQuery(listRows),
    storage: {
      from: () => ({
        // 진짜 저장소처럼 부를 때마다 다른 글자를 돌려준다. 캐시가 없으면 이것이
        // 그대로 <img src>에 실려 나가 깜빡임이 된다.
        createSignedUrls: async (paths) => {
          signCalls.push(paths);
          counter += 1;
          return {
            data: paths.map((path) => ({ path, signedUrl: `https://x/${path}?token=${counter}` })),
            error: null,
          };
        },
        remove: async () => ({ data: null, error: null }),
      }),
    },
  },
  GIFTICON_TABLE: 'gifticons',
  IMAGE_BUCKET: 'gifticon-images',
}));

const { listGifticons, removeImages } = await import('../api');

function row(id, thumb) {
  return { id, image_paths: [], barcode_image_path: null, thumb_image_path: thumb, category: '카페·디저트' };
}

beforeEach(() => {
  signCalls = [];
});

describe('사진 주소', () => {
  it('목록을 두 번 읽어도 같은 사진은 같은 주소다', async () => {
    listRows = [row(1, 'fam/a.jpg'), row(2, 'fam/b.jpg')];

    const first = await listGifticons({ familyId: 'fam' });
    const second = await listGifticons({ familyId: 'fam' });

    expect(second[0].thumb_image_url).toBe(first[0].thumb_image_url);
    expect(second[1].thumb_image_url).toBe(first[1].thumb_image_url);
  });

  it('이미 발급받은 사진은 서버에 다시 묻지 않는다', async () => {
    listRows = [row(3, 'fam/c.jpg')];

    await listGifticons({ familyId: 'fam' });
    expect(signCalls).toHaveLength(1);

    await listGifticons({ familyId: 'fam' });
    expect(signCalls).toHaveLength(1);
  });

  it('새로 올라온 사진만 발급받는다', async () => {
    listRows = [row(4, 'fam/d.jpg')];
    await listGifticons({ familyId: 'fam' });

    // 가족이 하나 더 올렸다. 이미 있던 것까지 다시 발급받으면 그 카드들이 깜빡인다.
    listRows = [row(5, 'fam/e.jpg'), row(4, 'fam/d.jpg')];
    await listGifticons({ familyId: 'fam' });

    expect(signCalls[1]).toEqual(['fam/e.jpg']);
  });

  it('사진을 지우면 그 주소는 잊는다', async () => {
    listRows = [row(6, 'fam/f.jpg')];
    const before = await listGifticons({ familyId: 'fam' });

    await removeImages(['fam/f.jpg']);

    const after = await listGifticons({ familyId: 'fam' });
    expect(after[0].thumb_image_url).not.toBe(before[0].thumb_image_url);
  });
});

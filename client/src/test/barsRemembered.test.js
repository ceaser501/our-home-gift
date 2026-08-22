import { describe, expect, it, beforeEach } from 'vitest';
import { rememberNoBarcode, readBarsRemembered } from '../utils/gallery';

// "막대로 보이는데 못 읽은 사진" 안내가 두 번째 훑기부터 사라지던 자리.
//
// 못 읽은 사진은 다음부터 건너뛰는데(NO_BARCODE 마커), 안내 문구는 이번 판에 실제로
// 읽어본 사진만으로 만들어졌다. 그래서 배스킨라빈스 카드가 첫 훑기에는 "카카오톡
// 사진첩에 1장"으로 나오고, 두 번째부터는 건너뛰어져 안내가 통째로 사라졌다.
// 마커가 막대 사진의 사진첩 이름을 같이 기억하고, 훑기가 그걸 안내에 합친다.

beforeEach(() => {
  localStorage.clear();
});

describe('막대로 보인 사진 기억하기', () => {
  it('막대로 보인 것만 사진첩 이름과 함께 남는다', () => {
    rememberNoBarcode([
      { id: 101, bucket: 'KakaoTalk', name: 'KakaoTalk_1.jpg', bars: true },
      { id: 102, bucket: 'Screenshots' }, // 막대로 안 보임 — 기억할 필요 없다
    ]);

    // 이름까지 남긴다. 건너뛴 사진을 갤러리에서 찾아 열려면 이름이 있어야 한다.
    expect(readBarsRemembered()).toEqual([
      { id: '101', bucket: 'KakaoTalk', name: 'KakaoTalk_1.jpg' },
    ]);
  });

  it('여러 번 훑어도 같은 사진이 두 번 쌓이지 않는다', () => {
    rememberNoBarcode([{ id: 101, bucket: 'KakaoTalk', bars: true }]);
    rememberNoBarcode([{ id: 101, bucket: 'KakaoTalk', bars: true }]);

    expect(readBarsRemembered()).toHaveLength(1);
  });

  it('판독기 버전이 다르면 없는 셈 친다', () => {
    rememberNoBarcode([{ id: 101, bucket: 'KakaoTalk', bars: true }]);
    const saved = JSON.parse(localStorage.getItem('moacon:gallery-no-barcode'));
    saved.version = saved.version - 1;
    localStorage.setItem('moacon:gallery-no-barcode', JSON.stringify(saved));

    expect(readBarsRemembered()).toEqual([]);
  });
});

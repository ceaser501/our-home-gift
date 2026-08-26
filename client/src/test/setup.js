import '@testing-library/react';

// jsdom에 없는 것들을 채운다. 화면 코드가 이것들을 부르다 죽으면, 정작 보려던 것을
// 보기도 전에 테스트가 끝난다.

// 시트가 열릴 때 스크롤 가둠에 쓴다.
if (!Element.prototype.scrollTo) {
  Element.prototype.scrollTo = function scrollTo() {};
}
if (!window.scrollTo) {
  window.scrollTo = () => {};
}

// 카드가 자라는 동안 따라 내려가려고 높이를 듣는다.
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// radix의 시트가 쓴다.
if (!globalThis.DOMRect) {
  globalThis.DOMRect = class {
    constructor(x = 0, y = 0, width = 0, height = 0) {
      Object.assign(this, { x, y, width, height, top: y, left: x, right: x + width, bottom: y + height });
    }
  };
}
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}

// radix의 셀렉트가 목록을 열면서 고른 줄로 스크롤한다. jsdom에는 이 함수가 없어서
// 목록이 뜨자마자 죽는다.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}

// 고른 사진을 그 자리에서 보여주려고 미리보기 주소를 만든다.
if (!URL.createObjectURL) {
  URL.createObjectURL = () => 'blob:preview';
  URL.revokeObjectURL = () => {};
}

// 스크롤을 흘려 내리는 쪽이 시각을 잰다.
if (!globalThis.performance?.now) {
  globalThis.performance = { now: () => 0 };
}

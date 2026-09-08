import { clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// 우리 이름을 tailwind-merge 에게 알려준다.
//
// tailwind-merge 는 text-* 를 보고 크기인지 색인지 가른다. 그런데 그 판단은 표준
// 스케일(sm·lg·xl…)을 아는 것에 기대고 있어서, 우리처럼 역할로 이름을 붙이면
// (text-body, text-title) 크기를 색으로 오해한다. 그러면 크기와 색이 한 그룹으로
// 묶여 "뒤에 온 하나만 남는" 규칙에 걸린다.
//
// 실제로 그렇게 조용히 사라진 적이 있다 — 시트 제목이 20px 을 잃어 16px 로 나왔고,
// primary 버튼은 흰 글자를 잃어 보라 배경에 진한 글자가 됐다(대비 5.63 → 2.95).
// 클래스는 소스에 그대로 적혀 있는데 화면에서만 없어져서 코드를 읽어서는 못 찾는다.
//
// 자간도 같은 사정이다. tracking-heading·tracking-code 는 표준 이름(tight·wide…)이
// 아니라서 알려주지 않으면 자간 그룹으로 안 본다.
//
// 이름을 바꾸면 이 목록도 같이 바꿔야 한다. index.css 의 --text-*·--tracking-* 와 짝이다.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['caption', 'footnote', 'body', 'callout', 'subtitle', 'title', 'heading', 'display'] }],
      tracking: [{ tracking: ['heading', 'code', 'button'] }],
    },
  },
});

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import Logo from '../components/Logo';

// 로고 바탕은 보라 그라데이션이다.
//
// 한때 fill 을 따옴표 안에 적어서(fill="{`url(#${id})`}") 식이 아니라 글자로 들어갔다.
// 그러면 SVG 가 그 값을 못 읽고 기본값인 검정으로 칠한다 — 헤더와 진입화면의 로고가
// 까만 네모가 된다. 눈으로 보면 바로 아는 것인데, 아무도 안 열어보면 그대로 나간다.
describe('로고', () => {
  it('네모에 그라데이션이 걸린다', () => {
    const { container } = render(<Logo className="size-7" />);
    const rect = container.querySelector('rect');
    const grad = container.querySelector('linearGradient');
    expect(rect.getAttribute('fill')).toBe(`url(#${grad.getAttribute('id')})`);
  });

  // 로고가 한 화면에 둘 이상 놓여도(헤더 + 진입화면이 겹치는 순간) 그라데이션 id 가
  // 부딪히면 안 된다. 부딪히면 뒤에 그려진 쪽이 앞의 것을 덮어쓴다.
  it('여러 개가 놓여도 id 가 안 겹친다', () => {
    const { container } = render(
      <>
        <Logo className="size-7" />
        <Logo className="size-7" />
      </>
    );
    const [a, b] = [...container.querySelectorAll('linearGradient')].map((g) => g.getAttribute('id'));
    expect(a).not.toBe(b);
  });
});

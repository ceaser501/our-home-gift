import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PhotoDeck, SwipeHint } from '../components/PhotoViewer';

// 원본 사진을 밀어서 넘기는 판.
//
// 화살표와 썸네일 줄을 뺐다. 미는 것을 모를까 걱정이었지만 사진첩이 그렇게 동작해서
// 이미 아는 조작이고, 남는 걱정("여기서도 밀리나")은 다음 장을 오른쪽에 손톱만큼
// 내놓는 것으로 답한다. 그 손톱이 사라지면 이 안은 그냥 '아무 표시 없는 화면'이 된다.

describe('사진 넘기는 판', () => {
  it('여러 장이면 다음 장이 오른쪽에 비어져 나온다', () => {
    render(<PhotoDeck photos={['a.jpg', 'b.jpg']} index={0} onPick={vi.fn()} alt="사진" />);
    const [first] = screen.getAllByRole('img');
    // 한 장이 화면 폭을 다 차지하면 옆에 무엇이 있는지 보이지 않는다.
    expect(first.closest('[style*="calc"]')).not.toBeNull();
  });

  it('한 장뿐이면 폭을 다 쓴다', () => {
    const { container } = render(
      <PhotoDeck photos={['a.jpg']} index={0} onPick={vi.fn()} alt="사진" />
    );
    const slide = container.querySelector('.snap-start');
    expect(slide.style.width).toBe('100%');
  });

  it('있는 장을 다 그려둔다 — 밀면 바로 보여야 한다', () => {
    render(<PhotoDeck photos={['a.jpg', 'b.jpg', 'c.jpg']} index={0} onPick={vi.fn()} alt="사진" />);
    expect(screen.getAllByRole('img')).toHaveLength(3);
  });
});

describe('미는 줄 안내', () => {
  it('마지막 장에서는 이전 쪽을 가리킨다', () => {
    // 없는 다음 장을 가리키면 그 줄을 다시는 안 믿는다.
    render(<SwipeHint index={1} total={2} />);
    expect(screen.getByText(/이전 사진/)).toBeTruthy();
  });

  it('그 앞에서는 다음 쪽을 가리킨다', () => {
    render(<SwipeHint index={0} total={2} />);
    expect(screen.getByText(/다음 사진/)).toBeTruthy();
  });
});

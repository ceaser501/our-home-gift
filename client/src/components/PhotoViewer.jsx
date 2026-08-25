import { useEffect, useRef } from 'react';

// 원본 사진을 보는 자리. 바코드 창 안(BarcodeModal의 photo 화면)과 카드에서 바로 여는
// 창(ImageViewerModal)이 같은 모양을 쓴다. 두 곳에서 각각 손보다가 한쪽만 고쳐진 적이 있다.

// 사진 한 장이 놓이는 틀.
//
// 배경이 검정이었다. 기프티콘은 대개 흰 바탕 캡처라 검정 판이 할 일이 없는데, 흰 시트
// 안에서 검은 사각형만 도드라져 사진보다 틀이 먼저 보였다.
//
// 높이는 화면 비율로 잡는다(62dvh). 시안은 452px로 못박았지만 이 시트는 max-h-[92dvh]
// 안에 살고, 세로 640px대 폰에서는 452px에 머리글과 버튼을 더하면 넘친다. 비율로 두면
// 큰 폰에서는 452px보다 커지고 작은 폰에서는 안 넘친다.
export function PhotoFrame({ src, alt }) {
  return (
    <div className="flex h-[62dvh] items-center justify-center overflow-hidden rounded-[15px] border border-border bg-secondary/60">
      <img src={src} alt={alt} className="max-h-full max-w-full object-contain" />
    </div>
  );
}

// 여러 장을 밀어서 넘기는 판.
//
// 화살표 둘과 썸네일 줄이 있던 자리다. 셋 다 뺐다 — 46px 버튼 두 개와 40px 썸네일 줄이
// 세로를 60px 넘게 먹었는데, 이 창에 온 이유는 사진을 크게 보려는 것이다.
//
// 미는 것을 모를까 걱정이었지만 사진 넘기기는 예외다. 전화기에 든 사진첩이 그렇게
// 동작해서, 스마트폰을 쓰는 사람은 이미 사진을 민다. 배워야 하는 조작이 아니다.
// 남는 걱정은 "여기서도 밀리나"인데, 그건 다음 장을 오른쪽 끝에 손톱만큼 내놓는 것으로
// 답한다(아래 PEEK). 글이 아니라 그림이라 읽지 않아도 보이고, 세로를 안 쓴다.
//
// 넘기기는 브라우저의 scroll-snap에 맡긴다. 손가락을 직접 재서 위치를 옮기면 관성과
// 되돌아감을 다 흉내내야 하는데, 그건 웹뷰마다 다르게 어긋난다.
const GAP = 10; // 장과 장 사이
const PEEK = 28; // 이만큼 좁혀서 다음 장이 오른쪽에 비어져 나오게 한다

export function PhotoDeck({ photos, index, onPick, alt }) {
  const ref = useRef(null);

  // 밖에서 번호가 바뀌면(창을 다시 열어 0으로 돌아가는 경우) 그 장으로 옮긴다.
  // 손으로 민 결과와 같은 값이면 건드리지 않는다 — 안 그러면 미는 도중에 되감긴다.
  useEffect(() => {
    const el = ref.current;
    const slide = el?.firstElementChild;
    if (!el || !slide) return;
    const target = index * (slide.offsetWidth + GAP);
    if (Math.abs(el.scrollLeft - target) > 4) el.scrollTo({ left: target, behavior: 'smooth' });
  }, [index]);

  function handleScroll(e) {
    const el = e.currentTarget;
    const slide = el.firstElementChild;
    if (!slide) return;
    const at = Math.round(el.scrollLeft / (slide.offsetWidth + GAP));
    if (at !== index && at >= 0 && at < photos.length) onPick(at);
  }

  return (
    <div
      ref={ref}
      onScroll={handleScroll}
      role="group"
      aria-label="원본 사진 넘겨보기"
      tabIndex={0}
      // overscroll-x-contain이 없으면 끝에서 한 번 더 민 것이 뒤로가기로 새어나간다.
      className="flex snap-x snap-mandatory gap-[10px] overflow-x-auto overscroll-x-contain outline-none [&::-webkit-scrollbar]:hidden"
      style={{ scrollbarWidth: 'none' }}
    >
      {photos.map((url, i) => (
        <div
          key={url}
          className="shrink-0 snap-start"
          style={{ width: photos.length > 1 ? `calc(100% - ${PEEK}px)` : '100%' }}
        >
          <PhotoFrame src={url} alt={`${alt} ${i + 1}`} />
        </div>
      ))}
    </div>
  );
}

// 미는 줄 안내.
//
// 12px 회색 한 줄이던 것을 14.5px로 올렸다. 안내는 못 읽으면 없는 것과 같다.
// 마지막 장에서는 화살표를 뒤집는다 — 없는 다음 장을 가리키면 그 줄을 다시는 안 믿는다.
export function SwipeHint({ index, total }) {
  const last = index >= total - 1;
  return (
    <p className="m-0 text-center text-[14.5px] font-semibold tracking-[-0.015em] text-muted-foreground">
      {last ? '‹ 옆으로 밀면 이전 사진' : '옆으로 밀면 다음 사진 ›'}
    </p>
  );
}

// 몇 장 중 몇 번째. 머리글 오른쪽에 앉는다.
//
// 점으로 찍던 자리다. 점은 6px이라 두 개인지 세 개인지가 안 세어진다. 숫자는 세지 않아도
// 읽힌다. 13.5px 회색이던 것을 15px 진하게 — 이 창에서 사진 다음으로 중요한 값이다.
export function PhotoCount({ index, total }) {
  return (
    <span className="shrink-0 rounded-full bg-secondary px-[11px] py-[3px] text-[15px] font-bold tabular-nums text-foreground">
      {index + 1} / {total}
    </span>
  );
}

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// 원본 사진을 보는 자리. 바코드 창 안(BarcodeModal의 photo 화면)과 카드에서 바로 여는
// 창(ImageViewerModal)이 같은 모양을 쓴다. 두 곳에서 각각 손보다가 한쪽만 고쳐진 적이 있다.

// 사진 한 장이 놓이는 틀.
//
// 배경이 검정이었다. 기프티콘은 대개 흰 바탕 캡처라 검정 판이 할 일이 없는데, 흰 시트
// 안에서 검은 사각형만 도드라져 사진보다 틀이 먼저 보였다.
//
// 높이는 화면 비율로 잡는다(62dvh). 시안은 452px로 못박았지만 이 시트는 max-h-[calc(92dvh/var(--ui-scale))]
// 안에 살고, 세로 640px대 폰에서는 452px에 머리글과 버튼을 더하면 넘친다. 비율로 두면
// 큰 폰에서는 452px보다 커지고 작은 폰에서는 안 넘친다.
export function PhotoFrame({ src, alt }) {
  return (
    <div className="flex h-[calc(62dvh/var(--ui-scale))] items-center justify-center overflow-hidden rounded-[15px] border border-border bg-secondary/60">
      <img
        src={src}
        alt={alt}
        className="max-h-full max-w-full object-contain"
      />
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
    if (Math.abs(el.scrollLeft - target) > 4)
      el.scrollTo({ left: target, behavior: "smooth" });
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
      style={{ scrollbarWidth: "none" }}
    >
      {photos.map((url, i) => (
        <div
          key={url}
          className="shrink-0 snap-start"
          style={{
            width: photos.length > 1 ? `calc(100% - ${PEEK}px)` : "100%",
          }}
        >
          <PhotoFrame src={url} alt={`${alt} ${i + 1}`} />
        </div>
      ))}
    </div>
  );
}

// 몇 장 중 몇 번째. 사진 바로 아래에 점으로 찍는다.
//
// 여기 있던 둘을 하나로 합쳤다 — 머리글의 「1 / 2」 뱃지와, 사진 아래의 「옆으로 밀면
// 다음 사진」 알약이다. 둘은 사진이 두 장 이상일 때만 나오는 같은 조건이었고 옷도
// 같았는데(회색 알약) 화면 양 끝에 떨어져 있었다. 그래서 뱃지가 갈 데 없이 제목과
// 부제 사이 44.5 에 떠 있었다.
//
// 글 안내를 걷은 까닭은 PhotoDeck 이 이미 그 일을 하고 있어서다. 다음 장을 오른쪽에
// 28px 내놓는 것이 「여기서도 밀린다」를 말하고, 마지막 장에서 그것이 사라지는 것이
// 「끝이다」를 말한다. 글로 한 번 더 할 일이 아니었다.
//
// 점으로 되돌린 까닭. 한때 점이었다가 숫자로 옮겼는데, 그 이유가 「점은 6px 이라 두
// 개인지 세 개인지 안 세어진다」였다. 그런데 이 앱은 한 기프티콘에 최대 3장이다
// (IMAGES_PER_CODE · SOLO_MAX_SHOTS). 셋까지는 세지 않아도 개수가 잡히고, 그러면
// 「읽어야 한다」는 숫자의 값도 같이 사라진다. 안 읽어도 보이는 쪽이 낫다.
//
// 점은 장식이라 읽어주는 기계에게는 숨기고, 대신 몇 번째인지를 글로 따로 남긴다.
export function PhotoDots({ index, total }) {
  return (
    // 위아래 여백은 감싸는 쪽이 준다. 여기서 pt 를 들고 있으면 감싼 gap 과 더해져,
    // 사진에서 24 · 버튼에서 12 로 아래가 더 가까워진다. 점은 사진에 딸린 것이다.
    <div className="flex justify-center">
      <span className="sr-only">
        {total}장 중 {index + 1}번째
      </span>
      <span className="flex gap-1.5" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={cn(
              "size-2 rounded-full",
              i === index ? "bg-primary" : "bg-border",
            )}
          />
        ))}
      </span>
    </div>
  );
}

// 되묻는 창에 넣는 사진 몇 장.
//
// "이 사진도 기프티콘인가요?"에서 '이 사진'이 화면 밖에 있으면, 읽는 사람은 무엇인지
// 모르는 채로 답해야 한다. 모르면 아니라고 누른다 — 그게 안전해 보여서다.
//
// 파일에서 바로 주소를 만든다. 훑기가 읽어둔 base64는 이제 안 들고 다닌다(쓸 데가
// 없어서 놓았다). 창이 닫힐 때 거둔다.
export function PhotoStrip({ files }) {
  const [urls, setUrls] = useState([]);

  useEffect(() => {
    const made = files.map((file) => URL.createObjectURL(file));
    setUrls(made);
    return () => made.forEach((url) => URL.revokeObjectURL(url));
  }, [files]);

  return (
    <div className="flex flex-wrap justify-center gap-2">
      {urls.map((url) => (
        <span
          key={url}
          className="flex h-[104px] w-[78px] items-center justify-center overflow-hidden rounded-[11px] border border-border bg-secondary/60"
        >
          <img
            src={url}
            alt=""
            className="max-h-full max-w-full object-contain"
          />
        </span>
      ))}
    </div>
  );
}

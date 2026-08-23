import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

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

// 넘기는 줄. 화살표 둘과 그 사이의 썸네일들.
//
// 화살표가 32px 반투명 원으로 사진 위에 얹혀 있었다. 사진을 가리는 데다, 사진이 어두우면
// 화살표가 묻혔다. 사진 밖 46px 테두리 버튼으로 내리면 사진이 온전해진다.
//
// 아래 점들은 썸네일로 바꿨다. 점은 눌러도 되는 것인지 알 수 없고, 눌러도 어느 사진으로
// 가는지 모른다. 40px짜리라도 그림이 보이면 보고 고른다.
export function PhotoNav({ photos, index, onPick }) {
  const arrow =
    'flex h-[46px] w-[50px] shrink-0 items-center justify-center rounded-xl border border-input bg-card text-foreground disabled:text-border';

  return (
    <div className="flex items-center gap-2.5">
      <button
        type="button"
        onClick={() => onPick(Math.max(0, index - 1))}
        disabled={index === 0}
        aria-label="이전 사진"
        className={arrow}
      >
        <ChevronLeft className="size-[18px]" />
      </button>

      <div className="flex flex-1 justify-center gap-[7px]">
        {photos.map((url, i) => (
          <button
            key={url}
            type="button"
            onClick={() => onPick(i)}
            aria-label={`${i + 1}번째 사진 보기`}
            aria-current={i === index}
            className={cn(
              'size-10 shrink-0 overflow-hidden rounded-[9px] bg-secondary',
              i === index ? 'border-2 border-primary' : 'border border-input'
            )}
          >
            <img src={url} alt="" className="size-full object-cover" />
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => onPick(Math.min(photos.length - 1, index + 1))}
        disabled={index === photos.length - 1}
        aria-label="다음 사진"
        className={arrow}
      >
        <ChevronRight className="size-[18px]" />
      </button>
    </div>
  );
}

import { ChevronRight, Megaphone, Plus, ScanSearch, Ticket } from 'lucide-react';
import { Button } from '@/components/ui/button';

// 기프티콘이 하나도 없는 사람이 보는 화면.
//
// 예전에는 목록 자리에 "등록된 기프티콘이 없어요 / 오른쪽 아래 + 버튼으로 첫 기프티콘을
// 추가해보세요" 두 줄이 있고, 그 위로 환영 띠가 따로 떠 있고, 필터 줄도 그대로 있었다.
// 셋이 같은 말을 나눠 하고 있었다 — 환영 띠는 "가족이 함께 본다"를, 빈 목록은 "＋를
// 누르라"를, 필터는 아무것도 거를 것이 없는 채로 자리만 차지했다.
//
// 한 화면으로 합친다. 누를 버튼을 가운데 두면 "오른쪽 아래 ＋"를 설명할 필요가 없어진다.
// 필터·환영 띠·오른쪽 아래 버튼 둘은 이 화면에서 숨긴다(App.jsx의 isFirstRun).
export default function FirstRunScreen({ notice, onOpenNotices, onUpload, onScan, scanSupported }) {
  return (
    <>
      {/* 공지 한 줄은 남긴다. 목록과 상관없이 읽어야 하는 것이고, 처음 온 사람은 알림
          종을 눌러볼 이유를 아직 모른다. 진행 중인 것이 있을 때만 나온다. */}
      {notice && (
        <div className="pb-1">
          <button
            type="button"
            onClick={onOpenNotices}
            className="flex h-12 w-full items-center gap-2.5 rounded-xl border border-border bg-muted/30 pr-3 pl-3.5"
          >
            <Megaphone className="size-[17px] shrink-0 text-primary" />
            <span className="shrink-0 rounded-[5px] bg-accent px-1.5 py-0.5 text-[11px] font-bold text-primary">
              공지
            </span>
            <span className="min-w-0 flex-1 truncate text-left text-[13.5px] font-semibold text-foreground">
              {notice.title}
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" />
          </button>
        </div>
      )}

      {/* 위아래 여백을 같게 뒀다. 예전에는 아래를 70px 더 줘서 내용이 가운데보다 23px쯤
          위에 섰는데, 공지 한 줄이 위에 들어오면 그만큼 더 눌린다 — 위는 빽빽하고 아래는
          비는 화면이 됐다. 남은 자리의 한가운데에 두면 공지가 있든 없든 같은 규칙이다. */}
      <div className="flex flex-1 flex-col items-center justify-center gap-[22px] px-[30px] py-8">
        <div className="flex size-20 items-center justify-center rounded-[22px] bg-accent">
          <Ticket className="size-10 text-primary" strokeWidth={1.7} />
        </div>

        <div className="flex flex-col items-center gap-2.5">
          <h2 className="m-0 text-center text-[21px] font-bold tracking-[-0.028em] text-foreground">
            첫 기프티콘을
            <br />
            올려보세요
          </h2>
          {/* 환영 띠에 있던 말을 여기로 합쳤다. 눌러보기 전에는 알 수 없는 것 —
              이게 나 혼자 쓰는 앱이 아니라는 것 — 을 마지막 줄에 둔다. */}
          <p className="m-0 text-center text-[15px] leading-relaxed font-medium break-keep text-muted-foreground">
            사진만 올리면 상품명과 사용기한을
            <br />
            알아서 채워드려요.
            <br />
            올린 기프티콘은 가족 모두가 함께 봐요.
          </p>
        </div>

        <div className="flex w-full flex-col gap-2.5">
          <Button size="lg" className="h-[52px] w-full rounded-[13px] text-[15.5px] font-bold" onClick={onUpload}>
            <Plus className="size-5" />
            기프티콘 올리기
          </Button>
          {scanSupported && (
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="h-12 w-full rounded-xl text-[15px] font-semibold"
              onClick={onScan}
            >
              <ScanSearch className="size-[18px]" />
              사진첩에서 찾아보기
            </Button>
          )}
        </div>
      </div>
    </>
  );
}

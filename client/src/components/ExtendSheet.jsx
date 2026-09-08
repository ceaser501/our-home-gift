import { useState } from "react";
import { Calendar, ChevronLeft, ExternalLink } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { addDays, formatDate, todayStr } from "../utils/date";
import useBackClose from "../utils/useBackClose";
import { PRIMARY_BUTTON } from "../utils/sheetUi";

// 유효기한이 임박했거나 지난 기프티콘의 기한 줄을 누르면 열리는 창.
//
// 연장은 우리가 대신 해줄 수 없다. 기프티콘의 실제 주인은 발행사(카카오 선물하기 등)
// 계정이고, 우리가 가진 건 사진과 바코드 번호뿐이라 연장 권한이 없다. 공개 API도 없다.
// 그래서 이 창이 하는 일은 둘이다 — 연장이 된다는 걸 알려주고, 그 화면까지 데려다주는 것.
// "연장이 되는 줄 몰라서 버리는" 경우가 대부분이라 그것만으로도 값어치가 있다.
//
// ── 왜 두 화면으로 갈랐나 ────────────────────────────────────────────────
// 한 화면에 다 있었다. 안내 · 선물함 링크 · 날짜 바꾸기가 위아래로 붙어 있었는데,
// 그 셋은 시점이 다르다. 앞의 둘은 앱을 떠나기 전에 할 일이고, 마지막 하나는 발행처에서
// 연장을 마치고 돌아온 뒤에 할 일이다. 한 화면에 두면 돌아오기 전에 날짜부터 눌러서,
// 실제로는 안 늘어난 기한이 앱에만 늘어난다.
//
// 이제 1/2는 "가서 연장하세요", 2/2는 "그럼 앱에도 반영할게요"다. '연장했어요'를
// 눌러야 두 번째로 넘어가므로, 그 한 번이 확인 절차가 된다.
//
// ── 무엇을 어느 순서로 보이나 ────────────────────────────────────────────
// 1/2 에서 제일 중요한 것은 "늘릴 수 있다"는 사실이다. 사용자는 기한이 임박한 것을
// 이미 안다 — 그래서 카드의 기한 줄을 눌렀다. 모르는 것은 늘릴 수 있다는 쪽이다.
// 그래서 제목이 그 사실을 말하고, 어디서 어떻게는 본문이 잇는다.
//
// 상품명은 1/2 에 두지 않는다. 이 화면은 아무 것도 바꾸지 않으므로 확인할 것이 없다.
// 2/2 는 실제로 날짜를 바꾸므로 누르기 직전에 확인이 필요하고, 거기에만 둔다.

// 카카오 선물하기 표준. 대부분의 기프티콘이 여기 해당한다.
const DEFAULT_DAYS = 90;
// 선물함(주문내역)으로 바로 보내면 "잘못된 접근입니다"가 뜬다. 그 주소는 로그인 세션을
// 달고 안에서 눌러 들어가야 하는 자리라, 밖에서 곧장 열면 카카오가 막는다.
// 홈으로 보낸다 — 한 번 더 눌러야 하지만 오류 화면을 보는 것보다 낫다.
const GIFT_BOX_URL = "https://gift.kakao.com/";

export default function ExtendSheet({ gifticon, onExtend, onClose }) {
  // 뒤로가기는 단계와 상관없이 창을 닫는다. 다른 창들과 같은 규칙이어야 한다 —
  // 여기만 한 단계씩 물러나면, 뒤로가기를 몇 번 눌러야 나가는지 알 수 없어진다.
  //
  // 그래서 헤더의 ‹ 가 1/2 로 돌아가는 유일한 길이다. '연장했어요'를 눌러놓고 아직
  // 안 했다는 걸 깨달았을 때 창을 닫고 카드를 다시 찾지 않아도 되게 남겨둔다.
  useBackClose(onClose);
  const [step, setStep] = useState(1);
  // 90일이 미리 계산돼 들어간다. 다르면 그 자리에서 고친다 —
  // 한때 '직접 날짜 선택' 버튼을 눌러야 입력칸이 생겼는데, 누른 데와 바뀌는 데가
  // 떨어져 있었다. 처음부터 입력칸이면 "이게 눌리나"를 묻지 않아도 된다.
  const [next, setNext] = useState(() =>
    addDays(gifticon.expires_at, DEFAULT_DAYS),
  );
  const [saving, setSaving] = useState(false);

  const expired = gifticon.expires_at < todayStr();

  async function apply() {
    if (!next) return;
    setSaving(true);
    try {
      await onExtend(gifticon, next);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  // 앱을 나가는 문. 테두리를 두른다 — 이 앱에서 테두리는 누르는 것에, 배경은 묶는
  // 것에 쓴다. 한때 이 안에 '열기'가 또 테두리 상자로 들어 있어서 상자 안 상자였다.
  const giftBox = (title, sub) => (
    <a
      href={GIFT_BOX_URL}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-3 rounded-lg border border-border px-3.5 py-3 text-foreground no-underline"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-body font-bold break-keep">{title}</span>
        <span className="text-body font-medium break-keep text-muted-foreground">
          {sub}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5 text-body font-semibold text-primary">
        열기
        <ExternalLink className="size-3.5" />
      </span>
    </a>
  );

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="max-h-[calc(92dvh/var(--ui-scale))] gap-0 overflow-y-auto pb-[var(--safe-bottom)]">
        <SheetHeader>
          {/* 두 화면짜리라는 것을 먼저 보여준다. 안 보이면 1/2에서 '연장했어요'를 누른
              사람이 "끝난 건가" 하고 창을 닫는다. 만료된 것은 한 화면이라 안 띄운다.

              줄 높이를 24 로 못박는다. 시트 위 테두리 1 에 헤더 여백 20 을 더해 21 에서
              시작하므로 가운데가 33 이 되고, 그게 닫기(✕)의 가운데선이다 — sheet.jsx 가
              제목 줄에 맞춰 잡아둔 값이다(테두리 1 + top-2.5 인 10 + 44 의 절반). 스텝퍼가
              있는 화면에서는 제목이 아래로 밀리므로, 그 줄에 남는 것은 스텝퍼다. 왼쪽에
              뒤로 · 가운데에 어디쯤인지 · 오른쪽에 닫기 — 내비게이션 바 그대로다.

              높이를 안 박으면 2/2 에서 ‹ 가 생기며 줄이 14 에서 20 으로 커져, 넘어갈 때
              점 두 개가 3px 내려앉는다. */}
          {!expired && (
            <div className="mb-2 flex h-6 items-center gap-2">
              {step === 2 && (
                // 동그란 배경을 걷었다. 헤더의 아이콘 버튼은 닫기(✕)와 같이 민짜다 —
                // 하나만 배경을 달고 있으면 그것만 다른 종류로 보인다.
                // 보이는 것은 20 이고 누를 자리는 40 이다(-m-2.5 p-2.5).
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  aria-label="이전 단계"
                  className="-m-2.5 flex shrink-0 p-2.5 text-muted-foreground"
                >
                  <ChevronLeft className="size-5" />
                </button>
              )}
              <span
                className={cn(
                  "h-1 w-[22px] rounded-full",
                  step === 1 ? "bg-primary" : "bg-primary/35",
                )}
              />
              <span
                className={cn(
                  "h-1 w-[22px] rounded-full",
                  step === 2 ? "bg-primary" : "bg-input",
                )}
              />
              <span className="ml-1 text-caption font-bold tabular-nums text-muted-foreground">
                {step} / 2
              </span>
            </div>
          )}

          {/* 제목이 사실을 말한다. 한때 '기한 연장은 / 기프티콘 발행처에서'였는데 그건
              조건절이라 말이 끝나지 않았고, 늘릴 수 있다는 사실을 아무도 말하지 않았다.

              줄바꿈을 넣지 않는다. 제일 긴 2/2 제목도 한 줄로 247px 이라 쓸 수 있는
              폭(295) 안에 들어간다. 한때 <br> 로 직접 끊고 있었다. */}
          <SheetTitle className="break-keep">
            {expired
              ? "기한이 지났어요"
              : step === 1
                ? "기한을 늘릴 수 있어요"
                : "늘어난 기한을 앱에도 반영할게요"}
          </SheetTitle>
        </SheetHeader>

        <div className="flex flex-col px-5">
          {expired ? (
            <>
              {/* 부제가 아니라 본문이다. 부제는 제목만으로 모자란 것을 한 마디 보태는
                  자리인데, 이 말은 이 창이 있는 이유 그 자체다. */}
              <p className="m-0 text-body leading-relaxed font-medium break-keep text-muted-foreground">
                기한이 지나도{" "}
                <b className="font-bold text-foreground">5년 안</b>이면{" "}
                <b className="font-bold text-foreground">90% 환불</b>을 받을 수
                있어요.
              </p>
              <div className="mt-4">
                {/* 1/2 의 카카오 줄과 같은 꼴로 묻는다. 한때 제목이 '선물함 열기'였는데
                    오른쪽에 '열기'가 또 붙어 같은 말이 두 번 나왔다. */}
                {giftBox(
                  "카카오톡 선물하기 상품인가요?",
                  "선물함에서 환불을 신청할 수 있어요",
                )}
              </div>
              <Button
                type="button"
                size="lg"
                className={cn(PRIMARY_BUTTON, "mt-6")}
                onClick={onClose}
              >
                닫기
              </Button>
            </>
          ) : step === 1 ? (
            <>
              {/* 발행사를 단정하지 않는다.
                  카카오·기프티쇼·SK… 어디서 받은 것인지 우리는 알 방법이 없다. 그런데
                  예전 문구는 "선물함에서 늘릴 수 있어요"라고 적어, 카카오톡이 아닌
                  사람에게는 그냥 틀린 말이 됐다. 어디서 받았든 같은 사실만 적는다. */}
              {/* 두 문장이 하는 일이 다르다 — 앞은 어디서, 뒤는 얼마나. 줄을 갈라
                  각자 한 줄씩 갖게 한다. 말끝도 '해요'로 맞춘다. */}
              <p className="m-0 text-body leading-relaxed font-medium break-keep text-muted-foreground">
                받으신 문자나 발행처 앱에서 할 수 있어요.
                <br />
                보통 90일씩, 최대 5년까지 늘어나요.
              </p>

              {/* 조건을 제목에 달아 해당 안 되는 사람이 먼저 걸러지게 한다. 주 버튼으로
                  두지 않는 이유는 발행처를 모르기 때문이다 — 카카오가 아닌 사람에게
                  '선물함 열기'가 제일 큰 버튼이면 막다른 길이다. */}
              <div className="mt-4">
                {giftBox(
                  "카카오톡 선물하기 상품인가요?",
                  "선물함에서 바로 연장할 수 있어요",
                )}
              </div>

              {/* 연장을 안 하고 돌아왔을 수도 있다. 그래서 '선물함 열기'를 누른 것만으로는
                  기한을 늘리지 않고, 이 버튼을 한 번 더 받는다.
                  '나중에 할게요'는 걷었다 — 오른쪽 위 ✕ 와 아래로 쓸어내리기가 이미 같은
                  일을 한다. 같은 문이 셋 있을 일은 아니다. */}
              <Button
                type="button"
                size="lg"
                className={cn(PRIMARY_BUTTON, "mt-6")}
                onClick={() => setStep(2)}
              >
                연장했어요
              </Button>
            </>
          ) : (
            <>
              {/* 어느 기프티콘인지. 확인용이라 제목(20)과 새 날짜(20)보다 한 단 아래다. */}
              <p className="m-0 truncate text-body font-semibold text-foreground">
                {gifticon.name}
              </p>

              {/* 지나갈 값. 새 날짜와 같은 꼴로 적고 취소선만 긋는다 — 자릿수가 맞아야
                  얼마나 늘어나는지 눈으로 견줘진다. '까지'도 날짜와 같은 크기로 두어야
                  선이 한 줄로 곧게 간다(크기가 다르면 중간에 꺾인다). */}
              <p className="m-0 mt-1 text-body font-semibold line-through tabular-nums text-muted-foreground">
                {formatDate(gifticon.expires_at)} 까지
              </p>

              {/* 처음부터 입력칸이다. 다만 네이티브 날짜 입력은 '2026. 12. 09.'처럼
                  제 마음대로 그리고 CSS 로 못 고친다. 투명하게 깔아 누르는 일만 맡기고
                  글자는 우리가 그린다 — 위 취소선 날짜와 포맷이 같아야 해서다.

                  테두리는 평소 회색이고 만질 때만 보라다. 이미 90일이 채워져 들어오는
                  칸이라 늘 보라면 "여기 채우세요"라고 잘못 말하게 된다. */}
              <label className="relative mt-4 flex h-13 items-center gap-2 rounded-lg border border-input bg-card px-[15px] transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30">
                <span className="flex-1 text-title font-bold tracking-heading tabular-nums text-foreground">
                  {formatDate(next)}
                  <span className="text-body font-semibold text-muted-foreground">
                    {" "}
                    까지
                  </span>
                </span>
                <Calendar className="size-[19px] shrink-0 text-muted-foreground" />
                {/* 칸 어디를 눌러도 달력이 뜬다.
                    투명한 입력이 칸을 통째로 덮고 있어 포커스는 어디서나 가지만, 그것만
                    으로는 부족하다 — 네이티브 날짜 입력은 제 달력 아이콘을 눌러야 열리고
                    그 아이콘은 여기서 안 보인다. 눌린 김에 직접 연다. */}
                <input
                  type="date"
                  value={next}
                  onChange={(e) => setNext(e.target.value)}
                  onClick={(e) => e.currentTarget.showPicker?.()}
                  onFocus={(e) => e.currentTarget.showPicker?.()}
                  aria-label="새 기한"
                  className="absolute inset-0 opacity-0"
                />
              </label>

              {/* 칸에 딸린 말이라 헬퍼다. 이름 바꾸기 시트의 헬퍼와 같은 옷이다. */}
              <div className="mt-2 flex items-start gap-1.5 pl-1">
                <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-border text-caption font-bold text-muted-foreground">
                  i
                </span>
                <p className="m-0 flex-1 text-footnote text-muted-foreground">
                  앱 안의 날짜만 바뀌어요. 실제 기한은 발행처 기준이에요.
                </p>
              </div>

              {/* 본문끼리는 4~16, 버튼 앞은 24 다. 같은 값이면 버튼이 본문의 마지막 줄로
                  읽힌다. 금액 입력 시트와 같은 값이다. */}
              <Button
                type="button"
                size="lg"
                className={cn(PRIMARY_BUTTON, "mt-6")}
                onClick={apply}
                disabled={saving || !next}
              >
                {next
                  ? `${formatDate(next)}까지로 바꾸기`
                  : "날짜를 골라주세요"}
              </Button>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

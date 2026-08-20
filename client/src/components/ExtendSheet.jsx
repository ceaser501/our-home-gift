import { useState } from 'react';
import { CalendarPlus, ChevronRight, ExternalLink } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { addDays, formatDate, formatDday, todayStr } from '../utils/date';
import useBackClose from '../utils/useBackClose';

// 유효기한이 임박했거나 지난 기프티콘의 칩을 누르면 열리는 창.
//
// 연장은 우리가 대신 해줄 수 없다. 기프티콘의 실제 주인은 발행사(카카오 선물하기 등)
// 계정이고, 우리가 가진 건 사진과 바코드 번호뿐이라 연장 권한이 없다. 공개 API도 없다.
// 그래서 이 창이 하는 일은 둘이다 — 연장이 된다는 걸 알려주고, 그 화면까지 데려다주는 것.
// "연장이 되는 줄 몰라서 버리는" 경우가 대부분이라 그것만으로도 값어치가 있다.

// 카카오 선물하기 표준. 대부분의 기프티콘이 여기 해당한다.
const DEFAULT_DAYS = 90;
// 선물함(주문내역)으로 바로 보내면 "잘못된 접근입니다"가 뜬다. 그 주소는 로그인 세션을
// 달고 안에서 눌러 들어가야 하는 자리라, 밖에서 곧장 열면 카카오가 막는다.
// 홈으로 보낸다 — 한 번 더 눌러야 하지만 오류 화면을 보는 것보다 낫다.
const GIFT_BOX_URL = 'https://gift.kakao.com/';

export default function ExtendSheet({ gifticon, onExtend, onClose }) {
  // 뒤로가기로 이 창을 닫는다. 안 그러면 설치해서 쓸 때 앱이 통째로 꺼진다.
  useBackClose(onClose);
  // 기본은 한 번 탭으로 끝내는 길. 날짜가 다를 때만 직접 넣는다.
  const [custom, setCustom] = useState(false);
  const [date, setDate] = useState('');
  const [saving, setSaving] = useState(false);

  const expired = gifticon.expires_at < todayStr();
  const suggested = addDays(gifticon.expires_at, DEFAULT_DAYS);

  async function apply(next) {
    if (!next) return;
    setSaving(true);
    try {
      await onExtend(gifticon, next);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="max-h-[92dvh] gap-0 overflow-y-auto pb-[var(--safe-bottom)]">
        <SheetHeader className="pr-14 pb-1">
          <SheetTitle className="truncate">{expired ? '기한이 지났어요' : '기한을 늘릴 수 있어요'}</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-5 pt-2">
          <div className="flex flex-col gap-1">
            <p className="m-0 text-base font-semibold break-keep text-foreground">{gifticon.name}</p>
            <p className="m-0 text-sm text-muted-foreground">
              {formatDate(gifticon.expires_at)}까지 · {formatDday(gifticon.expires_at)}
            </p>
          </div>

          {/* 발행사를 단정하지 않는다.
              카카오·기프티쇼·SK… 어디서 받은 것인지 우리는 알 방법이 없다. 그런데 예전
              문구는 "선물함에서 늘릴 수 있어요"라고 적어, 카카오톡이 아닌 사람에게는
              그냥 틀린 말이 됐다. 어디서 받았든 같은 사실만 적고, 카카오톡으로 가는
              문은 아래에 조건을 붙여 따로 둔다.

              문의할 곳도 적지 않는다. 카카오 말고는 짚어줄 자리가 없어서, 아는 척하느니
              말하지 않는 편이 낫다. */}
          {expired ? (
            // 만료된 것에 연장을 권하면 헛걸음이 된다. 대신 돈을 돌려받는 길을 알려준다.
            // 신유형 상품권 표준약관에서 정한 권리라, 모르고 버리는 사람이 많다.
            <p className="m-0 rounded-xl bg-accent px-4 py-3.5 text-[15px] leading-relaxed break-keep text-foreground">
              기한이 지나도 <b className="font-semibold">5년 안</b>이면 <b className="font-semibold">90% 환불</b>을 받을 수
              있어요.
            </p>
          ) : (
            <p className="m-0 rounded-xl bg-accent px-4 py-3.5 text-[15px] leading-relaxed break-keep text-foreground">
              기프티콘은 대부분 기한을 늘릴 수 있어요. 보통 <b className="font-semibold">90일씩</b>, 최대{' '}
              <b className="font-semibold">5년</b>까지요.
            </p>
          )}

          {/* 카카오톡으로 나가는 문. 버튼이 아니라 줄 하나로 둔다.

              한때 테두리 버튼이었는데, 바로 아래 '다른 날짜예요'와 생김새가 같아서
              나가는 문과 저장이 같은 무게로 보였다. 선 긋고 · 작은 회색 라벨 · 버튼이
              두 번 반복되는 것도 그래서였다. 줄로 두면 지나가는 길로 읽힌다 —
              설정 화면의 줄들과 같은 모양이라 눈에 익기도 하다.

              조건은 제목이 아니라 밑에 붙인다. 해당 안 되는 사람이 먼저 걸러진다. */}
          <a
            href={GIFT_BOX_URL}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2.5 border-y border-border py-3 text-foreground no-underline"
          >
            <ExternalLink className="size-4.5 shrink-0 text-muted-foreground" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-base font-semibold">선물함 열기</span>
              <span className="text-[13px] break-keep text-muted-foreground">카카오톡 기프티콘이라면</span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </a>

          {!expired && (
            <div className="flex flex-col gap-2 pt-1">
              <p className="m-0 text-sm font-semibold text-muted-foreground">연장하고 오셨나요?</p>

              {!custom ? (
                <>
                  {/* 날짜를 미리 보여주고 한 번 탭으로 끝낸다. 카톡에서 본 날짜와 같으면
                      그냥 누르면 되고, 다르면 여기서 알아챈다. */}
                  <Button
                    type="button"
                    size="lg"
                    onClick={() => apply(suggested)}
                    disabled={saving}
                    className="w-full rounded-xl"
                  >
                    <CalendarPlus className="size-4.5" />
                    {formatDate(suggested)}까지로 바꾸기
                  </Button>
                  {/* 위 버튼과 같은 모양이되 색을 뺀다. 나란히 놓였을 때 어느 쪽이 기본인지
                      한눈에 갈려야 한다 — 글자만 있는 링크로 두니 버튼으로 안 보였다. */}
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    onClick={() => {
                      setDate(suggested);
                      setCustom(true);
                    }}
                    disabled={saving}
                    className="w-full rounded-xl text-muted-foreground"
                  >
                    다른 날짜예요
                  </Button>
                </>
              ) : (
                <div className="flex gap-2">
                  <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="flex-1" />
                  <Button type="button" onClick={() => apply(date)} disabled={saving || !date} className="shrink-0 rounded-xl">
                    저장
                  </Button>
                </div>
              )}

              {/* 연장을 안 하고 돌아왔을 수도 있다. 그래서 "선물함 열기"를 누른 것만으로는
                  기한을 늘리지 않고, 반드시 여기서 한 번 더 확인받는다. */}
              <p className="m-0 text-[13px] leading-relaxed break-keep text-muted-foreground">
                실제로 연장한 뒤에 눌러주세요. 앱에만 반영돼요.
              </p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

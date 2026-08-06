import { useState } from 'react';
import { CalendarPlus, ExternalLink } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { addDays, formatDate, formatDday, todayStr } from '../utils/date';

// 유효기한이 임박했거나 지난 기프티콘의 칩을 누르면 열리는 창.
//
// 연장은 우리가 대신 해줄 수 없다. 기프티콘의 실제 주인은 발행사(카카오 선물하기 등)
// 계정이고, 우리가 가진 건 사진과 바코드 번호뿐이라 연장 권한이 없다. 공개 API도 없다.
// 그래서 이 창이 하는 일은 둘이다 — 연장이 된다는 걸 알려주고, 그 화면까지 데려다주는 것.
// "연장이 되는 줄 몰라서 버리는" 경우가 대부분이라 그것만으로도 값어치가 있다.

// 카카오 선물하기 표준. 대부분의 기프티콘이 여기 해당한다.
const DEFAULT_DAYS = 90;
const GIFT_BOX_URL = 'https://gift.kakao.com/order/history';

export default function ExtendSheet({ gifticon, onExtend, onClose }) {
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
      <SheetContent className="max-h-[92dvh] gap-0 overflow-y-auto pb-[max(24px,env(safe-area-inset-bottom))]">
        <SheetHeader className="pr-14 pb-1">
          <SheetTitle className="truncate">{expired ? '기한이 지났어요' : '기한을 늘릴 수 있어요'}</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-5 pt-2">
          <div className="flex flex-col gap-1">
            <p className="m-0 text-sm font-semibold text-foreground">{gifticon.name}</p>
            <p className="m-0 text-xs text-muted-foreground">
              {formatDate(gifticon.expires_at)}까지 · {formatDday(gifticon.expires_at)}
            </p>
          </div>

          {expired ? (
            // 만료된 것에 연장을 권하면 헛걸음이 된다. 대신 돈을 돌려받는 길을 알려준다.
            // 신유형 상품권 표준약관에서 정한 권리라, 모르고 버리는 사람이 많다.
            <p className="m-0 rounded-xl bg-accent px-3.5 py-3 text-[13px] leading-relaxed break-keep text-foreground">
              기한이 지나도 <b className="font-semibold">구매일로부터 5년</b> 안이면 발행사에 <b className="font-semibold">90% 환불</b>을
              요청할 수 있어요. 선물함에서 해당 상품의 고객센터로 문의해보세요.
            </p>
          ) : (
            <p className="m-0 rounded-xl bg-accent px-3.5 py-3 text-[13px] leading-relaxed break-keep text-foreground">
              대부분의 기프티콘은 만료 전에 유효기간을 늘릴 수 있어요. 보통 <b className="font-semibold">90일씩</b>, 구매일로부터
              5년까지요. 선물함에서 이 상품을 찾아 <b className="font-semibold">연장</b>을 눌러주세요.
            </p>
          )}

          {/* 우리가 여는 건 카카오 선물하기 구매내역이다. 다른 발행사(기프티쇼 등)를 쓰는
              기프티콘도 있어서 "카카오톡 선물함"이라고 이름을 밝혀 적는다. 엉뚱한 데로
              보냈을 때 사용자가 스스로 알아챌 수 있어야 한다. */}
          <a
            href={GIFT_BOX_URL}
            target="_blank"
            rel="noreferrer"
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-border py-3 text-sm font-semibold text-foreground no-underline"
          >
            <ExternalLink className="size-4 text-muted-foreground" />
            카카오톡 선물함 열기
          </a>

          {!expired && (
            <div className="flex flex-col gap-2 border-t border-border pt-4">
              <p className="m-0 text-xs font-semibold text-muted-foreground">연장하고 오셨나요?</p>

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
                  <button
                    type="button"
                    onClick={() => {
                      setDate(suggested);
                      setCustom(true);
                    }}
                    className="text-xs font-semibold text-muted-foreground underline underline-offset-2"
                  >
                    다른 날짜예요
                  </button>
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
              <p className="m-0 text-[11px] leading-relaxed break-keep text-muted-foreground">
                연장이 실제로 됐을 때만 눌러주세요. 여기서 바꾼 날짜는 앱에만 반영돼요.
              </p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

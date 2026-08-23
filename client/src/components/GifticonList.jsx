import { useState } from 'react';
import { CalendarOff } from 'lucide-react';
import GifticonCard from './GifticonCard';

// 기한을 일부러 안 적고 쓰는 사람도 있다. 그 사람에게는 이 안내가 잔소리라서,
// 한 번 끄면 다시 띄우지 않는다(개수가 늘어도 마찬가지다 — 늘 때마다 다시 나오면
// 끈 의미가 없다). 끈 뒤에도 카드마다 붙는 "유효기한 미입력" 칩은 그대로 남아서,
// 나중에 마음이 바뀌어도 어느 것이 비었는지는 목록에서 알 수 있다.
const NOTICE_DISMISS_KEY = 'expiry-notice-dismissed';

export default function GifticonList({ gifticons, onViewCode, onViewImage, onToggleUsed, onEdit, onDelete, onFindStores, onToggleClaim, onExtend, onSpend }) {
  const [noticeDismissed, setNoticeDismissed] = useState(() => localStorage.getItem(NOTICE_DISMISS_KEY) === '1');

  // 하나도 없는 사람이 보는 화면은 여기가 아니라 FirstRunScreen이다(App.jsx의 isFirstRun).
  // 여기 오는 빈 목록은 검색·필터로 걸러져 아무것도 안 남은 경우뿐이라, 할 일은 하나다 —
  // 거른 것을 푸는 것. 그래서 "＋로 올려보세요"라고 하지 않는다.
  if (gifticons.length === 0) {
    return (
      <p className="m-0 py-15 text-center text-[15px] break-keep text-muted-foreground">
        찾는 기프티콘이 없어요.
      </p>
    );
  }

  // 이미지에서 유효기한을 못 읽으면 빈칸으로 남는데, 기한이 없으면 만료 알림도 못 보낸다.
  // 카드마다 "미입력"이라고는 적혀 있지만 목록을 다 훑어야 몇 개인지 알 수 있어서,
  // 위에서 한 번에 알려준다. 다 채우면 저절로 사라진다.
  // 이미 쓴 것은 세지 않는다. 기한이 지나든 말든 상관없는 것들이라 채우라고 할 이유가 없다.
  const missingExpiry = gifticons.filter((g) => g.status !== 'used' && !g.expires_at).length;

  function dismissNotice() {
    localStorage.setItem(NOTICE_DISMISS_KEY, '1');
    setNoticeDismissed(true);
  }

  return (
    <>
      {/* 회색 배경만으로는 아래 카드와 구분이 약해서 테두리를 둘렀다.
          끄는 버튼은 문장 끝에 이어 붙이던 것을 오른쪽으로 빼냈다 — 문장 안에 밑줄
          버튼이 섞여 있으면 어디까지가 설명이고 어디부터가 누를 것인지 흐려진다.
          이름도 '다시 안 보기'에서 '숨기기'로 줄였다. 오른쪽에 따로 서면 그 짧은 말로도
          하는 일이 분명하다. */}
      {missingExpiry > 0 && !noticeDismissed && (
        <div className="mb-3 flex items-start gap-2 rounded-xl border border-border bg-muted/40 px-3.5 py-2.5 text-[13px] leading-relaxed font-medium break-keep text-muted-foreground">
          <CalendarOff className="mt-0.5 size-4 shrink-0" />
          <span className="flex-1">
            사용기한이 없는 기프티콘 <b className="font-bold text-foreground">{missingExpiry}개</b>. 사용기한을 적어야 만료
            전에 알려드릴 수 있어요.
          </span>
          <button
            type="button"
            onClick={dismissNotice}
            className="shrink-0 text-[12.5px] font-semibold whitespace-nowrap text-muted-foreground underline underline-offset-2"
          >
            숨기기
          </button>
        </div>
      )}

      <ul className="m-0 flex list-none flex-col gap-3.5 p-0">
        {gifticons.map((g) => (
          <GifticonCard
            key={g.id}
            gifticon={g}
            onViewCode={onViewCode}
            onViewImage={onViewImage}
            onToggleUsed={onToggleUsed}
            onEdit={onEdit}
            onDelete={onDelete}
            onFindStores={onFindStores}
            onToggleClaim={onToggleClaim}
            onExtend={onExtend}
            onSpend={onSpend}
          />
        ))}
      </ul>
    </>
  );
}

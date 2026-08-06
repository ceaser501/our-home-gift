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

  if (gifticons.length === 0) {
    return (
      <div className="px-5 py-15 text-center text-muted-foreground">
        <p>등록된 기프티콘이 없어요.</p>
        <p className="mt-1.5 text-[13px]">오른쪽 아래 + 버튼으로 첫 기프티콘을 추가해보세요.</p>
      </div>
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
      {missingExpiry > 0 && !noticeDismissed && (
        <p className="m-0 mb-3 flex items-start gap-1.5 rounded-xl bg-secondary px-3 py-2.5 text-xs leading-relaxed break-keep text-muted-foreground">
          <CalendarOff className="mt-0.5 size-3.5 shrink-0" />
          <span>
            유효기간이 없는 기프티콘이 <b className="font-semibold text-foreground">{missingExpiry}개</b> 있어요. 기한을 입력해야
            만료 전에 알려드릴 수 있어요.{' '}
            {/* 끄기는 글 아래에 따로 줄을 잡지 않고 문장 끝에 이어 붙인다. 줄을 따로 두면
                목록 위에 얹히는 안내가 세 줄이 되는데, 그 자리는 기프티콘이 써야 할 자리다.
                "닫기"(X)가 아니라 "다시 안 보기"로 적는 이유: X는 이번만 접는 것처럼
                읽히는데 실제로는 영영 안 띄우므로, 하는 일을 그대로 말하는 편이 낫다. */}
            <button
              type="button"
              onClick={dismissNotice}
              className="font-semibold whitespace-nowrap underline underline-offset-2"
            >
              다시 안 보기
            </button>
          </span>
        </p>
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

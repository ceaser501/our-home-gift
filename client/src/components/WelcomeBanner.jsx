import { useEffect, useState } from 'react';
import { PartyPopper, X } from 'lucide-react';
import { useFamily } from '../FamilyContext';

// 환영 인사는 공지로 띄우지 않는다.
//
// 공지는 성격이 "닫을 때까지 남는 것"이다(client/src/components/NoticeBanner.jsx).
// 거기에 "처음 한 번만"을 섞으면 공지 규칙이 거짓말이 된다 — 닫지도 않았는데 사라지는
// 공지가 생긴다. 성격이 다르면 자리를 따로 두는 편이 낫다.
const SEEN_KEY = 'welcome-seen';

// 가입한 지 얼마 안 된 사람에게만 띄운다.
//
// 본 적 있는지만 보고 판단하면, 오래 쓰던 사람이 폰을 바꿔 새로 깔았을 때 "환영해요"가
// 뜬다. 그 사람에게는 처음이 아니라 어색하다. 서버에 있는 가입 시각을 같이 본다.
//
// 하루가 아니라 일주일로 둔 이유는, 가입은 초대를 받은 날 하고 정작 앱은 주말에 여는
// 일이 흔해서다. 그때 인사를 못 받으면 이 띠가 존재할 이유가 없다.
const FRESH_MS = 7 * 24 * 60 * 60 * 1000;

function seenKey(userId) {
  return `${SEEN_KEY}:${userId}`;
}

export default function WelcomeBanner({ onShownChange }) {
  const { members, user } = useFamily();
  const me = members.find((m) => m.user_id === user?.id);

  // 처음 그릴 때 딱 한 번 정한다. 그 뒤로는 이 값이 바뀌지 않는다 — 아래에서 곧바로
  // "봤다"고 적어두기 때문에, 다시 계산하면 자기가 적은 것을 읽고 스스로 사라진다.
  const [show, setShow] = useState(() => {
    if (!user?.id || !me?.created_at) return false;
    if (localStorage.getItem(seenKey(user.id))) return false;
    return Date.now() - new Date(me.created_at).getTime() < FRESH_MS;
  });

  // 띄우는 순간에 적는다. X를 눌러야만 적으면, 안 닫고 앱을 끈 사람에게 내일 또 뜬다.
  // 인사는 한 번이면 된다 — 두 번째부터는 인사가 아니라 잔소리다.
  useEffect(() => {
    if (show && user?.id) localStorage.setItem(seenKey(user.id), String(Date.now()));
  }, [show, user?.id]);

  // 목록 위 띠는 한 자리뿐이다. 이 띠가 쓰는 동안 주변 매장 안내가 비켜선다.
  useEffect(() => {
    onShownChange?.(show);
    return () => onShownChange?.(false);
  }, [show, onShownChange]);

  if (!show) return null;

  return (
    // "＋를 누르세요"는 적지 않는다. 기프티콘이 없는 목록이 이미 그 말을 하고 있고
    // (client/src/components/GifticonList.jsx:18), 같은 말이 두 줄이면 둘 다 안 읽힌다.
    // 대신 눌러보기 전에는 알 수 없는 것을 적는다 — 이게 나 혼자 쓰는 앱이 아니라는 것.
    <div className="flex w-full items-start gap-2.5 border-b border-border bg-accent/60 px-5 py-3">
      <PartyPopper className="mt-0.5 size-4 shrink-0 text-primary" />
      <p className="m-0 min-w-0 flex-1 text-xs leading-relaxed break-keep text-muted-foreground">
        <b className="font-semibold text-foreground">모아콘에 오신 걸 환영해요.</b>
        <br />
        여기 올린 기프티콘은 가족 모두가 함께 봐요. 사진만 올리면 상품명과 기한은 알아서 채워드려요.
      </p>
      <button
        type="button"
        onClick={() => setShow(false)}
        aria-label="환영 인사 닫기"
        className="shrink-0 text-muted-foreground"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

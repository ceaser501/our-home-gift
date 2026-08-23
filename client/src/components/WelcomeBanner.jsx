import { useEffect, useState } from 'react';
import { PartyPopper, X } from 'lucide-react';
import { useFamily } from '../FamilyContext';

// 환영 인사는 공지로 띄우지 않는다.
//
// 공지는 성격이 "닫을 때까지 남는 것"이다(client/src/components/NoticesSheet.jsx).
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
    // 세 문장이던 것을 한 마디로 줄였다. 뒤 두 문장은 이미 다른 데서 말하고 있다 —
    // "가족 모두가 함께 봐요"와 "사진만 올리면 알아서 채워드려요"는 기프티콘이 하나도
    // 없는 사람이 보는 첫 화면(FirstRunScreen)의 본문이고, 이미 쌓아둔 사람에게는
    // 지난 이야기다. 인사는 인사만 하면 된다.
    //
    // 아래 테두리를 걷고 배경을 매장 안내 띠와 같은 bg-accent로 맞췄다. 같은 자리에
    // 번갈아 서는 띠라 모양이 달라야 할 이유가 없다.
    <div className="flex w-full items-center gap-2.5 bg-accent py-[9px] pr-2.5 pl-[13px]">
      <PartyPopper className="size-[17px] shrink-0 text-primary" />
      <p className="m-0 min-w-0 flex-1 truncate text-[13.5px] font-semibold tracking-[-0.01em] text-foreground">
        모아콘에 오신 걸 환영해요
      </p>
      <button
        type="button"
        onClick={() => setShow(false)}
        aria-label="환영 인사 닫기"
        className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

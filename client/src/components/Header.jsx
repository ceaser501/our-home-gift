import { useState } from 'react';
import { ChevronDown, Users } from 'lucide-react';
import Logo from './Logo';
import FamilyMembersSheet from './FamilyMembersSheet';
import NotificationBell from './NotificationBell';
import FamilySwitcherSheet from './FamilySwitcherSheet';
import ProfileMenu from './ProfileMenu';
import { useFamily } from '../FamilyContext';
import { OWNER_TAG_PALETTE, memberTagColorClass } from '../utils/tagColor';

export default function Header() {
  const { family, members, user, joinRequests } = useFamily();
  const me = members.find((m) => m.user_id === user.id);
  const myName = me?.display_name || '나';

  const [membersOpen, setMembersOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  return (
    <header className="px-5 pt-[max(16px,env(safe-area-inset-top))] pb-2">
      <div className="flex items-center gap-2.5">
        <Logo className="size-7 shrink-0" />

        {/* 가족 이름을 누르면 보는 가족을 바꾼다(여러 가족에 속할 수 있다). */}
        <button
          type="button"
          onClick={() => setSwitcherOpen(true)}
          className="flex min-w-0 items-center gap-1 text-left"
        >
          <h1 className="m-0 truncate text-xl font-bold text-foreground">{family.name}</h1>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        </button>

        {/* 구성원 목록은 따로 뗀다. 이름은 "가족 바꾸기", 이 아이콘은 "누가 있나". */}
        <button
          type="button"
          onClick={() => setMembersOpen(true)}
          aria-label="가족 구성원 보기"
          className="relative mr-auto flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground"
        >
          <Users className="size-4.5" />
          {/* 참여를 기다리는 사람이 있으면 여기서만 알 수 있으니 점으로 표시한다.
              점 하나만으로는 헤더 구석이라 그냥 지나치게 돼서, 숨쉬듯 살짝 커졌다
              작아지기를 반복하게 했다. */}
          {joinRequests.length > 0 && (
            <span className="animate-dot-pulse absolute top-0.5 right-0.5 size-2 rounded-full bg-destructive ring-2 ring-background" />
          )}
        </button>

        {/* 가족이 무엇을 했는지(올림·사용·사용취소) 모아 보는 자리. 구성원 아이콘과
            내 이름 사이에 둔다 — 둘 다 "가족" 쪽 이야기라 한 덩어리로 읽힌다. */}
        <NotificationBell />

        {/* 내 이름 버튼: 설정·가족 나가기·로그아웃이 여기 모여 있다. */}
        <button
          type="button"
          onClick={() => setProfileOpen(true)}
          aria-label="내 메뉴"
          className={`flex size-8.5 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
            memberTagColorClass(me) ?? OWNER_TAG_PALETTE[0]
          }`}
        >
          {myName.slice(0, 3)}
        </button>
      </div>

      {/* 예전에는 여기 "가족 3명 · 초대코드 ABCD" 한 줄이 더 있었다. 둘 다 늘 보고
          있어야 하는 값이 아니다 — 가족 수는 궁금할 때 사람 아이콘을 누르면 되고,
          초대 코드는 누구를 부를 때만 필요하다. 그래서 둘 다 그 창 안으로 넣고
          헤더는 한 줄로 줄였다. 목록이 그만큼 위로 올라온다. */}

      {switcherOpen && <FamilySwitcherSheet onClose={() => setSwitcherOpen(false)} />}
      {membersOpen && <FamilyMembersSheet onClose={() => setMembersOpen(false)} />}
      {profileOpen && <ProfileMenu onClose={() => setProfileOpen(false)} />}
    </header>
  );
}

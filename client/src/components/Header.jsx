import { useState } from 'react';
import { ChevronDown, Users } from 'lucide-react';
import Logo from './Logo';
import TestDataMenu from './ResetAllDataButton';
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
    <header className="px-4 pt-[var(--safe-top)] pb-2.5">
      {/* 아이콘 셋을 오른쪽으로 모은다. 예전에는 구성원 아이콘만 이름 옆에 붙어 있어서
          "가족 이름 · 구성원"과 "알림 · 나" 두 무리로 갈렸는데, 셋 다 누르면 창이 뜨는
          같은 성격이라 한 덩어리로 두는 편이 손이 덜 헤맨다. */}
      <div className="flex items-center gap-1.5">
        {/* ⚠️ 테스트 전용. 로고를 0.8초 길게 누르면 테스트 도구가 열린다.
            출시 전에 이 감싸개를 풀고 Logo만 남긴다. */}
        <TestDataMenu familyId={family.id} ownerName={myName} userId={user.id}>
          <Logo className="size-7 shrink-0 rounded-lg" />
        </TestDataMenu>

        {/* 가족 이름을 누르면 보는 가족을 바꾼다(여러 가족에 속할 수 있다). */}
        <button
          type="button"
          onClick={() => setSwitcherOpen(true)}
          className="mr-auto flex min-w-0 items-center gap-0.5 pl-1 text-left"
        >
          <h1 className="m-0 truncate text-[19px] font-bold tracking-[-0.026em] text-foreground">{family.name}</h1>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground/70" strokeWidth={2.4} />
        </button>

        {/* 아이콘은 20px 그대로 두고 누를 자리만 42px로 넓힌다. 여백이 과녁을 만들고
            아이콘은 작게 — 헤더에 아이콘 셋이 크게 늘어서면 가족 이름이 밀린다. */}
        {/* 구성원 목록은 따로 뗀다. 이름은 "가족 바꾸기", 이 아이콘은 "누가 있나". */}
        <button
          type="button"
          onClick={() => setMembersOpen(true)}
          aria-label="가족 구성원 보기"
          className="relative flex size-[42px] shrink-0 items-center justify-center rounded-xl text-foreground/70"
        >
          <Users className="size-5" />
          {/* 참여를 기다리는 사람이 있으면 여기서만 알 수 있으니 점으로 표시한다.
              점 하나만으로는 헤더 구석이라 그냥 지나치게 돼서, 숨쉬듯 살짝 커졌다
              작아지기를 반복하게 했다. 그 숨쉬기는 그대로 둔다 — 자리만 옮긴다. */}
          {joinRequests.length > 0 && (
            <span className="animate-dot-pulse absolute top-2 right-2 size-2 rounded-full bg-destructive ring-[1.5px] ring-background" />
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
          className={`ml-0.5 flex size-[34px] shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
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

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import Logo from './Logo';
import FamilyMembersSheet from './FamilyMembersSheet';
import ProfileMenu from './ProfileMenu';
import { useFamily } from '../FamilyContext';
import { OWNER_TAG_PALETTE, memberTagColorClass } from '../utils/tagColor';

export default function Header() {
  const { family, members, user } = useFamily();
  const me = members.find((m) => m.user_id === user.id);
  const myName = me?.display_name || '나';

  const [membersOpen, setMembersOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  return (
    <header className="flex flex-col gap-1 px-5 pt-[max(16px,env(safe-area-inset-top))] pb-2">
      <div className="flex items-center gap-2.5">
        <Logo className="size-7 shrink-0" />

        {/* 가족 이름을 누르면 구성원 목록을 보여준다. */}
        <button
          type="button"
          onClick={() => setMembersOpen(true)}
          className="flex min-w-0 flex-1 items-center gap-1 text-left"
        >
          <h1 className="m-0 truncate text-xl font-bold text-foreground">{family.name}</h1>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        </button>

        {/* 내 이름 버튼: 설정·가족 나가기·로그아웃이 여기 모여 있다. */}
        <button
          type="button"
          onClick={() => setProfileOpen(true)}
          aria-label="내 메뉴"
          className={`flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
            memberTagColorClass(me) ?? OWNER_TAG_PALETTE[0]
          }`}
        >
          {myName.slice(0, 3)}
        </button>
      </div>

      <p className="m-0 pl-9.5 text-xs text-muted-foreground">
        가족 {members.length}명 · 초대코드 {family.invite_code}
      </p>

      {membersOpen && <FamilyMembersSheet onClose={() => setMembersOpen(false)} />}
      {profileOpen && <ProfileMenu onClose={() => setProfileOpen(false)} />}
    </header>
  );
}

import { useState } from 'react';
import { BellRing, ChevronRight, DoorOpen, FileText, LogOut, Megaphone, Receipt, Scale, ShieldCheck, UserRound, UserRoundX } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import ThemeToggle from './ThemeToggle';
import NotificationToggle from './NotificationToggle';
import UsageReportSheet from './UsageReportSheet';
import NoticesSheet from './NoticesSheet';
import AlertDialog from './AlertDialog';
import RenameSheet from './RenameSheet';
import { sendTestNotification } from '../api';
import { deleteAccount } from '../auth';
import { useFamily } from '../FamilyContext';
import { leaveFamily, renameMember } from '../family';
import { OWNER_TAG_PALETTE, memberTagColorClass } from '../utils/tagColor';

export default function ProfileMenu({ onClose }) {
  const { family, members, user, refetchFamily, refreshFamily, signOut } = useFamily();
  const me = members.find((m) => m.user_id === user.id);
  const myName = me?.display_name || '나';
  const isLastMember = members.length === 1;

  const [renameOpen, setRenameOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [noticesOpen, setNoticesOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [leaveAsking, setLeaveAsking] = useState(false);
  const [testing, setTesting] = useState(false);
  const [notice, setNotice] = useState(null);
  // 탈퇴는 되돌릴 수 없어서 두 번 묻는다. null → 'what'(무엇이 없어지는지) → 'sure'(정말로).
  const [deleteStep, setDeleteStep] = useState(null);
  const [deleting, setDeleting] = useState(false);

  async function handleTestNotification() {
    setTesting(true);
    try {
      const result = await sendTestNotification();
      if (result?.sent > 0) {
        setNotice({
          tone: 'success',
          title: '알림을 보냈어요',
          description: `'${result.gifticon}' 기준으로 보냈어요. 잠시 뒤 도착해요.`,
        });
      } else if (result?.reason === 'notifications_off') {
        setNotice({
          tone: 'info',
          title: '알림이 꺼져 있어요',
          description: '꺼둔 상태라 아무것도 보내지 않았어요. 위에서 켠 뒤 다시 눌러보세요.',
        });
      } else {
        setNotice({
          tone: 'info',
          title: '알릴 기프티콘이 없어요',
          description: '유효기한이 남아 있는 사용 전 기프티콘이 있어야 보낼 수 있어요.',
        });
      }
    } catch (err) {
      setNotice({ tone: 'warning', title: '알림 테스트에 실패했어요', description: err.message });
    } finally {
      setTesting(false);
    }
  }

  async function handleLeave() {
    setLeaveAsking(false);
    setLeaving(true);
    try {
      await leaveFamily(family.id);
      onClose();
      refetchFamily();
    } catch (err) {
      setNotice({
        tone: 'warning',
        title: '가족에서 나가지 못했어요',
        description: err.message,
      });
      setLeaving(false);
    }
  }

  async function handleDeleteAccount() {
    setDeleteStep(null);
    setDeleting(true);
    try {
      await deleteAccount();
      // 계정이 없어지면 로그인 상태도 풀려서 앱이 알아서 첫 화면으로 돌아간다.
      onClose();
    } catch (err) {
      setNotice({ tone: 'warning', title: '계정을 지우지 못했어요', description: err.message });
      setDeleting(false);
    }
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="max-h-[92dvh] gap-0 overflow-y-auto pb-[max(24px,env(safe-area-inset-bottom))]">
        <SheetHeader className="pr-14 pb-1">
          <SheetTitle>내 메뉴</SheetTitle>
        </SheetHeader>

        <div className="flex items-center gap-3 px-5 pt-2 pb-4">
          <span
            className={`flex size-11 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${
              memberTagColorClass(me) ?? OWNER_TAG_PALETTE[0]
            }`}
          >
            {myName.slice(0, 3)}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-base font-bold text-foreground">{myName}</span>
            <span className="truncate text-xs text-muted-foreground">{user.email}</span>
          </span>
        </div>

        <div className="flex flex-col px-5">
          <p className="m-0 pb-1 text-xs font-semibold text-muted-foreground">내 정보</p>
          <button
            type="button"
            onClick={() => setRenameOpen(true)}
            className="flex w-full items-center gap-3 px-1 py-3 text-left text-sm"
          >
            <UserRound className="size-4.5 text-muted-foreground" />
            <span className="flex-1 text-foreground">내 이름</span>
            <span className="max-w-[40%] truncate text-xs text-muted-foreground">{myName}</span>
            <ChevronRight className="size-4 text-muted-foreground" />
          </button>

          <p className="m-0 pt-3 pb-1 text-xs font-semibold text-muted-foreground">설정</p>
          <ThemeToggle asRow />
          <NotificationToggle asRow />

          {/* 실제 발송과 같은 길로 보내보는 테스트. 알림을 꺼뒀으면 아무것도 오지 않는다. */}
          <button
            type="button"
            onClick={handleTestNotification}
            disabled={testing}
            className="flex w-full items-center gap-3 px-1 py-3 text-left text-sm disabled:opacity-50"
          >
            <BellRing className="size-4.5 text-muted-foreground" />
            <span className="flex-1 text-foreground">알림 테스트</span>
            <span className="text-xs text-muted-foreground">{testing ? '보내는 중…' : '5초 뒤 도착'}</span>
          </button>

          {/* 배너를 닫아도 여기서는 늘 다시 볼 수 있어야 한다. 배너에만 있으면
              한 번 닫는 순간 그 공지를 다시 찾을 데가 없어진다. */}
          <p className="m-0 pt-3 pb-1 text-xs font-semibold text-muted-foreground">소식</p>
          <button
            type="button"
            onClick={() => setNoticesOpen(true)}
            className="flex w-full items-center gap-3 px-1 py-3 text-left text-sm"
          >
            <Megaphone className="size-4.5 text-muted-foreground" />
            <span className="flex-1 text-foreground">공지사항</span>
            <ChevronRight className="size-4 text-muted-foreground" />
          </button>

          <p className="m-0 pt-3 pb-1 text-xs font-semibold text-muted-foreground">기록</p>
          <button
            type="button"
            onClick={() => setReportOpen(true)}
            className="flex w-full items-center gap-3 px-1 py-3 text-left text-sm"
          >
            <Receipt className="size-4.5 text-muted-foreground" />
            <span className="flex-1 text-foreground">사용 내역</span>
            <ChevronRight className="size-4 text-muted-foreground" />
          </button>

          {/* 스토어 심사에서 앱 안에 방침 링크가 있는지를 본다. 그것과 별개로, 사진이 AI에
              전송된다는 사실을 알고 싶은 사람이 찾아볼 자리는 있어야 한다. */}
          <p className="m-0 pt-3 pb-1 text-xs font-semibold text-muted-foreground">약관</p>
          <a
            href={`${import.meta.env.BASE_URL}privacy.html`}
            target="_blank"
            rel="noreferrer"
            className="flex w-full items-center gap-3 px-1 py-3 text-left text-sm text-foreground no-underline"
          >
            <ShieldCheck className="size-4.5 text-muted-foreground" />
            <span className="flex-1">개인정보처리방침</span>
            <ChevronRight className="size-4 text-muted-foreground" />
          </a>
          <a
            href={`${import.meta.env.BASE_URL}terms.html`}
            target="_blank"
            rel="noreferrer"
            className="flex w-full items-center gap-3 px-1 py-3 text-left text-sm text-foreground no-underline"
          >
            <FileText className="size-4.5 text-muted-foreground" />
            <span className="flex-1">이용약관</span>
            <ChevronRight className="size-4 text-muted-foreground" />
          </a>
          <a
            href={`${import.meta.env.BASE_URL}licenses.html`}
            target="_blank"
            rel="noreferrer"
            className="flex w-full items-center gap-3 px-1 py-3 text-left text-sm text-foreground no-underline"
          >
            <Scale className="size-4.5 text-muted-foreground" />
            <span className="flex-1">오픈소스 및 기술 정보</span>
            <ChevronRight className="size-4 text-muted-foreground" />
          </a>

          {/* 문의를 받았을 때 "어떤 코드를 쓰고 계신가"를 물어볼 수 있어야 한다.
              누를 것이 없는 줄이라 아이콘 없이 옅게 적어둔다. */}
          <p className="m-0 px-1 py-3 text-xs text-muted-foreground">
            버전 {__APP_VERSION__} ({__BUILD_DATE__})
          </p>

          {/* 자주 쓰는 것(로그아웃)을 위에 두고, 되돌리기 어려운 것 둘은 아래로 내려
              구분선으로 떼어놓는다. 손가락이 미끄러져도 위험한 쪽에 먼저 닿지 않도록. */}
          <div className="my-2 h-px bg-border" />

          <button
            type="button"
            onClick={() => signOut()}
            className="flex w-full items-center gap-3 px-1 py-3 text-left text-sm text-foreground"
          >
            <LogOut className="size-4.5 text-muted-foreground" />
            <span className="flex-1">로그아웃</span>
          </button>

          <div className="my-2 h-px bg-border" />

          <button
            type="button"
            onClick={() => setLeaveAsking(true)}
            disabled={leaving}
            className="flex w-full items-center gap-3 px-1 py-3 text-left text-sm text-destructive disabled:opacity-50"
          >
            <DoorOpen className="size-4.5" />
            <span className="flex-1">{leaving ? '나가는 중…' : '가족 나가기'}</span>
            <span className="text-xs text-muted-foreground">이 가족만</span>
          </button>

          <button
            type="button"
            onClick={() => setDeleteStep('what')}
            disabled={deleting}
            className="flex w-full items-center gap-3 px-1 py-3 text-left text-sm text-destructive disabled:opacity-50"
          >
            <UserRoundX className="size-4.5" />
            <span className="flex-1">{deleting ? '지우는 중…' : '계정 삭제'}</span>
            <span className="text-xs text-muted-foreground">계정까지</span>
          </button>
        </div>

        {renameOpen && (
          <RenameSheet
            title="내 이름 바꾸기"
            label="내 이름"
            description="기프티콘에 적힌 받은 사람·사용한 사람 이름도 새 이름으로 함께 바뀌어요."
            initialValue={myName}
            placeholder="예: 태수"
            onSubmit={async (name) => {
              await renameMember(family.id, name);
              await refreshFamily();
            }}
            onClose={() => setRenameOpen(false)}
          />
        )}

        {reportOpen && <UsageReportSheet onClose={() => setReportOpen(false)} />}

        {noticesOpen && <NoticesSheet onClose={() => setNoticesOpen(false)} />}

        {leaveAsking && (
          <AlertDialog
            tone="danger"
            title={`'${family.name}'에서 나갈까요?`}
            // 마지막 한 사람이 나가면 그 가족은 통째로 사라진다. 결과가 아예 다르므로
            // 같은 문구를 쓰면 안 된다("다시 참여하면 되살아난다"가 거짓말이 된다).
            description={isLastMember ? '나 말고 아무도 없어서, 나가면 이 가족이 없어져요.' : undefined}
            details={
              isLastMember
                ? ['이 가족의 기프티콘이 사진까지 지워져요', '되돌릴 수 없어요']
                : ['내 기프티콘은 남은 가족에게 안 보여요', '지워지진 않아서, 다시 참여하면 되살아나요']
            }
            confirmLabel="나가기"
            onConfirm={handleLeave}
            onClose={() => setLeaveAsking(false)}
          />
        )}

        {deleteStep === 'what' && (
          <AlertDialog
            tone="danger"
            title="계정을 삭제할까요?"
            description={"'가족 나가기'와 달라요.\n계정이 없어져서 다시 로그인할 수 없어요."}
            details={[
              '속한 가족에서 모두 빠져요',
              '내가 올린 기프티콘은 사진까지 지워져요',
              '나 혼자였던 가족은 없어져요',
            ]}
            confirmLabel="계속"
            onConfirm={() => setDeleteStep('sure')}
            onClose={() => setDeleteStep(null)}
          />
        )}

        {deleteStep === 'sure' && (
          <AlertDialog
            tone="danger"
            title="정말 탈퇴할까요?"
            description="한 번 지우면 되돌릴 수 없어요."
            confirmLabel="탈퇴하기"
            onConfirm={handleDeleteAccount}
            onClose={() => setDeleteStep(null)}
          />
        )}

        {notice && <AlertDialog {...notice} onClose={() => setNotice(null)} />}
      </SheetContent>
    </Sheet>
  );
}

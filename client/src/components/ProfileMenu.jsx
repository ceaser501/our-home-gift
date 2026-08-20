import { useState } from 'react';
import { BellRing, ChevronRight, DoorOpen, FileText, LogOut, Megaphone, Receipt, Scale, ScanSearch, ShieldCheck, UserRound, UserRoundX } from 'lucide-react';
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
import useBackClose from '../utils/useBackClose';
import { isGalleryScanSupported, isAutoScanOn, setAutoScanOn } from '../utils/gallery';
import { isPushSupported } from '../push';

export default function ProfileMenu({ onClose }) {
  // 뒤로가기로 이 창을 닫는다. 안 그러면 설치해서 쓸 때 앱이 통째로 꺼진다.
  useBackClose(onClose);
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
  // 갤러리 자동 스캔은 앱에서만 있다. 브라우저에는 폴더를 볼 방법이 없어서 줄 자체를 감춘다.
  const [scanSupported] = useState(() => isGalleryScanSupported());
  const [autoScan, setAutoScan] = useState(() => isAutoScanOn());
  // 알림 테스트 줄에 지금 상태를 같이 보여준다. 꺼둔 상태에서 "5초 뒤 도착"이라고
  // 적혀 있으면 눌러도 아무것도 안 오는 이유를 알 수가 없다.
  // 값은 바로 위 NotificationToggle이 알려준다 — 같은 걸 두 군데서 물어보면 어긋난다.
  const [pushOn, setPushOn] = useState(false);

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
      // 서버가 준 이유를 그대로 싣는다. 짧게 다듬지 않는다 — 여기 적힌 한 줄이 고칠
      // 자리를 가리키는 유일한 단서다.
      setNotice({
        tone: 'warning',
        title: '계정을 지우지 못했어요',
        description: err.message,
        details: ['이 문구를 그대로 알려주시면 원인을 찾을 수 있어요'],
      });
      setDeleting(false);
    }
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="max-h-[92dvh] gap-0 overflow-y-auto pb-[var(--safe-bottom)]">
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
          <NotificationToggle asRow onChange={setPushOn} />

          {/* 켜두면 앱을 열 때 바로 찾아준다. 받아둔 기프티콘을 넣는 게 이 앱에 들어오는
              이유라, 그걸 매번 눌러서 시작하게 할 이유가 없다. 다만 사진을 보는 일이라
              기본은 꺼두고 사용자가 켜게 한다.

              생김새는 위아래 줄에 맞춘다. 여기만 체크박스였는데, 나란히 놓인 설정들이
              서로 다른 방식으로 켜지고 꺼지면 어느 게 켜진 건지 한눈에 읽히지 않는다. */}
          {scanSupported && (
            <button
              type="button"
              onClick={() => {
                setAutoScan(!autoScan);
                setAutoScanOn(!autoScan);
              }}
              className="flex w-full items-center gap-3 px-1 py-3 text-left text-sm"
            >
              <ScanSearch className="size-4.5 shrink-0 text-muted-foreground" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-foreground">기프티콘 자동 찾기</span>
                <span className="text-xs break-keep text-muted-foreground">앱을 열 때 갤러리에서 찾아드려요</span>
              </span>
              <span className={autoScan ? 'shrink-0 text-xs font-semibold text-primary' : 'shrink-0 text-xs text-muted-foreground'}>
                {autoScan ? '켜짐' : '꺼짐'}
              </span>
            </button>
          )}

          {/* 실제 발송과 같은 길로 보내보는 테스트. 항상 그린다.

              한때 isPushSupported()로 감쌌다가 앱에서 통째로 사라졌다(v0.0.79). 앱
              웹뷰에는 PushManager가 없어서 그 검사가 거짓이다 — 그런데 알림 자체는
              같은 폰의 브라우저(PWA) 구독으로 도착하므로, 앱에서 눌러도 테스트는 뜻이
              있다. 보낼 곳이 정말 없으면 서버가 "꺼져 있어요"라고 정확히 답해준다.

              켜기 줄이 있는 환경(웹)에서만 켜짐과 묶는다. 꺼진 걸 알면서 보내게 두면
              "눌렀는데 안 와요"가 되고, 위에 켜는 줄이 있으니 그리로 보낸다.
              시험은 test/notifyMenu.test.jsx — 두 환경을 다 그려본다. */}
          <button
            type="button"
            onClick={handleTestNotification}
            disabled={testing || (isPushSupported() && !pushOn)}
            className="flex w-full items-center gap-3 px-1 py-3 text-left text-sm disabled:opacity-50"
          >
            <BellRing className="size-4.5 shrink-0 text-muted-foreground" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-foreground">알림 테스트</span>
              {isPushSupported() && !pushOn && (
                <span className="text-xs break-keep text-muted-foreground">위에서 알림을 켜야 보낼 수 있어요</span>
              )}
            </span>
            <span className="shrink-0 text-xs font-semibold text-primary">{testing ? '보내는 중…' : '보내기'}</span>
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

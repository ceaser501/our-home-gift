import { useState } from 'react';
import { DoorOpen, FileText, LogOut, Megaphone, Receipt, Scale, ScanSearch, ShieldCheck, UserRoundX } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { SettingLinkRow, SettingSection, SettingSwitchRow } from './SettingRow';
import ThemeToggle from './ThemeToggle';
import NotificationToggle from './NotificationToggle';
import UsageReportSheet from './UsageReportSheet';
import NoticesSheet from './NoticesSheet';
import AlertDialog from './AlertDialog';
import RenameSheet from './RenameSheet';
import { deleteAccount } from '../auth';
import { useFamily } from '../FamilyContext';
import { leaveFamily, renameMember } from '../family';
import { OWNER_TAG_PALETTE, memberTagColorClass } from '../utils/tagColor';
import useBackClose from '../utils/useBackClose';
import { isGalleryScanSupported, isAutoScanOn, setAutoScanOn } from '../utils/gallery';

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
  const [notice, setNotice] = useState(null);
  // 탈퇴는 되돌릴 수 없어서 두 번 묻는다. null → 'what'(무엇이 없어지는지) → 'sure'(정말로).
  const [deleteStep, setDeleteStep] = useState(null);
  const [deleting, setDeleting] = useState(false);
  // 갤러리 자동 스캔은 앱에서만 있다. 브라우저에는 폴더를 볼 방법이 없어서 줄 자체를 감춘다.
  const [scanSupported] = useState(() => isGalleryScanSupported());
  const [autoScan, setAutoScan] = useState(() => isAutoScanOn());
  /* 알림 테스트와 짝인 것들. 줄을 접어둔 동안 함께 접어둔다(아래 블록 참고).
  const [testing, setTesting] = useState(false);
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
          description: '사용기한이 남아 있는 사용 전 기프티콘이 있어야 보낼 수 있어요.',
        });
      }
    } catch (err) {
      setNotice({ tone: 'warning', title: '알림 테스트에 실패했어요', description: err.message });
    } finally {
      setTesting(false);
    }
  }
  */

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
        <SheetHeader className="px-[18px] pr-14 pb-3">
          <SheetTitle className="text-[19px] font-bold tracking-[-0.026em]">내 메뉴</SheetTitle>
        </SheetHeader>

        {/* 이름은 여기 크게 적혀 있는데 아래 '내 정보 · 내 이름' 줄에서 또 보여주고 있었다.
            같은 값이 한 화면에 두 번 나온 셈이라, 그 줄을 걷고 바꾸는 길만 이 카드로 들인다.
            구역이 하나 줄었다. */}
        <div className="mx-[18px] mb-3.5 flex items-center gap-3 rounded-[14px] bg-secondary/60 px-3.5 py-[13px]">
          <span
            className={`flex size-[46px] shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${
              memberTagColorClass(me) ?? OWNER_TAG_PALETTE[0]
            }`}
          >
            {myName.slice(0, 3)}
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-[17px] font-bold tracking-[-0.02em] text-foreground">{myName}</span>
            <span className="truncate text-[13px] font-medium text-muted-foreground">{user.email}</span>
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setRenameOpen(true)}
            className="h-[38px] shrink-0 rounded-[11px] px-[13px] text-[13.5px] font-semibold"
          >
            이름 바꾸기
          </Button>
        </div>

        {/* 구역을 여섯에서 셋으로 묶었다. '소식'과 '기록'은 각각 한 줄뿐이라 제목이 내용보다
            컸다. 줄 사이는 2px로 붙이고 구역 사이만 20px로 벌린다 — 눈이 쉬는 곳은 줄
            사이가 아니라 구역과 구역 사이다. */}
        <div className="flex flex-col gap-5 px-[18px]">
          <SettingSection label="설정">
            <ThemeToggle asRow />
            <NotificationToggle asRow />

            {/* 켜두면 앱을 열 때 바로 찾아준다. 받아둔 기프티콘을 넣는 게 이 앱에 들어오는
                이유라, 그걸 매번 눌러서 시작하게 할 이유가 없다. 다만 사진을 보는 일이라
                기본은 꺼두고 사용자가 켜게 한다. */}
            {scanSupported && (
              <SettingSwitchRow
                icon={ScanSearch}
                label="기프티콘 자동 찾기"
                hint="앱을 열 때 갤러리에서 찾아드려요"
                on={autoScan}
                onToggle={() => {
                  setAutoScan(!autoScan);
                  setAutoScanOn(!autoScan);
                }}
              />
            )}
          </SettingSection>

          {/* 배너를 닫아도 여기서는 늘 다시 볼 수 있어야 한다. 배너에만 있으면
              한 번 닫는 순간 그 공지를 다시 찾을 데가 없어진다. */}
          <SettingSection label="기록과 소식">
            <SettingLinkRow icon={Receipt} label="사용 내역" onClick={() => setReportOpen(true)} />
            <SettingLinkRow icon={Megaphone} label="공지사항" onClick={() => setNoticesOpen(true)} />
          </SettingSection>

          {/* 스토어 심사에서 앱 안에 방침 링크가 있는지를 본다. 그것과 별개로, 사진이 AI에
              전송된다는 사실을 알고 싶은 사람이 찾아볼 자리는 있어야 한다.
              셋 다 브라우저로 나가는 길이라 오른쪽 표시가 ↗다. */}
          <SettingSection label="약관과 정보">
            <SettingLinkRow
              icon={ShieldCheck}
              label="개인정보처리방침"
              href={`${import.meta.env.BASE_URL}privacy.html`}
              returnTo="profile"
            />
            <SettingLinkRow
              icon={FileText}
              label="이용약관"
              href={`${import.meta.env.BASE_URL}terms.html`}
              returnTo="profile"
            />
            <SettingLinkRow
              icon={Scale}
              label="오픈소스 및 기술 정보"
              href={`${import.meta.env.BASE_URL}licenses.html`}
              returnTo="profile"
            />
          </SettingSection>

          {/* 로그아웃을 목록에서 빼냈다.
              예전에는 열세 번째 줄이라 끝까지 내려야 나왔고, 나와도 바로 위 '이용약관'과
              똑같이 생겨서 눈에 걸리지 않았다. 버튼은 모양이 달라서 한눈에 찾힌다.

              폭은 다 쓰되 높이는 44px이다. 48px로 뒀더니 화면 아래에서 유독 두꺼워
              보였다 — 이 버튼이 해야 하는 일은 '찾히는 것'이지 '제일 커 보이는 것'이
              아니다. 찾히는 값은 이미 모양(테두리 버튼)이 지고 있다. */}
          <Button
            type="button"
            variant="outline"
            onClick={() => signOut()}
            className="mt-1 h-11 w-full rounded-xl text-[15px] font-semibold text-foreground/80"
          >
            <LogOut className="size-[18px] text-muted-foreground" />
            로그아웃
          </Button>

          {/* 되돌릴 수 없는 둘은 목록 줄이 아니라 박스 안 버튼이다.
              줄이면 스크롤하다 손가락이 스쳐도 열린다. 눌러야 할 자리를 따로 만들면
              지나가다 닿을 일이 없다.

              오른쪽에 '이 가족만 / 계정까지'라고 두 단어만 적어뒀던 것을 문장으로 풀었다.
              두 단어로는 무엇이 다른지가 전달되지 않는다.

              제목은 박스 밖으로 냈다. 안에 붉은 글자로 있을 때는 이 구역만 다른 물건처럼
              보였다 — 위의 '기록과 소식'·'약관과 정보'와 같은 자리에 같은 모양으로 두면
              화면이 한 줄로 읽힌다. 붉은색은 아래 두 버튼이 이미 지고 있어서, 제목까지
              붉으면 무엇이 실제로 눌리는 것인지가 흐려진다. */}
          <div className="mt-0.5 mb-1 flex flex-col gap-0.5">
            <p className="m-0 pb-1 text-[13px] font-bold tracking-[-0.01em] text-muted-foreground">
              조심해서 눌러주세요
            </p>
            <div className="flex flex-col gap-[11px] rounded-[14px] border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="m-0 text-[15px] font-semibold tracking-[-0.015em] text-foreground">가족 나가기</p>
                  <p className="mt-px mb-0 text-[13px] font-medium break-keep text-muted-foreground">
                    {family.name}에서만 빠져요
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setLeaveAsking(true)}
                  disabled={leaving}
                  className="h-10 shrink-0 rounded-[11px] border-destructive/30 px-3.5 text-sm font-semibold text-destructive/85"
                >
                  {leaving ? '나가는 중…' : '나가기'}
                </Button>
              </div>

              <div className="h-px bg-destructive/15" />

              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="m-0 text-[15px] font-semibold tracking-[-0.015em] text-foreground">계정 삭제</p>
                  <p className="mt-px mb-0 text-[13px] font-medium break-keep text-muted-foreground">
                    모든 가족과 기프티콘이 지워져요
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setDeleteStep('what')}
                  disabled={deleting}
                  className="h-10 shrink-0 rounded-[11px] border-destructive/30 px-3.5 text-sm font-semibold text-destructive/85"
                >
                  {deleting ? '지우는 중…' : '삭제'}
                </Button>
              </div>
            </div>
          </div>

          {/* 버전은 화면 맨 끝이다. 누를 것도 없고 알아야 할 일도 없는 값이라, 무엇보다
              뒤에 있어야 한다. 남겨두는 이유는 하나뿐 — 문의를 받았을 때 "어떤 코드를
              쓰고 계신가"를 물어볼 수 있어야 해서다. */}
          <p className="m-0 pb-1 text-center text-[12.5px] font-medium tabular-nums text-muted-foreground">
            버전 {__APP_VERSION__} ({__BUILD_DATE__})
          </p>
        </div>

        {renameOpen && (
          <RenameSheet
            title="내 이름 바꾸기"
            label="가족에게 보이는 이름"
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
            icon={DoorOpen}
            title={`'${family.name}'에서 나갈까요?`}
            // 마지막 한 사람이 나가면 그 가족은 통째로 사라진다. 결과가 아예 다르므로
            // 같은 문구를 쓰면 안 된다("다시 참여하면 되살아난다"가 거짓말이 된다).
            // 두 마디라 두 줄로 끊는다. '나 말고 아무도 없어서'가 까닭이고 '나가면 이
            // 가족이 없어져요'가 결과인데, 한 줄로 흘리면 어디서 숨을 쉬는지가 애매하다.
            // (AlertDialog의 description은 whitespace-pre-line이라 \n이 그대로 산다.)
            description={isLastMember ? '나 말고 아무도 없어서,\n나가면 이 가족이 없어져요.' : undefined}
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
            icon={UserRoundX}
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
            icon={UserRoundX}
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

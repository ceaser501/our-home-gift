import { useRef, useState } from 'react';
import { DatabaseBackup, PackagePlus, Trash2 } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { deleteSampleGifticons, resetAllData } from '../api';
import { SAMPLE_PREFIX, ensureSampleGifticon, setSampleOptOut } from '../sampleData';
import AlertDialog from './AlertDialog';

// ⚠️ 테스트 전용입니다. 실사용 배포 전에 이 파일을 지우고, Header에서 로고를 감싼 곳도
// 풀어주세요. supabase/functions/reset-all-data도 같이 지웁니다.
//
// 눌러야 할 것이 화면에 보이지 않습니다. 첫 화면과 목록 화면을 스크린샷으로 찍어야 하는데
// "전체 데이터 초기화 (테스트)" 같은 것이 붙어 있으면 그대로 사진에 남기 때문입니다.
// 대신 목록 화면 왼쪽 위 모아콘 로고를 0.8초 길게 누르면 열립니다.
//
// 여는 자리는 이 한 곳뿐입니다. 로그인 화면 로고에도 달아봤는데, 그 화면은 로그아웃
// 상태에서만 보여서 목데이터를 넣을 가족이 없었습니다. 일괄삭제는 로그인한 채로 눌러도
// 되고(누르면 계정이 지워지며 저절로 로그인 화면으로 나간다), 그러면 세 가지가 모두
// 한자리에서 끝납니다.
//
// 여는 방법을 두 번 바꿨습니다. 세 번 두드리기 → 오른쪽 위 구석 길게 누르기 → 로고 길게
// 누르기. 앞의 둘은 "화면의 어느 자리"를 좌표로 재서 판단했는데, 그 자리가 비어 있는지는
// 화면마다 다르고 노치·상태바·안전영역까지 얽혀서 실제 폰에서 잘 안 잡혔습니다.
// 로고는 실재하는 요소라 그 위에서 눌렸는지를 브라우저가 직접 알려줍니다 — 잴 것이 없습니다.
const HOLD_MS = 800;
// 가만히 눌러도 손가락은 미세하게 흔들린다. 조금이라도 움직이면 취소하게 두면 0.8초를
// 버틸 수가 없다. 로고를 벗어날 만큼(pointerleave) 움직이면 어차피 취소되므로 여기서는
// 넉넉하게 둔다.
const MOVE_TOLERANCE = 16;

export default function TestDataMenu({ familyId, ownerName, userId, children }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [running, setRunning] = useState('');
  // 되돌릴 수 없는 작업이라 확인을 두 번 받는다. 'first' → 'second' 순서로 물어본다.
  const [asking, setAsking] = useState(null);
  const [notice, setNotice] = useState(null);
  const timerRef = useRef(null);
  const startRef = useRef(null);

  const enabled = Boolean(import.meta.env.VITE_RESET_TOKEN);

  function startHold(e) {
    if (!enabled) return;
    startRef.current = { x: e.clientX, y: e.clientY };
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setMenuOpen(true), HOLD_MS);
  }

  function cancelHold() {
    clearTimeout(timerRef.current);
    timerRef.current = null;
    startRef.current = null;
  }

  function onMove(e) {
    const start = startRef.current;
    if (!start) return;
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > MOVE_TOLERANCE) cancelHold();
  }


  if (!enabled) return children ?? null;

  async function handleReset() {
    setAsking(null);
    setRunning('reset');
    try {
      const result = await resetAllData();
      const d = result?.deleted || {};
      setNotice({
        tone: 'success',
        title: '초기화했어요',
        description: `기프티콘 ${d.gifticons ?? 0}건 · 가족 ${d.families ?? 0}개 · 계정 ${d.users ?? 0}개를 지웠어요.`,
        reloadOnClose: true,
      });
      localStorage.removeItem('install-prompt-dismissed');
    } catch (err) {
      setNotice({ tone: 'warning', title: '초기화에 실패했어요', description: err.message });
    } finally {
      setRunning('');
    }
  }

  async function handleRemoveSamples() {
    setAsking(null);
    setRunning('remove');
    try {
      const count = await deleteSampleGifticons(familyId, SAMPLE_PREFIX);
      // 앱은 열릴 때마다 빠진 샘플을 자동으로 채운다. 그대로 두면 지워도 새로고침 한 번에
      // 되살아나므로, 지웠다는 뜻을 기기에 남겨 자동 채우기를 멈춘다.
      setSampleOptOut(true);
      setNotice({
        tone: 'success',
        title: '목데이터를 지웠어요',
        description: count > 0 ? `기프티콘 ${count}건을 지웠어요.` : '지울 목데이터가 없었어요.',
        reloadOnClose: true,
      });
    } catch (err) {
      setNotice({ tone: 'warning', title: '지우지 못했어요', description: err.message });
    } finally {
      setRunning('');
    }
  }

  // 이미 있는 것은 건너뛰고 빠진 것만 채운다. 그래서 여러 번 눌러도 케이스마다 하나씩만 남는다.
  async function handleAddSamples() {
    setMenuOpen(false);
    setRunning('add');
    try {
      // 지웠다는 표시를 풀고 넣는다. force를 주는 이유는 이 표시가 풀리는 것과
      // 넣는 것이 같은 순간에 일어나야 하기 때문이다.
      setSampleOptOut(false);
      const added = await ensureSampleGifticon({ familyId, ownerName, userId, force: true });
      setNotice({
        tone: 'success',
        title: added ? '목데이터를 넣었어요' : '이미 다 있어요',
        description: added
          ? '기한 임박·만료·기한 미입력·금액권까지 케이스마다 하나씩 들어갔어요.'
          : '케이스마다 하나씩 이미 들어가 있어요. 다시 넣으려면 먼저 지워주세요.',
        reloadOnClose: added,
      });
    } catch (err) {
      setNotice({ tone: 'warning', title: '넣지 못했어요', description: err.message });
    } finally {
      setRunning('');
    }
  }

  function closeNotice() {
    const shouldReload = notice?.reloadOnClose;
    setNotice(null);
    if (shouldReload) window.location.reload();
  }

  const items = [
    {
      key: 'reset',
      icon: DatabaseBackup,
      label: '데이터 일괄삭제 (가족/사용자 전부)',
      hint: '가족·구성원·기프티콘·가입계정까지 모두 지워요.',
      danger: true,
      show: true,
      onClick: () => {
        setMenuOpen(false);
        setAsking('reset-first');
      },
    },
    {
      key: 'remove',
      icon: Trash2,
      label: '목데이터 삭제',
      hint: `번호가 ${SAMPLE_PREFIX}로 시작하는 샘플만 지워요. 직접 올린 건 그대로 둡니다.`,
      danger: true,
      onClick: () => {
        setMenuOpen(false);
        setAsking('remove');
      },
    },
    {
      key: 'add',
      icon: PackagePlus,
      label: '목데이터 추가',
      hint: '케이스마다 하나씩 넣어요. 이미 있는 건 건너뜁니다.',
      onClick: handleAddSamples,
    },
  ];

  return (
    <>
      {/* 로고를 감싸는 자리. 길게 누르는 동안 브라우저가 끼어들지 않게 해둔다 —
          안드로이드는 이미지 저장 메뉴를, iOS는 확대·복사 팝업을 띄우려 든다.
          touch-none은 이 안에서 스크롤 제스처를 브라우저에 넘기지 않게 해서, 로고를
          누른 채 있어도 목록이 딸려 움직이지 않게 한다. */}
      <span
        onPointerDown={startHold}
        onPointerUp={cancelHold}
        onPointerCancel={cancelHold}
        onPointerLeave={cancelHold}
        onPointerMove={onMove}
        onContextMenu={(e) => e.preventDefault()}
        className="inline-flex touch-none select-none [-webkit-touch-callout:none]"
      >
        {children}
      </span>

      {/* 무엇을 하는 중인지 화면 어딘가에는 보여야 한다. 눌렀는지 알 수 없으면 또 누른다. */}
      {running && (
        <div className="fixed inset-x-0 bottom-6 z-50 flex justify-center">
          <p className="m-0 rounded-full bg-foreground px-4 py-2 text-xs font-semibold text-background">처리 중…</p>
        </div>
      )}

      {menuOpen && (
        <Sheet open onOpenChange={(open) => !open && setMenuOpen(false)}>
          <SheetContent className="gap-0 pb-[max(24px,env(safe-area-inset-bottom))]">
            <SheetHeader className="pr-14 pb-1">
              <SheetTitle>테스트 도구</SheetTitle>
            </SheetHeader>
            <div className="flex flex-col px-5 pt-2">
              {items.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={item.onClick}
                  className="flex w-full items-start gap-3 border-b border-border px-1 py-3.5 text-left last:border-b-0"
                >
                  <item.icon className={`mt-0.5 size-4.5 shrink-0 ${item.danger ? 'text-destructive' : 'text-muted-foreground'}`} />
                  <span className="flex min-w-0 flex-col">
                    <span className={`text-sm font-semibold ${item.danger ? 'text-destructive' : 'text-foreground'}`}>
                      {item.label}
                    </span>
                    <span className="mt-0.5 text-xs break-keep text-muted-foreground">{item.hint}</span>
                  </span>
                </button>
              ))}
              <p className="m-0 py-4 text-center text-[11px] break-keep text-muted-foreground">
                테스트 중에만 있는 창이에요. 출시할 때 없어집니다.
              </p>
            </div>
          </SheetContent>
        </Sheet>
      )}

      {/* 계정까지 지우는 건 되돌릴 수 없어서 두 번 묻는다. */}
      {asking === 'reset-first' && (
        <AlertDialog
          tone="danger"
          title="정말 초기화할까요?"
          description="모든 가족·기프티콘·가입계정이 삭제돼요."
          confirmLabel="초기화"
          onConfirm={() => setAsking('reset-second')}
          onClose={() => setAsking(null)}
        />
      )}

      {asking === 'reset-second' && (
        <AlertDialog
          tone="danger"
          title="되돌릴 수 없어요"
          description="그래도 진행할까요?"
          confirmLabel="진행"
          onConfirm={handleReset}
          onClose={() => setAsking(null)}
        />
      )}

      {/* 목데이터는 다시 넣으면 되므로 한 번만 묻는다. */}
      {asking === 'remove' && (
        <AlertDialog
          tone="danger"
          title="목데이터를 지울까요?"
          description="샘플 기프티콘만 지워요. 직접 올린 것은 그대로 있어요."
          confirmLabel="지우기"
          onConfirm={handleRemoveSamples}
          onClose={() => setAsking(null)}
        />
      )}

      {notice && (
        <AlertDialog tone={notice.tone} title={notice.title} description={notice.description} onClose={closeNotice} />
      )}
    </>
  );
}

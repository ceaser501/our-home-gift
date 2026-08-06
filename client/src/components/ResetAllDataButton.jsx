import { useEffect, useRef, useState } from 'react';
import { resetAllData } from '../api';
import AlertDialog from './AlertDialog';

// ⚠️ 테스트 전용입니다. 처음부터 다시 테스트하고 싶을 때 가족/구성원/기프티콘/
// 이미지/가입계정을 전부 지웁니다. 실사용 배포 전에는 이 컴포넌트를 LoginScreen에서
// 빼고 supabase/functions/reset-all-data도 삭제하세요.
//
// 보이는 버튼이 없습니다. 첫 화면을 스크린샷으로 찍어야 하는데 "전체 데이터 초기화
// (테스트)"가 밑에 붙어 있으면 그대로 사진에 남기 때문입니다. 대신 화면 오른쪽 위
// 구석을 빠르게 세 번 누르면 열립니다.
//
// 덮어씌우는 판을 깔지 않고 좌표만 본다. 그 자리에는 알림 배너의 닫기(✕)처럼 진짜
// 눌러야 할 것이 있을 수 있는데, 판을 깔면 그것들이 안 눌린다.
const CORNER = 80; // 오른쪽 위에서 이만큼 안쪽까지를 구석으로 친다
const TAP_WINDOW_MS = 1500; // 이 안에 세 번 눌러야 한다(지나가다 눌린 것과 구분)

export default function ResetAllDataButton() {
  const [running, setRunning] = useState(false);
  // 되돌릴 수 없는 작업이라 확인을 두 번 받는다. 'first' → 'second' 순서로 물어본다.
  const [asking, setAsking] = useState(null);
  const [notice, setNotice] = useState(null);
  const taps = useRef([]);

  const enabled = Boolean(import.meta.env.VITE_RESET_TOKEN);

  useEffect(() => {
    if (!enabled) return undefined;

    function onPointerDown(e) {
      const inCorner = e.clientX > window.innerWidth - CORNER && e.clientY < CORNER;
      if (!inCorner) {
        taps.current = [];
        return;
      }
      const now = Date.now();
      taps.current = [...taps.current, now].filter((t) => now - t < TAP_WINDOW_MS);
      if (taps.current.length >= 3) {
        taps.current = [];
        setAsking('first');
      }
    }

    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [enabled]);

  if (!enabled) return null;

  async function handleReset() {
    setAsking(null);
    setRunning(true);
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
      setRunning(false);
    }
  }

  function closeNotice() {
    const shouldReload = notice?.reloadOnClose;
    setNotice(null);
    if (shouldReload) window.location.reload();
  }

  return (
    <>
      {/* 지우는 중에는 화면에 아무 표시가 없으면 눌렸는지 알 수 없어서, 그동안만 알려준다. */}
      {running && (
        <p className="m-0 text-xs text-muted-foreground">초기화 중…</p>
      )}

      {asking === 'first' && (
        <AlertDialog
          tone="danger"
          title="정말 초기화할까요?"
          description="모든 가족·기프티콘·가입계정이 삭제돼요."
          confirmLabel="초기화"
          onConfirm={() => setAsking('second')}
          onClose={() => setAsking(null)}
        />
      )}

      {asking === 'second' && (
        <AlertDialog
          tone="danger"
          title="되돌릴 수 없어요"
          description="그래도 진행할까요?"
          confirmLabel="진행"
          onConfirm={handleReset}
          onClose={() => setAsking(null)}
        />
      )}

      {notice && (
        <AlertDialog
          tone={notice.tone}
          title={notice.title}
          description={notice.description}
          onClose={closeNotice}
        />
      )}
    </>
  );
}

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { resetAllData } from '../api';
import AlertDialog from './AlertDialog';

// ⚠️ 테스트 전용 버튼입니다. 처음부터 다시 테스트하고 싶을 때 가족/구성원/기프티콘/
// 이미지/가입계정을 전부 지웁니다. 실사용 배포 전에는 이 컴포넌트를 App/LoginScreen에서
// 빼고 supabase/functions/reset-all-data도 삭제하세요.
export default function ResetAllDataButton() {
  const [running, setRunning] = useState(false);
  // 되돌릴 수 없는 작업이라 확인을 두 번 받는다. 'first' → 'second' 순서로 물어본다.
  const [asking, setAsking] = useState(null);
  const [notice, setNotice] = useState(null);

  if (!import.meta.env.VITE_RESET_TOKEN) return null;

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
      <button
        type="button"
        onClick={() => setAsking('first')}
        disabled={running}
        className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground underline disabled:opacity-50"
      >
        <Trash2 className="size-3.5" />
        {running ? '초기화 중…' : '전체 데이터 초기화 (테스트)'}
      </button>

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

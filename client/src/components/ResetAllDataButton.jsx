import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { resetAllData } from '../api';

// ⚠️ 테스트 전용 버튼입니다. 처음부터 다시 테스트하고 싶을 때 가족/구성원/기프티콘/
// 이미지/가입계정을 전부 지웁니다. 실사용 배포 전에는 이 컴포넌트를 App/LoginScreen에서
// 빼고 supabase/functions/reset-all-data도 삭제하세요.
export default function ResetAllDataButton() {
  const [running, setRunning] = useState(false);

  if (!import.meta.env.VITE_RESET_TOKEN) return null;

  async function handleClick() {
    if (!confirm('모든 가족·기프티콘·가입계정이 삭제됩니다. 정말 초기화할까요?')) return;
    if (!confirm('되돌릴 수 없어요. 그래도 진행할까요?')) return;

    setRunning(true);
    try {
      const result = await resetAllData();
      const d = result?.deleted || {};
      alert(`초기화했어요.\n기프티콘 ${d.gifticons ?? 0}건 · 가족 ${d.families ?? 0}개 · 계정 ${d.users ?? 0}개 삭제`);
      localStorage.removeItem('install-prompt-dismissed');
      window.location.reload();
    } catch (err) {
      alert(err.message || '초기화에 실패했어요.');
    } finally {
      setRunning(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={running}
      className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground underline disabled:opacity-50"
    >
      <Trash2 className="size-3.5" />
      {running ? '초기화 중…' : '전체 데이터 초기화 (테스트)'}
    </button>
  );
}

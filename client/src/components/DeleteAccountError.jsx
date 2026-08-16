import { useState } from 'react';
import { clearDeleteError, readDeleteError } from '../auth';

// 탈퇴가 막힌 이유를 적어두는 자리.
//
// 이 조각이 따로 있는 이유는 자리 때문이다. 원래는 내 메뉴 안에서 창을 띄웠는데, 탈퇴는
// 데이터부터 지우기 때문에 그 순간 나는 '가족이 없는 사람'이 되고 화면이 통째로 갈아끼워진다.
// 창은 그 화면 안에 있었으니 세워지자마자 같이 사라졌다. 눌러도 아무것도 안 남는 것처럼
// 보인 게 그래서다.
//
// 그래서 AuthGate가 이걸 들고 있는다. 로그인 화면이든 가족 만들기 화면이든 목록이든,
// 어느 화면으로 갈아끼워져도 이건 그 위에 남는다. 기록은 기기에 적혀 있어서 앱을 껐다
// 켜도 그대로 있다 — 닫기를 눌러야 지워진다.
export default function DeleteAccountError() {
  const [saved, setSaved] = useState(() => readDeleteError());
  const [copied, setCopied] = useState(false);

  if (!saved?.message) return null;

  function close() {
    clearDeleteError();
    setSaved(null);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(saved.message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 클립보드를 못 쓰는 환경이 있다. 문구는 화면에 그대로 있으니 읽어서 옮기면 된다.
      setCopied(false);
    }
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-[100] p-3 pb-[max(0.75rem,var(--safe-bottom))]">
      <div className="bg-card border-destructive/40 mx-auto max-w-md rounded-2xl border p-4 shadow-lg">
        <p className="text-destructive m-0 text-sm font-bold">탈퇴가 끝나지 못했어요</p>
        {/* 서버가 준 말을 다듬지 않는다. 여기 적힌 한 줄이 고칠 자리를 가리키는 단서다. */}
        <p className="text-foreground mt-2 mb-0 text-[13px] leading-relaxed break-all whitespace-pre-wrap">
          {saved.message}
        </p>
        <p className="text-muted-foreground mt-2 mb-0 text-[11px]">
          데이터는 지워졌지만 계정이 남아 있어요. 이 문구를 그대로 알려주시면 원인을 찾을 수 있어요.
        </p>
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={copy}
            className="border-border text-foreground rounded-lg border px-3 py-1.5 text-xs font-semibold"
          >
            {copied ? '복사했어요' : '문구 복사'}
          </button>
          <button
            type="button"
            onClick={close}
            className="bg-primary text-primary-foreground rounded-lg px-3 py-1.5 text-xs font-semibold"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

import { createPortal } from 'react-dom';
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';

const TONE = {
  info: { Icon: Info, className: 'text-primary' },
  warning: { Icon: AlertCircle, className: 'text-warning' },
  success: { Icon: CheckCircle2, className: 'text-success' },
  danger: { Icon: AlertTriangle, className: 'text-destructive' },
};

// 브라우저 기본 alert()/confirm() 대신 쓰는 안내창. 기본 창은 주소창 아래 회색 띠로 떠서
// 앱 안의 다른 화면들과 따로 놀기 때문에, 같은 모양(둥근 카드·같은 버튼)으로 맞춘다.
// onConfirm을 넘기면 확인/취소 두 개짜리 물음창(confirm)이 되고, 없으면 확인만 있는 안내창이다.
export default function AlertDialog({
  title,
  description,
  details,
  tone = 'info',
  confirmLabel = '확인',
  cancelLabel = '취소',
  onConfirm,
  onClose,
}) {
  const { Icon, className } = TONE[tone] || TONE.info;
  const asking = typeof onConfirm === 'function';

  return createPortal(
    // 시트(Radix Dialog) 위에 뜰 수 있어서, 그 안에서도 눌리도록 pointer-events를 다시 켠다.
    <div
      className="pointer-events-auto fixed inset-0 z-[70] flex items-center justify-center px-8"
      role="alertdialog"
      aria-modal="true"
    >
      <button type="button" aria-label="닫기" onClick={onClose} className="absolute inset-0 bg-black/50" />

      <div className="animate-splash-in relative w-full max-w-[320px] rounded-2xl border border-border bg-card p-5 shadow-lg">
        <div className="flex flex-col items-center gap-2 text-center">
          <Icon className={`size-8 ${className}`} />
          <p className="m-0 text-base font-bold break-keep text-foreground">{title}</p>
          {description && (
            <p className="m-0 text-sm leading-relaxed break-keep whitespace-pre-line text-muted-foreground">
              {description}
            </p>
          )}
        </div>

        {/* 여러 항목을 알려줘야 할 때. 가운데 정렬 안에 목록을 넣으면 줄마다 시작점이 달라져
            읽기 어려워서, 목록만 왼쪽으로 맞추고 상자로 묶어 본문과 구분한다. */}
        {details?.length > 0 && (
          <ul className="m-0 mt-3 flex list-none flex-col gap-1.5 rounded-xl bg-secondary p-3 text-left">
            {details.map((item) => (
              <li key={item} className="flex gap-1.5 text-xs leading-relaxed break-keep text-muted-foreground">
                <span aria-hidden="true">·</span>
                <span className="flex-1">{item}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex gap-2">
          {asking && (
            <Button type="button" variant="outline" onClick={onClose} className="flex-1 rounded-xl">
              {cancelLabel}
            </Button>
          )}
          <Button
            type="button"
            variant={tone === 'danger' ? 'destructive' : 'default'}
            onClick={asking ? onConfirm : onClose}
            className="flex-1 rounded-xl"
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

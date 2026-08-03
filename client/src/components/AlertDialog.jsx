import { createPortal } from 'react-dom';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';

const TONE = {
  info: { Icon: Info, className: 'text-primary' },
  warning: { Icon: AlertCircle, className: 'text-warning' },
  success: { Icon: CheckCircle2, className: 'text-success' },
};

// 브라우저 기본 alert() 대신 쓰는 안내창. 기본 alert은 주소창 아래 회색 띠로 떠서
// 앱 안의 다른 화면들과 따로 놀기 때문에, 같은 모양(둥근 카드·같은 버튼)으로 맞춘다.
export default function AlertDialog({ title, description, tone = 'info', confirmLabel = '확인', onClose }) {
  const { Icon, className } = TONE[tone] || TONE.info;

  return createPortal(
    // 시트(Radix Dialog) 위에 뜰 수 있어서, 그 안에서도 눌리도록 pointer-events를 다시 켠다.
    <div className="pointer-events-auto fixed inset-0 z-[70] flex items-center justify-center px-8" role="alertdialog" aria-modal="true">
      <button type="button" aria-label="닫기" onClick={onClose} className="absolute inset-0 bg-black/50" />

      <div className="animate-splash-in relative w-full max-w-[320px] rounded-2xl border border-border bg-card p-5 shadow-lg">
        <div className="flex flex-col items-center gap-2 text-center">
          <Icon className={`size-8 ${className}`} />
          <p className="m-0 text-base font-bold break-keep text-foreground">{title}</p>
          {description && <p className="m-0 text-sm leading-relaxed break-keep text-muted-foreground">{description}</p>}
        </div>

        <Button type="button" onClick={onClose} className="mt-4 w-full rounded-xl">
          {confirmLabel}
        </Button>
      </div>
    </div>,
    document.body,
  );
}

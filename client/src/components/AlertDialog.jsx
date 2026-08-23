import { createPortal } from 'react-dom';
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import useBackClose from '../utils/useBackClose';

// 아이콘을 동그란 바탕에 담는다. 아이콘 하나만 떠 있으면 제목과 무게가 같아 보이는데,
// 이 창에서 제일 먼저 읽혀야 하는 것은 제목이다.
const TONE = {
  info: { Icon: Info, className: 'bg-primary/10 text-primary' },
  warning: { Icon: AlertCircle, className: 'bg-warning/12 text-warning' },
  success: { Icon: CheckCircle2, className: 'bg-success/12 text-success' },
  danger: { Icon: AlertTriangle, className: 'bg-destructive/10 text-destructive' },
};

// 브라우저 기본 alert()/confirm() 대신 쓰는 안내창. 기본 창은 주소창 아래 회색 띠로 떠서
// 앱 안의 다른 화면들과 따로 놀기 때문에, 같은 모양(둥근 카드·같은 버튼)으로 맞춘다.
// onConfirm을 넘기면 확인/취소 두 개짜리 물음창(confirm)이 되고, 없으면 확인만 있는 안내창이다.
// icon — 무엇을 하려는 것인지 그림으로 말한다. 삼각형은 "위험"만 말하고, 휴지통은
//        "지우려 한다"를 말한다. 안 넘기면 tone에 딸린 기본 아이콘을 쓴다.
// subject — 대상 이름 한 줄. 이름을 따옴표 문장 안에 넣으면("'○○'이(가) 목록에서
//        사라져요") 이름이 길 때 세 줄로 접혀서, 정작 무엇을 지우는지가 문장에 묻힌다.
// warning — 붉게 남길 한마디("되돌릴 수 없어요"). 문장 끝에 붙여두면 앞의 설명과 같은
//        무게로 읽혀 그냥 지나간다.
export default function AlertDialog({
  title,
  description,
  subject,
  warning,
  details,
  icon: CustomIcon,
  tone = 'info',
  confirmLabel = '확인',
  cancelLabel = '취소',
  onConfirm,
  onClose,
}) {
  // 뒤로가기로 이 창을 닫는다. 안 그러면 설치해서 쓸 때 앱이 통째로 꺼진다.
  // 물음창(확인/취소)에서 뒤로가기는 취소로 친다 — 되묻는 창을 확인으로 넘기면 안 된다.
  useBackClose(onClose);

  const { Icon: ToneIcon, className } = TONE[tone] || TONE.info;
  const Icon = CustomIcon || ToneIcon;
  const asking = typeof onConfirm === 'function';
  // 되돌릴 수 없는 물음만 버튼을 세로로 쌓는다. 가로로 나란하면 엄지가 스치는 자리에 둘 다
  // 있어서 지우는 쪽이 오탭으로 눌린다. 세로로 쌓으면 위아래가 갈리고, 되돌릴 수 없는 쪽을
  // 위에 둔다 — 아래가 엄지에 가까워 취소가 더 쉽게 눌린다.
  //
  // 되돌릴 수 있는 물음("이어서 올릴까요?")까지 세로로 만들지는 않는다. 오탭이 위험하지
  // 않은 곳에서 두 줄을 쓰면 창만 길어진다.
  const stacked = asking && tone === 'danger';

  return createPortal(
    // 시트(Radix Dialog) 위에 뜰 수 있어서, 그 안에서도 눌리도록 pointer-events를 다시 켠다.
    <div
      className="pointer-events-auto fixed inset-0 z-[70] flex items-center justify-center px-8"
      role="alertdialog"
      aria-modal="true"
    >
      <button type="button" aria-label="닫기" onClick={onClose} className="absolute inset-0 bg-black/50" />

      {/* 테두리를 걷고 그림자를 키웠다. 어두운 판 위에 뜬 카드라 테두리가 할 일이 없고,
          그림자가 카드를 판에서 들어올린다. */}
      <div className="animate-splash-in relative w-full max-w-[322px] rounded-[18px] bg-card px-5 pt-[22px] pb-[18px] shadow-xl">
        <div className="flex flex-col items-center gap-[9px] text-center">
          <span className={cn('flex size-[46px] items-center justify-center rounded-full', className)}>
            <Icon className="size-[23px]" />
          </span>
          <p className="m-0 text-[17.5px] leading-snug font-bold tracking-[-0.02em] break-keep text-foreground">
            {title}
          </p>
          {subject && (
            <p className="m-0 text-sm leading-snug font-medium break-keep text-muted-foreground">{subject}</p>
          )}
          {description && (
            <p className="m-0 text-sm leading-relaxed break-keep whitespace-pre-line text-muted-foreground">
              {description}
            </p>
          )}
          {warning && (
            <p className="m-0 text-[13.5px] font-bold tracking-[-0.01em] text-destructive">{warning}</p>
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

        <div className={cn('mt-[18px] flex gap-2', stacked ? 'flex-col' : 'flex-row-reverse')}>
          <Button
            type="button"
            variant={tone === 'danger' ? 'destructive' : 'default'}
            onClick={asking ? onConfirm : onClose}
            className={cn(
              stacked ? 'h-[50px] w-full rounded-[13px] text-[15.5px] font-bold' : 'flex-1 rounded-xl'
            )}
          >
            {confirmLabel}
          </Button>
          {asking && (
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className={cn(
                stacked
                  ? 'h-12 w-full rounded-xl text-[14.5px] font-semibold text-foreground/80'
                  : 'flex-1 rounded-xl'
              )}
            >
              {cancelLabel}
            </Button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

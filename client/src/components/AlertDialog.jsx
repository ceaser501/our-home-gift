import { createPortal } from 'react-dom';
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ACTION_ROW, ACTION_PRIMARY, ACTION_CANCEL } from '../utils/sheetUi';
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
// preview — 무엇에 대해 묻는지 그림으로 보여줄 자리. "이 사진도 기프티콘인가요?"처럼
//        '이것'이 화면 밖에 있으면, 읽는 사람은 무엇인지 모르는 채로 답해야 한다.
export default function AlertDialog({
  title,
  description,
  subject,
  warning,
  details,
  preview,
  icon: CustomIcon,
  tone = 'info',
  confirmLabel = '확인',
  cancelLabel = '취소',
  // 버튼을 세로로 쌓을지. 기본은 가로다 — 부르는 쪽이 그럴 까닭을 댈 때만 켠다.
  stacked = false,
  onConfirm,
  onClose,
}) {
  // 뒤로가기로 이 창을 닫는다. 안 그러면 설치해서 쓸 때 앱이 통째로 꺼진다.
  // 물음창(확인/취소)에서 뒤로가기는 취소로 친다 — 되묻는 창을 확인으로 넘기면 안 된다.
  useBackClose(onClose);

  const { Icon: ToneIcon, className } = TONE[tone] || TONE.info;
  const Icon = CustomIcon || ToneIcon;
  const asking = typeof onConfirm === 'function';
  // 세로 쌓기는 tone === 'danger' 이면 저절로 켜졌었다. 이제 부르는 쪽이 stacked 로
  // 명시할 때만 켠다.
  //
  // 세로가 하는 일은 남아 있다 — 가로로 나란하면 엄지가 스치는 자리에 둘 다 있어서 위험한
  // 쪽이 오탭으로 눌린다. 다만 그것이 필요한 자리는 삭제 전부가 아니라 정말 되돌릴 수 없는
  // 몇 곳이고, 그 판단은 창을 여는 쪽이 안다.

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
      {/* 여백이 22/20/18 이었다. 위아래를 다르게 둘 까닭이 여기엔 없다 —
          시트가 사방 20 이므로 이 창도 20 으로 맞춘다. */}
      <div className="animate-splash-in relative w-full max-w-[322px] rounded-xl bg-card p-5 shadow-xl">
        <div className="flex flex-col items-center gap-2.5 text-center">
          <span className={cn('flex size-12 items-center justify-center rounded-full', className)}>
            <Icon className="size-5" />
          </span>
          {/* 17.5 는 스케일에 없는 값이었다. title(20)로 올린다 — 시트 제목과 같은
              자리다. 322 폭에서 '이 기프티콘을 삭제할까요?'가 한 줄에 들어간다.
              16 으로 내리면 바로 아래 이름(14)과 2 차이라 제목으로 서지 못한다. */}
          <p className="m-0 text-title font-bold break-keep text-foreground">{title}</p>
          {subject && (
            <p className="m-0 text-body leading-snug font-medium break-keep text-muted-foreground">{subject}</p>
          )}
          {description && (
            <p className="m-0 text-body leading-relaxed break-keep whitespace-pre-line text-muted-foreground">
              {description}
            </p>
          )}
          {warning && (
            <p className="m-0 text-body font-bold text-destructive">{warning}</p>
          )}
        </div>

        {preview && <div className="mt-3.5">{preview}</div>}

        {/* 여러 항목을 알려줘야 할 때. 가운데 정렬 안에 목록을 넣으면 줄마다 시작점이 달라져
            읽기 어려워서, 목록만 왼쪽으로 맞추고 상자로 묶어 본문과 구분한다. */}
        {/* 카드가 rounded-xl(16)인데 이 상자도 같은 16 이었다. 굴림이 같으면 안쪽
            상자가 카드에 담긴 게 아니라 카드를 밀어내는 것처럼 보인다. 한 단
            내린다 — 눈금에 12 가 없어서 rounded-md(10)를 쓴다. */}
        {details?.length > 0 && (
          <ul className="m-0 mt-3.5 flex list-none flex-col gap-1.5 rounded-md bg-secondary p-3 text-left">
            {details.map((item) => (
              <li key={item} className="flex gap-1.5 text-caption leading-relaxed break-keep text-muted-foreground">
                <span aria-hidden="true">·</span>
                <span className="flex-1">{item}</span>
              </li>
            ))}
          </ul>
        )}

        {/* 나란히 놓을 때는 시트의 확정·취소 짝과 같은 치수를 쓴다. 앞서는 flex-1 rounded-xl
            만 주어서 버튼 기본 높이(40)에 반지름 16 으로 나왔다 — 같은 앱의 다른 창들이
            52 · 13 인데 알림 창만 작고 둥글었다.

            세로로 쌓는 경우(되돌릴 수 없는 선택)는 폭이 꽉 차므로 ACTION_ROW 를 쓰지 않고
            같은 버튼 치수만 가져온다. */}
        {/* 18 이었다. 시트가 칸에서 버튼으로 넘어갈 때 쓰는 28 로 맞춘다.
            되돌릴 수 없는 것을 묻는 창이라, 읽기 전에 손이 가지 않도록 벌린다. */}
        <div className={cn('mt-7 gap-2', stacked ? 'flex flex-col' : ACTION_ROW)}>
          <Button size="xl"
            type="button"
            variant={tone === 'danger' ? 'destructive' : 'default'}
            onClick={asking ? onConfirm : onClose}
            className={ACTION_PRIMARY}
          >
            {confirmLabel}
          </Button>
          {asking && (
            <Button size="xl"
              type="button"
              variant="outline"
              onClick={onClose}
              className={ACTION_CANCEL}
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

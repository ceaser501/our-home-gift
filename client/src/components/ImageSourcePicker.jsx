import { createPortal } from 'react-dom';
import { Camera, FileUp, ImageIcon, X } from 'lucide-react';
import { detectInAppBrowser, openInExternalBrowser } from '../utils/browser';

const IN_APP_NAMES = {
  kakaotalk: '카카오톡',
  naver: '네이버 앱',
  instagram: '인스타그램',
  facebook: '페이스북',
  line: '라인',
  daum: '다음 앱',
};

// 사진을 어디서 가져올지 고르는 하단 시트.
// 브라우저는 "어느 앱을 열지"를 직접 정할 수 없고, 파일 입력의 조건으로만 유도할 수 있다.
//   - 사진: 이미지만 + 여러 장 → 크롬/설치한 앱에서는 갤러리(사진 선택 도구)가 바로 열린다
//   - 파일: 종류 제한 없음 → 파일 관리자가 열린다
//   - 카메라: capture → 촬영 화면이 바로 열린다
// 단, 인앱 브라우저(카카오톡 등)는 자체 선택 창을 강제해서 갤러리가 아예 안 나온다.
export default function ImageSourcePicker({ onPick, onClose }) {
  const inApp = detectInAppBrowser();

  function handleOpenExternal() {
    if (!openInExternalBrowser(inApp)) {
      alert('오른쪽 아래 메뉴에서 "다른 브라우저로 열기"를 선택해주세요.');
    }
  }

  return createPortal(
    // 기프티콘 시트(Radix Dialog)가 열려 있는 동안 body는 pointer-events가 꺼지므로,
    // 이 시트에서 다시 켜줘야 버튼을 누를 수 있다.
    <div
      className="pointer-events-auto fixed inset-0 z-[60] flex flex-col justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="이미지 추가"
    >
      <button type="button" aria-label="닫기" onClick={onClose} className="absolute inset-0 bg-black/50" />

      <div className="relative mx-auto w-full max-w-[480px] rounded-t-2xl border-t border-border bg-card px-5 pt-4 pb-[max(20px,env(safe-area-inset-bottom))]">
        <div className="mb-4 flex items-center">
          <button type="button" onClick={onClose} aria-label="닫기" className="text-muted-foreground">
            <X className="size-5" />
          </button>
          <p className="m-0 flex-1 pr-5 text-center text-sm font-semibold text-foreground">이미지 추가</p>
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          <SourceTile icon={Camera} label="카메라" onClick={() => onPick('camera')} />
          <SourceTile icon={ImageIcon} label="사진" onClick={() => onPick('photo')} />
          <SourceTile icon={FileUp} label="파일" onClick={() => onPick('file')} />
        </div>

        {inApp && (
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-accent/60 px-3 py-2.5">
            <p className="m-0 flex-1 text-xs break-keep text-muted-foreground">
              {IN_APP_NAMES[inApp] || '이 앱'} 안에서는 갤러리를 열 수 없어요.
            </p>
            <button
              type="button"
              onClick={handleOpenExternal}
              className="shrink-0 text-xs font-semibold text-primary underline"
            >
              브라우저로 열기
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function SourceTile({ icon: Icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-border py-6 text-sm text-foreground active:bg-accent"
    >
      <Icon className="size-6 text-muted-foreground" />
      {label}
    </button>
  );
}

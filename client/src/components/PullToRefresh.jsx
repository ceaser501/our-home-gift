import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';

// 화면을 아래로 당겨서 새로고침. 브라우저가 해주는 기능이지만, 아이폰은 홈 화면에
// 설치한 앱(standalone)에서는 이 기능을 빼버린다. 주소창의 새로고침 버튼도 없어서
// 아이폰 사용자는 목록을 새로 불러올 방법이 아예 없다. 그래서 직접 만든다.
// 안드로이드에는 원래 있지만, 두 벌이 겹쳐 동작하지 않도록 브라우저 기본 동작은
// index.css에서 꺼두고(overscroll-behavior) 두 폰이 똑같이 이 코드로 움직이게 했다.

const THRESHOLD = 72; // 이만큼 당겼다 놓으면 새로고침
const MAX_PULL = 110; // 더 당겨도 이 이상은 내려오지 않는다
const RESISTANCE = 0.55; // 손가락이 움직인 거리보다 덜 따라오게 해서 고무줄 느낌을 준다
const MIN_SPIN_MS = 500; // 너무 빨리 끝나면 깜빡인 것처럼 보여서 최소한 이만큼은 돌린다
const PUCK_SIZE = 44; // 이만큼 위로 올려두면 당기기 전에는 화면 밖에 숨는다

export default function PullToRefresh({ onRefresh }) {
  const [spinning, setSpinning] = useState(false);
  const puckRef = useRef(null);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    const gesture = { tracking: false, engaged: false, startX: 0, startY: 0, distance: 0 };
    let refreshing = false;

    function paint(distance, animated) {
      const puck = puckRef.current;
      if (!puck) return;
      puck.style.transition = animated ? 'transform 0.25s ease-out, opacity 0.25s ease-out' : 'none';
      puck.style.transform = `translate(-50%, ${distance - PUCK_SIZE}px) rotate(${distance * 4}deg)`;
      puck.style.opacity = String(Math.min(1, distance / (THRESHOLD * 0.6)));
    }

    // 시트나 안내창이 떠 있으면 그 안의 스크롤이지 새로고침 제스처가 아니다.
    function blocked() {
      return !!document.querySelector('[data-slot="sheet-content"], [role="alertdialog"]');
    }

    function onTouchStart(e) {
      if (refreshing || e.touches.length !== 1 || window.scrollY > 0 || blocked()) return;
      gesture.tracking = true;
      gesture.engaged = false;
      gesture.distance = 0;
      gesture.startX = e.touches[0].clientX;
      gesture.startY = e.touches[0].clientY;
    }

    function onTouchMove(e) {
      if (!gesture.tracking) return;

      const dy = e.touches[0].clientY - gesture.startY;
      const dx = e.touches[0].clientX - gesture.startX;

      // 위로 올리거나, 가로로 넘기는 손짓(카테고리 줄)이면 새로고침이 아니다.
      if (!gesture.engaged) {
        if (dy <= 8 || Math.abs(dx) > dy) {
          if (dy < 0 || Math.abs(dx) > 8) gesture.tracking = false;
          return;
        }
        gesture.engaged = true;
      }

      // 당기는 중에 화면까지 같이 밀려나면 지저분해서 기본 동작을 막는다.
      // (이 한 줄이 안드로이드의 기본 당겨서 새로고침도 같이 막아준다.)
      if (e.cancelable) e.preventDefault();

      gesture.distance = Math.min(MAX_PULL, dy * RESISTANCE);
      paint(gesture.distance, false);
    }

    async function onTouchEnd() {
      if (!gesture.tracking) return;
      const pulled = gesture.engaged ? gesture.distance : 0;
      gesture.tracking = false;
      gesture.engaged = false;
      gesture.distance = 0;

      if (pulled < THRESHOLD) {
        paint(0, true);
        return;
      }

      refreshing = true;
      setSpinning(true);
      paint(THRESHOLD, true);
      try {
        await Promise.all([onRefreshRef.current?.(), new Promise((r) => setTimeout(r, MIN_SPIN_MS))]);
      } catch {
        // 실패해도 목록 쪽에서 안내하므로 여기서는 되돌리기만 한다.
      } finally {
        refreshing = false;
        setSpinning(false);
        paint(0, true);
      }
    }

    // 당기는 동안 preventDefault를 하려면 passive가 아니어야 한다.
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd);
    window.addEventListener('touchcancel', onTouchEnd);
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
    };
  }, []);

  return (
    <div
      ref={puckRef}
      aria-hidden="true"
      style={{ transform: `translate(-50%, ${-PUCK_SIZE}px)`, opacity: 0 }}
      className="pointer-events-none fixed top-[var(--safe-top)] left-1/2 z-30 flex size-9 items-center justify-center rounded-full border border-border bg-card shadow-md"
    >
      <RefreshCw className={`size-4 text-primary ${spinning ? 'animate-spin' : ''}`} />
    </div>
  );
}

// 팝업 검증용 하니스. 시트·다이얼로그를 진짜 컴포넌트로 띄운다.
// Supabase 를 안 부르는 것만 고른다 — 나머지는 껍데기(ui/sheet)가 같아서 이걸로 갈음된다.
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import RenameSheet from '../src/components/RenameSheet';
import SpendSheet from '../src/components/SpendSheet';
import ExtendSheet from '../src/components/ExtendSheet';
import AlertDialog from '../src/components/AlertDialog';

// 제목이 한 줄인 경우와 두 줄인 경우를 다 본다. 닫기 버튼과 부딪히는 자리라
// 한 줄만 보면 넘어간다.
const STAGES = {
  rename1: '① 이름 바꾸기 — 제목 한 줄',
  rename2: '① - 2 제목이 두 줄일 때',
  spend: '② 금액 입력 — 부제 없음',
  extend: '③ 기한 연장 — 긴 제목 + 부제',
  danger: '④ 삭제 다이얼로그',
  warn: '④ - 2 오류 다이얼로그',
  info: '④ - 3 알림 다이얼로그',
};

const GIFTICON = {
  id: 1,
  name: '카페 아메리카노 T 2잔 + 딸기 생크림 케이크',
  brand: '스타벅스',
  amount: 500000,
  spent_amount: 120000,
  is_voucher: true,
  expires_at: '2026-09-03',
};

function Bar({ cur }) {
  return (
    <nav
      style={{
        position: 'fixed', insetInline: 0, top: 0, zIndex: 100, display: 'flex', flexWrap: 'wrap',
        gap: 6, padding: '8px 12px', background: '#1b1b21', fontSize: 12, fontWeight: 700,
      }}
    >
      {Object.entries(STAGES).map(([k, label]) => (
        <a
          key={k}
          href={`?v=${k}`}
          style={{
            padding: '5px 10px', borderRadius: 999, textDecoration: 'none',
            background: cur === k ? '#5b4fe8' : 'transparent',
            color: cur === k ? '#fff' : '#9b9ba6',
          }}
        >
          {label}
        </a>
      ))}
    </nav>
  );
}

// 제목이 닫기 버튼 밑으로 들어가는 것은 눈으로 잘 안 잡힌다 — 제목이 짧으면 안 겹치고
// 길어야 겹치기 때문이다. 열릴 때마다 재서 걸리면 화면에 띄운다.
function useCloseGuard() {
  useEffect(() => {
    const id = setInterval(() => {
      const t = document.querySelector('[data-slot="sheet-title"]');
      const c = document.querySelector('[data-slot="sheet-content"]');
      if (!t || !c) return;
      const close = [...c.querySelectorAll('button')].find((b) => b.querySelector('.sr-only'));
      const el = document.getElementById('guard');
      if (!close || !el) return;
      const hit = t.getBoundingClientRect().right > close.getBoundingClientRect().left;
      el.textContent = hit ? '제목이 닫기 버튼과 겹친다' : '';
      el.style.display = hit ? 'block' : 'none';
    }, 400);
    return () => clearInterval(id);
  }, []);
}

function App() {
  useCloseGuard();
  const cur = new URLSearchParams(location.search).get('v') || 'rename1';
  const [, force] = useState(0);
  const reopen = () => force((n) => n + 1);

  return (
    <>
      <Bar cur={cur} />
      <div
        id="guard"
        style={{
          display: 'none', position: 'fixed', insetInline: 0, bottom: 0, zIndex: 200,
          background: '#e03e49', color: '#fff', fontSize: 12, fontWeight: 700,
          padding: '10px 14px', textAlign: 'center',
        }}
      />
      <div style={{ height: '100dvh' }} />

      {cur === 'rename1' && (
        <RenameSheet
          title="이름 바꾸기"
          label="이름"
          initialValue="태수"
          placeholder="이름을 적어주세요"
          description="가족에게 이 이름으로 보여요."
          onSubmit={async () => {}}
          onClose={reopen}
        />
      )}

      {cur === 'rename2' && (
        <RenameSheet
          title="우리집 기프티콘함 이름 바꾸기"
          label="가족 이름"
          initialValue="우리집"
          placeholder="가족 이름을 적어주세요"
          description="구성원 모두에게 이 이름으로 보여요. 언제든 다시 바꿀 수 있어요."
          onSubmit={async () => {}}
          onClose={reopen}
        />
      )}

      {cur === 'spend' && <SpendSheet gifticon={GIFTICON} onSpend={async () => {}} onClose={reopen} />}

      {cur === 'extend' && <ExtendSheet gifticon={GIFTICON} onExtend={async () => {}} onClose={reopen} />}

      {cur === 'danger' && (
        <AlertDialog
          tone="danger"
          title="이 기프티콘을 지울까요?"
          description="지우면 되돌릴 수 없어요. 가족 모두의 목록에서 사라져요."
          confirmText="지우기"
          cancelText="그만두기"
          onConfirm={reopen}
          onCancel={reopen}
        />
      )}

      {cur === 'warn' && (
        <AlertDialog
          tone="warning"
          title="사진을 읽지 못했어요"
          description="바코드가 흐릿하게 찍혔어요. 다시 찍거나 직접 등록으로 올려주세요."
          confirmText="확인"
          onConfirm={reopen}
        />
      )}

      {cur === 'info' && (
        <AlertDialog
          tone="info"
          title="저장했어요"
          description="기프티콘 3개를 목록에 넣었어요."
          confirmText="확인"
          onConfirm={reopen}
        />
      )}
    </>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
